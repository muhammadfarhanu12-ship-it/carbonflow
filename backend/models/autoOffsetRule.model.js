const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const autoOffsetRuleSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false },
  carbonIntensityThreshold: { type: Number, default: 0.8, min: 0 },
  maxSpendPerMonth: { type: Number, default: null, min: 0 },
  preferredProjectTypes: { type: [String], default: [] },
  preferredRegistries: { type: [String], default: [] },
  requireApproval: { type: Boolean, default: true },
  lastEvaluatedAt: { type: Date, default: null },
  lastEvaluation: { type: Object, default: {} },
  createdBy: { type: String, ref: "User", default: null },
  updatedBy: { type: String, ref: "User", default: null },
}, {
  collection: "marketplace_auto_offset_rules",
});

module.exports = mongoose.models.AutoOffsetRule || mongoose.model("AutoOffsetRule", autoOffsetRuleSchema);
