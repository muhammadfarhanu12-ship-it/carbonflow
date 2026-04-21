const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const validateSchema = require("../middlewares/validateSchema");
const { checkoutRateLimiter } = require("../middlewares/rateLimiter");
const controller = require("../controllers/checkout.controller");
const {
  startCheckoutSchema,
  completeCheckoutSchema,
} = require("../validators/checkout.schema");

const router = express.Router();

router.use(authenticate);
router.post("/start", checkoutRateLimiter, validateSchema(startCheckoutSchema), asyncHandler(controller.start));
router.post("/complete", checkoutRateLimiter, validateSchema(completeCheckoutSchema), asyncHandler(controller.complete));

module.exports = router;
