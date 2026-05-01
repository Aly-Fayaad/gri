const mongoose = require("mongoose");

const AREA_UNITS = ["faddan", "qirat", "hectare", "m2"];
const CROP_TYPES = ["rice", "wheat", "corn", "cotton", "vegetables", "other"];
// const IRRIGATION_SOURCES = ["canal", "groundwater", "unknown"];

const fieldSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    planting_date: {
      type: Date,
      required: true,
    },

    crop_type: {
      type: String,
      enum: CROP_TYPES,
      default: "other",
    },

    area_value: {
      type: Number,
      required: true,
      min: 0,
    },

    area_unit: {
      type: String,
      enum: AREA_UNITS,
      required: true,
    },


  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Compound index: quickly fetch all active fields for a user
// fieldSchema.index({ user: 1});

const Field = mongoose.model("Field", fieldSchema);

module.exports = Field;