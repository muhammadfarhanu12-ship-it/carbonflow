const ReportsService = require("../services/reports.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.list = async (req, res) => sendSuccess(res, {
  message: "Reports fetched successfully",
  data: await ReportsService.list(req.query, req.user.companyId),
});

exports.generate = async (req, res) => {
  const report = await ReportsService.generate(req.body, req.user.companyId, req.user);
  req.io.emit("reportGenerated", report);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Report generated successfully",
    data: report,
  });
};

exports.download = async (req, res) => {
  const file = await ReportsService.buildDownload(req.params.fileName, req.user.companyId);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  return res.send(file.content);
};
