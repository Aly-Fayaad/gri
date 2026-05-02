const axios    = require('axios');
const GeoTIFF  = require('geotiff');

const CLIENT_ID     = 'sh-969d4c9e-cf59-40b1-be2b-059d677e8a7d';
const CLIENT_SECRET = '588nit4RWUceJZVghrdisR3k06wvvNvx';

const BANDS = ['B02','B03','B04','B05','B06','B08','B11','B12'];

// One evalscript per band — each returns a single-band TIFF (guaranteed 1 page, SPP=1)
function makeEvalscript(band) {
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["${band}"], units: "REFLECTANCE" }],
    output: { bands: 1, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(s) { return [s.${band}]; }`;
}

// =======================
// AUTH
// =======================
async function getToken() {
  const res = await axios.post(
    'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  if (!res.data.access_token) throw new Error('No token');
  return res.data.access_token;
}

// =======================
// MAIN
// =======================
async function getComputedBands(bbox, startDate) {
  try {
    const token    = await getToken();
    const dates    = generateDateIntervals(startDate, 4, 15);
    const results  = [];
    const failures = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      console.log(`📡 ${date} (${i + 1}/${dates.length})`);

      const res = await fetchAllBandsForDate(token, bbox, date);

      if (res.ok && res.bands) {
        console.log('   ✔ bands:', res.bands);
        results.push({ date, bands: res.bands, index: i });
      } else {
        console.log(`   ✗ failed: ${res.error}`);
        failures.push({ date, error: res.error });
      }
    }

    if (!results.length) {
      return { success: false, error: 'No valid Sentinel data', failures };
    }

    return { success: true, images: results, imageCount: results.length, failures, timestamp: new Date().toISOString() };

  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
}

// =======================
// FETCH ALL 8 BANDS FOR ONE DATE
// One request per band — avoids any multi-band TIFF layout ambiguity
// =======================
async function fetchAllBandsForDate(token, bbox, date) {
  const from = new Date(date);
  const to   = new Date(date);
  from.setDate(from.getDate() - 15);
  to.setDate(to.getDate()   + 15);

  const { width, height } = computeDimensionsForBBox(bbox);
  const means = {};

  for (const band of BANDS) {
    const result = await fetchSingleBand(token, bbox, band, from, to, width, height);
    if (!result.ok) {
      return { ok: false, error: `Band ${band}: ${result.error}` };
    }
    means[band] = result.mean;
    console.log(`   ${band}: ${result.mean.toFixed(5)}`);
  }

  return { ok: true, bands: means };
}

// =======================
// FETCH ONE BAND → mean reflectance value
// =======================
async function fetchSingleBand(token, bbox, band, from, to, width, height) {
  try {
    const payload = {
      input: {
        bounds: {
          bbox,
          properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' }
        },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: { from: from.toISOString(), to: to.toISOString() },
            maxCloudCoverage: 50,
            mosaickingOrder: 'leastCC'
          }
        }]
      },
      output: {
        width, height,
        responses: [{
          identifier: 'default',
          format: { type: 'image/tiff' }
        }]
      },
      evalscript: makeEvalscript(band)
    };

    const res = await axios.post(
      'https://sh.dataspace.copernicus.eu/api/v1/process',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'image/tiff'
        },
        responseType: 'arraybuffer'
      }
    );

    if (res.status !== 200) {
      const txt = Buffer.from(res.data).toString('utf8');
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }

    const mean = await extractMeanFromTiff(res.data);
    if (mean === null) return { ok: false, error: 'all pixels no-data' };

    return { ok: true, mean };

  } catch (err) {
    if (err.response?.data) {
      const txt = Buffer.from(err.response.data).toString('utf8');
      try {
        const p = JSON.parse(txt);
        return { ok: false, error: p.error?.message || p.message || txt.slice(0, 200) };
      } catch {
        return { ok: false, error: txt.slice(0, 200) };
      }
    }
    return { ok: false, error: err.message };
  }
}

// =======================
// READ SINGLE-BAND TIFF → mean float value
// =======================
async function extractMeanFromTiff(data) {
  try {
    const ab    = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const tiff  = await GeoTIFF.fromArrayBuffer(ab);
    const image = await tiff.getImage(0);

    // readRasters() returns array of typed arrays, one per band
    const rasters = await image.readRasters();
    const raster  = rasters[0]; // single band

    let sum = 0, count = 0;
    for (let i = 0; i < raster.length; i++) {
      const v = raster[i];
      if (isNaN(v) || v === 0) continue;
      sum += v;
      count++;
    }

    if (count === 0) return null;

    const mean = sum / count;
    return mean > 2.0 ? mean / 10000 : mean; // DN → reflectance if needed
  } catch (err) {
    console.error('TIFF parse error:', err.message);
    return null;
  }
}

// =======================
// DIMENSIONS
// =======================
function computeDimensionsForBBox(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const mPerDegLon = 111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  return {
    width:  Math.max(32, Math.round((maxLon - minLon) * mPerDegLon / 20)),
    height: Math.max(32, Math.round((maxLat - minLat) * 111320    / 20))
  };
}

// =======================
// DATE GENERATOR
// =======================
function generateDateIntervals(startDate, count, step) {
  const dates = [];
  const d = new Date(startDate);
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + step);
  }
  return dates;
}

module.exports = { getComputedBands };