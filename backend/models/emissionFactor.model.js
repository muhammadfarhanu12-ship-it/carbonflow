const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const emissionFactorSchema = withBaseSchema({
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  value: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, trim: true },
  source: { type: String, default: null, trim: true },
  isActive: { type: Boolean, default: true },
}, {
  collection: "emission_factors",
});

module.exports = mongoose.models.EmissionFactor || mongoose.model("EmissionFactor", emissionFactorSchema);
