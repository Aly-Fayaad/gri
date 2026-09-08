const Field = require('../models/fieldModel')
const FieldLocation = require("../models/fieldLocation");
const axios = require('axios')
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');



exports.getInsights = catchAsync(async (req, res, next) => {
  let id = req.params.id

  let field = await Field.findOne({ _id: id })
  if (!field) {
    return next(new AppError("the field with this id doesn't exist"))
  }

  // ── 4-Day Cache Check ─────────────────────────────────────────────────────
  if (field.last_insight && field.insighted_at) {
    const daysSinceLastInsight = (Date.now() - field.insighted_at) / (1000 * 60 * 60 * 24);
    if (daysSinceLastInsight < 4) {
      console.log(`🚀 Returning cached insight for field ${id} (last updated ${Math.round(daysSinceLastInsight)} days ago)`);
      return res.status(200).json({
        success: true,
        cached: true,
        data: field.last_insight
      });
    }
  }

  let location = await FieldLocation.findOne({ field: id })
  if (!location) {
    return next(new AppError("the location with this id doesn't exist"))
  }

  let bbox = location.bounding_box
  const bboxArray = [bbox.west, bbox.south, bbox.east, bbox.north]

  console.log(`🛰️ Fetching new insights from remote model for field ${id}...`);
  let response = await axios.post("https://model-production-06a6.up.railway.app/predict/field_bbox", {
    bbox: bboxArray
  })

  if (response.status !== 200) {
    return next(new AppError("the response from the server is empty"))
  }

  // ── Update Field Document ───────────────────────────────────────────────
  field.last_insight = response.data;
  field.insighted_at = Date.now();
  await field.save();

  res.status(200).json({
    success: true,
    cached: false,
    data: response.data
  })
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