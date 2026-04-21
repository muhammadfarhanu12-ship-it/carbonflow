const mongoose = require("mongoose");
const { withBaseSchema } = require("./helpers/model.utils");

const auditLogSchema = withBaseSchema({
  companyId: { type: String, ref: "Company", default: null, index: true },
  userId: { type: String, ref: "User", default: null },
  userEmail: { type: String, default: null, trim: true },
  action: { type: String, required: true, trim: true, index: true },
  entityType: { type: String, default: null, trim: true, index: true },
  entityId: { type: String, default: null, trim: true, index: true },
  ipAddress: { type: String, default: null, trim: true },
  details: { type: Object, default: null },
}, {
  collection: "audit_logs",
});

auditLogSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
