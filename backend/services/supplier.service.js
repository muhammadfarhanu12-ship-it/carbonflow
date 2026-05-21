const { Supplier } = require("../models");
const BaseService = require("./base.service");
const EmissionRecordService = require("./emissionRecord.service");
const AuditService = require("./audit.service");
const { calculateSupplierScore, buildPersistedScoreFields, toRiskScore } = require("./supplierScoring.service");
const { buildSupplierIntelligenceSummary, calculateSupplierBenchmark, resolveSupplierBenchmark } = require("./supplierBenchmarking.service");
const { SupplierQuestionnaireService } = require("./supplierQuestionnaire.service");
const { SupplierEvidenceService } = require("./supplierEvidence.service");
const { getPagination } = require("../utils/pagination");

function normalizeVerificationStatus(value) {
  const normalized = String(value || "pending").trim().toLowerCase();
  if (value === "VERIFIED") return "third_party_verified";
  if (value === "ACTION_REQUIRED") return "pending";
  if (["pending", "self_reported", "third_party_verified", "expired", "rejected"].includes(normalized)) return normalized;
  return "pending";
}

function normalizeInvitationStatus(value) {
  const normalized = String(value || "not_sent").trim().toLowerCase();
  if (value === "SENT") return "sent";
  if (value === "ACCEPTED") return "submitted";
  if (value === "NOT_SENT") return "not_sent";
  if (["not_sent", "sent", "opened", "submitted", "overdue", "expired"].includes(normalized)) return normalized;
  return "not_sent";
}

function normalizeQuestionnaireStatus(value) {
  const normalized = String(value || "not_sent").trim().toLowerCase();
  return SupplierQuestionnaireService.statuses.includes(normalized) ? normalized : "not_sent";
}

function auditContext(actor = null, requestMeta = {}) {
  return {
    userId: actor?.id || null,
    userEmail: actor?.email || null,
    ipAddress: requestMeta.ipAddress || null,
    userAgent: requestMeta.userAgent || null,
  };
}

function normalizeSupplierStatus(value, fallback = "draft") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ["draft", "invited", "submitted", "under_review", "verified", "rejected", "needs_update", "approved", "high_risk", "archived"].includes(normalized)
    ? normalized
    : fallback;
}

class SupplierService extends BaseService {
  static toSupplierView(supplier, companySuppliers = null, evidenceSummary = null, benchmarkOverride = null) {
    if (!supplier) {
      return supplier;
    }

    const baseSupplier = typeof supplier.toJSON === "function" ? supplier.toJSON() : { ...supplier };
    const scoreResult = calculateSupplierScore({
      ...baseSupplier,
      evidenceSummary,
    });
    const peerBenchmark = benchmarkOverride || (Array.isArray(companySuppliers)
      ? calculateSupplierBenchmark(baseSupplier, companySuppliers)
      : (baseSupplier.supplierBenchmark?.categoryAverageIntensity !== undefined ? baseSupplier.supplierBenchmark : null));
    const supplierBenchmark = peerBenchmark
      ? {
        ...scoreResult.benchmark,
        ...peerBenchmark,
        industryKey: scoreResult.benchmark.industryKey,
        industryLabel: scoreResult.benchmark.industryLabel,
        industryAverageIntensity: scoreResult.benchmark.industryAverageIntensity,
        percentileRank: peerBenchmark.percentile ?? scoreResult.benchmark.percentileRank,
        industryComparison: peerBenchmark.categoryComparison || scoreResult.benchmark.industryComparison,
        isAboveIndustryAverage: peerBenchmark.isAboveCategoryAverage ?? scoreResult.benchmark.isAboveIndustryAverage,
        variancePct: scoreResult.benchmark.variancePct,
      }
      : scoreResult.benchmark;
    const nextScoreResult = {
      ...scoreResult,
      benchmark: supplierBenchmark,
      benchmarkScore: supplierBenchmark.percentile ?? scoreResult.benchmarkScore,
    };

    return {
      ...baseSupplier,
      totalEmissionsTco2e: Number(baseSupplier.totalEmissionsTco2e ?? baseSupplier.totalEmissions ?? 0),
      revenueOrActivityBase: baseSupplier.revenueOrActivityBase ?? baseSupplier.revenue ?? null,
      emissionIntensity: scoreResult.emissionIntensity ?? Number(baseSupplier.emissionIntensity ?? baseSupplier.emissionFactor ?? 0),
      carbonScore: scoreResult.totalScore,
      esgScore: scoreResult.totalScore,
      riskScore: toRiskScore(scoreResult.totalScore),
      riskLevel: scoreResult.riskLevel,
      supplierScoreBreakdown: scoreResult.breakdown,
      supplierScoreInsights: scoreResult.insights,
      supplierBenchmark,
      evidenceSummary,
      evidenceStatus: evidenceSummary?.indicator || "missing",
      questionnaireStatus: baseSupplier.questionnaireStatus || baseSupplier.invitationStatus || "not_sent",
      questionnaireSentAt: baseSupplier.questionnaireSentAt || null,
      questionnaireOpenedAt: baseSupplier.questionnaireOpenedAt || null,
      questionnaireSubmittedAt: baseSupplier.questionnaireSubmittedAt || null,
      questionnaireDueDate: baseSupplier.questionnaireDueDate || null,
      questionnaireReminderCount: Number(baseSupplier.questionnaireReminderCount || 0),
      lastReminderSentAt: baseSupplier.lastReminderSentAt || null,
      dataQualityScore: scoreResult.dataQualityScore,
      benchmarkScore: supplierBenchmark.percentile ?? scoreResult.benchmarkScore,
      latestScoreExplanation: scoreResult.latestScoreExplanation,
      recommendedActions: scoreResult.recommendedActions,
      riskTrend: scoreResult.riskTrend,
      scoreCalculatedAt: scoreResult.calculatedAt,
      scoreResult: {
        ...nextScoreResult,
        evidenceSummary,
      },
    };
  }

  static async list(query = {}, companyId) {
    const filter = {
      companyId,
      ...this.getLikeFilter(["name", "region", "country", "category", "contactEmail"], query.search),
    };

    if (query.includeArchived !== true && query.includeArchived !== "true") {
      filter.status = { $ne: "archived" };
    }
    if (query.riskLevel) filter.riskLevel = query.riskLevel;
    if (query.verificationStatus) filter.verificationStatus = query.verificationStatus;
    if (query.category) filter.category = query.category;
    if (query.region) filter.region = query.region;

    const hasBenchmarkFilter = query.benchmark === "above"
      || query.benchmark === "below"
      || query.benchmark === "unavailable"
      || query.aboveBenchmark === "true"
      || query.belowBenchmark === "true"
      || query.benchmarkUnavailable === "true";
    const companySuppliers = await Supplier.find({ companyId, status: { $ne: "archived" } }).lean();

    if (hasBenchmarkFilter) {
      const { page, pageSize, offset, limit } = getPagination(query);
      const rows = await Supplier.find(filter).sort({ riskScore: -1, createdAt: -1 });
      const evidenceSummaries = await SupplierEvidenceService.summaryForSuppliers(rows.map((supplier) => supplier.id), companyId);
      const benchmarks = await Promise.all(rows.map((supplier) => resolveSupplierBenchmark({ supplier, companySuppliers })));
      let data = rows.map((supplier, index) => this.toSupplierView(supplier, companySuppliers, evidenceSummaries.get(supplier.id), benchmarks[index]));

      if (query.benchmark === "above" || query.aboveBenchmark === "true") {
        data = data.filter((supplier) => supplier.supplierBenchmark?.benchmarkLabel === "ABOVE_AVERAGE");
      }
      if (query.benchmark === "below" || query.belowBenchmark === "true") {
        data = data.filter((supplier) => supplier.supplierBenchmark?.benchmarkLabel === "BELOW_AVERAGE");
      }
      if (query.benchmark === "unavailable" || query.benchmarkUnavailable === "true") {
        data = data.filter((supplier) => supplier.supplierBenchmark?.isBenchmarkAvailable === false);
      }

      const count = data.length;
      return {
        data: data.slice(offset, offset + limit),
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize) || 1,
        },
      };
    }

    const result = await this.buildListResult(Supplier, {
      query,
      filter,
      sort: { riskScore: -1, createdAt: -1 },
    });
    const evidenceSummaries = await SupplierEvidenceService.summaryForSuppliers(result.data.map((supplier) => supplier.id), companyId);
    const benchmarks = await Promise.all(result.data.map((supplier) => resolveSupplierBenchmark({ supplier, companySuppliers })));
    const data = result.data.map((supplier, index) => this.toSupplierView(supplier, companySuppliers, evidenceSummaries.get(supplier.id), benchmarks[index]));

    return {
      ...result,
      data,
    };
  }

  static async summary(companyId) {
    const suppliers = await Supplier.find({ companyId, status: { $ne: "archived" } }).lean();
    const total = suppliers.length;
    const verified = suppliers.filter((supplier) => ["third_party_verified", "VERIFIED", "approved", "verified"].includes(supplier.verificationStatus) || ["approved", "verified"].includes(supplier.status)).length;
    const invited = suppliers.filter((supplier) => ["sent", "opened", "SENT"].includes(supplier.invitationStatus)).length;
    const highRisk = suppliers.filter((supplier) => ["HIGH", "CRITICAL"].includes(supplier.riskLevel) || supplier.status === "high_risk").length;
    const missingData = suppliers.filter((supplier) => Number(supplier.dataQualityScore || 0) < 70 || !supplier.lastReportedAt || Number(supplier.totalEmissionsTco2e ?? supplier.totalEmissions ?? 0) <= 0).length;
    const totalEmissions = suppliers.reduce((sum, supplier) => sum + Number(supplier.totalEmissionsTco2e ?? supplier.totalEmissions ?? 0), 0);
    const averageEsgScore = total ? suppliers.reduce((sum, supplier) => sum + Number(supplier.esgScore || supplier.carbonScore || 0), 0) / total : 0;
    const averageTransparency = total ? suppliers.reduce((sum, supplier) => sum + Number(supplier.dataTransparencyScore || 0), 0) / total : 0;
    const supplierIntelligence = buildSupplierIntelligenceSummary(suppliers);

    return {
      total,
      averageEsgScore,
      averageTransparency,
      verified,
      invited,
      highRisk,
      missingData,
      totalEmissions,
      supplierIntelligence,
    };
  }

  static async getById(id, companyId) {
    const supplier = await Supplier.findOne({ _id: id, companyId });

    if (!supplier) {
      const error = new Error("Supplier not found");
      error.status = 404;
      throw error;
    }

    return supplier;
  }

  static enrichPayload(payload = {}) {
    const totalEmissions = Number(payload.totalEmissionsTco2e ?? payload.totalEmissions ?? 0);
    const revenue = payload.revenueOrActivityBase ?? payload.revenue ?? null;
    const hasISO14001 = Boolean(payload.hasISO14001 || payload.certifications?.includes?.("ISO 14001"));
    const hasSBTi = Boolean(payload.hasSBTi || payload.certifications?.includes?.("SBTi"));
    const scoringFields = buildPersistedScoreFields({
      ...payload,
      totalEmissions,
      revenue,
      hasISO14001,
      hasSBTi,
      emissionIntensity: payload.emissionIntensity ?? payload.emissionFactor ?? null,
    });

    return {
      ...payload,
      name: String(payload.name || "").trim(),
      contactEmail: String(payload.contactEmail || "").trim(),
      country: String(payload.country || "").trim(),
      region: String(payload.region || "").trim(),
      category: String(payload.category || "").trim(),
      status: normalizeSupplierStatus(payload.status),
      verificationStatus: normalizeVerificationStatus(payload.verificationStatus),
      invitationStatus: normalizeInvitationStatus(payload.invitationStatus),
      questionnaireStatus: normalizeQuestionnaireStatus(payload.questionnaireStatus ?? payload.invitationStatus),
      questionnaireDueDate: payload.questionnaireDueDate ?? null,
      questionnaireSentAt: payload.questionnaireSentAt ?? null,
      questionnaireOpenedAt: payload.questionnaireOpenedAt ?? null,
      questionnaireSubmittedAt: payload.questionnaireSubmittedAt ?? null,
      questionnaireTokenHash: payload.questionnaireTokenHash ?? null,
      questionnaireReminderCount: Number(payload.questionnaireReminderCount || 0),
      lastReminderSentAt: payload.lastReminderSentAt ?? null,
      totalEmissions,
      totalEmissionsTco2e: totalEmissions,
      revenue,
      revenueOrActivityBase: revenue,
      intensityUnit: payload.intensityUnit || "tCO2e/USD",
      certifications: Array.isArray(payload.certifications)
        ? payload.certifications.map((item) => String(item).trim()).filter(Boolean)
        : [
          hasISO14001 ? "ISO 14001" : null,
          hasSBTi ? "SBTi" : null,
        ].filter(Boolean),
      emissionIntensity: scoringFields.emissionIntensity,
      revenue: scoringFields.revenue,
      hasISO14001: scoringFields.hasISO14001,
      hasSBTi: scoringFields.hasSBTi,
      dataTransparencyScore: scoringFields.dataTransparencyScore,
      lastReportedAt: scoringFields.lastReportedAt,
      carbonScore: scoringFields.carbonScore,
      esgScore: scoringFields.esgScore,
      riskScore: scoringFields.riskScore,
      riskLevel: scoringFields.riskLevel,
      supplierScoreBreakdown: scoringFields.supplierScoreBreakdown,
      supplierScoreInsights: scoringFields.supplierScoreInsights,
      supplierBenchmark: scoringFields.supplierBenchmark,
      dataQualityScore: scoringFields.dataQualityScore,
      benchmarkScore: scoringFields.benchmarkScore,
      latestScoreExplanation: scoringFields.latestScoreExplanation,
      recommendedActions: scoringFields.recommendedActions,
      riskTrend: scoringFields.riskTrend,
      scoreCalculatedAt: scoringFields.scoreCalculatedAt,
      scoreVersion: scoringFields.scoreVersion,
    };
  }

  static async create(payload, companyId, actor = null, requestMeta = {}) {
    const supplier = await Supplier.create(this.enrichPayload({
      ...payload,
      companyId,
      createdBy: actor?.id || null,
      updatedBy: actor?.id || null,
    }));
    await EmissionRecordService.syncSupplierRecord(supplier);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "supplier_created",
      entityType: "Supplier",
      entityId: supplier.id,
      newValue: this.toSupplierView(supplier),
      details: {
        name: supplier.name,
        riskLevel: supplier.riskLevel,
      },
    });
    return supplier;
  }

  static async update(id, payload, companyId, actor = null, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const oldValue = this.toSupplierView(supplier);
    const nextPayload = this.enrichPayload({
      ...supplier.toJSON(),
      ...payload,
      companyId,
      updatedBy: actor?.id || null,
    });

    await supplier.update(nextPayload);
    const updatedSupplier = await this.getById(id, companyId);
    await EmissionRecordService.syncSupplierRecord(updatedSupplier);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "supplier_updated",
      entityType: "Supplier",
      entityId: id,
      oldValue,
      newValue: this.toSupplierView(updatedSupplier),
      details: {
        name: updatedSupplier.name,
        riskLevel: updatedSupplier.riskLevel,
        riskScore: updatedSupplier.riskScore,
      },
    });
    return updatedSupplier;
  }

  static async getScorecard(id, companyId) {
    const [supplier, companySuppliers] = await Promise.all([
      this.getById(id, companyId),
      Supplier.find({ companyId, status: { $ne: "archived" } }).lean(),
    ]);
    const evidenceSummaries = await SupplierEvidenceService.summaryForSuppliers([supplier.id], companyId);
    const benchmark = await resolveSupplierBenchmark({ supplier, companySuppliers });
    return this.toSupplierView(supplier, companySuppliers, evidenceSummaries.get(supplier.id), benchmark).scoreResult;
  }

  static async recalculateScore(id, companyId, actor = null, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const oldValue = this.toSupplierView(supplier);
    const nextPayload = this.enrichPayload({ ...supplier.toJSON(), companyId, updatedBy: actor?.id || null });
    await supplier.update(nextPayload);
    const updatedSupplier = await this.getById(id, companyId);
    const companySuppliers = await Supplier.find({ companyId, status: { $ne: "archived" } }).lean();
    const evidenceSummaries = await SupplierEvidenceService.summaryForSuppliers([updatedSupplier.id], companyId);
    const benchmark = await resolveSupplierBenchmark({ supplier: updatedSupplier, companySuppliers });
    const supplierView = this.toSupplierView(updatedSupplier, companySuppliers, evidenceSummaries.get(updatedSupplier.id), benchmark);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "supplier_score_recalculated",
      entityType: "Supplier",
      entityId: id,
      oldValue,
      newValue: supplierView,
    });
    return supplierView;
  }

  static async listEvidence(id, companyId) {
    await this.getById(id, companyId);
    return SupplierEvidenceService.list(id, companyId);
  }

  static async createEvidence(id, companyId, payload = {}, actor = null, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const evidence = await SupplierEvidenceService.create(supplier, payload, actor);
    await this.applyEvidenceScoreImpact(id, companyId, actor);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: evidence.status === "requested" ? "evidence_requested" : "evidence_submitted",
      entityType: "SupplierEvidence",
      entityId: evidence.id,
      newValue: evidence,
      details: { supplierId: id, supplierName: supplier.name },
    });
    return evidence;
  }

  static async uploadEvidenceFile(id, companyId, file, payload = {}, actor = null, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const evidence = await SupplierEvidenceService.uploadFile(supplier, file, payload, actor, "app");
    await this.applyEvidenceScoreImpact(id, companyId, actor);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "evidence_file_uploaded",
      entityType: "SupplierEvidence",
      entityId: evidence.id,
      newValue: evidence,
      details: {
        supplierId: id,
        fileName: evidence.fileName,
        fileSize: evidence.fileSize,
        mimeType: evidence.mimeType,
      },
    });
    return evidence;
  }

  static async downloadEvidenceFile(id, evidenceId, companyId, actor = null, requestMeta = {}) {
    await this.getById(id, companyId);
    const download = await SupplierEvidenceService.getDownload(id, evidenceId, companyId);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "evidence_file_downloaded",
      entityType: "SupplierEvidence",
      entityId: evidenceId,
      details: {
        supplierId: id,
        fileName: download.evidence.fileName || null,
      },
    });
    return download;
  }

  static async updateEvidence(id, evidenceId, companyId, payload = {}, actor = null, requestMeta = {}) {
    await this.getById(id, companyId);
    const oldValue = await SupplierEvidenceService.getById(id, evidenceId, companyId);
    const evidence = await SupplierEvidenceService.update(id, evidenceId, companyId, payload, actor);
    await this.applyEvidenceScoreImpact(id, companyId, actor);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: evidence.status === "requested" ? "evidence_requested" : "evidence_submitted",
      entityType: "SupplierEvidence",
      entityId: evidenceId,
      oldValue: typeof oldValue.toJSON === "function" ? oldValue.toJSON() : oldValue,
      newValue: evidence,
      details: { supplierId: id },
    });
    return evidence;
  }

  static async verifyEvidence(id, evidenceId, companyId, actor = null, requestMeta = {}) {
    await this.getById(id, companyId);
    const oldValue = await SupplierEvidenceService.getById(id, evidenceId, companyId);
    const evidence = await SupplierEvidenceService.verify(id, evidenceId, companyId, actor);
    await this.applyEvidenceScoreImpact(id, companyId, actor);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "evidence_verified",
      entityType: "SupplierEvidence",
      entityId: evidenceId,
      oldValue: typeof oldValue.toJSON === "function" ? oldValue.toJSON() : oldValue,
      newValue: evidence,
      details: { supplierId: id },
    });
    return evidence;
  }

  static async rejectEvidence(id, evidenceId, companyId, payload = {}, actor = null, requestMeta = {}) {
    await this.getById(id, companyId);
    const oldValue = await SupplierEvidenceService.getById(id, evidenceId, companyId);
    const evidence = await SupplierEvidenceService.reject(id, evidenceId, companyId, payload, actor);
    await this.applyEvidenceScoreImpact(id, companyId, actor);
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "evidence_rejected",
      entityType: "SupplierEvidence",
      entityId: evidenceId,
      oldValue: typeof oldValue.toJSON === "function" ? oldValue.toJSON() : oldValue,
      newValue: evidence,
      details: { supplierId: id },
    });
    return evidence;
  }

  static async applyEvidenceScoreImpact(id, companyId, actor = null) {
    const supplier = await this.getById(id, companyId);
    const evidenceSummaries = await SupplierEvidenceService.summaryForSuppliers([supplier.id], companyId);
    const evidenceSummary = evidenceSummaries.get(supplier.id);
    const nextPayload = this.enrichPayload({
      ...supplier.toJSON(),
      companyId,
      updatedBy: actor?.id || null,
      hasISO14001: supplier.hasISO14001 || Boolean(evidenceSummary?.hasVerifiedISO14001),
      hasSBTi: supplier.hasSBTi || Boolean(evidenceSummary?.hasVerifiedSBTi),
      verificationStatus: evidenceSummary?.hasVerifiedGHGInventory ? "third_party_verified" : supplier.verificationStatus,
      evidenceSummary,
    });
    await supplier.update(nextPayload);
    return this.toSupplierView(await this.getById(id, companyId), null, evidenceSummary);
  }

  static async sendQuestionnaire(id, companyId, actor = null, options = {}, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const oldValue = this.toSupplierView(supplier);
    const result = await SupplierQuestionnaireService.send({
      supplier,
      companyId,
      reminder: false,
      dueDate: options.dueDate,
    });
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "questionnaire_sent",
      entityType: "Supplier",
      entityId: id,
      oldValue,
      newValue: result.questionnaire,
      details: {
        name: result.supplier.name,
        emailConfigured: result.questionnaire.emailStatus?.configured,
      },
    });
    return {
      ...result,
      supplierView: this.toSupplierView(result.supplier),
    };
  }

  static async resendQuestionnaire(id, companyId, actor = null, options = {}, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const oldValue = this.toSupplierView(supplier);
    const result = await SupplierQuestionnaireService.send({
      supplier,
      companyId,
      reminder: true,
      dueDate: options.dueDate,
    });
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "questionnaire_resent",
      entityType: "Supplier",
      entityId: id,
      oldValue,
      newValue: result.questionnaire,
      details: {
        name: result.supplier.name,
        reminderCount: result.questionnaire.questionnaireReminderCount,
        emailConfigured: result.questionnaire.emailStatus?.configured,
      },
    });
    return {
      ...result,
      supplierView: this.toSupplierView(result.supplier),
    };
  }

  static async updateQuestionnaireStatus(id, companyId, payload = {}, actor = null, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const oldValue = this.toSupplierView(supplier);
    const result = await SupplierQuestionnaireService.updateStatus({
      supplier,
      status: payload.questionnaireStatus || payload.status,
      dueDate: payload.questionnaireDueDate,
    });
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "questionnaire_status_changed",
      entityType: "Supplier",
      entityId: id,
      oldValue,
      newValue: result.questionnaire,
      details: {
        name: result.supplier.name,
        questionnaireStatus: result.questionnaire.questionnaireStatus,
      },
    });
    return {
      ...result,
      supplierView: this.toSupplierView(result.supplier),
    };
  }

  static async getQuestionnaire(id, companyId) {
    const supplier = await this.getById(id, companyId);
    return SupplierQuestionnaireService.view(supplier);
  }

  static async remove(id, companyId, actor = null, requestMeta = {}) {
    return this.archive(id, companyId, actor, requestMeta);
  }

  static async archive(id, companyId, actor = null, requestMeta = {}) {
    const supplier = await this.getById(id, companyId);
    const oldValue = this.toSupplierView(supplier);
    await supplier.update({
      status: "archived",
      updatedBy: actor?.id || null,
    });
    await AuditService.log({
      companyId,
      ...auditContext(actor, requestMeta),
      action: "supplier_archived",
      entityType: "Supplier",
      entityId: id,
      oldValue,
      newValue: this.toSupplierView(await this.getById(id, companyId)),
      details: {
        name: supplier.name,
      },
    });
    return this.toSupplierView(await this.getById(id, companyId));
  }
}

module.exports = SupplierService;
