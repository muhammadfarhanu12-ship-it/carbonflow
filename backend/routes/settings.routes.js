const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const validateRequest = require("../middleware/validate");
const controller = require("../controllers/settings.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", asyncHandler(controller.get));
router.put("/", [
  body("profile.name").optional().isLength({ min: 2, max: 120 }),
  body("profile.email").optional().isEmail(),
  body("company.companyName").optional().isLength({ min: 2, max: 120 }),
  body("company.industry").optional().isLength({ min: 2, max: 120 }),
  body("company.region").optional().isLength({ min: 2, max: 80 }),
  body("company.currency").optional().isLength({ min: 3, max: 3 }),
  body("company.carbonPricePerTon").optional().isFloat({ min: 0 }),
  body("company.netZeroTargetYear").optional().isInt({ min: 2024, max: 2100 }),
  body("company.revenueUsd").optional().isFloat({ min: 0 }),
  body("company.annualShipmentWeightKg").optional().isFloat({ min: 0 }),
  body("organization.companyName").optional().isLength({ min: 2, max: 120 }),
  body("organization.industry").optional().isLength({ min: 2, max: 120 }),
  body("organization.region").optional().isLength({ min: 2, max: 80 }),
  body("organization.currency").optional().isLength({ min: 3, max: 3 }),
  body("organization.carbonPricePerTon").optional().isFloat({ min: 0 }),
  body("organization.netZeroTargetYear").optional().isInt({ min: 2024, max: 2100 }),
  body("organization.revenueUsd").optional().isFloat({ min: 0 }),
  body("organization.annualShipmentWeightKg").optional().isFloat({ min: 0 }),
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
  body("password.currentPassword").optional().isLength({ min: 8 }),
  body("password.newPassword").optional().isLength({ min: 8 }),
], validateRequest, asyncHandler(controller.update));
router.post("/api-keys", [
  body("label").optional().isLength({ min: 2, max: 80 }),
], validateRequest, asyncHandler(controller.createApiKey));
router.post("/integrations/:name/sync", asyncHandler(controller.syncIntegration));

module.exports = router;
