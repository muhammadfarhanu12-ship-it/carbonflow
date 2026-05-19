const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/reports.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", requirePermission("reports:view"), asyncHandler(controller.list));
router.post("/generate", requirePermission("reports:generate"), asyncHandler(controller.generate));
router.get("/download/:fileName", requirePermission("reports:view"), asyncHandler(controller.download));

module.exports = router;
