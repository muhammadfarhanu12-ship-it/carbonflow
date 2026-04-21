const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const costSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null },
  cost: { type: Number, default: 0 },
  emissions: { type: Number, default: 0 },
  month: { type: String, default: null },
}, {
  collection: "costs",
});

module.exports = mongoose.models.Cost || mongoose.model("Cost", costSchema);
