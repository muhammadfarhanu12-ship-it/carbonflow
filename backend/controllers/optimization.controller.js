const OptimizationService = require("../services/optimizationService");
const { sendSuccess } = require("../utils/apiResponse");

exports.analyze = async (req, res) => {
  const analysis = await OptimizationService.analyze(req.body.query, req.user.companyId);

  return sendSuccess(res, {
    message: "Optimization analysis completed successfully",
    data: analysis,
  });
};
