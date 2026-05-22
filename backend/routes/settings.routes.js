const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const validateRequest = require("../middleware/validate");
const controller = require("../controllers/settings.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", requirePermission("settings:view"), asyncHandler(controller.get));
router.put("/", requirePermission("settings:view"), [
  body("profile.name").optional().isLength({ min: 2, max: 120 }),
  body("profile.email").optional().isEmail(),
  body("profile.timezone").optional().isLength({ min: 2, max: 80 }),
  body("profile.locale").optional().isLength({ min: 2, max: 20 }),
  body("company.companyName").optional().isLength({ min: 2, max: 120 }),
  body("company.legalName").optional().isLength({ min: 2, max: 160 }),
  body("company.industry").optional().isLength({ min: 2, max: 120 }),
  body("company.headquarters").optional().isLength({ min: 2, max: 120 }),
  body("company.country").optional().isLength({ min: 2, max: 80 }),
  body("company.region").optional().isLength({ min: 2, max: 80 }),
  body("company.currency").optional().isLength({ min: 3, max: 3 }),
  body("company.fiscalYearStartMonth").optional().isInt({ min: 1, max: 12 }),
  body("company.reportingYear").optional().isInt({ min: 2000, max: 2200 }),
  body("company.carbonPricePerTon").optional().isFloat({ min: 0 }),
  body("company.netZeroTargetYear").optional().isInt({ min: 2024, max: 2100 }),
  body("company.revenueUsd").optional().isFloat({ min: 0 }),
  body("company.annualShipmentWeightKg").optional().isFloat({ min: 0 }),
  body("company.preferredUnits").optional().isIn(["metric", "imperial"]),
  body("company.defaultReportingBoundary").optional().isIn(["operational_control", "financial_control", "equity_share"]),
  body("company.defaultReportInclusionPolicy").optional().isIn(["approved_only", "all_with_warning"]),
  body("company.dataRetentionYears").optional().isInt({ min: 1, max: 25 }),
  body("organization.companyName").optional().isLength({ min: 2, max: 120 }),
  body("organization.legalName").optional().isLength({ min: 2, max: 160 }),
  body("organization.industry").optional().isLength({ min: 2, max: 120 }),
  body("organization.headquarters").optional().isLength({ min: 2, max: 120 }),
  body("organization.country").optional().isLength({ min: 2, max: 80 }),
  body("organization.region").optional().isLength({ min: 2, max: 80 }),
  body("organization.currency").optional().isLength({ min: 3, max: 3 }),
  body("organization.fiscalYearStartMonth").optional().isInt({ min: 1, max: 12 }),
  body("organization.reportingYear").optional().isInt({ min: 2000, max: 2200 }),
  body("organization.carbonPricePerTon").optional().isFloat({ min: 0 }),
  body("organization.netZeroTargetYear").optional().isInt({ min: 2024, max: 2100 }),
  body("organization.revenueUsd").optional().isFloat({ min: 0 }),
  body("organization.annualShipmentWeightKg").optional().isFloat({ min: 0 }),
  body("organization.preferredUnits").optional().isIn(["metric", "imperial"]),
  body("organization.defaultReportingBoundary").optional().isIn(["operational_control", "financial_control", "equity_share"]),
  body("organization.defaultReportInclusionPolicy").optional().isIn(["approved_only", "all_with_warning"]),
  body("organization.dataRetentionYears").optional().isInt({ min: 1, max: 25 }),
  body("operationalMetrics.revenueUsd").optional().isFloat({ min: 0 }),
  body("operationalMetrics.annualShipmentWeightKg").optional().isFloat({ min: 0 }),
  body("operationalMetrics.electricityConsumptionKwh").optional().isFloat({ min: 0 }),
  body("operationalMetrics.renewableElectricityPct").optional().isFloat({ min: 0, max: 100 }),
  body("operationalMetrics.stationaryFuelLiters").optional().isFloat({ min: 0 }),
  body("operationalMetrics.mobileFuelLiters").optional().isFloat({ min: 0 }),
  body("operationalMetrics.companyVehicleKm").optional().isFloat({ min: 0 }),
  body("operationalMetrics.stationaryFuelType").optional().isLength({ min: 2, max: 40 }),
  body("operationalMetrics.mobileFuelType").optional().isLength({ min: 2, max: 40 }),
  body("preferences.notificationsEnabled").optional().isBoolean(),
  body("preferences.securityAlertsEnabled").optional().isBoolean(),
  body("preferences.reportNotificationsEnabled").optional().isBoolean(),
  body("preferences.integrationSyncNotificationsEnabled").optional().isBoolean(),
  body("preferences.marketplaceNotificationsEnabled").optional().isBoolean(),
  body("password.currentPassword").optional().isLength({ min: 8 }),
  body("password.newPassword").optional().isStrongPassword({ minLength: 10, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 }),
  body("password.confirmPassword").optional().isString(),
], validateRequest, asyncHandler(controller.update));
router.post("/api-keys", requirePermission("settings:api_keys:manage"), [
  body("label").optional().isLength({ min: 2, max: 80 }),
  body("scopes").optional().isArray(),
  body("expiresAt").optional().isISO8601(),
], validateRequest, asyncHandler(controller.createApiKey));
router.patch("/api-keys/:id/revoke", requirePermission("settings:api_keys:manage"), asyncHandler(controller.revokeApiKey));
router.post("/api-keys/:id/rotate", requirePermission("settings:api_keys:manage"), [
  body("expiresAt").optional().isISO8601(),
], validateRequest, asyncHandler(controller.rotateApiKey));
router.post("/integrations/:name/test", requirePermission("settings:integrations:manage"), asyncHandler(controller.testIntegration));
router.post("/integrations/:name/sync", requirePermission("settings:integrations:manage"), asyncHandler(controller.syncIntegration));
router.get("/integrations/:name/sync-history", requirePermission("settings:view"), asyncHandler(controller.integrationHistory));

module.exports = router;
