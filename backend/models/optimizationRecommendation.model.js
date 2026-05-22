const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const optimizationRecommendationSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  runId: { type: String, ref: "OptimizationRun", required: true, index: true },
  recommendationId: { type: String, required: true, trim: true, index: true },
  title: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ["route", "mode_shift", "carrier", "supplier", "data_quality", "financial"],
    required: true,
    index: true,
  },
  priority: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium", index: true },
  estimatedTco2eSavings: { type: Number, default: null },
  estimatedCostImpact: { type: Number, default: null },
  confidenceScore: { type: Number, default: 0 },
  effortLevel: { type: String, default: "medium", trim: true },
  implementationTimeframe: { type: String, default: "30-90 days", trim: true },
  affectedRecordsCount: { type: Number, default: 0 },
  affectedShipments: [{ type: String, ref: "Shipment" }],
  affectedSuppliers: [{ type: String, ref: "Supplier" }],
  explanation: { type: String, required: true, trim: true },
  assumptions: [{ type: String, trim: true }],
  requiredData: [{ type: String, trim: true }],
  nextActions: [{ type: String, trim: true }],
  dataUsed: [{ type: String, trim: true }],
  calculationBasis: { type: String, default: null, trim: true },
  status: {
    type: String,
    enum: ["suggested", "planned", "in_progress", "implemented", "dismissed"],
    default: "suggested",
    index: true,
  },
  createdBy: { type: String, ref: "User", default: null },
  updatedBy: { type: String, ref: "User", default: null },
}, {
  collection: "optimization_recommendations",
});

optimizationRecommendationSchema.index({ companyId: 1, runId: 1 });
optimizationRecommendationSchema.index({ companyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.OptimizationRecommendation || mongoose.model("OptimizationRecommendation", optimizationRecommendationSchema);
