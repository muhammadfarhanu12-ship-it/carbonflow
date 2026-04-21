const CompanyService = require("../services/company.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.list = async (req, res) => sendSuccess(res, {
  message: "Companies fetched successfully",
  data: await CompanyService.list(req.query),
});
exports.getById = async (req, res) => sendSuccess(res, {
  message: "Company fetched successfully",
  data: await CompanyService.getById(req.params.id),
});
exports.create = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Company created successfully",
  data: await CompanyService.create(req.body),
});
exports.update = async (req, res) => sendSuccess(res, {
  message: "Company updated successfully",
  data: await CompanyService.update(req.params.id, req.body),
});
exports.remove = async (req, res) => sendSuccess(res, {
  message: "Company removed successfully",
  data: await CompanyService.remove(req.params.id),
});
