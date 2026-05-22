const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const marketplaceBudgetRequestSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  requestedAmount: { type: Number, required: true, min: 0 },
  currentBudget: { type: Number, default: 0, min: 0 },
  reason: { type: String, default: null, trim: true },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING", index: true },
  reviewReason: { type: String, default: null, trim: true },
  requestedBy: { type: String, ref: "User", default: null },
  reviewedBy: { type: String, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, {
  collection: "marketplace_budget_requests",
});

marketplaceBudgetRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.MarketplaceBudgetRequest || mongoose.model("MarketplaceBudgetRequest", marketplaceBudgetRequestSchema);
