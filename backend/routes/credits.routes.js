const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const validateSchema = require("../middlewares/validateSchema");
const { checkoutRateLimiter } = require("../middlewares/rateLimiter");
const controller = require("../controllers/credits.controller");
const { checkoutSchema } = require("../validators/credits.schema");

const router = express.Router();

router.use(authenticate);
router.post("/checkout", checkoutRateLimiter, validateSchema(checkoutSchema), asyncHandler(controller.checkout));
router.get("/:id", asyncHandler(controller.getById));
router.get("/:id/certificate", asyncHandler(controller.getCertificateById));

module.exports = router;
