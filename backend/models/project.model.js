const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { OFFSET_PROJECT_STATUSES, MARKETPLACE_VERIFICATION_STATUSES } = require("../constants/platform");

const projectDocumentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  type: { type: String, default: "evidence", trim: true },
  uploadedAt: { type: Date, default: null },
}, {
  _id: false,
});

const projectSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  description: { type: String, default: null, trim: true },
  methodology: { type: String, default: null, trim: true },
  registryName: { type: String, default: null, trim: true },
  registryProjectId: { type: String, default: null, trim: true },
  registryUrl: { type: String, default: null, trim: true },
  country: { type: String, default: null, trim: true },
  region: { type: String, default: null, trim: true },
  coordinates: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  pddDocuments: { type: [projectDocumentSchema], default: [] },
  certification: { type: String, required: true, trim: true },
  registry: { type: String, default: null, trim: true },
  vintageYear: { type: Number, default: new Date().getUTCFullYear() },
  rating: { type: Number, default: 4.5, min: 0, max: 5 },
  pricePerCreditUsd: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "USD", trim: true },
  totalQuantityTco2e: { type: Number, default: 0, min: 0 },
  availableCredits: { type: Number, required: true, min: 0 },
  reservedCredits: { type: Number, default: 0, min: 0 },
  retiredCredits: { type: Number, default: 0, min: 0 },
  verificationStandard: { type: String, default: null, trim: true },
  verificationStatus: { type: String, enum: MARKETPLACE_VERIFICATION_STATUSES, default: "UNVERIFIED", index: true },
  isDemo: { type: Boolean, default: false, index: true },
  isSample: { type: Boolean, default: false, index: true },
  isRealInventory: { type: Boolean, default: false, index: true },
  evidenceDocuments: { type: [projectDocumentSchema], default: [] },
  notes: { type: String, default: null, trim: true },
  createdBy: { type: String, ref: "User", default: null },
  updatedBy: { type: String, ref: "User", default: null },
  publishedBy: { type: String, ref: "User", default: null },
  publishedAt: { type: Date, default: null },
  archivedBy: { type: String, ref: "User", default: null },
  archivedAt: { type: Date, default: null },
  status: { type: String, enum: OFFSET_PROJECT_STATUSES, default: "DRAFT", index: true },
}, {
  collection: "carbon_projects",
});

projectSchema.index({ companyId: 1, status: 1, type: 1 });

projectSchema.virtual("pricePerTonUsd").get(function getPricePerTonUsd() {
  return this.pricePerCreditUsd;
});

projectSchema.virtual("pricePerTonUsd").set(function setPricePerTonUsd(value) {
  this.pricePerCreditUsd = value;
});

projectSchema.virtual("verificationStandardComputed").get(function getVerificationStandardComputed() {
  return this.verificationStandard || this.certification;
});

projectSchema.virtual("registryComputed").get(function getRegistryComputed() {
  return this.registryName || this.registry || this.verificationStandard || this.certification;
});

projectSchema.virtual("projectName").get(function getProjectName() {
  return this.name;
});

projectSchema.virtual("availableQuantityTco2e").get(function getAvailableQuantityTco2e() {
  return this.availableCredits;
});

projectSchema.virtual("retiredQuantityTco2e").get(function getRetiredQuantityTco2e() {
  return this.retiredCredits;
});

projectSchema.virtual("reservedQuantityTco2e").get(function getReservedQuantityTco2e() {
  return this.reservedCredits;
});

module.exports = mongoose.models.CarbonProject || mongoose.model("CarbonProject", projectSchema);
