const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const auditLogSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null, index: true },
  userId: { type: String, ref: "User", default: null },
  userEmail: { type: String, default: null, trim: true },
  userName: { type: String, default: null, trim: true },
  action: { type: String, required: true, trim: true, index: true },
  actionLabel: { type: String, default: null, trim: true },
  entityType: { type: String, default: null, trim: true, index: true },
  entityId: { type: String, default: null, trim: true, index: true },
  entityLabel: { type: String, default: null, trim: true },
  module: { type: String, default: "system", trim: true, index: true },
  severity: { type: String, enum: ["info", "low", "medium", "high", "critical"], default: "info", index: true },
  category: { type: String, default: "system", trim: true, index: true },
  ipAddress: { type: String, default: null, trim: true },
  userAgent: { type: String, default: null, trim: true },
  requestId: { type: String, default: null, trim: true, index: true },
  source: { type: String, enum: ["web", "admin_panel", "api", "system", "import", "automation"], default: "web", index: true },
  status: { type: String, enum: ["success", "failed"], default: "success", index: true },
  errorCode: { type: String, default: null, trim: true },
  oldValue: { type: Object, default: null },
  newValue: { type: Object, default: null },
  changesSummary: { type: [String], default: [] },
  reason: { type: String, default: null, trim: true },
  metadata: { type: Object, default: null },
  details: { type: Object, default: null },
  retentionUntil: { type: Date, default: null, index: true },
  retentionPolicy: { type: String, default: "standard_7_years", trim: true },
  integrityHash: { type: String, default: null, trim: true },
  previousHash: { type: String, default: null, trim: true },
}, {
  collection: "audit_logs",
});

auditLogSchema.index({ companyId: 1, createdAt: -1 });
auditLogSchema.index({ companyId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ companyId: 1, entityType: 1, createdAt: -1 });
auditLogSchema.index({ companyId: 1, module: 1, createdAt: -1 });
auditLogSchema.index({ companyId: 1, severity: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
