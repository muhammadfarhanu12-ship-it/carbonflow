const crypto = require("crypto");
const { Company, Supplier, User } = require("../models");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { isMailerConfigured, sendEmail } = require("../utils/mailer");
const { sendSupplierQuestionnaireEmail } = require("./emailService");
const AuditService = require("./audit.service");
const EmissionRecordService = require("./emissionRecord.service");
const { buildPersistedScoreFields } = require("./supplierScoring.service");
const { SupplierEvidenceService } = require("./supplierEvidence.service");

const EMAIL_NOT_CONFIGURED_MESSAGE = "Questionnaire created but email provider is not configured.";
const QUESTIONNAIRE_STATUSES = ["not_sent", "sent", "opened", "submitted", "overdue", "expired"];
const REQUESTED_FIELDS = [
  "Supplier identity confirmation",
  "Total emissions",
  "Revenue or activity base",
  "Reporting period",
  "Verification status",
  "ESG certifications",
  "Evidence notes",
  "Additional comments",
];

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateQuestionnaireToken() {
  return crypto.randomBytes(32).toString("hex");
}

function buildQuestionnaireUrl(token) {
  const frontendUrl = env.frontendUrl || "http://localhost:5173";
  return `${frontendUrl.replace(/\/+$/, "")}/supplier-questionnaire/${encodeURIComponent(token)}`;
}

function toQuestionnaireView(supplier, emailStatus = null) {
  return {
    supplierId: supplier.id || supplier._id,
    supplierName: supplier.name,
    contactEmail: supplier.contactEmail,
    questionnaireStatus: supplier.questionnaireStatus || "not_sent",
    questionnaireSentAt: supplier.questionnaireSentAt || null,
    questionnaireOpenedAt: supplier.questionnaireOpenedAt || null,
    questionnaireSubmittedAt: supplier.questionnaireSubmittedAt || null,
    questionnaireDueDate: supplier.questionnaireDueDate || null,
    questionnaireTokenExpiresAt: supplier.questionnaireTokenExpiresAt || null,
    questionnaireReminderCount: supplier.questionnaireReminderCount || 0,
    lastReminderSentAt: supplier.lastReminderSentAt || null,
    invitationStatus: supplier.invitationStatus || supplier.questionnaireStatus || "not_sent",
    emailStatus,
  };
}

async function resolveCompanyName(companyId) {
  const company = await Company.findById(companyId).lean();
  return company?.name || "CarbonFlow customer";
}

function isExpired(supplier, now = new Date()) {
  const expiresAt = supplier?.questionnaireTokenExpiresAt ? new Date(supplier.questionnaireTokenExpiresAt) : null;
  if (supplier?.questionnaireStatus === "expired") return true;
  return Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime());
}

function toPublicQuestionnaireContext(supplier, companyName) {
  const expired = isExpired(supplier);
  const alreadySubmitted = supplier.questionnaireStatus === "submitted";

  return {
    supplierId: supplier.id || supplier._id,
    supplierName: supplier.name,
    requestingCompanyName: companyName,
    companyName,
    dueDate: supplier.questionnaireDueDate || null,
    tokenExpiresAt: supplier.questionnaireTokenExpiresAt || null,
    requestedFields: REQUESTED_FIELDS,
    status: supplier.questionnaireStatus || "sent",
    alreadySubmitted,
    expired,
  };
}

function requireNumberField(payload, field, label, errors) {
  const value = payload[field];
  const number = Number(value);

  if (value === undefined || value === null || value === "" || !Number.isFinite(number) || number < 0) {
    errors.push({ field, message: `${label} is required and must be a valid number.` });
    return null;
  }

  return number;
}

function normalizeCertifications(payload = {}) {
  if (Array.isArray(payload.certifications)) {
    return payload.certifications.map((item) => String(item).trim()).filter(Boolean);
  }

  return [
    payload.hasISO14001 ? "ISO 14001" : null,
    payload.hasSBTi ? "SBTi" : null,
  ].filter(Boolean);
}

async function notifyCompanyUser(supplier, companyName) {
  if (!isMailerConfigured()) {
    return false;
  }

  const recipient = await User.findOne({
    companyId: supplier.companyId,
    role: { $in: ["OWNER", "ADMIN", "MANAGER", "owner", "admin", "manager"] },
    email: { $exists: true, $ne: "" },
  }).lean();

  if (!recipient?.email) {
    return false;
  }

  await sendEmail({
    to: recipient.email,
    subject: `${supplier.name} submitted a CarbonFlow supplier questionnaire`,
    text: [
      `${supplier.name} submitted ESG and emissions data for ${companyName}.`,
      "",
      "Review the supplier scorecard in CarbonFlow to validate the disclosure and evidence notes.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
        <h2>Supplier questionnaire submitted</h2>
        <p><strong>${supplier.name}</strong> submitted ESG and emissions data for ${companyName}.</p>
        <p>Review the supplier scorecard in CarbonFlow to validate the disclosure and evidence notes.</p>
      </div>
    `,
  });

  return true;
}

class SupplierQuestionnaireService {
  static statuses = QUESTIONNAIRE_STATUSES;

  static async send({ supplier, companyId, reminder = false, dueDate = null }) {
    const now = new Date();
    const token = generateQuestionnaireToken();
    const questionnaireDueDate = dueDate ? new Date(dueDate) : (supplier.questionnaireDueDate || addDays(now, 14));
    const questionnaireTokenExpiresAt = addDays(questionnaireDueDate, 7);
    const questionnaireUrl = buildQuestionnaireUrl(token);
    const update = {
      questionnaireStatus: "sent",
      questionnaireSentAt: supplier.questionnaireSentAt || now,
      questionnaireDueDate,
      questionnaireTokenHash: hashToken(token),
      questionnaireTokenExpiresAt,
      invitationStatus: "sent",
    };

    if (reminder) {
      update.questionnaireReminderCount = Number(supplier.questionnaireReminderCount || 0) + 1;
      update.lastReminderSentAt = now;
    }

    await supplier.update(update);
    const updatedSupplier = await supplier.constructor.findOne({ _id: supplier._id, companyId });
    const emailStatus = {
      configured: isMailerConfigured(),
      sent: false,
      message: null,
    };

    if (!emailStatus.configured) {
      emailStatus.message = EMAIL_NOT_CONFIGURED_MESSAGE;
      return {
        supplier: updatedSupplier,
        questionnaire: toQuestionnaireView(updatedSupplier, emailStatus),
        message: EMAIL_NOT_CONFIGURED_MESSAGE,
      };
    }

    const companyName = await resolveCompanyName(companyId);
    await sendSupplierQuestionnaireEmail({
      to: updatedSupplier.contactEmail,
      supplierName: updatedSupplier.name,
      companyName,
      dueDate: questionnaireDueDate,
      questionnaireUrl,
    });

    emailStatus.sent = true;
    emailStatus.message = reminder ? "Questionnaire reminder sent successfully." : "Questionnaire sent successfully.";

    return {
      supplier: updatedSupplier,
      questionnaire: toQuestionnaireView(updatedSupplier, emailStatus),
      message: emailStatus.message,
    };
  }

  static async updateStatus({ supplier, status, dueDate = undefined }) {
    if (!QUESTIONNAIRE_STATUSES.includes(status)) {
      const error = new Error("Questionnaire status is invalid");
      error.status = 400;
      throw error;
    }

    const now = new Date();
    const update = {
      questionnaireStatus: status,
      invitationStatus: status === "expired" ? "overdue" : status,
    };

    if (status === "opened" && !supplier.questionnaireOpenedAt) update.questionnaireOpenedAt = now;
    if (status === "submitted") update.questionnaireSubmittedAt = now;
    if (dueDate !== undefined) update.questionnaireDueDate = dueDate ? new Date(dueDate) : null;

    await supplier.update(update);
    const updatedSupplier = await supplier.constructor.findOne({ _id: supplier._id, companyId: supplier.companyId });

    return {
      supplier: updatedSupplier,
      questionnaire: toQuestionnaireView(updatedSupplier),
    };
  }

  static view(supplier) {
    return toQuestionnaireView(supplier);
  }

  static async getPublicQuestionnaire(token) {
    const tokenHash = hashToken(String(token || ""));
    const supplier = await Supplier.findOne({ questionnaireTokenHash: tokenHash });

    if (!supplier) {
      throw new ApiError(404, "Questionnaire link is invalid.");
    }

    const companyName = await resolveCompanyName(supplier.companyId);

    if (isExpired(supplier)) {
      return toPublicQuestionnaireContext(supplier, companyName);
    }

    if (supplier.questionnaireStatus === "sent" && !supplier.questionnaireOpenedAt) {
      await supplier.update({
        questionnaireStatus: "opened",
        questionnaireOpenedAt: new Date(),
        invitationStatus: "opened",
      });
      supplier.questionnaireStatus = "opened";
      supplier.questionnaireOpenedAt = new Date();
      supplier.invitationStatus = "opened";
    }

    return toPublicQuestionnaireContext(supplier, companyName);
  }

  static async submitPublicQuestionnaire(token, payload = {}, requestMeta = {}) {
    const tokenHash = hashToken(String(token || ""));
    const supplier = await Supplier.findOne({ questionnaireTokenHash: tokenHash });

    if (!supplier) {
      throw new ApiError(404, "Questionnaire link is invalid.");
    }

    if (isExpired(supplier)) {
      throw new ApiError(410, "Questionnaire link has expired.");
    }

    if (supplier.questionnaireStatus === "submitted") {
      throw new ApiError(409, "Questionnaire has already been submitted.");
    }

    const errors = [];
    const totalEmissions = requireNumberField(payload, "totalEmissions", "Total emissions", errors);
    const revenueOrActivityBase = requireNumberField(payload, "revenueOrActivityBase", "Revenue or activity base", errors);
    const reportingPeriod = String(payload.reportingPeriod || "").trim();
    const verificationStatus = String(payload.verificationStatus || "").trim();

    if (!reportingPeriod) errors.push({ field: "reportingPeriod", message: "Reporting period is required." });
    if (!verificationStatus) errors.push({ field: "verificationStatus", message: "Verification status is required." });

    if (errors.length > 0) {
      throw new ApiError(422, "Questionnaire submission has validation errors.", errors);
    }

    const certifications = normalizeCertifications(payload);
    const now = new Date();
    const nextPayload = {
      ...supplier.toJSON(),
      country: String(payload.country || supplier.country || "").trim(),
      region: String(payload.region || supplier.region || "").trim(),
      category: String(payload.category || supplier.category || "").trim(),
      contactEmail: String(payload.contactEmail || supplier.contactEmail || "").trim(),
      totalEmissions,
      totalEmissionsTco2e: totalEmissions,
      revenue: revenueOrActivityBase,
      revenueOrActivityBase,
      emissionIntensity: payload.emissionIntensity !== undefined && payload.emissionIntensity !== ""
        ? Number(payload.emissionIntensity)
        : undefined,
      verificationStatus,
      certifications,
      hasISO14001: certifications.includes("ISO 14001"),
      hasSBTi: certifications.includes("SBTi"),
      notes: [payload.notes, payload.additionalComments].filter(Boolean).join("\n\n") || supplier.notes,
      questionnaireStatus: "submitted",
      invitationStatus: "submitted",
      questionnaireSubmittedAt: now,
      lastReportedAt: now,
      metadata: {
        ...(supplier.metadata || {}),
        publicQuestionnaire: {
          reportingPeriod,
          contactName: payload.contactName || null,
          contactEmail: payload.contactEmail || null,
          evidenceNotes: payload.evidenceNotes || null,
          answers: payload.questionnaireAnswers || {},
          submittedAt: now,
        },
      },
    };
    const scoringFields = buildPersistedScoreFields(nextPayload);

    await supplier.update({
      ...nextPayload,
      ...scoringFields,
    });

    const updatedSupplier = await Supplier.findOne({ _id: supplier._id, companyId: supplier.companyId });

    if (Array.isArray(payload.evidence)) {
      for (const evidence of payload.evidence) {
        await SupplierEvidenceService.create(updatedSupplier, {
          ...evidence,
          status: evidence.status || "submitted",
          notes: evidence.notes || payload.evidenceNotes || null,
        }, null);
      }
    } else if (payload.evidenceNotes) {
      await SupplierEvidenceService.create(updatedSupplier, {
        evidenceType: "supplier_questionnaire_answers",
        title: "Supplier questionnaire evidence notes",
        status: "submitted",
        notes: payload.evidenceNotes,
      }, null);
    }

    await EmissionRecordService.syncSupplierRecord(updatedSupplier);
    await AuditService.log({
      companyId: updatedSupplier.companyId,
      action: "questionnaire_status_changed",
      entityType: "Supplier",
      entityId: updatedSupplier.id || updatedSupplier._id,
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      oldValue: {
        questionnaireStatus: supplier.questionnaireStatus,
      },
      newValue: {
        questionnaireStatus: "submitted",
        totalEmissions,
        revenueOrActivityBase,
        verificationStatus,
      },
      details: {
        source: "public_questionnaire",
        tokenHashStored: Boolean(updatedSupplier.questionnaireTokenHash),
      },
    });

    const companyName = await resolveCompanyName(updatedSupplier.companyId);
    try {
      await notifyCompanyUser(updatedSupplier, companyName);
    } catch (_error) {
      // Email delivery should not block the supplier submission.
    }

    return {
      supplierId: updatedSupplier.id || updatedSupplier._id,
      status: updatedSupplier.questionnaireStatus,
      submittedAt: updatedSupplier.questionnaireSubmittedAt,
      riskLevel: updatedSupplier.riskLevel,
      esgScore: updatedSupplier.esgScore,
      message: "Questionnaire submitted successfully.",
    };
  }

  static async uploadPublicEvidence(token, file, payload = {}, requestMeta = {}) {
    const tokenHash = hashToken(String(token || ""));
    const supplier = await Supplier.findOne({ questionnaireTokenHash: tokenHash });

    if (!supplier) {
      throw new ApiError(404, "Questionnaire link is invalid.");
    }

    if (isExpired(supplier)) {
      throw new ApiError(410, "Questionnaire link has expired.");
    }

    const evidence = await SupplierEvidenceService.uploadFile(supplier, file, payload, null, "questionnaire");
    await AuditService.log({
      companyId: supplier.companyId,
      action: "evidence_file_uploaded",
      entityType: "SupplierEvidence",
      entityId: evidence.id,
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      newValue: evidence,
      details: {
        source: "public_questionnaire",
        supplierId: supplier.id || supplier._id,
        fileName: evidence.fileName,
        fileSize: evidence.fileSize,
      },
    });

    return evidence;
  }
}

module.exports = {
  EMAIL_NOT_CONFIGURED_MESSAGE,
  QUESTIONNAIRE_STATUSES,
  REQUESTED_FIELDS,
  SupplierQuestionnaireService,
  buildQuestionnaireUrl,
  generateQuestionnaireToken,
  hashToken,
};
