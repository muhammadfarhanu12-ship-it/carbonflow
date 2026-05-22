const ReportsService = require("../services/reports.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.list = async (req, res) => sendSuccess(res, {
  message: "Reports fetched successfully",
  data: await ReportsService.list(req.query, req.user.companyId),
});

exports.readiness = async (req, res) => sendSuccess(res, {
  message: "Report readiness fetched successfully",
  data: await ReportsService.readiness(req.body, req.user.companyId, req.user, {
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
  }),
});

exports.generate = async (req, res) => {
  const report = await ReportsService.generate(req.body, req.user.companyId, {
    ...req.user,
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
  });
  req.io.emit("reportGenerated", report);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Report generated successfully",
    data: report,
  });
};

exports.download = async (req, res) => {
  const file = await ReportsService.buildDownload(req.params.fileName, req.user.companyId, req.user, {
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
  });
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(file.content);
};

exports.downloadById = async (req, res) => {
  const file = await ReportsService.buildDownloadById(req.params.id, req.user.companyId, req.user, {
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
  });
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(file.content);
};

exports.archive = async (req, res) => sendSuccess(res, {
  message: "Report archived successfully",
  data: await ReportsService.archive(req.params.id, req.user.companyId, req.user, {
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
  }),
});

exports.regenerate = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Report regenerated successfully",
  data: await ReportsService.regenerate(req.params.id, req.user.companyId, {
    ...req.user,
    ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
  }),
});

exports.auditSummary = async (req, res) => sendSuccess(res, {
  message: "Report audit summary fetched successfully",
  data: await ReportsService.getAuditSummary(req.params.id, req.user.companyId),
});
