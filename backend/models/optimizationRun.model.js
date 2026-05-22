const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const optimizationRunSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  question: { type: String, required: true, trim: true },
  analysisMode: { type: String, enum: ["rule_based", "ai_assisted", "hybrid"], default: "rule_based", index: true },
  filters: { type: Object, default: {} },
  recommendations: { type: Array, default: [] },
  dataCoverage: { type: Object, default: {} },
  dataQualityIssues: { type: Array, default: [] },
  createdBy: { type: String, ref: "User", default: null, index: true },
}, {
  collection: "optimization_runs",
});

optimizationRunSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.models.OptimizationRun || mongoose.model("OptimizationRun", optimizationRunSchema);
