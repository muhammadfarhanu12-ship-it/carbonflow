const ProjectService = require("../services/project.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.listProjects = async (req, res) => sendSuccess(res, {
  message: "Projects fetched successfully",
  data: await ProjectService.listProjects(req.user.companyId, req.query),
});

exports.getProjectById = async (req, res) => sendSuccess(res, {
  message: "Project fetched successfully",
  data: await ProjectService.getProjectById(req.params.id, req.user.companyId),
});

exports.createProject = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Project created successfully",
  data: await ProjectService.createProject(req.body, req.user.companyId, req.user),
});

exports.updateProject = async (req, res) => sendSuccess(res, {
  message: "Project updated successfully",
  data: await ProjectService.updateProject(req.params.id, req.body, req.user.companyId, req.user),
});

exports.deleteProject = async (req, res) => sendSuccess(res, {
  message: "Project deleted successfully",
  data: await ProjectService.deleteProject(req.params.id, req.user.companyId, req.user),
});
