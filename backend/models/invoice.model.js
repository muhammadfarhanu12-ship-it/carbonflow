const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const invoiceSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", required: true, index: true },
  invoiceNumber: { type: String, required: true, unique: true, trim: true },
  amountUsd: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "USD", trim: true },
  status: { type: String, enum: ["DRAFT", "ISSUED", "PAID", "OVERDUE", "CANCELLED"], default: "ISSUED" },
  issuedAt: { type: Date, default: Date.now },
  dueAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  lineItems: {
    type: [{
      description: { type: String, trim: true },
      quantity: { type: Number, min: 0, default: 1 },
      unitPriceUsd: { type: Number, min: 0, default: 0 },
      totalUsd: { type: Number, min: 0, default: 0 },
    }],
    default: [],
  },
  notes: { type: String, default: null, trim: true },
}, {
  collection: "invoices",
});

module.exports = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
