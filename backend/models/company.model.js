const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const companySchema = withBaseSchema({
  name: { type: String, required: true, trim: true },
  industry: { type: String, required: true, trim: true },
  headquarters: { type: String, required: true, trim: true },
  region: { type: String, default: "GLOBAL", trim: true },
  currency: { type: String, default: "USD", trim: true },
  revenueUsd: { type: Number, default: 1000000 },
  annualShipmentWeightKg: { type: Number, default: 0 },
  primaryElectricityRegion: { type: String, default: "GLOBAL", trim: true },
  carbonTargetYear: { type: Number, required: true, default: 2040 },
  carbonPricePerTon: { type: Number, required: true, default: 55 },
  apiKey: { type: String, default: null, index: { unique: true, sparse: true } },
  planType: { type: String, enum: ["TRIAL", "STARTER", "GROWTH", "ENTERPRISE"], default: "TRIAL" },
  status: { type: String, enum: ["ACTIVE", "TRIAL", "SUSPENDED"], default: "ACTIVE" },
}, {
  collection: "companies",
});

companySchema.virtual("organizationId").get(function getOrganizationId() {
  return this.id;
});

companySchema.index({ status: 1, planType: 1 });

module.exports = mongoose.models.Company || mongoose.model("Company", companySchema);
