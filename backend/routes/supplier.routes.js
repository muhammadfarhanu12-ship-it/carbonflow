const express = require("express");
const { body, param } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const { requirePermission } = require("../middlewares/rbac");
const validateSchema = require("../middlewares/validateSchema");
const { evidenceUpload } = require("../middlewares/evidenceUpload");
const controller = require("../controllers/supplier.controller");
const { supplierScoreSchema, supplierBulkScoreSchema } = require("../validators/supplierScore.schema");

const router = express.Router();
const supplierStatuses = ["draft", "invited", "submitted", "under_review", "verified", "rejected", "needs_update", "approved", "high_risk", "archived"];
const verificationStatuses = ["pending", "self_reported", "third_party_verified", "expired", "rejected", "VERIFIED", "PENDING", "ACTION_REQUIRED"];
const invitationStatuses = ["not_sent", "sent", "opened", "submitted", "overdue", "expired", "SENT", "ACCEPTED", "NOT_SENT"];
const questionnaireStatuses = ["not_sent", "sent", "opened", "submitted", "overdue", "expired"];
const evidenceTypes = ["iso_14001_certificate", "sbti_commitment", "ghg_inventory", "esg_report", "audit_report", "utility_fuel_data", "carbon_reduction_plan", "supplier_questionnaire_answers", "other"];
const evidenceStatuses = ["requested", "submitted", "under_review", "verified", "rejected", "expired"];
const supplierIdValidator = [param("id").isUUID().withMessage("Supplier id must be a valid UUID")];
const evidenceIdValidator = [param("evidenceId").isUUID().withMessage("Evidence id must be a valid UUID")];

function notFutureDate(value) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now()) {
    throw new Error("lastReportedAt cannot be in the future");
  }
  return true;
}

const supplierCreateValidation = [
  body("name").trim().isLength({ min: 2 }).withMessage("supplier name is required"),
  body("contactEmail").optional({ checkFalsy: true }).isEmail().withMessage("contact email must be valid"),
  body("country").trim().isLength({ min: 2, max: 80 }).withMessage("country is required"),
  body("region").optional({ checkFalsy: true }).isLength({ max: 80 }),
  body("category").trim().notEmpty().withMessage("category is required"),
  body("status").optional().isIn(supplierStatuses).withMessage("status is invalid"),
  body("emissionFactor").optional().isFloat({ min: 0 }),
  body("emissionIntensity").optional().isFloat({ min: 0 }),
  body("totalEmissions").optional().isFloat({ min: 0 }).withMessage("total emissions must be zero or positive"),
  body("totalEmissionsTco2e").optional().isFloat({ min: 0 }).withMessage("total emissions must be zero or positive"),
  body("complianceScore").optional().isFloat({ min: 0, max: 100 }),
  body("revenue").optional({ nullable: true }).isFloat({ min: 0.000001 }),
  body("revenueOrActivityBase").optional({ nullable: true }).isFloat({ min: 0.000001 }).withMessage("revenue/activity base must be greater than zero"),
  body("hasISO14001").optional().isBoolean(),
  body("hasSBTi").optional().isBoolean(),
  body("dataTransparencyScore").optional().isFloat({ min: 0, max: 100 }),
  body("lastReportedAt").optional({ nullable: true, checkFalsy: true }).isISO8601().custom(notFutureDate),
  body("verificationStatus").optional().isIn(verificationStatuses).withMessage("verification status is invalid"),
  body("invitationStatus").optional().isIn(invitationStatuses).withMessage("invitation status is invalid"),
  body("questionnaireStatus").optional().isIn(questionnaireStatuses).withMessage("questionnaire status is invalid"),
  body("questionnaireDueDate").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("certifications").optional().isArray(),
  body("notes").optional({ nullable: true }).isLength({ max: 1000 }),
];

const supplierUpdateValidation = [
  ...supplierIdValidator,
  body("name").optional().trim().isLength({ min: 2 }),
  body("contactEmail").optional({ checkFalsy: true }).isEmail(),
  body("country").optional().isLength({ min: 2, max: 80 }),
  body("region").optional({ checkFalsy: true }).isLength({ max: 80 }),
  body("category").optional().notEmpty(),
  body("status").optional().isIn(supplierStatuses).withMessage("status is invalid"),
  body("emissionFactor").optional().isFloat({ min: 0 }),
  body("emissionIntensity").optional().isFloat({ min: 0 }),
  body("totalEmissions").optional().isFloat({ min: 0 }).withMessage("total emissions must be zero or positive"),
  body("totalEmissionsTco2e").optional().isFloat({ min: 0 }).withMessage("total emissions must be zero or positive"),
  body("complianceScore").optional().isFloat({ min: 0, max: 100 }),
  body("revenue").optional({ nullable: true }).isFloat({ min: 0.000001 }),
  body("revenueOrActivityBase").optional({ nullable: true }).isFloat({ min: 0.000001 }).withMessage("revenue/activity base must be greater than zero"),
  body("hasISO14001").optional().isBoolean(),
  body("hasSBTi").optional().isBoolean(),
  body("dataTransparencyScore").optional().isFloat({ min: 0, max: 100 }),
  body("lastReportedAt").optional({ nullable: true, checkFalsy: true }).isISO8601().custom(notFutureDate),
  body("verificationStatus").optional().isIn(verificationStatuses).withMessage("verification status is invalid"),
  body("invitationStatus").optional().isIn(invitationStatuses).withMessage("invitation status is invalid"),
  body("questionnaireStatus").optional().isIn(questionnaireStatuses).withMessage("questionnaire status is invalid"),
  body("questionnaireDueDate").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("certifications").optional().isArray(),
  body("notes").optional({ nullable: true }).isLength({ max: 1000 }),
];

const questionnaireSendValidation = [
  ...supplierIdValidator,
  body("dueDate").optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage("dueDate must be a valid date"),
];

const questionnaireStatusValidation = [
  ...supplierIdValidator,
  body("questionnaireStatus").optional().isIn(questionnaireStatuses).withMessage("questionnaire status is invalid"),
  body("status").optional().isIn(questionnaireStatuses).withMessage("questionnaire status is invalid"),
  body().custom((value) => {
    if (!value.questionnaireStatus && !value.status) {
      throw new Error("questionnaireStatus is required");
    }
    return true;
  }),
  body("questionnaireDueDate").optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage("questionnaireDueDate must be a valid date"),
];

const evidenceCreateValidation = [
  ...supplierIdValidator,
  body("evidenceType").isIn(evidenceTypes).withMessage("evidenceType is invalid"),
  body("title").trim().isLength({ min: 2, max: 160 }).withMessage("title is required"),
  body("status").optional().isIn(evidenceStatuses).withMessage("evidence status is invalid"),
  body("fileUrl").optional({ nullable: true, checkFalsy: true }).isURL().withMessage("fileUrl must be a valid URL"),
  body("uploadedAt").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("expiresAt").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("notes").optional({ nullable: true }).isLength({ max: 1000 }),
];

const evidenceUploadValidation = [
  ...supplierIdValidator,
  body("evidenceType").isIn(evidenceTypes).withMessage("evidenceType is invalid"),
  body("title").optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 160 }),
  body("expiresAt").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("notes").optional({ nullable: true }).isLength({ max: 1000 }),
];

const evidenceUpdateValidation = [
  ...supplierIdValidator,
  ...evidenceIdValidator,
  body("evidenceType").optional().isIn(evidenceTypes).withMessage("evidenceType is invalid"),
  body("title").optional().trim().isLength({ min: 2, max: 160 }),
  body("status").optional().isIn(evidenceStatuses).withMessage("evidence status is invalid"),
  body("fileUrl").optional({ nullable: true, checkFalsy: true }).isURL().withMessage("fileUrl must be a valid URL"),
  body("uploadedAt").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("expiresAt").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("notes").optional({ nullable: true }).isLength({ max: 1000 }),
];

router.use(authenticate);
router.get("/", requirePermission("supplier:view"), asyncHandler(controller.list));
router.get("/summary", requirePermission("supplier:view"), asyncHandler(controller.summary));
router.post("/score", requirePermission("supplier:score:view"), validateSchema(supplierScoreSchema), asyncHandler(controller.score));
router.post("/score/bulk", requirePermission("supplier:score:view"), validateSchema(supplierBulkScoreSchema), asyncHandler(controller.bulkScore));
router.get("/:id/scorecard", requirePermission("supplier:score:view"), supplierIdValidator, validateRequest, asyncHandler(controller.scorecard));
router.post("/:id/recalculate-score", requirePermission("supplier:update"), supplierIdValidator, validateRequest, asyncHandler(controller.recalculateScore));
router.post("/:id/send-questionnaire", requirePermission("supplier:questionnaire:send"), questionnaireSendValidation, validateRequest, asyncHandler(controller.sendQuestionnaire));
router.post("/:id/resend-questionnaire", requirePermission("supplier:questionnaire:send"), questionnaireSendValidation, validateRequest, asyncHandler(controller.resendQuestionnaire));
router.patch("/:id/questionnaire-status", requirePermission("supplier:questionnaire:send"), questionnaireStatusValidation, validateRequest, asyncHandler(controller.updateQuestionnaireStatus));
router.get("/:id/questionnaire", requirePermission("supplier:view"), supplierIdValidator, validateRequest, asyncHandler(controller.getQuestionnaire));
router.get("/:id/evidence", requirePermission("supplier:evidence:view"), supplierIdValidator, validateRequest, asyncHandler(controller.listEvidence));
router.post("/:id/evidence", requirePermission("supplier:update"), evidenceCreateValidation, validateRequest, asyncHandler(controller.createEvidence));
router.post("/:id/evidence/upload", requirePermission("supplier:update"), evidenceUpload.single("file"), evidenceUploadValidation, validateRequest, asyncHandler(controller.uploadEvidence));
router.get("/:id/evidence/:evidenceId/download", requirePermission("supplier:evidence:view"), [...supplierIdValidator, ...evidenceIdValidator], validateRequest, asyncHandler(controller.downloadEvidence));
router.patch("/:id/evidence/:evidenceId", requirePermission("supplier:update"), evidenceUpdateValidation, validateRequest, asyncHandler(controller.updateEvidence));
router.patch("/:id/evidence/:evidenceId/verify", requirePermission("supplier:evidence:verify"), [...supplierIdValidator, ...evidenceIdValidator], validateRequest, asyncHandler(controller.verifyEvidence));
router.patch("/:id/evidence/:evidenceId/reject", requirePermission("supplier:evidence:verify"), [...supplierIdValidator, ...evidenceIdValidator, body("notes").optional({ nullable: true }).isLength({ max: 1000 })], validateRequest, asyncHandler(controller.rejectEvidence));
router.get("/:id", requirePermission("supplier:view"), supplierIdValidator, validateRequest, asyncHandler(controller.getById));
router.post("/", requirePermission("supplier:create"), supplierCreateValidation, validateRequest, asyncHandler(controller.create));
router.put("/:id", requirePermission("supplier:update"), supplierUpdateValidation, validateRequest, asyncHandler(controller.update));
router.patch("/:id", requirePermission("supplier:update"), supplierUpdateValidation, validateRequest, asyncHandler(controller.update));
router.patch("/:id/archive", requirePermission("supplier:archive"), supplierIdValidator, validateRequest, asyncHandler(controller.archive));
router.delete("/:id", requirePermission("supplier:archive"), supplierIdValidator, validateRequest, asyncHandler(controller.remove));

module.exports = router;
