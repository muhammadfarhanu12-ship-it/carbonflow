const express = require("express");
const { body, param } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/shipment.controller");

const router = express.Router();

const shipmentIdValidator = [
  param("id").isUUID().withMessage("Shipment id must be a valid UUID"),
];

const shipmentCreateValidators = [
  body("supplierId").isUUID().withMessage("supplierId must be a valid UUID"),
  body("reference").trim().isLength({ min: 3, max: 120 }).withMessage("reference must be between 3 and 120 characters"),
  body("origin").trim().isLength({ min: 2, max: 180 }).withMessage("origin is required"),
  body("destination").trim().isLength({ min: 2, max: 180 }).withMessage("destination is required"),
  body("transportMode").isIn(["ROAD", "RAIL", "AIR", "OCEAN"]).withMessage("transportMode is invalid"),
  body("carrier").trim().isLength({ min: 2, max: 120 }).withMessage("carrier is required"),
  body("distanceKm").isFloat({ min: 0.001 }).withMessage("distanceKm must be greater than zero"),
  body("weightKg").isFloat({ min: 0.001 }).withMessage("weightKg must be greater than zero"),
  body("costUsd").isFloat({ min: 0 }).withMessage("costUsd must be zero or positive"),
  body("carbonPricePerTon").optional().isFloat({ min: 0 }).withMessage("carbonPricePerTon must be zero or positive"),
  body("shipmentDate").optional().isISO8601().withMessage("shipmentDate must be a valid ISO8601 date"),
  body("status").optional().isIn(["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"]).withMessage("status is invalid"),
  body("distanceSource").optional().isIn(["MANUAL", "ESTIMATED"]).withMessage("distanceSource is invalid"),
  body("notes").optional().isLength({ max: 600 }).withMessage("notes cannot exceed 600 characters"),
];

const shipmentUpdateValidators = [
  ...shipmentIdValidator,
  body("supplierId").optional().isUUID().withMessage("supplierId must be a valid UUID"),
  body("reference").optional().trim().isLength({ min: 3, max: 120 }).withMessage("reference must be between 3 and 120 characters"),
  body("origin").optional().trim().isLength({ min: 2, max: 180 }).withMessage("origin must be between 2 and 180 characters"),
  body("destination").optional().trim().isLength({ min: 2, max: 180 }).withMessage("destination must be between 2 and 180 characters"),
  body("transportMode").optional().isIn(["ROAD", "RAIL", "AIR", "OCEAN"]).withMessage("transportMode is invalid"),
  body("carrier").optional().trim().isLength({ min: 2, max: 120 }).withMessage("carrier must be between 2 and 120 characters"),
  body("distanceKm").optional().isFloat({ min: 0.001 }).withMessage("distanceKm must be greater than zero"),
  body("weightKg").optional().isFloat({ min: 0.001 }).withMessage("weightKg must be greater than zero"),
  body("costUsd").optional().isFloat({ min: 0 }).withMessage("costUsd must be zero or positive"),
  body("carbonPricePerTon").optional().isFloat({ min: 0 }).withMessage("carbonPricePerTon must be zero or positive"),
  body("shipmentDate").optional().isISO8601().withMessage("shipmentDate must be a valid ISO8601 date"),
  body("status").optional().isIn(["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"]).withMessage("status is invalid"),
  body("distanceSource").optional().isIn(["MANUAL", "ESTIMATED"]).withMessage("distanceSource is invalid"),
  body("notes").optional().isLength({ max: 600 }).withMessage("notes cannot exceed 600 characters"),
];

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.get("/:id", shipmentIdValidator, validateRequest, asyncHandler(controller.getById));
router.post("/", shipmentCreateValidators, validateRequest, asyncHandler(controller.create));
router.put("/:id", shipmentUpdateValidators, validateRequest, asyncHandler(controller.update));
router.delete("/:id", shipmentIdValidator, validateRequest, asyncHandler(controller.remove));

module.exports = router;
