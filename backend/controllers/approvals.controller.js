const ApprovalsService = require("../services/approvals.service");
const AuditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/apiResponse");

function actorFromRequest(req) {
  return {
    ...req.user,
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

exports.summary = async (req, res) => sendSuccess(res, {
  message: "Approval summary fetched successfully",
  data: await ApprovalsService.summary(req.user.companyId),
});

exports.list = async (req, res) => {
  const data = await ApprovalsService.list(req.user.companyId, req.query);
  await AuditService.logForRequest(req, {
    action: "approval_queue_viewed",
    entityType: "ApprovalQueue",
    entityId: req.user.companyId,
    details: { filters: req.query },
  });
  return sendSuccess(res, {
    message: "Approval queue fetched successfully",
    data,
  });
};

exports.approve = async (req, res) => sendSuccess(res, {
  message: "Approval item approved successfully",
  data: await ApprovalsService.approve(req.params.type, req.params.id, req.user.companyId, actorFromRequest(req), req.body),
});

exports.reject = async (req, res) => sendSuccess(res, {
  message: "Approval item rejected successfully",
  data: await ApprovalsService.reject(req.params.type, req.params.id, req.user.companyId, actorFromRequest(req), req.body),
});

exports.requestCorrection = async (req, res) => sendSuccess(res, {
  message: "Approval correction requested successfully",
  data: await ApprovalsService.requestCorrection(req.params.type, req.params.id, req.user.companyId, actorFromRequest(req), req.body),
});
