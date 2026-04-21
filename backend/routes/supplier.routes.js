const express = require("express");
const { body } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const validateSchema = require("../middlewares/validateSchema");
const controller = require("../controllers/supplier.controller");
const { supplierScoreSchema, supplierBulkScoreSchema } = require("../validators/supplierScore.schema");

const router = express.Router();

const supplierCreateValidation = [
  body("name").isLength({ min: 2 }),
  body("contactEmail").isEmail(),
  body("country").optional().isLength({ min: 2, max: 80 }),
  body("region").notEmpty(),
  body("category").notEmpty(),
  body("emissionFactor").optional().isFloat({ min: 0 }),
  body("emissionIntensity").optional().isFloat({ min: 0 }),
  body("complianceScore").optional().isFloat({ min: 0, max: 100 }),
  body("revenue").optional({ nullable: true }).isFloat({ min: 0 }),
  body("hasISO14001").optional().isBoolean(),
  body("hasSBTi").optional().isBoolean(),
  body("dataTransparencyScore").optional().isFloat({ min: 0, max: 100 }),
  body("lastReportedAt").optional({ nullable: true }).isISO8601(),
];

const supplierUpdateValidation = [
  body("name").optional().isLength({ min: 2 }),
  body("contactEmail").optional().isEmail(),
  body("country").optional().isLength({ min: 2, max: 80 }),
  body("region").optional().notEmpty(),
  body("category").optional().notEmpty(),
  body("emissionFactor").optional().isFloat({ min: 0 }),
  body("emissionIntensity").optional().isFloat({ min: 0 }),
  body("complianceScore").optional().isFloat({ min: 0, max: 100 }),
  body("revenue").optional({ nullable: true }).isFloat({ min: 0 }),
  body("hasISO14001").optional().isBoolean(),
  body("hasSBTi").optional().isBoolean(),
  body("dataTransparencyScore").optional().isFloat({ min: 0, max: 100 }),
  body("lastReportedAt").optional({ nullable: true }).isISO8601(),
];

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.post("/score", validateSchema(supplierScoreSchema), asyncHandler(controller.score));
router.post("/score/bulk", validateSchema(supplierBulkScoreSchema), asyncHandler(controller.bulkScore));
router.get("/:id", asyncHandler(controller.getById));
router.post("/", supplierCreateValidation, validateRequest, asyncHandler(controller.create));
router.put("/:id", supplierUpdateValidation, validateRequest, asyncHandler(controller.update));
router.delete("/:id", asyncHandler(controller.remove));

module.exports = router;
