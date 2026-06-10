const UserService = require("../services/user.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.getCurrentUser = async (req, res) => sendSuccess(res, {
  message: "Current user fetched successfully",
  data: await UserService.getCurrentUser(req.user.id),
});

exports.listUsers = async (req, res) => sendSuccess(res, {
  message: "Users fetched successfully",
  data: await UserService.listUsers(req.user, req.query),
});

exports.listTeamMembers = async (req, res) => sendSuccess(res, {
  message: "Workspace users fetched successfully",
  data: await UserService.listTeamMembers(req.user),
});

exports.listPendingInvites = async (req, res) => sendSuccess(res, {
  message: "Pending invites fetched successfully",
  data: await UserService.listPendingInvites(req.user),
});

exports.createUser = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "User created successfully",
  data: await UserService.createUser(req.body, req.user),
});

exports.inviteUser = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "User invited successfully",
  data: await UserService.inviteUser(req.body, req.user),
});

exports.getUserById = async (req, res) => sendSuccess(res, {
  message: "User fetched successfully",
  data: await UserService.getUserById(req.params.id, req.user),
});

exports.updateCurrentUser = async (req, res) => sendSuccess(res, {
  message: "Current user updated successfully",
  data: await UserService.updateCurrentUser(req.user.id, req.body),
});

exports.updateUser = async (req, res) => sendSuccess(res, {
  message: "User updated successfully",
  data: await UserService.updateUser(req.params.id, req.body, req.user),
});

exports.updateUserRole = async (req, res) => sendSuccess(res, {
  message: "User role updated successfully",
  data: await UserService.updateUserRole(req.params.id, req.body.role, req.user),
});

exports.updateUserStatus = async (req, res) => sendSuccess(res, {
  message: "User status updated successfully",
  data: await UserService.updateUserStatus(req.params.id, req.body.status, req.user),
});

exports.resendInvite = async (req, res) => sendSuccess(res, {
  message: "Invite resent successfully",
  data: await UserService.resendInvite(req.params.id, req.user),
});

exports.cancelInvite = async (req, res) => sendSuccess(res, {
  message: "Invite cancelled successfully",
  data: await UserService.cancelInvite(req.params.id, req.user),
});

exports.deleteUser = async (req, res) => sendSuccess(res, {
  message: "User deleted successfully",
  data: await UserService.deleteUser(req.params.id, req.user),
});
