const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/approvals.controller");

const router = express.Router();

router.use(authenticate);

router.get("/summary", requirePermission("approvals:view"), asyncHandler(controller.summary));
router.get("/", requirePermission("approvals:view"), asyncHandler(controller.list));
router.post("/:type/:id/approve", requirePermission("approvals:view"), asyncHandler(controller.approve));
router.post("/:type/:id/reject", requirePermission("approvals:view"), asyncHandler(controller.reject));
router.post("/:type/:id/request-correction", requirePermission("approvals:view"), asyncHandler(controller.requestCorrection));

module.exports = router;
