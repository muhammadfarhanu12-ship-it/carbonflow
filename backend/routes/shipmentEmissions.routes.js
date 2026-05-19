const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/shipmentEmissions.controller");

const router = express.Router();

router.use(authenticate);

router.get("/", asyncHandler(controller.listActivities));
router.get("/factors/match", asyncHandler(controller.matchFactor));
router.get("/factors", asyncHandler(controller.listFactors));
router.get("/import/template", requirePermission("records:create"), asyncHandler(controller.downloadTemplate));
router.post("/import/preview", requirePermission("records:create"), asyncHandler(controller.previewImport));
router.post("/import/commit", requirePermission("records:create"), asyncHandler(controller.commitImport));
router.post("/activities", requirePermission("records:create"), asyncHandler(controller.createActivity));
router.patch("/:id/status", asyncHandler(controller.updateStatus));
router.post("/shipments", asyncHandler(controller.calculateShipmentEmissions));

module.exports = router;
