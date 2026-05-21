const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");
const {
  SUPPLIER_EVIDENCE_STATUSES,
  SUPPLIER_EVIDENCE_TYPES,
} = require("../constants/platform");

const supplierEvidenceSchema = withBaseSchema({
  supplierId: { type: String, ref: "Supplier", required: true, index: true },
  companyId: { type: String, ref: "Company", required: true, index: true },
  evidenceType: { type: String, enum: SUPPLIER_EVIDENCE_TYPES, required: true, index: true },
  title: { type: String, required: true, trim: true },
  status: { type: String, enum: SUPPLIER_EVIDENCE_STATUSES, default: "requested", index: true },
  fileUrl: { type: String, default: null, trim: true },
  fileName: { type: String, default: null, trim: true },
  fileSize: { type: Number, default: null },
  mimeType: { type: String, default: null, trim: true },
  storageKey: { type: String, default: null, trim: true },
  signedUrl: { type: String, default: null, trim: true },
  uploadedAt: { type: Date, default: null },
  uploadedBy: { type: String, default: null },
  uploadedVia: { type: String, enum: ["app", "questionnaire", null], default: null },
  virusScanStatus: { type: String, enum: ["not_scanned", "pending", "clean", "failed"], default: "not_scanned" },
  expiryReminder30SentAt: { type: Date, default: null },
  expiryReminder7SentAt: { type: Date, default: null },
  lastReminderSentAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: String, default: null },
  expiresAt: { type: Date, default: null },
  notes: { type: String, default: null, trim: true },
  createdBy: { type: String, default: null },
  updatedBy: { type: String, default: null },
}, {
  collection: "supplier_evidence",
});

supplierEvidenceSchema.index({ companyId: 1, supplierId: 1, evidenceType: 1 });
supplierEvidenceSchema.index({ companyId: 1, supplierId: 1, status: 1 });

module.exports = mongoose.models.SupplierEvidence || mongoose.model("SupplierEvidence", supplierEvidenceSchema);
