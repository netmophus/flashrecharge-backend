const mongoose = require("mongoose");

const distributorPartnershipSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    distributorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected"],
      default: "pending",
    },
    canViewData: { type: Boolean, default: true },
    canSellCards: { type: Boolean, default: true },
    canSellAirtime: { type: Boolean, default: false },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

distributorPartnershipSchema.index(
  { organizationId: 1, distributorUserId: 1 },
  { unique: true }
);

module.exports = mongoose.model("DistributorPartnership", distributorPartnershipSchema);
