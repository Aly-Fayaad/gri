const mongoose = require("mongoose");

// Reusable coordinate pair
const coordinateSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false }
);

// Bounding box derived from center pin + area size
const boundingBoxSchema = new mongoose.Schema(
  {
    north: { type: Number, required: true },
    south: { type: Number, required: true },
    east:  { type: Number, required: true },
    west:  { type: Number, required: true },
  },
  { _id: false }
);

const fieldLocationSchema = new mongoose.Schema(
  {
    field: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Field",
      required: true,
      unique: true, // one location record per field
    },

    // Raw GPS pin dropped by the farmer
    center: {
      type: coordinateSchema,
      required: true,
    },

    // Derived from center + field area; used to query Sentinel-2
    bounding_box: {
      type: boundingBoxSchema,
      required: true,
    },

    // Optional: polygon drawn manually for higher accuracy
    polygon_coords: {
      type: [coordinateSchema],
      default: [],
    },

   
  },
  {
    timestamps: true,
  }
);

// 2dsphere index for geo queries (e.g. find fields near a point)
fieldLocationSchema.index({ "center.lat": 1, "center.lng": 1 });

const FieldLocation = mongoose.model("FieldLocation", fieldLocationSchema);

module.exports = FieldLocation;