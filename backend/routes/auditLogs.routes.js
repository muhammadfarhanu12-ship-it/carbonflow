const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/auditLogs.controller");

const router = express.Router();

router.use(authenticate);

router.get("/", requirePermission("audit:view"), asyncHandler(controller.listAuditLogs));

module.exports = router;
