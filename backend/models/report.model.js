const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const reportSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ["ESG", "COMPLIANCE", "ANALYTICS", "CUSTOM"], required: true },
  format: { type: String, enum: ["CSV", "PDF"], default: "CSV" },
  generatedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["READY", "PROCESSING", "FAILED"], default: "READY" },
  downloadUrl: { type: String, required: true },
  metadata: { type: Object, default: {} },
}, {
  collection: "reports",
});

module.exports = mongoose.models.Report || mongoose.model("Report", reportSchema);
