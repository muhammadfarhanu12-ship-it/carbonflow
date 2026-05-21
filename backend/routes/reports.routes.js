const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/reports.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", requirePermission("report:view"), asyncHandler(controller.list));
router.post("/generate", requirePermission("report:generate"), asyncHandler(controller.generate));
router.get("/download/:fileName", requirePermission("report:view"), asyncHandler(controller.download));

module.exports = router;
