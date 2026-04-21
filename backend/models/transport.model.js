const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const transportSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null },
  mode: { type: String, default: null },
  emissions: { type: Number, default: 0 },
}, {
  collection: "transports",
});

module.exports = mongoose.models.Transport || mongoose.model("Transport", transportSchema);
