const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/reports.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", requirePermission("report:view"), asyncHandler(controller.list));
router.post("/readiness", requirePermission("report:view"), asyncHandler(controller.readiness));
router.post("/generate", requirePermission("report:generate"), asyncHandler(controller.generate));
router.get("/:id/download", requirePermission("report:download"), asyncHandler(controller.downloadById));
router.post("/:id/regenerate", requirePermission("report:regenerate"), asyncHandler(controller.regenerate));
router.patch("/:id/archive", requirePermission("report:archive"), asyncHandler(controller.archive));
router.get("/:id/audit", requirePermission("audit:view"), asyncHandler(controller.auditSummary));
router.get("/download/:fileName", requirePermission("report:download"), asyncHandler(controller.download));

module.exports = router;
