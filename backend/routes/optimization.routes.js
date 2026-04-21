const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { optimizationRateLimiter } = require("../middlewares/rateLimiter");
const controller = require("../controllers/optimization.controller");

const router = express.Router();

router.use(authenticate);
router.use(optimizationRateLimiter);

router.post(
  "/analyze",
  [
    body("query")
      .isString()
      .withMessage("Query must be a string")
      .trim()
      .isLength({ min: 2, max: 240 })
      .withMessage("Query must be between 2 and 240 characters"),
  ],
  validateRequest,
  asyncHandler(controller.analyze),
);

module.exports = router;
