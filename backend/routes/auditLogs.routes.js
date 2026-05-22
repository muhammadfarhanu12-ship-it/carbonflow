const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/auditLogs.controller");

const router = express.Router();

router.use(authenticate);

router.get("/summary", requirePermission("audit:view"), asyncHandler(controller.getAuditSummary));
router.get("/export", requirePermission("audit:export"), asyncHandler(controller.exportAuditLogs));
router.get("/entity/:entityType/:entityId", requirePermission("audit:view"), asyncHandler(controller.listEntityAuditLogs));
router.get("/:id", requirePermission("audit:view"), asyncHandler(controller.getAuditLog));
router.get("/", requirePermission("audit:view"), asyncHandler(controller.listAuditLogs));

module.exports = router;
