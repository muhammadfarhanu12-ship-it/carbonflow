const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const supplierBenchmarkSchema = withBaseSchema({
  category: { type: String, required: true, trim: true, index: true },
  region: { type: String, default: "GLOBAL", trim: true, index: true },
  country: { type: String, default: null, trim: true, index: true },
  industryCode: { type: String, default: null, trim: true, index: true },
  averageIntensity: { type: Number, required: true, min: 0 },
  medianIntensity: { type: Number, default: null, min: 0 },
  percentile25: { type: Number, default: null, min: 0 },
  percentile75: { type: Number, default: null, min: 0 },
  sourceName: { type: String, required: true, trim: true, index: true },
  sourceYear: { type: Number, required: true, index: true },
  version: { type: String, default: "v1", trim: true, index: true },
  isOfficial: { type: Boolean, default: false },
  isSample: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true, index: true },
  provider: {
    type: String,
    enum: ["uploaded_csv", "external", "manual"],
    default: "uploaded_csv",
    index: true,
  },
  effectiveFrom: { type: Date, default: null, index: true },
  effectiveTo: { type: Date, default: null, index: true },
  createdBy: { type: String, ref: "Admin", default: null },
  updatedBy: { type: String, ref: "Admin", default: null },
}, {
  collection: "supplier_benchmarks",
});

supplierBenchmarkSchema.index({
  category: 1,
  region: 1,
  country: 1,
  industryCode: 1,
  sourceYear: -1,
  version: -1,
  isActive: 1,
});

module.exports = mongoose.models.SupplierBenchmark || mongoose.model("SupplierBenchmark", supplierBenchmarkSchema);
