const { body, param, query } = require("express-validator");

const paginationValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("pageSize must be between 1 and 100"),
];

const listUsersValidator = [
  ...paginationValidators,
  query("search").optional().trim().isLength({ max: 120 }).withMessage("search is too long"),
  query("status").optional().isIn(["ACTIVE", "INVITED", "SUSPENDED"]).withMessage("Invalid user status"),
];

const userStatusValidator = [
  param("id").trim().notEmpty().withMessage("User id is required"),
  body("status").isIn(["ACTIVE", "INVITED", "SUSPENDED"]).withMessage("Invalid user status"),
];

const deleteUserValidator = [
  param("id").trim().notEmpty().withMessage("User id is required"),
];

const reportIdValidator = [
  param("id").trim().notEmpty().withMessage("Report id is required"),
];

const analyticsValidator = [
  query("months").optional().isInt({ min: 3, max: 24 }).withMessage("months must be between 3 and 24"),
];

const carbonDataValidator = [
  ...paginationValidators,
  query("search").optional().trim().isLength({ max: 120 }).withMessage("search is too long"),
  query("status").optional().isIn(["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"]).withMessage("Invalid shipment status"),
  query("transportMode").optional().isIn(["ROAD", "RAIL", "AIR", "OCEAN"]).withMessage("Invalid transport mode"),
];

const reportsValidator = [
  ...paginationValidators,
  query("search").optional().trim().isLength({ max: 120 }).withMessage("search is too long"),
  query("status").optional().isIn(["READY", "PROCESSING", "FAILED"]).withMessage("Invalid report status"),
];

const updateReportValidator = [
  param("id").trim().notEmpty().withMessage("Report id is required"),
  body("status").optional().isIn(["READY", "PROCESSING", "FAILED"]).withMessage("Invalid report status"),
  body("downloadUrl").optional().isString().isLength({ min: 1 }).withMessage("downloadUrl must be a non-empty string"),
  body("metadata").optional().isObject().withMessage("metadata must be an object"),
];

const settingsValidator = [
  body("platformName").optional().trim().isLength({ min: 2, max: 120 }).withMessage("platformName must be between 2 and 120 characters"),
  body("supportEmail").optional().trim().isEmail().withMessage("supportEmail must be a valid email address"),
  body("sessionTimeoutMinutes").optional().isInt({ min: 15, max: 1440 }).withMessage("sessionTimeoutMinutes must be between 15 and 1440"),
  body("maintenanceMode").optional().isBoolean().withMessage("maintenanceMode must be true or false"),
  body("allowSelfSignup").optional().isBoolean().withMessage("allowSelfSignup must be true or false"),
  body("emissionFactors").optional().isObject().withMessage("emissionFactors must be an object"),
  body("emissionFactors.road").optional().isFloat({ min: 0 }).withMessage("road emission factor must be zero or greater"),
  body("emissionFactors.air").optional().isFloat({ min: 0 }).withMessage("air emission factor must be zero or greater"),
  body("emissionFactors.ocean").optional().isFloat({ min: 0 }).withMessage("ocean emission factor must be zero or greater"),
];

module.exports = {
  listUsersValidator,
  userStatusValidator,
  deleteUserValidator,
  reportIdValidator,
  analyticsValidator,
  carbonDataValidator,
  reportsValidator,
  updateReportValidator,
  settingsValidator,
};
