const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/shipment.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.getById));
router.post("/", [
  body("supplierId").isUUID(),
  body("reference").isLength({ min: 3 }),
  body("origin").notEmpty(),
  body("destination").notEmpty(),
  body("transportMode").isIn(["ROAD", "RAIL", "AIR", "OCEAN"]),
  body("distanceKm").isFloat({ min: 1 }),
  body("weightKg").isFloat({ min: 1 }),
  body("costUsd").isFloat({ min: 0 }),
  body("shipmentDate").optional().isISO8601(),
  body("status").optional().isIn(["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"]),
  body("distanceSource").optional().isIn(["MANUAL", "ESTIMATED"]),
], validateRequest, asyncHandler(controller.create));
router.put("/:id", asyncHandler(controller.update));
router.delete("/:id", asyncHandler(controller.remove));

module.exports = router;
