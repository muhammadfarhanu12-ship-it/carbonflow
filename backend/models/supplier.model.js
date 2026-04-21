const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { SUPPLIER_RISK_LEVELS, SUPPLIER_VERIFICATION_STATUSES } = require("../constants/platform");

const supplierSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  name: { type: String, required: true, trim: true },
  contactEmail: { type: String, required: true, trim: true },
  country: { type: String, default: "Unknown", trim: true, index: true },
  region: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  verificationStatus: { type: String, enum: SUPPLIER_VERIFICATION_STATUSES, default: "PENDING", index: true },
  onTimeDeliveryRate: { type: Number, default: 95 },
  renewableRatio: { type: Number, default: 0.1 },
  complianceFlags: { type: Number, default: 0 },
  complianceScore: { type: Number, default: 80 },
  countryRiskIndex: { type: Number, default: 35 },
  emissionFactor: { type: Number, default: 1.2 },
  emissionIntensity: { type: Number, default: 0 },
  totalEmissions: { type: Number, default: 0 },
  revenue: { type: Number, default: null },
  hasISO14001: { type: Boolean, default: false },
  hasSBTi: { type: Boolean, default: false },
  dataTransparencyScore: { type: Number, default: 0 },
  lastReportedAt: { type: Date, default: null },
  carbonScore: { type: Number, default: 75 },
  esgScore: { type: Number, default: 75 },
  riskScore: { type: Number, default: 25 },
  riskLevel: { type: String, enum: SUPPLIER_RISK_LEVELS, default: "LOW", index: true },
  supplierScoreBreakdown: {
    emissionScore: { type: Number, default: 0 },
    certificationScore: { type: Number, default: 0 },
    transparencyScore: { type: Number, default: 0 },
  },
  supplierScoreInsights: [{
    type: {
      type: String,
      enum: ["warning", "info"],
      required: true,
    },
    message: { type: String, required: true, trim: true },
  }],
  supplierBenchmark: {
    industryKey: { type: String, default: "default" },
    industryLabel: { type: String, default: "Cross-industry" },
    industryAverageIntensity: { type: Number, default: 0 },
    percentileRank: { type: Number, default: null },
    industryComparison: {
      type: String,
      enum: ["ABOVE_AVERAGE", "AT_AVERAGE", "BELOW_AVERAGE", "UNKNOWN"],
      default: "UNKNOWN",
    },
    isAboveIndustryAverage: { type: Boolean, default: null },
    variancePct: { type: Number, default: null },
  },
  riskTrend: { type: String, default: null },
  scoreCalculatedAt: { type: Date, default: null },
  scoreVersion: { type: String, default: null },
  invitationStatus: { type: String, enum: ["SENT", "ACCEPTED", "NOT_SENT"], default: "NOT_SENT" },
  notes: { type: String, default: null, trim: true },
  metadata: { type: Object, default: {} },
}, {
  collection: "suppliers",
});

supplierSchema.index({ companyId: 1, name: 1 });
supplierSchema.index({ companyId: 1, category: 1, country: 1 });

supplierSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

module.exports = mongoose.models.Supplier || mongoose.model("Supplier", supplierSchema);
