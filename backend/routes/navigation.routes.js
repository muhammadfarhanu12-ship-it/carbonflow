const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const controller = require("../controllers/navigation.controller");

const router = express.Router();

router.use(authenticate);
router.get("/summary", asyncHandler(controller.summary));

module.exports = router;
