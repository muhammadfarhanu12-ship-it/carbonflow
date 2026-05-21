const express = require("express");
const { body, param } = require("express-validator");
const publicQuestionnaireController = require("../controllers/publicQuestionnaire.controller");
const { publicQuestionnaireRateLimiter } = require("../middlewares/rateLimiter");
const { evidenceUpload } = require("../middlewares/evidenceUpload");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");

const router = express.Router();
const tokenValidator = [
  param("token").isLength({ min: 32, max: 256 }).withMessage("questionnaire token is invalid"),
];
const submissionValidator = [
  ...tokenValidator,
  body("totalEmissions").isFloat({ min: 0 }).withMessage("total emissions must be zero or positive"),
  body("revenueOrActivityBase").isFloat({ min: 0.000001 }).withMessage("revenue/activity base must be greater than zero"),
  body("emissionIntensity").optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body("reportingPeriod").trim().notEmpty().withMessage("reporting period is required"),
  body("verificationStatus").trim().notEmpty().withMessage("verification status is required"),
  body("contactEmail").optional({ nullable: true, checkFalsy: true }).isEmail().withMessage("contact email must be valid"),
  body("certifications").optional().isArray(),
  body("evidence").optional().isArray(),
  body("notes").optional({ nullable: true }).isLength({ max: 2000 }),
  body("additionalComments").optional({ nullable: true }).isLength({ max: 2000 }),
  body("evidenceNotes").optional({ nullable: true }).isLength({ max: 2000 }),
];
const evidenceTypes = ["iso_14001_certificate", "sbti_commitment", "ghg_inventory", "esg_report", "audit_report", "utility_fuel_data", "carbon_reduction_plan", "supplier_questionnaire_answers", "other"];
const publicEvidenceUploadValidator = [
  ...tokenValidator,
  body("evidenceType").isIn(evidenceTypes).withMessage("evidenceType is invalid"),
  body("title").optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 160 }),
  body("expiresAt").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("notes").optional({ nullable: true }).isLength({ max: 1000 }),
];

router.get("/questionnaire/:token", tokenValidator, validateRequest, asyncHandler(publicQuestionnaireController.getQuestionnaire));
router.post(
  "/questionnaire/:token/submit",
  publicQuestionnaireRateLimiter,
  submissionValidator,
  validateRequest,
  asyncHandler(publicQuestionnaireController.submitQuestionnaire),
);
router.post(
  "/questionnaire/:token/evidence/upload",
  publicQuestionnaireRateLimiter,
  evidenceUpload.single("file"),
  publicEvidenceUploadValidator,
  validateRequest,
  asyncHandler(publicQuestionnaireController.uploadEvidence),
);

module.exports = router;
