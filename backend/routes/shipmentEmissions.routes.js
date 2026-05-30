const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requireAnyPermission, requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/shipmentEmissions.controller");

const router = express.Router();

router.use(authenticate);

router.get("/", requirePermission("emission:view"), asyncHandler(controller.listActivities));
router.get("/factors/match", requirePermission("emission:view"), asyncHandler(controller.matchFactor));
router.post("/factors/preview-import", requireAnyPermission(["factor:import", "factor:manage"]), asyncHandler(controller.previewFactorImport));
router.post("/factors/import", requireAnyPermission(["factor:import", "factor:manage"]), asyncHandler(controller.commitFactorImport));
router.get("/factors", requirePermission("factor:view"), asyncHandler(controller.listFactors));
router.post("/factors", requirePermission("factor:manage"), asyncHandler(controller.createFactor));
router.get("/factors/:id", requirePermission("factor:view"), asyncHandler(controller.getFactor));
router.patch("/factors/:id", requirePermission("factor:manage"), asyncHandler(controller.updateFactor));
router.patch("/factors/:id/deactivate", requirePermission("factor:manage"), asyncHandler(controller.deactivateFactor));
router.patch("/factors/:id/reactivate", requirePermission("factor:manage"), asyncHandler(controller.reactivateFactor));
router.get("/import/template", requirePermission("emission:create"), asyncHandler(controller.downloadTemplate));
router.post("/import/preview", requirePermission("emission:create"), asyncHandler(controller.previewImport));
router.post("/import/commit", requirePermission("emission:create"), asyncHandler(controller.commitImport));
router.post("/activities", requirePermission("emission:create"), asyncHandler(controller.createActivity));
router.get("/:id/audit-timeline", requirePermission("emission:view"), asyncHandler(controller.auditTimeline));
router.patch("/:id", requirePermission("emission:update"), asyncHandler(controller.updateActivity));
router.patch("/:id/status", requirePermission("emission:update"), asyncHandler(controller.updateStatus));
router.post("/:id/recalculate", requirePermission("emission:recalculate"), asyncHandler(controller.recalculateRecord));
router.post("/shipments", asyncHandler(controller.calculateShipmentEmissions));

module.exports = router;
