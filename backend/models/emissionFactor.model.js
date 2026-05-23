const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const emissionFactorSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null, index: true },
  name: { type: String, required: true, trim: true },
  scope: { type: Number, enum: [1, 2, 3], required: true, default: 3, index: true },
  category: { type: String, required: true, trim: true },
  activityType: { type: String, required: true, default: "transport", trim: true, index: true },
  factorKey: { type: String, default: null, trim: true, index: true },
  activityUnit: { type: String, default: null, trim: true, index: true },
  factorValue: { type: Number, default: null, min: 0 },
  value: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, trim: true },
  factorUnit: { type: String, default: "kgCO2e/unit", trim: true },
  source: { type: String, default: "CarbonFlow sample factors", trim: true },
  sourceName: { type: String, default: "CarbonFlow sample factors", trim: true },
  sourceYear: { type: Number, default: 2026 },
  sourceUrl: { type: String, default: null, trim: true },
  methodology: { type: String, default: null, trim: true },
  notes: { type: String, default: null, trim: true },
  region: { type: String, default: "GLOBAL", trim: true, index: true },
  country: { type: String, default: null, trim: true, index: true },
  version: { type: String, default: "v1", trim: true },
  effectiveFrom: { type: Date, default: null, index: true },
  effectiveTo: { type: Date, default: null, index: true },
  isSample: { type: Boolean, default: true },
  isOfficial: { type: Boolean, default: false, index: true },
  isCustom: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String, ref: "Admin", default: null },
  updatedBy: { type: String, ref: "Admin", default: null },
}, {
  collection: "emission_factors",
});

emissionFactorSchema.index({ companyId: 1, scope: 1, category: 1, activityType: 1, factorKey: 1, activityUnit: 1, country: 1, region: 1, isActive: 1 });
emissionFactorSchema.index({ scope: 1, activityType: 1, unit: 1, region: 1, isActive: 1 });

module.exports = mongoose.models.EmissionFactor || mongoose.model("EmissionFactor", emissionFactorSchema);
