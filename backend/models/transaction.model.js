const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const { OFFSET_TRANSACTION_STATUSES, OFFSET_TRANSACTION_TYPES } = require("../constants/platform");

const transactionSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null, index: true, immutable: true },
  projectId: { type: String, ref: "CarbonProject", default: null, index: true, immutable: true },
  userId: { type: String, ref: "User", default: null, index: true, immutable: true },
  type: { type: String, enum: OFFSET_TRANSACTION_TYPES, default: "PURCHASE" },
  status: { type: String, enum: OFFSET_TRANSACTION_STATUSES, default: "COMPLETED", index: true },
  companyName: { type: String, default: null, trim: true, immutable: true },
  projectName: { type: String, default: null, trim: true, immutable: true },
  registry: { type: String, default: null, trim: true, immutable: true },
  registryRecordId: { type: String, default: null, trim: true },
  blockchainHash: { type: String, default: null, trim: true },
  vintageYear: { type: Number, default: null, immutable: true },
  shipmentId: { type: String, ref: "Shipment", default: null, index: true, immutable: true },
  shipmentReference: { type: String, default: null, trim: true, immutable: true },
  shipmentStatus: { type: String, default: null, trim: true, immutable: true },
  credits: { type: Number, default: 0, immutable: true },
  quantity: { type: Number, default: null, immutable: true },
  price: { type: Number, default: 0, immutable: true },
  pricePerTonUsd: { type: Number, default: 0, immutable: true },
  pricePerTon: { type: Number, default: null, immutable: true },
  subtotalUsd: { type: Number, default: 0, immutable: true },
  platformFeeUsd: { type: Number, default: 0, immutable: true },
  total: { type: Number, default: 0, immutable: true },
  totalCostUsd: { type: Number, default: 0, immutable: true },
  totalCost: { type: Number, default: null, immutable: true },
  tCO2eRetired: { type: Number, default: null, immutable: true },
  serialNumber: { type: String, default: null, trim: true, immutable: true },
  idempotencyKey: { type: String, default: null, trim: true, immutable: true },
  requestChecksum: { type: String, default: null, trim: true, immutable: true },
  paymentReference: { type: String, default: null, trim: true },
  completedAt: { type: Date, default: null },
  retiredAt: { type: Date, default: null },
  certificate: {
    transactionId: { type: String, default: null, trim: true },
    issuedAt: { type: Date, default: null },
    certificateUrl: { type: String, default: null, trim: true },
    checksum: { type: String, default: null, trim: true },
    certificateId: { type: String, default: null, trim: true },
    storagePath: { type: String, default: null, trim: true },
    fileName: { type: String, default: null, trim: true },
  },
  metadata: { type: Object, default: {} },
}, {
  collection: "transactions",
});

transactionSchema.index({ companyId: 1, retiredAt: -1 });
transactionSchema.index(
  { companyId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" },
    },
  },
);
transactionSchema.index(
  { serialNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      serialNumber: { $type: "string" },
    },
  },
);

transactionSchema.virtual("organizationId").get(function getOrganizationId() {
  return this.companyId;
});

transactionSchema.virtual("certificateMetadata").get(function getCertificateMetadata() {
  if (!this.certificate?.certificateUrl) {
    return null;
  }

  return {
    transactionId: this.id,
    issuedAt: this.certificate.issuedAt,
    certificateUrl: this.certificate.certificateUrl,
    checksum: this.certificate.checksum,
  };
});

module.exports = mongoose.models.Transaction || mongoose.model("Transaction", transactionSchema);
