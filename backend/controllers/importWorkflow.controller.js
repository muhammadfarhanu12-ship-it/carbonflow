const ImportWorkflowService = require("../services/importWorkflow.service");
const AuditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/apiResponse");

function actorFromRequest(req) {
  return {
    ...req.user,
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

exports.list = async (req, res) => sendSuccess(res, {
  message: "Import history fetched successfully",
  data: await ImportWorkflowService.list(req.user.companyId, req.query),
});

exports.get = async (req, res) => sendSuccess(res, {
  message: "Import history item fetched successfully",
  data: await ImportWorkflowService.get(req.user.companyId, req.params.id),
});

exports.errors = async (req, res) => {
  const item = await ImportWorkflowService.get(req.user.companyId, req.params.id);
  await AuditService.logForRequest(req, {
    action: "import_error_report_downloaded",
    entityType: "Import",
    entityId: req.params.id,
    details: { importType: item.importType, errorCount: item.errors?.length || 0 },
  });
  return sendSuccess(res, {
    message: "Import error report fetched successfully",
    data: item.errors || [],
  });
};

exports.template = async (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.type}-import-template.csv"`);
  return res.send(ImportWorkflowService.getTemplate(req.params.type));
};

exports.preview = async (req, res) => sendSuccess(res, {
  message: "Import preview generated successfully",
  data: await ImportWorkflowService.preview(req.params.type, req.body.csv, req.user.companyId, actorFromRequest(req), { fileName: req.body.fileName }),
});

exports.commit = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Import committed successfully",
  data: await ImportWorkflowService.commit(req.params.type, req.body.csv, req.user.companyId, actorFromRequest(req), { fileName: req.body.fileName }),
});
