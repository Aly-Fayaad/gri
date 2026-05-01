const axios = require('axios');
const UTIF = require('utif');

const CLIENT_ID = 'sh-969d4c9e-cf59-40b1-be2b-059d677e8a7d';
const CLIENT_SECRET = '588nit4RWUceJZVghrdisR3k06wvvNvx';

// Default evalscript to get all needed bands
const DEFAULT_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ 
      bands: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "B12"], 
      units: "REFLECTANCE" 
    }],
    output: { bands: 8 }
  };
}
function evaluatePixel(sample) {
  return [sample.B02, sample.B03, sample.B04, sample.B05, sample.B06, sample.B08, sample.B11, sample.B12];
}`;

async function getToken() {
  const response = await axios.post(
    'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );
  
  if (!response.data.access_token) {
    throw new Error('Failed to get token');
  }
  
  return response.data.access_token;
}

/**
 * Get computed bands from Sentinel-2 for multiple dates
 * @param {Array} bbox - Bounding box [minX, minY, maxX, maxY]
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @returns {Promise<Array>} - Array of band objects for each date
 */
async function getComputedBands(bbox, startDate) {
  try {
    const token = await getToken();
    
    // Generate 4 dates with 15-day intervals
    const dates = generateDateIntervals(startDate, 4, 15);
    
    console.log(`📡 Fetching bands for ${dates.length} dates...`);
    
    // Fetch bands for each date
    const results = [];
    const failures = [];
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      console.log(`  Processing ${date} (${i+1}/${dates.length})...`);
      
      const response = await fetchBandsForDate(token, bbox, date);
      if (response.ok) {
        results.push({
          date: date,
          bands: response.bands,
          index: i
        });
      } else {
        failures.push({ date, error: response.error });
      }
    }

    if (results.length === 0) {
      return {
        success: false,
        error: `No usable Sentinel scenes found. ${failures[0]?.error || 'Unknown fetch error'}`,
        failures,
        bbox,
        startDate
      };
    }
    
    return {
      success: true,
      bbox: bbox,
      startDate: startDate,
      images: results,
      imageCount: results.length,
      failures,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error getting computed bands:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Details:', error.response.data);
    }
    return {
      success: false,
      error: error.message,
      bbox: bbox
    };
  }
}

/**
 * Fetch bands for a specific date
 */
async function fetchBandsForDate(token, bbox, date) {
  try {
    // Use a wider window around the target date so we can get the nearest
    // available scene instead of requiring an exact acquisition day.
    const fromDate = new Date(date);
    const toDate = new Date(date);
    fromDate.setDate(fromDate.getDate() - 10);
    toDate.setDate(toDate.getDate() + 10);

    const fromISO = `${fromDate.toISOString().split('T')[0]}T00:00:00Z`;
    const toISO = `${toDate.toISOString().split('T')[0]}T23:59:59Z`;

    const { width, height } = computeDimensionsForBBox(bbox);

    const payload = {
      input: {
        bounds: {
          bbox: bbox,
          properties: { 
            crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' 
          }
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: {
              from: fromISO,
              to: toISO
            },
            maxCloudCoverage: 40,
            mosaickingOrder: 'mostRecent'
          }
        }]
      },
      output: {
        width,
        height,
        responses: [{ 
          identifier: 'default', 
          format: { type: 'image/tiff' } 
        }]
      },
      evalscript: DEFAULT_EVALSCRIPT
    };
    
    const response = await axios.post(
      'https://sh.dataspace.copernicus.eu/api/v1/process',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'image/tiff'
        },
        responseType: 'arraybuffer'
      }
    );
    
    // Parse the response to extract band values
    const bands = parseBandResponse(response.data);
    return { ok: true, bands };
    
  } catch (error) {
    console.error(`  ⚠️ Failed to fetch bands for ${date}:`, error.message);
    if (error.response?.data) {
      console.error(
        `  ↳ Sentinel details for ${date}:`,
        JSON.stringify(error.response.data)
      );
    }
    const details =
      error.response?.data?.message ||
      error.response?.data?.error?.message ||
      error.response?.statusText ||
      error.message ||
      'Unknown Sentinel error';
    return { ok: false, error: details };
  }
}

function computeDimensionsForBBox(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const centerLat = (minLat + maxLat) / 2;

  // Rough meter conversions for WGS84 degrees.
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180);

  const widthMeters = Math.abs(maxLon - minLon) * metersPerDegLon;
  const heightMeters = Math.abs(maxLat - minLat) * metersPerDegLat;

  // Keep resolution comfortably below 1500 m/px Sentinel limit.
  const targetMetersPerPixel = 500;
  const minPixels = 16;

  const width = Math.max(minPixels, Math.ceil(widthMeters / targetMetersPerPixel));
  const height = Math.max(minPixels, Math.ceil(heightMeters / targetMetersPerPixel));

  return { width, height };
}

/**
 * Generate date intervals
 * @param {string} startDate - Start date in YYYY-MM-DD
 * @param {number} count - Number of dates to generate
 * @param {number} intervalDays - Interval in days between dates
 * @returns {Array} Array of dates in YYYY-MM-DD format
 */
function generateDateIntervals(startDate, count, intervalDays) {
  const dates = [];
  const currentDate = new Date(startDate);
  
  for (let i = 0; i < count; i++) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    
    // Move to next interval
    currentDate.setDate(currentDate.getDate() + intervalDays);
  }
  
  return dates;
}

/**
 * Parse the API response to extract band values
 */
function parseBandResponse(data) {
  const bands = {
    B02: null, // Blue
    B03: null, // Green
    B04: null, // Red
    B05: null, // Red Edge 1
    B06: null, // Red Edge 2
    B08: null, // NIR
    B11: null, // SWIR 1
    B12: null  // SWIR 2
  };
  
  try {
    // TIFF binary parsing path
    if (data && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      const buffer = data instanceof ArrayBuffer ? data : data.buffer;
      const ifds = UTIF.decode(buffer);
      if (!ifds || ifds.length === 0) return bands;

      UTIF.decodeImage(buffer, ifds[0]);
      const raster = ifds[0].data;
      const samplesPerPixel = ifds[0]['t277'] || 1;
      if (!raster || samplesPerPixel < 8) return bands;

      // Pick center pixel to reduce edge/no-data effects.
      const width = ifds[0].width;
      const height = ifds[0].height;
      const centerIndex = (Math.floor(height / 2) * width + Math.floor(width / 2)) * samplesPerPixel;

      bands.B02 = raster[centerIndex + 0] ?? null;
      bands.B03 = raster[centerIndex + 1] ?? null;
      bands.B04 = raster[centerIndex + 2] ?? null;
      bands.B05 = raster[centerIndex + 3] ?? null;
      bands.B06 = raster[centerIndex + 4] ?? null;
      bands.B08 = raster[centerIndex + 5] ?? null;
      bands.B11 = raster[centerIndex + 6] ?? null;
      bands.B12 = raster[centerIndex + 7] ?? null;
    }
  } catch (error) {
    console.error('Error parsing band response:', error);
  }
//   console.log(bands)
  return bands;
}

module.exports = { getComputedBands };