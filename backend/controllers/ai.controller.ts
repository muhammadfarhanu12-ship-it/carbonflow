const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const aiService = require("../services/ai.service.ts");

function getRequestSizeBytes(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body || {}), "utf8");
  } catch (_error) {
    return null;
  }
}

async function optimize(req, res) {
  if (!req.body || !req.body.carbonLedger || typeof req.body.carbonLedger !== "object" || Array.isArray(req.body.carbonLedger)) {
    throw new ApiError(400, "carbonLedger is required and must be an object");
  }

  logger.info("ai.optimize.endpoint.received", {
    path: req.originalUrl,
    requestSizeBytes: getRequestSizeBytes(req.body),
  });

  const recommendations = await aiService.generateOptimizationRecommendations(req.body.carbonLedger);

  return res.status(200).json({
    success: true,
    data: recommendations,
  });
}

module.exports = {
  optimize,
};
