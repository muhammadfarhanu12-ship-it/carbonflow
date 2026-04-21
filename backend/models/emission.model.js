const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const emissionSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null },
  scope: { type: Number, default: null },
  value: { type: Number, default: 0 },
  month: { type: String, default: null },
  year: { type: Number, default: null },
}, {
  collection: "emissions",
});

module.exports = mongoose.models.Emission || mongoose.model("Emission", emissionSchema);
