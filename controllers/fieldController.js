const Field = require('../models/fieldModel')
const FieldLocation = require("../models/fieldLocation");
const FieldSnapshot = require("../models/fieldSnapshot");

const { getComputedBands } = require('../utils/sentinel');
const { getModelFeatures, getAvailableModels } = require('../utils/trainingFeatures');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');



exports.getInsights = catchAsync(async (req, res, next) => {
  // Optional query params: ?bbox=minLon,minLat,maxLon,maxLat&startDate=YYYY-MM-DD
  // Cairo area in correct order: [minLon, minLat, maxLon, maxLat]
  const defaultBbox = [31.47, 30.56, 31.55, 30.62];
  const bbox = req.query.bbox
    ? req.query.bbox.split(',').map(Number)
    : defaultBbox;
  const startDate = req.query.startDate || '2026-06-01';

  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(Number.isNaN)) {
    return next(
      new AppError('Invalid bbox. Use: minLon,minLat,maxLon,maxLat', 400)
    );
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (minLon >= maxLon || minLat >= maxLat) {
    return next(
      new AppError('Invalid bbox bounds. Ensure min values are less than max values.', 400)
    );
  }

  const result = await getComputedBands(bbox, startDate);

  if (!result.success) {
    return next(new AppError(`Sentinel fetch failed: ${result.error}`, 502));
  }

  if (!result.images || result.images.length === 0) {
    return next(
      new AppError('No satellite images found for this area/date range.', 404)
    );
  }

  const models = getAvailableModels();
  const waterStatus = getModelFeatures('water_status', result.images);
  const cropHealth = getModelFeatures('crop_health', result.images);
  const salinityRisk = getModelFeatures('salinity_risk', result.images);

  res.status(200).json({
    status: 'success',
    models,
    imageCount: result.imageCount,
    dates: result.images.map((img) => img.date),
    waterStatus,
    cropHealth,
    salinityRisk,
  });
});




// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives a bounding box from a GPS center point and a field area.
 * Converts the area to approximate lat/lng offsets.
 *
 * @param {number} lat        - Center latitude
 * @param {number} lng        - Center longitude
 * @param {number} areaValue  - Numeric area value
 * @param {string} areaUnit   - "faddan" | "qirat" | "hectare" | "m2"
 * @returns {{ north, south, east, west }}
 */
function deriveBoundingBox(lat, lng, areaValue, areaUnit) {
  // Normalize everything to m²
  const toM2 = { faddan: 4200, qirat: 175, hectare: 10000, m2: 1 };
  const areaM2 = areaValue * (toM2[areaUnit] ?? 1);

  // Approximate the field as a square and get its half-side in degrees
  const halfSideMeters = Math.sqrt(areaM2) / 2;
  const latOffset = halfSideMeters / 111320;                      // 1° lat ≈ 111,320 m
  const lngOffset = halfSideMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  return {
    north: lat + latOffset,
    south: lat - latOffset,
    east:  lng + lngOffset,
    west:  lng - lngOffset,
  };
}

// ─── CREATE FIELD ─────────────────────────────────────────────────────────────

/**
 * POST /api/fields
 *
 * Body:
 * {
 *   name             : string   (required)
 *   planting_date    : ISO date (required)
 *   center_lat       : number   (required)
 *   center_lng       : number   (required)
 *   area_value       : number   (required)
 *   area_unit        : string   (required) — faddan | qirat | hectare | m2
 *   crop_type        : string   (optional)
 *   irrigation_source: string   (optional)
 * }
 *
 * Auth: req.user._id must be set by your auth middleware
 */


exports.createField = catchAsync(async (req, res) => {
 
    const {
      name,
      planting_date,
      center_lat,
      center_lng,
      area_value,
      area_unit,
      crop_type,
     
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    const missing = [];
    if (!name)          missing.push("name");
    if (!planting_date) missing.push("planting_date");
    if (center_lat == null) missing.push("center_lat");
    if (center_lng == null) missing.push("center_lng");
    if (area_value == null) missing.push("area_value");
    if (!area_unit)     missing.push("area_unit");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    // ── Validate coordinate ranges ────────────────────────────────────────
    if (center_lat < -90 || center_lat > 90) {
      return res.status(400).json({ success: false, message: "center_lat must be between -90 and 90" });
    }
    if (center_lng < -180 || center_lng > 180) {
      return res.status(400).json({ success: false, message: "center_lng must be between -180 and 180" });
    }
    if (area_value <= 0) {
      return res.status(400).json({ success: false, message: "area_value must be greater than 0" });
    }

    // ── Create FIELD document ─────────────────────────────────────────────
    const field = await Field.create({
      user: req.user._id,
      name,
      planting_date: new Date(planting_date),
      crop_type,
    
      area_value,
      area_unit,
    });

    // ── Derive bounding box & create FIELD_LOCATION document ─────────────
    const bbox = deriveBoundingBox(center_lat, center_lng, area_value, area_unit);

    const fieldLocation = await FieldLocation.create({
      field: field._id,
      center: { lat: center_lat, lng: center_lng },
      bounding_box: bbox,
    });

    return res.status(201).json({
      success: true,
      message: "Field created successfully",
      data: {
        field,
        location: fieldLocation,
      },
    });
  
})

// ─── DELETE FIELD ─────────────────────────────────────────────────────────────

/**
 * DELETE /api/fields/:id
 *
 * Soft-deletes the field by default (sets is_active = false).
 * Pass ?hard=true to permanently delete the field and all related documents.
 *
 * Auth: req.user._id must match field.user (ownership check)
 */
exports.deleteField = catchAsync(async(req, res) => {
 
    const { id } = req.params;
    

    // ── Find field and verify ownership ──────────────────────────────────
    const field = await Field.findById(id);

    if (!field) {
      return res.status(404).json({ success: false, message: "Field not found" });
    }

    if (field.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You do not have permission to delete this field" });
    }

    
      // ── Hard delete: remove field + all its related documents ──────────
      await Promise.all([
        Field.findByIdAndDelete(id),
        FieldLocation.deleteOne({ field: id }),
        FieldSnapshot.deleteMany({ field: id }),
      ]);

      return res.status(200).json({
        success: true,
        message: "Field and all related data permanently deleted",
      });

      // ── Soft delete: just flip is_active to false ───────────────────────
      // Farmer keeps full history; field disappears from the active dashboard
      
    
  
})




exports.getUserFields = catchAsync(async (req, res) => {
    const fields = await Field.find({ user: req.user._id })
      .select("name planting_date crop_type")
      .sort({ createdAt: -1 })
      .lean();
  
    if (fields.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }
  
    const fieldIds = fields.map((f) => f._id);
  
    const locations = await FieldLocation.find({ field: { $in: fieldIds } })
      .select("field center")
      .lean();
  
    const locationMap = {};
    for (const loc of locations) {
      locationMap[loc.field.toString()] = loc.center;
    }
  
    const data = fields.map((field) => ({
      name: field.name,
      id: field._id,
      planting_date: field.planting_date,
      crop_type: field.crop_type,
      location: locationMap[field._id.toString()] || null,
    }));
  
    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  });