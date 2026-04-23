const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { SHIPMENT_STATUSES, TRANSPORT_MODES } = require("../constants/platform");

const shipmentSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  supplierId: { type: String, ref: "Supplier", required: true, index: true },
  reference: { type: String, required: true, trim: true },
  origin: { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true },
  distanceKm: { type: Number, required: true, min: 0 },
  transportMode: { type: String, enum: TRANSPORT_MODES, required: true, index: true },
  carrier: { type: String, required: true, trim: true },
  vehicleType: { type: String, default: null },
  fuelType: { type: String, default: null },
  weightKg: { type: Number, required: true, min: 0 },
  costUsd: { type: Number, required: true, min: 0 },
  carbonPricePerTon: { type: Number, default: 55, min: 0 },
  emissionsTonnes: { type: Number, default: 0, min: 0 },
  carbonCostUsd: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: SHIPMENT_STATUSES, default: "IN_TRANSIT", index: true },
  shipmentDate: { type: Date, default: Date.now, index: true },
  distanceSource: { type: String, enum: ["MANUAL", "ESTIMATED"], default: "MANUAL" },
  notes: { type: String, default: null, trim: true },
  metadata: { type: Object, default: {} },
  departedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
}, {
  collection: "shipments",
});

shipmentSchema.index({ companyId: 1, reference: 1 }, { unique: true });
shipmentSchema.index({ companyId: 1, shipmentDate: -1 });
shipmentSchema.index({ companyId: 1, supplierId: 1, shipmentDate: -1 });

shipmentSchema.virtual("supplier", {
  ref: "Supplier",
  localField: "supplierId",
  foreignField: "_id",
  justOne: true,
});

shipmentSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

module.exports = mongoose.models.Shipment || mongoose.model("Shipment", shipmentSchema);
