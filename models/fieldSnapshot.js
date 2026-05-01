const mongoose = require("mongoose");

const STATUS_VALUES = ["good", "warning", "danger", "unknown"];

// Stores one Sentinel-2 satellite fetch result per field per date
const fieldSnapshotSchema = new mongoose.Schema(
  {
    field: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Field",
      required: true,
      index: true,
    },

    snapshot_date: {
      type: Date,
      required: true,
    },

    // --- Raw satellite index values (floats from Sentinel-2) ---
    indices: {
      ndwi:  { type: Number, default: null }, // Water content
      lswi:  { type: Number, default: null }, // Leaf/soil water index (crop age)
      evi:   { type: Number, default: null }, // Enhanced vegetation index (yield)
      ndre:  { type: Number, default: null }, // Red-edge (nitrogen/chlorophyll)
      ndsi:  { type: Number, default: null }, // Soil salinity index
    },

    // --- Derived traffic-light statuses (computed from indices + growth stage) ---
    // These are what the app displays; pre-computed so the mobile app
    // doesn't need to run threshold logic on every request.
    status: {
      water:       { type: String, enum: STATUS_VALUES, default: "unknown" },
      crop_health: { type: String, enum: STATUS_VALUES, default: "unknown" },
      soil:        { type: String, enum: STATUS_VALUES, default: "unknown" },
    },

    // Growth stage in days at time of snapshot (calculated from planting_date)
    days_since_planting: {
      type: Number,
      default: null,
    },

    // Full raw payload from Sentinel-2 API for debugging / reprocessing
    raw_data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = when the fetch ran
  }
);

// Prevent duplicate snapshots for the same field on the same date
fieldSnapshotSchema.index({ field: 1, snapshot_date: -1 }, { unique: true });

const FieldSnapshot = mongoose.model("FieldSnapshot", fieldSnapshotSchema);

module.exports = FieldSnapshot;