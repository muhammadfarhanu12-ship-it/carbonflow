const AuditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.listAuditLogs = async (req, res) => sendSuccess(res, {
  message: "Audit logs fetched successfully",
  data: await AuditService.list(req.user.companyId, req.query),
});

exports.getAuditLog = async (req, res) => sendSuccess(res, {
  message: "Audit log fetched successfully",
  data: await AuditService.getById(req.user.companyId, req.params.id),
});

exports.listEntityAuditLogs = async (req, res) => sendSuccess(res, {
  message: "Entity audit logs fetched successfully",
  data: await AuditService.listByEntity(req.user.companyId, req.params.entityType, req.params.entityId, req.query),
});

exports.getAuditSummary = async (req, res) => sendSuccess(res, {
  message: "Audit summary fetched successfully",
  data: await AuditService.summary(req.user.companyId, req.query),
});

exports.exportAuditLogs = async (req, res) => {
  const exported = await AuditService.export(req.user.companyId, req.query, req.user, {
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
    requestId: req.headers["x-request-id"] || req.headers["x-correlation-id"] || null,
  });

  res.setHeader("Content-Type", exported.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${exported.fileName}"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(exported.content);
};
