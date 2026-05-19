const AuditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.listAuditLogs = async (req, res) => sendSuccess(res, {
  message: "Audit logs fetched successfully",
  data: await AuditService.list(req.user.companyId, req.query),
});
