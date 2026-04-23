const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { OFFSET_PROJECT_STATUSES } = require("../constants/platform");

const projectDocumentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
}, {
  _id: false,
});

const projectSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  description: { type: String, default: null, trim: true },
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
  availableCredits: { type: Number, required: true, min: 0 },
  reservedCredits: { type: Number, default: 0, min: 0 },
  retiredCredits: { type: Number, default: 0, min: 0 },
  verificationStandard: { type: String, default: null, trim: true },
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
  return this.registry || this.verificationStandard || this.certification;
});

module.exports = mongoose.models.CarbonProject || mongoose.model("CarbonProject", projectSchema);
