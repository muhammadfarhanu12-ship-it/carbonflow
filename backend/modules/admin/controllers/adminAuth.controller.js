const AdminAuthService = require("../services/adminAuth.service");
const { sendSuccess } = require("../../../utils/apiResponse");

exports.login = async (req, res) => sendSuccess(res, {
  message: "Admin login successful",
  data: await AdminAuthService.login(req.body),
});

exports.register = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Admin registered successfully",
  data: await AdminAuthService.register(req.body, req.admin || null),
});

exports.me = async (req, res) => sendSuccess(res, {
  message: "Admin profile fetched successfully",
  data: await AdminAuthService.getAdminProfile(req.admin.id),
});

exports.changePassword = async (req, res) => sendSuccess(res, {
  message: "Admin password updated successfully",
  data: await AdminAuthService.changePassword(req.admin.id, req.body),
});
