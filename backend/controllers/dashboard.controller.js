const DashboardService = require("../services/dashboard.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.getMetrics = async (req, res) => {
  return sendSuccess(res, {
    message: "Dashboard metrics fetched successfully",
    data: await DashboardService.getMetrics(req.user.companyId),
  });
};

exports.getSummary = exports.getMetrics;
