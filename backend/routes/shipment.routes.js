const express = require("express");
const { body, param } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { requireAnyPermission, requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/shipment.controller");

const router = express.Router();

const shipmentIdValidator = [
  param("id").isUUID().withMessage("Shipment id must be a valid UUID"),
];

const shipmentCreateValidators = [
  body("supplierId").optional({ checkFalsy: true }).isUUID().withMessage("supplierId must be a valid UUID"),
  body("linkedSupplierId").optional({ checkFalsy: true }).isUUID().withMessage("linkedSupplierId must be a valid UUID"),
  body(["reference", "shipmentReference"]).custom((_, { req }) => Boolean(String(req.body.reference || req.body.shipmentReference || "").trim())).withMessage("shipment reference is required"),
  body("reference").optional().trim().isLength({ min: 3, max: 120 }).withMessage("reference must be between 3 and 120 characters"),
  body("shipmentReference").optional().trim().isLength({ min: 3, max: 120 }).withMessage("shipmentReference must be between 3 and 120 characters"),
  body("bolNumber").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("bolNumber cannot exceed 120 characters"),
  body("containerId").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("containerId cannot exceed 120 characters"),
  body("origin").trim().isLength({ min: 2, max: 180 }).withMessage("origin is required"),
  body("originCountry").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("originCountry cannot exceed 120 characters"),
  body("originRegion").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("originRegion cannot exceed 120 characters"),
  body("destination").trim().isLength({ min: 2, max: 180 }).withMessage("destination is required"),
  body("destinationCountry").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("destinationCountry cannot exceed 120 characters"),
  body("destinationRegion").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("destinationRegion cannot exceed 120 characters"),
  body(["transportMode", "mode"]).custom((_, { req }) => ["ROAD", "RAIL", "AIR", "OCEAN", "SEA"].includes(String(req.body.transportMode || req.body.mode || "").trim().toUpperCase())).withMessage("transportMode is invalid"),
  body("carrier").trim().isLength({ min: 2, max: 120 }).withMessage("carrier is required"),
  body("carrierId").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("carrierId cannot exceed 120 characters"),
  body("fuelType").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("fuelType cannot exceed 120 characters"),
  body("distanceKm").isFloat({ min: 0.001 }).withMessage("distanceKm must be greater than zero"),
  body("weightKg").isFloat({ min: 0.001 }).withMessage("weightKg must be greater than zero"),
  body(["costUsd", "cost"]).custom((_, { req }) => {
    const cost = req.body.costUsd ?? req.body.cost;
    return cost === undefined || cost === null || cost === "" || (Number.isFinite(Number(cost)) && Number(cost) >= 0);
  }).withMessage("cost must be zero or positive"),
  body("currency").optional().matches(/^[A-Z]{3}$/i).withMessage("currency must be a valid three-letter code"),
  body("carbonPricePerTon").optional().isFloat({ min: 0 }).withMessage("carbonPricePerTon must be zero or positive"),
  body("shipmentDate").optional().isISO8601().withMessage("shipmentDate must be a valid ISO8601 date"),
  body("reportingPeriod").optional({ nullable: true }).trim().isLength({ max: 20 }).withMessage("reportingPeriod cannot exceed 20 characters"),
  body("status").optional().isIn(["DRAFT", "SUBMITTED", "PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED", "ARCHIVED"]).withMessage("status is invalid"),
  body("distanceSource").optional().isIn(["MANUAL", "ESTIMATED"]).withMessage("distanceSource is invalid"),
  body("notes").optional().isLength({ max: 2000 }).withMessage("notes cannot exceed 2000 characters"),
];

const shipmentUpdateValidators = [
  ...shipmentIdValidator,
  body("supplierId").optional({ checkFalsy: true }).isUUID().withMessage("supplierId must be a valid UUID"),
  body("linkedSupplierId").optional({ checkFalsy: true }).isUUID().withMessage("linkedSupplierId must be a valid UUID"),
  body("reference").optional().trim().isLength({ min: 3, max: 120 }).withMessage("reference must be between 3 and 120 characters"),
  body("shipmentReference").optional().trim().isLength({ min: 3, max: 120 }).withMessage("shipmentReference must be between 3 and 120 characters"),
  body("bolNumber").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("bolNumber cannot exceed 120 characters"),
  body("containerId").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("containerId cannot exceed 120 characters"),
  body("origin").optional().trim().isLength({ min: 2, max: 180 }).withMessage("origin must be between 2 and 180 characters"),
  body("originCountry").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("originCountry cannot exceed 120 characters"),
  body("originRegion").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("originRegion cannot exceed 120 characters"),
  body("destination").optional().trim().isLength({ min: 2, max: 180 }).withMessage("destination must be between 2 and 180 characters"),
  body("destinationCountry").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("destinationCountry cannot exceed 120 characters"),
  body("destinationRegion").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("destinationRegion cannot exceed 120 characters"),
  body("transportMode").optional().isIn(["ROAD", "RAIL", "AIR", "OCEAN"]).withMessage("transportMode is invalid"),
  body("mode").optional().isIn(["ROAD", "RAIL", "AIR", "OCEAN", "SEA"]).withMessage("mode is invalid"),
  body("carrier").optional().trim().isLength({ min: 2, max: 120 }).withMessage("carrier must be between 2 and 120 characters"),
  body("carrierId").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("carrierId cannot exceed 120 characters"),
  body("fuelType").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("fuelType cannot exceed 120 characters"),
  body("distanceKm").optional().isFloat({ min: 0.001 }).withMessage("distanceKm must be greater than zero"),
  body("weightKg").optional().isFloat({ min: 0.001 }).withMessage("weightKg must be greater than zero"),
  body("costUsd").optional().isFloat({ min: 0 }).withMessage("costUsd must be zero or positive"),
  body("cost").optional().isFloat({ min: 0 }).withMessage("cost must be zero or positive"),
  body("currency").optional().matches(/^[A-Z]{3}$/i).withMessage("currency must be a valid three-letter code"),
  body("carbonPricePerTon").optional().isFloat({ min: 0 }).withMessage("carbonPricePerTon must be zero or positive"),
  body("shipmentDate").optional().isISO8601().withMessage("shipmentDate must be a valid ISO8601 date"),
  body("reportingPeriod").optional({ nullable: true }).trim().isLength({ max: 20 }).withMessage("reportingPeriod cannot exceed 20 characters"),
  body("status").optional().isIn(["DRAFT", "SUBMITTED", "PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED", "ARCHIVED"]).withMessage("status is invalid"),
  body("distanceSource").optional().isIn(["MANUAL", "ESTIMATED"]).withMessage("distanceSource is invalid"),
  body("notes").optional().isLength({ max: 2000 }).withMessage("notes cannot exceed 2000 characters"),
];

router.use(authenticate);
router.get("/", requirePermission("shipment:view"), asyncHandler(controller.list));
router.get("/:id", requirePermission("shipment:view"), shipmentIdValidator, validateRequest, asyncHandler(controller.getById));
router.post("/", requirePermission("shipment:create"), shipmentCreateValidators, validateRequest, asyncHandler(controller.create));
router.put("/:id", requirePermission("shipment:update"), shipmentUpdateValidators, validateRequest, asyncHandler(controller.update));
router.patch("/:id", requirePermission("shipment:update"), shipmentUpdateValidators, validateRequest, asyncHandler(controller.update));
router.post("/:id/recalculate", requireAnyPermission(["shipment:recalculate", "shipment:update"]), shipmentIdValidator, validateRequest, asyncHandler(controller.recalculate));
router.patch("/:id/archive", requirePermission("shipment:archive"), shipmentIdValidator, validateRequest, asyncHandler(controller.archive));
router.delete("/:id", requirePermission("shipment:archive"), shipmentIdValidator, validateRequest, asyncHandler(controller.remove));

module.exports = router;
