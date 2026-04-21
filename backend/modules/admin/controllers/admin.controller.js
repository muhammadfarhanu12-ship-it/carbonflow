const AdminService = require("../services/admin.service");
const { sendSuccess } = require("../../../utils/apiResponse");

exports.getDashboard = async (_req, res) => sendSuccess(res, {
  message: "Admin dashboard fetched successfully",
  data: await AdminService.getDashboardData(),
});

exports.getUsers = async (req, res) => sendSuccess(res, {
  message: "Users fetched successfully",
  data: await AdminService.listUsers(req.query),
});

exports.updateUserStatus = async (req, res) => sendSuccess(res, {
  message: "User status updated successfully",
  data: await AdminService.updateUserStatus(req.params.id, req.body.status, req.admin),
});

exports.deleteUser = async (req, res) => sendSuccess(res, {
  message: "User deleted successfully",
  data: await AdminService.deleteUser(req.params.id, req.admin),
});

exports.getAnalytics = async (req, res) => sendSuccess(res, {
  message: "Analytics fetched successfully",
  data: await AdminService.getAnalytics(req.query),
});

exports.getCarbonData = async (req, res) => sendSuccess(res, {
  message: "Carbon data fetched successfully",
  data: await AdminService.listCarbonData(req.query),
});

exports.getReports = async (req, res) => sendSuccess(res, {
  message: "Reports fetched successfully",
  data: await AdminService.listReports(req.query),
});

exports.updateReport = async (req, res) => sendSuccess(res, {
  message: "Report updated successfully",
  data: await AdminService.updateReport(req.params.id, req.body, req.admin),
});

exports.deleteReport = async (req, res) => sendSuccess(res, {
  message: "Report deleted successfully",
  data: await AdminService.deleteReport(req.params.id, req.admin),
});

exports.getSettings = async (_req, res) => sendSuccess(res, {
  message: "Admin settings fetched successfully",
  data: await AdminService.getSettings(),
});

exports.updateSettings = async (req, res) => sendSuccess(res, {
  message: "Admin settings updated successfully",
  data: await AdminService.updateSettings(req.body, req.admin),
});
