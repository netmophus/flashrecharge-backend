const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    legalName: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "NE" },
    currency: { type: String, trim: true, default: "XOF" },
    timezone: { type: String, trim: true, default: "Africa/Niamey" },
    contactEmail: { type: String, trim: true, lowercase: true, default: "" },
    contactPhone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    organizationType: {
      type: String,
      enum: ["telco", "service_consumer"],
      default: "telco",
      trim: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

organizationSchema.index({ name: 1 });

module.exports = mongoose.model("Organization", organizationSchema);
