const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/reports.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.post("/generate", asyncHandler(controller.generate));
router.get("/download/:fileName", asyncHandler(controller.download));

module.exports = router;
