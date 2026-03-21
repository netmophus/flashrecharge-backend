const mongoose = require("mongoose");

const organizationLicenseSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    code: { type: String, required: true, trim: true, unique: true },
    planName: { type: String, required: true, trim: true },
    seats: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ["draft", "active", "suspended", "expired"],
      default: "active",
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    notes: { type: String, trim: true, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

organizationLicenseSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model("OrganizationLicense", organizationLicenseSchema);
