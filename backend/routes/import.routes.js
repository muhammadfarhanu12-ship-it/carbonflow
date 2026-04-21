const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { importRateLimiter } = require("../middlewares/rateLimiter");
const controller = require("../controllers/import.controller");

const router = express.Router();

router.use(authenticate);
router.use(importRateLimiter);

router.post("/import", asyncHandler(controller.importShipments));

module.exports = router;
