const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/dashboard.controller");

const router = express.Router();

router.use(authenticate);
router.get("/summary", asyncHandler(controller.getSummary));
router.get("/", asyncHandler(controller.getMetrics));

module.exports = router;
