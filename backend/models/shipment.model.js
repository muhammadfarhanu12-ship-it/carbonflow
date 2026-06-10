const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { SHIPMENT_STATUSES, TRANSPORT_MODES } = require("../constants/platform");

const shipmentSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  supplierId: { type: String, ref: "Supplier", default: null, index: true },
  linkedSupplierId: { type: String, ref: "Supplier", default: null, index: true },
  linkedSupplierSnapshot: {
    id: { type: String, default: null },
    name: { type: String, default: null },
    category: { type: String, default: null },
    country: { type: String, default: null },
    region: { type: String, default: null },
    riskLevel: { type: String, default: null },
  },
  reference: { type: String, required: true, trim: true },
  shipmentReference: { type: String, default: null, trim: true },
  bolNumber: { type: String, default: null, trim: true },
  containerId: { type: String, default: null, trim: true },
  origin: { type: String, required: true, trim: true },
  originCountry: { type: String, default: null, trim: true },
  originRegion: { type: String, default: null, trim: true },
  destination: { type: String, required: true, trim: true },
  destinationCountry: { type: String, default: null, trim: true },
  destinationRegion: { type: String, default: null, trim: true },
  distanceKm: { type: Number, required: true, min: 0 },
  distanceUnit: { type: String, enum: ["km"], default: "km" },
  transportMode: { type: String, enum: TRANSPORT_MODES, required: true, index: true },
  carrier: { type: String, required: true, trim: true },
  carrierId: { type: String, default: null, trim: true },
  vehicleType: { type: String, default: null },
  fuelType: { type: String, default: null },
  weightKg: { type: Number, required: true, min: 0 },
  weightUnit: { type: String, enum: ["kg", "tonnes"], default: "kg" },
  costUsd: { type: Number, required: true, min: 0 },
  cost: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: "USD", trim: true },
  carbonPricePerTon: { type: Number, default: 55, min: 0 },
  emissionFactor: { type: Number, default: 0, min: 0 },
  factorSource: { type: String, default: "CarbonFlow sample logistics factors", trim: true },
  emissionFactorId: { type: String, default: null, trim: true },
  emissionFactorKey: { type: String, default: null, trim: true },
  emissionFactorValue: { type: Number, default: 0, min: 0 },
  emissionFactorUnit: { type: String, default: "kgCO2e/ton-km", trim: true },
  emissionFactorSourceName: { type: String, default: null, trim: true },
  emissionFactorSourceYear: { type: Number, default: null },
  emissionFactorType: { type: String, enum: ["sample", "official", "custom", "missing"], default: "sample", index: true },
  calculationFormula: { type: String, default: null, trim: true },
  emissionsKgCo2e: { type: Number, default: 0, min: 0 },
  emissionsTonnes: { type: Number, default: 0, min: 0 },
  kgCO2e: { type: Number, default: 0, min: 0 },
  tCO2e: { type: Number, default: 0, min: 0 },
  carbonIntensityKgCo2ePerTonKm: { type: Number, default: 0, min: 0 },
  calculationStatus: { type: String, enum: ["calculated", "missing_factor", "invalid_input", "estimated"], default: "calculated", index: true },
  dataQualityWarnings: { type: [String], default: [] },
  calculatedAt: { type: Date, default: null },
  carbonCostUsd: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: SHIPMENT_STATUSES, default: "IN_TRANSIT", index: true },
  shipmentDate: { type: Date, default: Date.now, index: true },
  reportingPeriod: { type: String, default: null, trim: true, index: true },
  distanceSource: { type: String, enum: ["MANUAL", "ESTIMATED"], default: "MANUAL" },
  notes: { type: String, default: null, trim: true },
  metadata: { type: Object, default: {} },
  departedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null, index: true },
  archivedBy: { type: String, default: null, trim: true },
  createdBy: { type: String, default: null, trim: true },
  updatedBy: { type: String, default: null, trim: true },
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
