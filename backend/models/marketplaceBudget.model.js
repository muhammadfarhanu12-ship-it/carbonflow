const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const marketplaceBudgetSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, unique: true, index: true },
  totalBudget: { type: Number, default: 0, min: 0 },
  monthlyBudget: { type: Number, default: null, min: 0 },
  approvalRequiredThreshold: { type: Number, default: null, min: 0 },
  currency: { type: String, default: "USD", trim: true },
  createdBy: { type: String, ref: "User", default: null },
  updatedBy: { type: String, ref: "User", default: null },
}, {
  collection: "marketplace_budgets",
});

module.exports = mongoose.models.MarketplaceBudget || mongoose.model("MarketplaceBudget", marketplaceBudgetSchema);
