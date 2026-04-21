const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const ledgerSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  shipmentId: { type: String, ref: "Shipment", default: null, index: true },
  transactionId: { type: String, ref: "Transaction", default: null, index: true },
  entryDate: { type: String, required: true },
  category: { type: String, enum: ["FREIGHT", "OFFSET", "TAX", "ADJUSTMENT"], required: true },
  description: { type: String, required: true, trim: true },
  logisticsCostUsd: { type: Number, default: 0 },
  emissionsTonnes: { type: Number, default: 0 },
  carbonTaxUsd: { type: Number, default: 0 },
  carbonCostUsd: { type: Number, default: 0 },
  totalCostUsd: { type: Number, default: 0 },
  metadata: { type: Object, default: {} },
}, {
  collection: "ledger_entries",
});

ledgerSchema.index({ companyId: 1, entryDate: -1 });
ledgerSchema.index({ companyId: 1, category: 1, entryDate: -1 });
ledgerSchema.index(
  { companyId: 1, transactionId: 1, shipmentId: 1, category: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionId: { $type: "string" },
      category: "OFFSET",
    },
  },
);

ledgerSchema.virtual("shipment", {
  ref: "Shipment",
  localField: "shipmentId",
  foreignField: "_id",
  justOne: true,
});

ledgerSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

module.exports = mongoose.models.LedgerEntry || mongoose.model("LedgerEntry", ledgerSchema);
