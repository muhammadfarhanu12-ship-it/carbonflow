const express = require("express");
const { body, param } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { optimizationRateLimiter } = require("../middlewares/rateLimiter");
const { requirePermission } = require("../middlewares/rbac");
const controller = require("../controllers/optimization.controller");

const router = express.Router();

router.use(authenticate);

router.get(
  "/context",
  requirePermission("optimization:view"),
  asyncHandler(controller.getContext),
);

router.get(
  "/runs",
  requirePermission("optimization:view"),
  asyncHandler(controller.listRuns),
);

router.get(
  "/runs/:id",
  requirePermission("optimization:view"),
  [param("id").isString().trim().isLength({ min: 1, max: 120 })],
  validateRequest,
  asyncHandler(controller.getRun),
);

router.post(
  "/runs/:id/export",
  requirePermission("optimization:export"),
  [
    param("id").isString().trim().isLength({ min: 1, max: 120 }),
    body("format").isIn(["PDF", "CSV", "pdf", "csv"]).withMessage("Format must be PDF or CSV"),
  ],
  validateRequest,
  asyncHandler(controller.exportRun),
);

router.get(
  "/runs/:id/download/:format",
  requirePermission("optimization:export"),
  [
    param("id").isString().trim().isLength({ min: 1, max: 120 }),
    param("format").isIn(["PDF", "CSV", "pdf", "csv"]).withMessage("Format must be PDF or CSV"),
  ],
  validateRequest,
  asyncHandler(controller.exportRun),
);

router.post(
  "/analyze",
  optimizationRateLimiter,
  requirePermission("optimization:run"),
  [
    body("question")
      .optional()
      .isString()
      .withMessage("Question must be a string")
      .trim()
      .isLength({ min: 2, max: 500 })
      .withMessage("Question must be between 2 and 500 characters"),
    body("query")
      .optional()
      .isString()
      .withMessage("Query must be a string")
      .trim()
      .isLength({ min: 2, max: 500 })
      .withMessage("Query must be between 2 and 500 characters"),
    body("filters").optional().isObject().withMessage("Filters must be an object"),
    body("dateRange").optional().isObject().withMessage("Date range must be an object"),
  ],
  validateRequest,
  asyncHandler(controller.analyze),
);

router.patch(
  "/recommendations/:id/status",
  requirePermission("optimization:update"),
  [
    param("id").isString().trim().isLength({ min: 1, max: 120 }),
    body("status")
      .isIn(["suggested", "planned", "in_progress", "implemented", "dismissed"])
      .withMessage("Status is invalid"),
  ],
  validateRequest,
  asyncHandler(controller.updateRecommendationStatus),
);

module.exports = router;
