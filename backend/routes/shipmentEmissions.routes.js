const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/shipmentEmissions.controller");

const router = express.Router();

router.use(authenticate);

router.post("/shipments", asyncHandler(controller.calculateShipmentEmissions));

module.exports = router;
