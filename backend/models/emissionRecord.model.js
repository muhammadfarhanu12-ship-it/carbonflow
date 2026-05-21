const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { EMISSION_SCOPES, EMISSION_SOURCE_TYPES } = require("../constants/platform");

const emissionRecordSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  recordKey: { type: String, required: true, trim: true },
  scope: { type: Number, enum: EMISSION_SCOPES, required: true, index: true },
  category: { type: String, required: true, trim: true, index: true },
  sourceType: { type: String, enum: EMISSION_SOURCE_TYPES, required: true, index: true },
  sourceId: { type: String, default: null, index: true },
  shipmentId: { type: String, ref: "Shipment", default: null, index: true },
  supplierId: { type: String, ref: "Supplier", default: null, index: true },
  description: { type: String, default: null, trim: true },
  notes: { type: String, default: null, trim: true },
  amountTonnes: { type: Number, required: true, default: 0, min: 0 },
  emissionsKgCo2e: { type: Number, required: true, default: 0, min: 0 },
  emissionsTCo2e: { type: Number, required: true, default: 0, min: 0 },
  calculationStatus: {
    type: String,
    enum: ["calculated", "missing_factor", "draft_incomplete", "calculation_error"],
    default: "missing_factor",
    index: true,
  },
  emissionFactorId: { type: String, ref: "EmissionFactor", default: null, index: true },
  costUsd: { type: Number, default: 0, min: 0 },
  factorValue: { type: Number, default: 0, min: 0 },
  factorValueUsed: { type: Number, default: 0, min: 0 },
  factorUnit: { type: String, default: null, trim: true },
  factorUnitUsed: { type: String, default: null, trim: true },
  factorSource: { type: String, default: null, trim: true },
  factorSourceName: { type: String, default: null, trim: true },
  factorSourceYear: { type: Number, default: null },
  factorRegion: { type: String, default: null, trim: true },
  factorCountry: { type: String, default: null, trim: true },
  factorVersion: { type: String, default: null, trim: true },
  factorIsSample: { type: Boolean, default: true },
  factorIsOfficial: { type: Boolean, default: false },
  factorIsCustom: { type: Boolean, default: false },
  formula: { type: String, default: "emissions = activityAmount x emissionFactor", trim: true },
  activityAmount: { type: Number, default: 0, min: 0 },
  activityUnit: { type: String, default: null, trim: true },
  facilityId: { type: String, default: null, trim: true, index: true },
  facilityName: { type: String, default: null, trim: true },
  businessUnit: { type: String, default: null, trim: true, index: true },
  reportingPeriod: { type: String, default: null, trim: true, index: true },
  reportingPeriodStart: { type: Date, default: null, index: true },
  reportingPeriodEnd: { type: Date, default: null, index: true },
  dataStatus: {
    type: String,
    enum: ["draft", "submitted", "reviewed", "approved", "rejected", "needs_correction", "archived"],
    default: "draft",
    index: true,
  },
  submittedBy: { type: String, ref: "User", default: null },
  submittedAt: { type: Date, default: null },
  reviewedBy: { type: String, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  approvedBy: { type: String, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: String, ref: "User", default: null },
  rejectedAt: { type: Date, default: null },
  correctionNotes: { type: String, default: null, trim: true },
  approvalNotes: { type: String, default: null, trim: true },
  archivedBy: { type: String, ref: "User", default: null },
  archivedAt: { type: Date, default: null },
  createdBy: { type: String, ref: "User", default: null, index: true },
  updatedBy: { type: String, ref: "User", default: null, index: true },
  activityData: { type: Object, default: {} },
  metadata: { type: Object, default: {} },
  occurredAt: { type: Date, required: true, default: Date.now, index: true },
  periodMonth: { type: Number, required: true, min: 1, max: 12, index: true },
  periodYear: { type: Number, required: true, min: 2000, max: 3000, index: true },
}, {
  collection: "emission_records",
});

emissionRecordSchema.index({ companyId: 1, recordKey: 1 }, { unique: true });
emissionRecordSchema.index({ companyId: 1, scope: 1, periodYear: 1, periodMonth: 1 });
emissionRecordSchema.index({ companyId: 1, supplierId: 1, occurredAt: -1 });
emissionRecordSchema.index({ companyId: 1, dataStatus: 1, occurredAt: -1 });
emissionRecordSchema.index({ companyId: 1, facilityName: 1, businessUnit: 1 });

emissionRecordSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

module.exports = mongoose.models.EmissionRecord || mongoose.model("EmissionRecord", emissionRecordSchema);
