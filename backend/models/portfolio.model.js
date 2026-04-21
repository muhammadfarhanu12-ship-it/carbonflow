const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const portfolioSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null },
  projectId: { type: String, ref: "CarbonProject", default: null },
  creditsOwned: { type: Number, default: 0 },
}, {
  collection: "portfolios",
});

module.exports = mongoose.models.Portfolio || mongoose.model("Portfolio", portfolioSchema);
