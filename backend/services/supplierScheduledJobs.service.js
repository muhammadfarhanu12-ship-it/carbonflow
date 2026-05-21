const { Supplier, SupplierEvidence } = require("../models");
const AuditService = require("./audit.service");
const { isMailerConfigured, sendEmail } = require("../utils/mailer");

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function evidenceQueryBase(now, futureDate) {
  return {
    expiresAt: { $ne: null, $lte: futureDate },
    status: { $nin: ["expired", "rejected"] },
  };
}

async function safeAudit(payload) {
  return AuditService.log({
    userId: "system",
    userEmail: "system@carbonflow.local",
    ...payload,
  });
}

class SupplierScheduledJobsService {
  static async detect({ now = new Date() } = {}) {
    const in7Days = addDays(now, 7);
    const in30Days = addDays(now, 30);
    const [expiring7, expiring30, expired, overdueQuestionnaires] = await Promise.all([
      SupplierEvidence.find({ ...evidenceQueryBase(now, in7Days), expiresAt: { $gte: now, $lte: in7Days } }).lean(),
      SupplierEvidence.find({ ...evidenceQueryBase(now, in30Days), expiresAt: { $gt: in7Days, $lte: in30Days } }).lean(),
      SupplierEvidence.find({ expiresAt: { $lt: now }, status: { $ne: "expired" } }).lean(),
      Supplier.find({
        questionnaireDueDate: { $lt: now },
        questionnaireStatus: { $nin: ["submitted", "expired", "overdue", "not_sent"] },
      }).lean(),
    ]);

    return {
      expiring7,
      expiring30,
      expired,
      overdueQuestionnaires,
    };
  }

  static async sendReminder({ companyId, supplier, evidence = null, reminderType, subject, message, updateReminder }) {
    if (!supplier?.contactEmail) {
      await safeAudit({
        companyId,
        action: "reminder_email_failed",
        entityType: evidence ? "SupplierEvidence" : "Supplier",
        entityId: evidence?.id || evidence?._id || supplier?.id || supplier?._id || null,
        details: { reminderType, reason: "missing_supplier_contact_email" },
      });
      return false;
    }

    if (!isMailerConfigured()) {
      await safeAudit({
        companyId,
        action: "reminder_email_failed",
        entityType: evidence ? "SupplierEvidence" : "Supplier",
        entityId: evidence?.id || evidence?._id || supplier.id || supplier._id,
        details: { reminderType, reason: "email_provider_not_configured" },
      });
      return false;
    }

    try {
      await sendEmail({
        to: supplier.contactEmail,
        subject,
        text: message,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;"><h2>${subject}</h2><p>${message}</p></div>`,
      });
      await updateReminder();
      await safeAudit({
        companyId,
        action: "reminder_email_sent",
        entityType: evidence ? "SupplierEvidence" : "Supplier",
        entityId: evidence?.id || evidence?._id || supplier.id || supplier._id,
        details: { reminderType, to: supplier.contactEmail },
      });
      return true;
    } catch (error) {
      await safeAudit({
        companyId,
        action: "reminder_email_failed",
        entityType: evidence ? "SupplierEvidence" : "Supplier",
        entityId: evidence?.id || evidence?._id || supplier.id || supplier._id,
        details: { reminderType, reason: error.message || "send_failed" },
      });
      return false;
    }
  }

  static async runEvidenceExpiryJob({ now = new Date() } = {}) {
    const detection = await this.detect({ now });
    const result = {
      expiring30: detection.expiring30.length,
      expiring7: detection.expiring7.length,
      expiredEvidence: 0,
      overdueQuestionnaires: 0,
      reminderEmailsSent: 0,
      reminderEmailsFailed: 0,
      emailConfigured: isMailerConfigured(),
    };

    for (const evidence of detection.expired) {
      const oldValue = { status: evidence.status, expiresAt: evidence.expiresAt };
      await SupplierEvidence.updateOne({ _id: evidence._id, companyId: evidence.companyId }, {
        status: "expired",
        lastReminderSentAt: evidence.lastReminderSentAt || now,
      });
      result.expiredEvidence += 1;
      await safeAudit({
        companyId: evidence.companyId,
        action: "evidence_marked_expired",
        entityType: "SupplierEvidence",
        entityId: evidence.id || evidence._id,
        oldValue,
        newValue: { status: "expired", expiresAt: evidence.expiresAt },
      });
    }

    for (const supplier of detection.overdueQuestionnaires) {
      await Supplier.updateOne({ _id: supplier._id, companyId: supplier.companyId }, {
        questionnaireStatus: "overdue",
        invitationStatus: "overdue",
      });
      result.overdueQuestionnaires += 1;
      await safeAudit({
        companyId: supplier.companyId,
        action: "questionnaire_marked_overdue",
        entityType: "Supplier",
        entityId: supplier.id || supplier._id,
        oldValue: {
          questionnaireStatus: supplier.questionnaireStatus,
          invitationStatus: supplier.invitationStatus,
        },
        newValue: {
          questionnaireStatus: "overdue",
          invitationStatus: "overdue",
        },
      });
    }

    const expiringEvidence = [
      ...detection.expiring30.map((evidence) => ({ evidence, windowDays: 30 })),
      ...detection.expiring7.map((evidence) => ({ evidence, windowDays: 7 })),
      ...detection.expired.map((evidence) => ({ evidence, windowDays: 0 })),
    ];

    for (const { evidence, windowDays } of expiringEvidence) {
      const supplier = await Supplier.findOne({ _id: evidence.supplierId, companyId: evidence.companyId }).lean();
      const reminderField = windowDays === 7 ? "expiryReminder7SentAt" : windowDays === 30 ? "expiryReminder30SentAt" : "lastReminderSentAt";

      if (!supplier || evidence[reminderField]) continue;

      const sent = await this.sendReminder({
        companyId: evidence.companyId,
        supplier,
        evidence,
        reminderType: windowDays === 0 ? "supplier_data_update" : "evidence_expiry_warning",
        subject: windowDays === 0 ? "Supplier evidence update needed" : `Supplier evidence expires in ${daysUntil(evidence.expiresAt, now)} days`,
        message: windowDays === 0
          ? `${evidence.title || "Supplier evidence"} has expired. Please provide updated supplier evidence.`
          : `${evidence.title || "Supplier evidence"} expires on ${new Date(evidence.expiresAt).toLocaleDateString("en-US")}. Please upload updated evidence if available.`,
        updateReminder: () => SupplierEvidence.updateOne({ _id: evidence._id, companyId: evidence.companyId }, {
          [reminderField]: now,
          lastReminderSentAt: now,
        }),
      });
      result[ sent ? "reminderEmailsSent" : "reminderEmailsFailed" ] += 1;
    }

    for (const supplier of detection.overdueQuestionnaires) {
      const sent = await this.sendReminder({
        companyId: supplier.companyId,
        supplier,
        reminderType: "questionnaire_overdue",
        subject: "Supplier questionnaire is overdue",
        message: `Your CarbonFlow supplier questionnaire for ${supplier.name} is overdue. Please submit the requested ESG and emissions data.`,
        updateReminder: () => Supplier.updateOne({ _id: supplier._id, companyId: supplier.companyId }, {
          lastReminderSentAt: now,
          questionnaireReminderCount: Number(supplier.questionnaireReminderCount || 0) + 1,
        }),
      });
      result[ sent ? "reminderEmailsSent" : "reminderEmailsFailed" ] += 1;
    }

    return result;
  }
}

module.exports = SupplierScheduledJobsService;
