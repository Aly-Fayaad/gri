/**
 * Training Features Utility
 * Maps ML models to their required features and calculates indices from Sentinel-2 bands
 */

// Model features mapping - only contains the features each model needs
const MODEL_FEATURES = {
    water_status: [
      'NDRE_range', 'EVI_slope', 'flood_ever', 'NDVI_mean', 'NDRE_mean',
      'EVI_mean', 'LSWI_mean', 'NDSI_mean', 'B5_mean', 'B6_mean',
      'NDVI_heading', 'LAI_max', 'LAI_heading', 'salinity_proxy'
    ],
    
    crop_health: [
      'LSWI_std', 'flood_ever', 'NDVI_mean', 'NDRE_mean', 'EVI_mean',
      'LSWI_mean', 'NDSI_mean', 'B5_mean', 'B6_mean', 'salinity_proxy'
    ],
    
    salinity_risk: [
      'LSWI_std', 'NDRE_range', 'EVI_slope', 'flood_ever', 'NDVI_mean',
      'NDRE_mean', 'EVI_mean', 'B5_mean', 'B6_mean', 'NDVI_heading',
      'LAI_max', 'LAI_heading'
    ]
  };
  
  /**
   * Calculate spectral indices from band reflectances
   */
  function calculateIndices(bands) {
    const indices = {};
    // Extract bands with defaults
    const B2 = bands.B02 || 0;
    const B3 = bands.B03 || 0;
    const B4 = bands.B04 || 0;
    const B5 = bands.B05 || 0;
    const B6 = bands.B06 || 0;
    const B8 = bands.B08 || 0;
    const B11 = bands.B11 || 0;
    const B12 = bands.B12 || 0;
    
    // NDVI - Normalized Difference Vegetation Index
    indices.NDVI = (B8 - B4) / (B8 + B4 + 1e-10);
    
    // NDRE - Normalized Difference Red Edge
    indices.NDRE = (B8 - B6) / (B8 + B6 + 1e-10);
    
    // EVI - Enhanced Vegetation Index
    indices.EVI = 2.5 * (B8 - B4) / (B8 + 6 * B4 - 7.5 * B2 + 1 + 1e-10);
    
    // LSWI - Land Surface Water Index
    indices.LSWI = (B8 - B11) / (B8 + B11 + 1e-10);
    
    // NDSI - Normalized Difference Snow/Ice Index
    indices.NDSI = (B3 - B11) / (B3 + B11 + 1e-10);
    
    // LAI - Leaf Area Index (approximation using NDVI)
    indices.LAI = -Math.log((1 - indices.NDVI) / 2) / 0.5;
    
    // Salinity Proxy (using SWIR bands)
    indices.salinity_proxy = (B11 - B12) / (B8 + B11 + B12 + 1e-10);
    
    // Flood indicator (binary)
    indices.flood_ever = (indices.LSWI > 0.1 && indices.NDVI < 0.3) ? 1 : 0;
    
    // Store raw bands
    indices.B5 = B5;
    indices.B6 = B6;
    
    return indices;
  }
  
  /**
   * Calculate statistics across multiple images
   * @param {Array} indicesArray - Array of index values from multiple dates
   * @returns {Object} Statistics object
   */
  function calculateStats(values) {
    if (!values || values.length === 0) return null;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    const range = Math.max(...values) - Math.min(...values);
    const max = Math.max(...values);
    
    return { mean, std, range, max };
  }
  
  /**
   * Calculate slope (trend) across time series
   * @param {Array} values - Array of values over time
   * @returns {number} Slope value
   */
  function calculateSlope(values) {
    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((a, b, i) => a + b * values[i], 0);
    const sumXX = indices.reduce((a, b) => a + b * b, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }
  
  /**
   * Get features for a specific model from multiple images
   * @param {string} modelName - Name of the model
   * @param {Array} images - Array of image objects with date and bands
   * @returns {Object} - Computed features for the model
   */
  function getModelFeatures(modelName, images) {
    // Validate model name
    if (!MODEL_FEATURES[modelName]) {
      throw new Error(`Unknown model: ${modelName}. Available models: ${Object.keys(MODEL_FEATURES).join(', ')}`);
    }
    
    // Calculate indices for each image
    const indicesList = [];
    images.forEach(image => {
      const indices = calculateIndices(image.bands);
      indicesList.push({
        date: image.date,
        indices: indices
      });
    });
    
    // Extract time series for each index
    const ndviSeries = indicesList.map(item => item.indices.NDVI);
    const ndreSeries = indicesList.map(item => item.indices.NDRE);
    const eviSeries = indicesList.map(item => item.indices.EVI);
    const lswiSeries = indicesList.map(item => item.indices.LSWI);
    const ndsiSeries = indicesList.map(item => item.indices.NDSI);
    const laiSeries = indicesList.map(item => item.indices.LAI);
    const salinitySeries = indicesList.map(item => item.indices.salinity_proxy);
    const floodSeries = indicesList.map(item => item.indices.flood_ever);
    const b5Series = indicesList.map(item => item.indices.B5);
    const b6Series = indicesList.map(item => item.indices.B6);
    
    // Calculate statistics
    const ndviStats = calculateStats(ndviSeries);
    const ndreStats = calculateStats(ndreSeries);
    const eviStats = calculateStats(eviSeries);
    const lswiStats = calculateStats(lswiSeries);
    const ndsiStats = calculateStats(ndsiSeries);
    const laiStats = calculateStats(laiSeries);
    const salinityStats = calculateStats(salinitySeries);
    const b5Stats = calculateStats(b5Series);
    const b6Stats = calculateStats(b6Series);
    
    // Calculate slopes (trends)
    const ndviSlope = calculateSlope(ndviSeries);
    const ndreSlope = calculateSlope(ndreSeries);
    const eviSlope = calculateSlope(eviSeries);
    const laiSlope = calculateSlope(laiSeries);
    
    // Check if flood occurred in any image
    const floodEver = floodSeries.some(flood => flood === 1) ? 1 : 0;
    
    // Build computed values
    const computed = {
      // Ranges
      NDRE_range: ndreStats?.range || 0,
      EVI_slope: eviSlope,
      
      // Flood
      flood_ever: floodEver,
      
      // Means
      NDVI_mean: ndviStats?.mean || 0,
      NDRE_mean: ndreStats?.mean || 0,
      EVI_mean: eviStats?.mean || 0,
      LSWI_mean: lswiStats?.mean || 0,
      NDSI_mean: ndsiStats?.mean || 0,
      B5_mean: b5Stats?.mean || 0,
      B6_mean: b6Stats?.mean || 0,
      
      // Trends
      NDVI_heading: ndviSlope,
      LAI_heading: laiSlope,
      
      // Max values
      LAI_max: laiStats?.max || 0,
      
      // Standard deviation
      LSWI_std: lswiStats?.std || 0,
      
      // Salinity
      salinity_proxy: salinityStats?.mean || 0
    };
    
    // Get required features for this model
    const requiredFeatures = MODEL_FEATURES[modelName];
    
    // Build features object with only what the model needs
    const features = {};
    requiredFeatures.forEach(feature => {
      if (computed[feature] !== undefined) {
        features[feature] = computed[feature];
      } else {
        console.warn(`Warning: ${feature} not found in computed values`);
        features[feature] = null;
      }
    });
    
    return {
      model: modelName,
      features: features,
      imageCount: images.length,
      dateRange: {
        start: images[0]?.date,
        end: images[images.length - 1]?.date
      },
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Get list of required features for a model (without computing values)
   * @param {string} modelName 
   * @returns {Array} List of feature names
   */
  function getRequiredFeatures(modelName) {
    if (!MODEL_FEATURES[modelName]) {
      throw new Error(`Unknown model: ${modelName}`);
    }
    return MODEL_FEATURES[modelName];
  }
  
  /**
   * Get all available models
   * @returns {Array} List of available models
   */
  function getAvailableModels() {
    return Object.keys(MODEL_FEATURES);
  }
  
  module.exports = {
    getModelFeatures,
    getRequiredFeatures,
    getAvailableModels,
    calculateIndices,
    calculateStats,
    calculateSlope
  };