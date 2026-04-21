const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { aiOptimizationRateLimiter } = require("../middlewares/rateLimiter");
const controller = require("../controllers/ai.controller.ts");

const router = express.Router();

router.use(authenticate);
router.use(aiOptimizationRateLimiter);

router.post(
  "/optimize",
  [
    body("carbonLedger")
      .custom((value) => value !== null && typeof value === "object" && !Array.isArray(value))
      .withMessage("carbonLedger must be a non-null object"),
  ],
  validateRequest,
  asyncHandler(controller.optimize),
);

module.exports = router;
