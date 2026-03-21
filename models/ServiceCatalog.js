const mongoose = require("mongoose");

const serviceCatalogSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["airtime", "virtual_card", "utility", "other"],
      default: "other",
    },
    provider: { type: String, trim: true, default: "" },
    isGlobal: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

serviceCatalogSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model("ServiceCatalog", serviceCatalogSchema);
