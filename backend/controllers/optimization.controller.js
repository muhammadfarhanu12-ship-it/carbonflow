const OptimizationService = require("../services/optimizationService");
const { sendSuccess } = require("../utils/apiResponse");

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

exports.getContext = async (req, res) => {
  const context = await OptimizationService.getContext(req.user.companyId, {
    dateRange: req.query,
    filters: req.query,
  });

  return sendSuccess(res, {
    message: "Optimization context loaded successfully",
    data: context,
  });
};

exports.analyze = async (req, res) => {
  const analysis = await OptimizationService.analyze({
    question: req.body.question || req.body.query,
    dateRange: req.body.dateRange,
    filters: req.body.filters,
  }, req.user, requestMeta(req));

  return sendSuccess(res, {
    message: "Optimization analysis completed successfully",
    data: analysis,
  });
};

exports.listRuns = async (req, res) => {
  const runs = await OptimizationService.listRuns(req.user.companyId);

  return sendSuccess(res, {
    message: "Optimization runs loaded successfully",
    data: runs,
  });
};

exports.getRun = async (req, res) => {
  const run = await OptimizationService.getRun(req.user.companyId, req.params.id);

  return sendSuccess(res, {
    message: "Optimization run loaded successfully",
    data: run,
  });
};

exports.updateRecommendationStatus = async (req, res) => {
  const recommendation = await OptimizationService.updateRecommendationStatus(
    req.user.companyId,
    req.params.id,
    req.body.status,
    req.user,
    requestMeta(req),
  );

  return sendSuccess(res, {
    message: "Optimization recommendation status updated successfully",
    data: recommendation,
  });
};

exports.exportRun = async (req, res) => {
  const file = await OptimizationService.buildExport(
    req.user.companyId,
    req.params.id,
    req.params.format || req.body.format,
    req.user,
    requestMeta(req),
  );

  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  return res.send(file.content);
};
