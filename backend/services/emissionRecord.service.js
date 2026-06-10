const { EmissionRecord, EmissionFactor, Supplier, AuditLog, LedgerEntry, Report } = require("../models");
const {
  calculateActivityEmission,
  calculateScope1,
  calculateScope2,
  calculateShipmentEmissions,
  getSampleFactors,
  resolveSampleFactor,
  round,
  toKgFromTonnes,
} = require("./carbonEngine");
const cache = require("../utils/cache");
const AuditService = require("./audit.service");
const EmissionFactorService = require("./emissionFactor.service");
const { hasPermission, normalizeRole } = require("../middlewares/rbac");

const DATA_STATUSES = ["draft", "submitted", "reviewed", "approved", "rejected", "needs_correction", "archived"];
const REVIEW_ROLES = new Set(["manager", "admin", "owner"]);
const LOCKED_EDIT_STATUSES = new Set(["submitted", "reviewed", "approved"]);

function getPeriod(occurredAt, reportingPeriodStart = null) {
  const date = new Date(reportingPeriodStart || occurredAt || Date.now());
  const activityDate = new Date(occurredAt || date);

  return {
    occurredAt: activityDate,
    periodMonth: date.getUTCMonth() + 1,
    periodYear: date.getUTCFullYear(),
  };
}

function invalidateCompanyMetrics(companyId) {
  cache.removeByPrefix(`dashboard:${companyId}:`);
  cache.removeByPrefix(`ledger:${companyId}:`);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compactAuditSummary(value = {}) {
  if (!value || typeof value !== "object") return null;
  const keys = [
    "scope",
    "category",
    "activityAmount",
    "activityUnit",
    "factorValue",
    "factorUnit",
    "factorSource",
    "factorSourceYear",
    "factorVersion",
    "factorIsSample",
    "calculationStatus",
    "emissionsKgCo2e",
    "emissionsTCo2e",
    "dataStatus",
    "approvalNotes",
    "correctionNotes",
  ];
  return keys.reduce((summary, key) => {
    if (value[key] !== undefined) summary[key] = value[key];
    return summary;
  }, {});
}

function inferTimelineSource(log = {}) {
  const action = String(log.action || "");
  if (action.includes("csv_import")) return "CSV import";
  if (action.includes("recalculated")) return "recalculation";
  if (action.includes("report")) return "report";
  if (log.details?.source) return log.details.source;
  return "manual";
}

class EmissionRecordService {
  static async list(companyId, query = {}) {
    const filter = { companyId };
    if (query.scope) filter.scope = Number(query.scope);
    if (query.category) filter.category = query.category;
    if (query.status) filter.dataStatus = query.status;
    if (query.dataStatus) filter.dataStatus = query.dataStatus;
    if (query.reportingPeriod) filter.reportingPeriod = { $regex: escapeRegex(query.reportingPeriod), $options: "i" };
    if (query.facility || query.facilityName) filter.facilityName = { $regex: escapeRegex(query.facility || query.facilityName), $options: "i" };
    if (query.businessUnit) filter.businessUnit = { $regex: escapeRegex(query.businessUnit), $options: "i" };
    if (query.supplierId) filter.supplierId = query.supplierId;
    if (query.createdBy) filter.createdBy = query.createdBy;
    if (query.factorStatus === "missing" || query.missingFactor === "true") filter.$or = [{ factorValue: null }, { factorValue: 0 }, { factorUnit: null }];
    if (query.factorStatus === "sample" || query.isSample === "true") filter.factorIsSample = true;
    if (query.factorStatus === "custom" || query.isSample === "false") filter.factorIsSample = false;
    if (query.activityDateFrom || query.activityDateTo) {
      filter.occurredAt = {};
      if (query.activityDateFrom) filter.occurredAt.$gte = new Date(query.activityDateFrom);
      if (query.activityDateTo) filter.occurredAt.$lte = new Date(query.activityDateTo);
    }
    if (query.search) {
      const regex = { $regex: escapeRegex(query.search), $options: "i" };
      filter.$or = [
        ...(filter.$or || []),
        { category: regex },
        { description: regex },
        { facilityName: regex },
        { businessUnit: regex },
        { "metadata.factorKey": regex },
        { "activityData.supplierName": regex },
      ];
    }

    const limit = Math.min(Math.max(Number(query.pageSize || 50), 1), 100);
    const page = Math.max(Number(query.page || 1), 1);
    const [data, total] = await Promise.all([
      EmissionRecord.find(filter).sort({ occurredAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      EmissionRecord.countDocuments(filter),
    ]);

    return {
      data: data.map((record) => ({ id: record._id, ...record })),
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  static async listFactors(query = {}) {
    const filter = { isActive: true };
    if (query.scope) filter.scope = Number(query.scope);
    if (query.activityType) filter.activityType = query.activityType;
    if (query.region) filter.region = String(query.region).toUpperCase();

    const dbFactors = await EmissionFactor.find(filter).sort({ scope: 1, category: 1, activityType: 1 }).lean();
    if (dbFactors.length > 0) {
      return dbFactors.map((factor) => ({ id: factor._id, ...factor }));
    }

    return getSampleFactors().filter((factor) => (
      (!query.scope || Number(factor.scope) === Number(query.scope))
      && (!query.activityType || factor.activityType === query.activityType)
      && (!query.region || factor.region === String(query.region).toUpperCase() || factor.region === "GLOBAL")
    ));
  }

  static async resolveActivityFactor(payload) {
    const region = String(payload.region || "GLOBAL").trim().toUpperCase();
    const dbFactor = await EmissionFactorService.resolveBestMatch({
      companyId: payload.companyId,
      scope: payload.scope,
      category: payload.category,
      activityType: payload.activityType,
      factorKey: payload.factorKey || payload.fuelType,
      activityUnit: payload.activityUnit || payload.unit,
      country: payload.country,
      region,
      occurredAt: payload.occurredAt,
    });

    return dbFactor || resolveSampleFactor({
      scope: payload.scope,
      activityType: payload.activityType,
      unit: payload.activityUnit || payload.unit,
      region,
      fuelType: payload.fuelType || payload.factorKey,
    });
  }

  static async buildFactorGovernance(record = {}, companyId) {
    const currentFactorId = record.emissionFactorId || record.metadata?.emissionFactorId || record.metadata?.factorId || null;
    const currentFactor = currentFactorId
      ? await EmissionFactor.findOne({
        _id: currentFactorId,
        $or: [{ companyId }, { companyId: null }, { companyId: "" }],
      }).lean()
      : null;
    const latest = await EmissionFactorService.resolveBestMatch({
      companyId,
      scope: record.scope,
      category: record.category,
      activityType: record.activityData?.activityType,
      factorKey: record.metadata?.factorKey || record.activityData?.fuelType,
      activityUnit: record.activityUnit,
      country: record.factorCountry,
      region: record.factorRegion || record.metadata?.region || "GLOBAL",
      occurredAt: record.occurredAt,
    });
    const latestId = latest?._id || latest?.id || null;
    const factorStillActive = currentFactor ? currentFactor.isActive !== false : Boolean(!currentFactorId && latest);
    const staleReasons = [];
    if (currentFactor && currentFactor.isActive === false) staleReasons.push("The factor used by this record is inactive.");
    if (latestId && currentFactorId && String(latestId) !== String(currentFactorId)) staleReasons.push("A newer or better matching active factor is available.");
    if (latest && !currentFactorId && record.factorIsSample === true && latest.isSample === false) staleReasons.push("An official/custom factor is now available for a record that used a sample factor.");
    if (latest && record.factorVersion && latest.version && latest.version !== record.factorVersion) staleReasons.push("The available factor version differs from the stored snapshot.");
    if (latest && Number(latest.factorValue ?? latest.value ?? 0) !== Number(record.factorValueUsed ?? record.factorValue ?? 0)) staleReasons.push("The available factor value differs from the stored snapshot.");

    return {
      factorStillActive,
      latestAvailableFactorId: latestId,
      latestAvailableFactorValue: latest ? Number(latest.factorValue ?? latest.value ?? 0) : null,
      latestAvailableFactorVersion: latest?.version || null,
      latestAvailableFactorSourceName: latest?.sourceName || latest?.source || null,
      latestAvailableFactorSourceYear: latest?.sourceYear || null,
      latestAvailableFactorUnit: latest?.factorUnit || null,
      latestAvailableFactorIsSample: latest?.isSample ?? null,
      isStaleFactor: staleReasons.length > 0,
      staleFactorReason: staleReasons.join(" "),
      canRecalculateWithLatestFactor: Boolean(latest && staleReasons.length > 0),
    };
  }

  static validateActivityPayload(payload = {}) {
    const errors = [];
    const scope = Number(payload.scope);
    const activityAmount = Number(payload.activityAmount ?? payload.amount);
    const dataStatus = DATA_STATUSES.includes(payload.dataStatus) ? payload.dataStatus : "draft";

    if (![1, 2, 3].includes(scope)) errors.push("scope must be 1, 2, or 3");
    if (!payload.category) errors.push("category is required");
    if (!payload.activityType) errors.push("activityType is required");
    if (!payload.activityUnit && !payload.unit) errors.push("activityUnit is required");
    if (!Number.isFinite(activityAmount) || activityAmount < 0) errors.push("activityAmount must be a non-negative number");
    if (Number.isFinite(activityAmount) && activityAmount === 0 && dataStatus !== "draft") errors.push("activityAmount must be greater than 0 unless saved as draft");
    if (dataStatus !== "draft" && !payload.factorKey && !payload.fuelType && !Number.isFinite(Number(payload.factorValue))) errors.push("factorKey is required unless a custom factorValue is provided");
    if (!payload.reportingPeriod && (!payload.reportingPeriodStart || !payload.reportingPeriodEnd)) errors.push("reportingPeriod is required");
    if (!payload.occurredAt && !payload.activityDate) errors.push("activityDate is required");
    if (payload.country && !/^[A-Za-z]{2,3}$/.test(String(payload.country).trim())) errors.push("country must be a 2 or 3 letter code when provided");
    if (payload.region && String(payload.region).trim().length > 80) errors.push("region must be 80 characters or fewer");

    if (errors.length) {
      const error = new Error(errors.join("; "));
      error.status = 422;
      throw error;
    }
  }

  static async createActivity(companyId, payload, actor = null) {
    this.validateActivityPayload(payload);
    const dataStatus = DATA_STATUSES.includes(payload.dataStatus) ? payload.dataStatus : "draft";
    let linkedSupplier = null;
    if (payload.supplierId) {
      linkedSupplier = await Supplier.findOne({ _id: payload.supplierId, companyId })
        .select("_id name category country riskLevel")
        .lean();
      if (!linkedSupplier) {
        const error = new Error("Supplier not found for this company");
        error.status = 404;
        throw error;
      }
    }
    const factor = await this.resolveActivityFactor({ ...payload, companyId });
    if (!factor && !Number.isFinite(Number(payload.factorValue)) && dataStatus !== "draft") {
      const error = new Error("No emission factor found. Provide factorValue or configure an emission factor.");
      error.status = 422;
      throw error;
    }

    const activityPayload = { ...payload, occurredAt: payload.occurredAt || payload.activityDate };
    const calculation = calculateActivityEmission(activityPayload, factor);
    const recordKey = payload.recordKey || `activity:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date();
    const factorValueUsed = calculation.factorValue;
    const factorUnitUsed = calculation.factorUnit;
    const factorSourceName = factor ? calculation.factorSource : null;
    const formula = calculation.formula || "emissions = activityAmount x emissionFactor";
    const calculationStatus = factor
      ? calculation.calculationStatus
      : dataStatus === "draft" ? "draft_incomplete" : "missing_factor";
    const record = await this.upsertRecord(companyId, recordKey, {
      scope: Number(payload.scope),
      category: String(payload.category).trim(),
      sourceType: payload.sourceType || "ACTIVITY",
      sourceId: payload.sourceId || null,
      shipmentId: payload.shipmentId || null,
      supplierId: linkedSupplier?._id || payload.supplierId || null,
      description: payload.description || `${payload.category} activity`,
      activityAmount: calculation.activityAmount,
      activityUnit: calculation.activityUnit,
      amountTonnes: calculation.amountTonnes,
      emissionsKgCo2e: calculation.emissionsKgCo2e,
      emissionsTCo2e: calculation.emissionsTCo2e,
      factorValue: calculation.factorValue,
      factorValueUsed,
      factorUnit: calculation.factorUnit,
      factorUnitUsed,
      factorSource: factor ? calculation.factorSource : null,
      factorSourceName,
      factorSourceYear: calculation.factorSourceYear,
      factorRegion: calculation.factorRegion,
      factorCountry: calculation.factorCountry,
      factorVersion: calculation.factorVersion,
      factorIsSample: factor ? calculation.factorIsSample : false,
      factorIsOfficial: factor ? calculation.factorIsOfficial : false,
      factorIsCustom: factor ? calculation.factorIsCustom : false,
      emissionFactorId: calculation.emissionFactorId,
      calculationStatus,
      formula,
      facilityId: payload.facilityId || null,
      facilityName: payload.facilityName || null,
      businessUnit: payload.businessUnit || null,
      reportingPeriod: payload.reportingPeriod || null,
      reportingPeriodStart: payload.reportingPeriodStart ? new Date(payload.reportingPeriodStart) : null,
      reportingPeriodEnd: payload.reportingPeriodEnd ? new Date(payload.reportingPeriodEnd) : null,
      dataStatus,
      submittedBy: dataStatus === "submitted" ? actor?.id || null : null,
      submittedAt: dataStatus === "submitted" ? now : null,
      createdBy: actor?.id || null,
      updatedBy: actor?.id || null,
      notes: payload.notes || null,
      activityData: {
        activityType: payload.activityType,
        fuelType: payload.fuelType || payload.factorKey || null,
        supplierName: linkedSupplier?.name || payload.supplier || payload.supplierName || null,
        supplierCategory: linkedSupplier?.category || null,
        supplierCountry: linkedSupplier?.country || null,
        supplierRiskLevel: linkedSupplier?.riskLevel || null,
        method: payload.method || null,
        notes: payload.notes || null,
        calculationFormula: formula,
      },
      metadata: {
        factorId: factor?._id || factor?.id || null,
        emissionFactorId: factor?._id || factor?.id || null,
        factorKey: factor?.factorKey || factor?.key || payload.factorKey || payload.fuelType || null,
        factorIsSample: factor ? calculation.factorIsSample : false,
        factorVersion: calculation.factorVersion,
        factorIsOfficial: calculation.factorIsOfficial,
        factorIsCustom: calculation.factorIsCustom,
      },
      occurredAt: payload.occurredAt || payload.activityDate || new Date(),
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_record_created",
      entityType: "EmissionRecord",
      entityId: record.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      details: {
        scope: record.scope,
        category: record.category,
        amountTonnes: record.amountTonnes,
      },
      newValue: record.toObject ? record.toObject() : record,
    });

    return record;
  }

  static async updateStatus(companyId, id, status, actor = null, notes = null) {
    if (!DATA_STATUSES.includes(status)) {
      const error = new Error(`dataStatus must be one of: ${DATA_STATUSES.join(", ")}`);
      error.status = 422;
      throw error;
    }

    const record = await EmissionRecord.findOne({ _id: id, companyId });
    if (!record) {
      const error = new Error("Emission record not found");
      error.status = 404;
      throw error;
    }

    const role = normalizeRole(actor?.role);
    const currentStatus = record.dataStatus || "draft";
    const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
    const canReview = REVIEW_ROLES.has(role) && hasPermission(actor, "records:approve");
    const canSubmit = role === "data_entry" && hasPermission(actor, "records:edit");
    const isSubmitTransition = status === "submitted" && ["draft", "rejected", "needs_correction"].includes(currentStatus);
    const isArchiveTransition = canReview && status === "archived";
    const isReviewTransition = canReview && (
      (currentStatus === "submitted" && ["reviewed", "approved", "rejected", "needs_correction"].includes(status))
      || (currentStatus === "reviewed" && ["approved", "rejected", "needs_correction"].includes(status))
      || (currentStatus === "rejected" && status === "needs_correction")
      || (currentStatus === "needs_correction" && status === "rejected")
    );

    if (!(canSubmit && isSubmitTransition) && !isReviewTransition && !isArchiveTransition) {
      const error = new Error(`Role ${role || "unknown"} cannot change emission record status from ${currentStatus} to ${status}`);
      error.status = canReview || canSubmit ? 422 : 403;
      throw error;
    }

    if (["rejected", "needs_correction"].includes(status) && !normalizedNotes) {
      const error = new Error("Notes are required when rejecting a record or requesting correction");
      error.status = 422;
      throw error;
    }

    const actionByStatus = {
      submitted: "emission_record_submitted",
      reviewed: "emission_record_reviewed",
      approved: "emission_record_approved",
      rejected: "emission_record_rejected",
      needs_correction: "emission_record_needs_correction",
      archived: "emission_record_archived",
    };

    const oldValue = {
      dataStatus: record.dataStatus,
      submittedBy: record.submittedBy,
      submittedAt: record.submittedAt,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt,
      approvedBy: record.approvedBy,
      approvedAt: record.approvedAt,
      rejectedBy: record.rejectedBy,
      rejectedAt: record.rejectedAt,
      approvalNotes: record.approvalNotes,
      correctionNotes: record.correctionNotes,
      archivedBy: record.archivedBy,
      archivedAt: record.archivedAt,
    };
    const changedAt = new Date();
    record.dataStatus = status;
    record.updatedBy = actor?.id || null;

    if (status === "submitted") {
      record.submittedBy = actor?.id || null;
      record.submittedAt = changedAt;
      record.correctionNotes = null;
    }

    if (status === "reviewed") {
      record.reviewedBy = actor?.id || null;
      record.reviewedAt = changedAt;
      record.approvalNotes = normalizedNotes || null;
    }

    if (status === "approved") {
      record.reviewedBy = record.reviewedBy || actor?.id || null;
      record.reviewedAt = record.reviewedAt || changedAt;
      record.approvedBy = actor?.id || null;
      record.approvedAt = changedAt;
      record.approvalNotes = normalizedNotes || null;
      record.correctionNotes = null;
    }

    if (status === "rejected") {
      record.rejectedBy = actor?.id || null;
      record.rejectedAt = changedAt;
      record.correctionNotes = normalizedNotes;
      record.approvalNotes = null;
    }

    if (status === "needs_correction") {
      record.reviewedBy = actor?.id || null;
      record.reviewedAt = changedAt;
      record.correctionNotes = normalizedNotes;
      record.approvalNotes = null;
    }

    if (status === "archived") {
      record.reviewedBy = actor?.id || null;
      record.reviewedAt = changedAt;
      record.archivedBy = actor?.id || null;
      record.archivedAt = changedAt;
      record.correctionNotes = normalizedNotes || record.correctionNotes || null;
    }

    await record.save();
    invalidateCompanyMetrics(companyId);

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: actionByStatus[status] || "emission_record_updated",
      entityType: "EmissionRecord",
      entityId: record.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      oldValue,
      newValue: {
        dataStatus: record.dataStatus,
        submittedBy: record.submittedBy,
        submittedAt: record.submittedAt,
        reviewedBy: record.reviewedBy,
        reviewedAt: record.reviewedAt,
        approvedBy: record.approvedBy,
        approvedAt: record.approvedAt,
        rejectedBy: record.rejectedBy,
        rejectedAt: record.rejectedAt,
        approvalNotes: record.approvalNotes,
        correctionNotes: record.correctionNotes,
        archivedBy: record.archivedBy,
        archivedAt: record.archivedAt,
      },
    });

    return record;
  }

  static async updateActivity(companyId, id, payload = {}, actor = null) {
    const record = await EmissionRecord.findOne({ _id: id, companyId });
    if (!record) {
      const error = new Error("Emission record not found");
      error.status = 404;
      throw error;
    }

    const role = normalizeRole(actor?.role);
    if (role === "data_entry" && record.createdBy && record.createdBy !== actor?.id) {
      const error = new Error("Data entry users can only edit their own draft records");
      error.status = 403;
      throw error;
    }
    if (role === "data_entry" && record.dataStatus !== "draft") {
      const error = new Error("Data entry users can only edit draft records");
      error.status = 403;
      throw error;
    }

    const currentStatus = record.dataStatus || "draft";
    const editReason = String(payload.editReason || payload.reason || "").trim();
    if (LOCKED_EDIT_STATUSES.has(currentStatus) && !editReason) {
      const error = new Error("editReason is required when editing submitted, reviewed, or approved records");
      error.status = 422;
      throw error;
    }

    let linkedSupplier = null;
    if (payload.supplierId || record.supplierId) {
      const supplierId = payload.supplierId === "" ? null : (payload.supplierId ?? record.supplierId);
      if (supplierId) {
        linkedSupplier = await Supplier.findOne({ _id: supplierId, companyId }).select("_id name category country riskLevel").lean();
        if (!linkedSupplier) {
          const error = new Error("Supplier not found for this company");
          error.status = 404;
          throw error;
        }
      }
    }

    const nextPayload = {
      scope: payload.scope ?? record.scope,
      category: payload.category ?? record.category,
      activityType: payload.activityType ?? record.activityData?.activityType,
      activityAmount: payload.activityAmount ?? record.activityAmount,
      activityUnit: payload.activityUnit ?? record.activityUnit,
      factorKey: payload.factorKey ?? record.metadata?.factorKey ?? record.activityData?.fuelType,
      fuelType: payload.factorKey ?? record.activityData?.fuelType,
      country: payload.country ?? record.factorCountry,
      region: payload.region ?? record.factorRegion ?? "GLOBAL",
      reportingPeriod: payload.reportingPeriod ?? record.reportingPeriod,
      reportingPeriodStart: payload.reportingPeriodStart ?? record.reportingPeriodStart,
      reportingPeriodEnd: payload.reportingPeriodEnd ?? record.reportingPeriodEnd,
      occurredAt: payload.occurredAt ?? payload.activityDate ?? record.occurredAt,
      activityDate: payload.activityDate ?? payload.occurredAt ?? record.occurredAt,
      dataStatus: currentStatus === "draft" ? "draft" : "needs_correction",
    };
    this.validateActivityPayload(nextPayload);

    const factor = await this.resolveActivityFactor({ ...nextPayload, companyId });
    const calculation = calculateActivityEmission(nextPayload, factor);
    const oldValue = record.toObject();
    const now = new Date();
    const nextStatus = LOCKED_EDIT_STATUSES.has(currentStatus) ? "needs_correction" : currentStatus;

    Object.assign(record, {
      scope: Number(nextPayload.scope),
      category: String(nextPayload.category || "").trim(),
      supplierId: linkedSupplier?._id || (payload.supplierId === "" ? null : record.supplierId),
      description: payload.description ?? record.description,
      notes: payload.notes ?? record.notes,
      activityAmount: calculation.activityAmount,
      activityUnit: calculation.activityUnit,
      amountTonnes: calculation.amountTonnes,
      emissionsKgCo2e: calculation.emissionsKgCo2e,
      emissionsTCo2e: calculation.emissionsTCo2e,
      factorValue: calculation.factorValue,
      factorValueUsed: calculation.factorValue,
      factorUnit: calculation.factorUnit,
      factorUnitUsed: calculation.factorUnit,
      factorSource: factor ? calculation.factorSource : null,
      factorSourceName: factor ? calculation.factorSource : null,
      factorSourceYear: factor ? calculation.factorSourceYear : null,
      factorRegion: nextPayload.region,
      factorCountry: nextPayload.country || null,
      factorVersion: calculation.factorVersion,
      factorIsSample: factor ? calculation.factorIsSample : false,
      factorIsOfficial: factor ? calculation.factorIsOfficial : false,
      factorIsCustom: factor ? calculation.factorIsCustom : false,
      emissionFactorId: calculation.emissionFactorId,
      calculationStatus: factor ? calculation.calculationStatus : "missing_factor",
      formula: calculation.formula,
      facilityName: payload.facilityName ?? payload.facility ?? record.facilityName,
      businessUnit: payload.businessUnit ?? record.businessUnit,
      reportingPeriod: nextPayload.reportingPeriod,
      reportingPeriodStart: toDateOrNull(nextPayload.reportingPeriodStart),
      reportingPeriodEnd: toDateOrNull(nextPayload.reportingPeriodEnd),
      occurredAt: toDateOrNull(nextPayload.occurredAt) || record.occurredAt,
      dataStatus: nextStatus,
      correctionNotes: nextStatus === "needs_correction" ? editReason : record.correctionNotes,
      updatedBy: actor?.id || null,
      activityData: {
        ...(record.activityData || {}),
        activityType: nextPayload.activityType,
        fuelType: nextPayload.factorKey,
        supplierName: linkedSupplier?.name || payload.supplierName || record.activityData?.supplierName || null,
        supplierCategory: linkedSupplier?.category || record.activityData?.supplierCategory || null,
        supplierCountry: linkedSupplier?.country || record.activityData?.supplierCountry || null,
        supplierRiskLevel: linkedSupplier?.riskLevel || record.activityData?.supplierRiskLevel || null,
        notes: payload.notes ?? record.activityData?.notes ?? null,
        calculationFormula: calculation.formula,
      },
      metadata: {
        ...(record.metadata || {}),
        factorId: calculation.emissionFactorId,
        emissionFactorId: calculation.emissionFactorId,
        factorKey: nextPayload.factorKey,
        factorVersion: calculation.factorVersion,
        factorIsSample: factor ? calculation.factorIsSample : false,
        factorIsOfficial: factor ? calculation.factorIsOfficial : false,
        factorIsCustom: factor ? calculation.factorIsCustom : false,
        lastEditReason: editReason || null,
      },
    });

    await record.save();
    invalidateCompanyMetrics(companyId);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_record_updated",
      entityType: "EmissionRecord",
      entityId: record.id,
      ipAddress: actor?.ipAddress || null,
      userAgent: actor?.userAgent || null,
      oldValue,
      newValue: record.toObject(),
      details: {
        reason: editReason || null,
        previousStatus: currentStatus,
        nextStatus,
        source: "manual",
      },
    });
    if (String(oldValue.supplierId || "") !== String(record.supplierId || "") && record.supplierId) {
      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        action: "supplier_linked_to_emission_record",
        entityType: "EmissionRecord",
        entityId: record.id,
        details: { supplierId: record.supplierId, supplierName: record.activityData?.supplierName || null },
      });
    }
    if (String(oldValue.emissionFactorId || oldValue.metadata?.factorId || "") !== String(record.emissionFactorId || "")) {
      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        action: "factor_replaced_on_record",
        entityType: "EmissionRecord",
        entityId: record.id,
        oldValue: compactAuditSummary(oldValue),
        newValue: compactAuditSummary(record.toObject()),
        details: { reason: editReason || null },
      });
    }

    return record;
  }

  static async recalculate(companyId, id, actor = null, reason = null) {
    const record = await EmissionRecord.findOne({ _id: id, companyId });
    if (!record) {
      const error = new Error("Emission record not found");
      error.status = 404;
      throw error;
    }

    const payload = {
      scope: record.scope,
      category: record.category,
      activityType: record.activityData?.activityType,
      activityAmount: record.activityAmount,
      activityUnit: record.activityUnit,
      factorKey: record.metadata?.factorKey || record.activityData?.fuelType,
      fuelType: record.activityData?.fuelType,
      country: record.factorCountry,
      region: record.factorRegion || "GLOBAL",
      occurredAt: record.occurredAt,
    };
    const currentStatus = record.dataStatus || "draft";
    const normalizedReason = String(reason || "").trim();
    if (LOCKED_EDIT_STATUSES.has(currentStatus) && !normalizedReason) {
      const error = new Error("reason is required when recalculating submitted, reviewed, or approved records");
      error.status = 422;
      throw error;
    }
    const factor = await this.resolveActivityFactor({ ...payload, companyId });
    if (!factor) {
      const error = new Error("No emission factor found for recalculation.");
      error.status = 422;
      throw error;
    }
    const calculation = calculateActivityEmission(payload, factor);
    const oldValue = record.toObject();
    Object.assign(record, {
      amountTonnes: calculation.amountTonnes,
      emissionsKgCo2e: calculation.emissionsKgCo2e,
      emissionsTCo2e: calculation.emissionsTCo2e,
      factorValue: calculation.factorValue,
      factorValueUsed: calculation.factorValue,
      factorUnit: calculation.factorUnit,
      factorUnitUsed: calculation.factorUnit,
      factorSource: calculation.factorSource,
      factorSourceName: calculation.factorSource,
      factorSourceYear: calculation.factorSourceYear,
      factorRegion: calculation.factorRegion,
      factorCountry: calculation.factorCountry,
      factorVersion: calculation.factorVersion,
      factorIsSample: calculation.factorIsSample,
      factorIsOfficial: calculation.factorIsOfficial,
      factorIsCustom: calculation.factorIsCustom,
      emissionFactorId: calculation.emissionFactorId,
      calculationStatus: calculation.calculationStatus,
      formula: calculation.formula,
      updatedBy: actor?.id || null,
      metadata: {
        ...(record.metadata || {}),
        factorId: factor?._id || factor?.id || null,
        emissionFactorId: factor?._id || factor?.id || null,
        factorKey: factor?.factorKey || factor?.key || payload.factorKey || null,
        factorIsSample: calculation.factorIsSample,
        factorVersion: calculation.factorVersion,
        factorIsOfficial: calculation.factorIsOfficial,
        factorIsCustom: calculation.factorIsCustom,
      },
      dataStatus: LOCKED_EDIT_STATUSES.has(currentStatus) ? "needs_correction" : record.dataStatus,
      correctionNotes: LOCKED_EDIT_STATUSES.has(currentStatus) ? normalizedReason : record.correctionNotes,
    });
    await record.save();
    invalidateCompanyMetrics(companyId);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "emission_record_recalculated",
      entityType: "EmissionRecord",
      entityId: record.id,
      oldValue,
      newValue: record.toObject(),
      details: {
        reason: normalizedReason || null,
        source: "recalculation",
      },
    });
    return record;
  }

  static async getAuditTimeline(companyId, id, actor = null) {
    const record = await EmissionRecord.findOne({ _id: id, companyId }).lean();
    if (!record) {
      const error = new Error("Emission record not found");
      error.status = 404;
      throw error;
    }
    const [recordLogs, financialLogs, reportLogs] = await Promise.all([
      AuditLog.find({ companyId, entityType: "EmissionRecord", entityId: id }).sort({ createdAt: 1 }).lean(),
      LedgerEntry.find({ companyId, emissionRecordId: id }).select("_id createdAt updatedAt createdBy updatedBy description totalCostUsd").lean(),
      Report.find({
        companyId,
        $or: [
          { "metadata.generatedFrom": "carbon_ledger" },
          { "metadata.recordIds": id },
        ],
      }).select("_id name generatedAt createdAt metadata").sort({ generatedAt: 1 }).lean(),
    ]);

    const items = recordLogs.map((log) => ({
      id: log._id || log.id,
      action: log.action,
      timestamp: log.createdAt,
      userId: log.userId || null,
      userEmail: log.userEmail || null,
      oldValueSummary: compactAuditSummary(log.oldValue),
      newValueSummary: compactAuditSummary(log.newValue),
      notes: log.details?.reason || log.details?.notes || log.newValue?.correctionNotes || log.newValue?.approvalNotes || null,
      source: inferTimelineSource(log),
    }));

    financialLogs.forEach((entry) => {
      items.push({
        id: `financial:${entry._id || entry.id}`,
        action: "financial_entry_linked",
        timestamp: entry.createdAt,
        userId: entry.createdBy || null,
        userEmail: null,
        oldValueSummary: null,
        newValueSummary: { description: entry.description, totalCostUsd: entry.totalCostUsd },
        notes: null,
        source: "financial ledger",
      });
    });

    reportLogs.forEach((report) => {
      items.push({
        id: `report:${report._id || report.id}`,
        action: "report_generated_including_record",
        timestamp: report.generatedAt || report.createdAt,
        userId: report.metadata?.generatedBy || null,
        userEmail: report.metadata?.generatedByEmail || null,
        oldValueSummary: null,
        newValueSummary: { reportName: report.name, inclusionPolicy: report.metadata?.recordSelection || report.metadata?.approvedOnly },
        notes: null,
        source: "report",
      });
    });

    return items.sort((left, right) => new Date(left.timestamp || 0) - new Date(right.timestamp || 0));
  }

  static async upsertRecord(companyId, recordKey, payload) {
    const period = getPeriod(payload.occurredAt, payload.reportingPeriodStart);

    const record = await EmissionRecord.findOneAndUpdate(
      { companyId, recordKey },
      {
        $set: {
          ...payload,
          companyId,
          recordKey,
          emissionsKgCo2e: payload.emissionsKgCo2e ?? toKgFromTonnes(payload.amountTonnes),
          emissionsTCo2e: payload.emissionsTCo2e ?? payload.amountTonnes,
          occurredAt: period.occurredAt,
          periodMonth: period.periodMonth,
          periodYear: period.periodYear,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    invalidateCompanyMetrics(companyId);
    return record;
  }

  static async deleteRecord(companyId, recordKey) {
    await EmissionRecord.deleteOne({ companyId, recordKey });
    invalidateCompanyMetrics(companyId);
  }

  static async syncShipmentRecord(shipment, supplier = null) {
    const computed = calculateShipmentEmissions(shipment, shipment.emissionFactorOverrides || {});
    const factorType = shipment.emissionFactorType || (shipment.calculationStatus === "missing_factor" ? "missing" : "sample");
    const factorIsSample = factorType === "sample";
    const factorIsOfficial = factorType === "official";
    const factorIsCustom = factorType === "custom";

    return this.upsertRecord(shipment.companyId, `shipment:${shipment.id || shipment._id}`, {
      scope: 3,
      category: "Logistics",
      sourceType: "SHIPMENT",
      sourceId: shipment.id || shipment._id,
      shipmentId: shipment.id || shipment._id,
      supplierId: shipment.supplierId || null,
      description: `${shipment.reference} ${shipment.origin} to ${shipment.destination}`,
      amountTonnes: round(shipment.tCO2e ?? shipment.emissionsTonnes ?? computed.emissionsTonnes),
      emissionsKgCo2e: Number(shipment.kgCO2e ?? shipment.emissionsKgCo2e ?? 0),
      emissionsTCo2e: Number(shipment.tCO2e ?? shipment.emissionsTonnes ?? computed.emissionsTonnes),
      costUsd: Number(shipment.costUsd || 0),
      factorValue: Number(shipment.emissionFactorValue ?? shipment.emissionFactor ?? computed.factorKgPerTonKm),
      factorValueUsed: Number(shipment.emissionFactorValue ?? shipment.emissionFactor ?? computed.factorKgPerTonKm),
      factorUnit: shipment.emissionFactorUnit || "kgCO2e/ton-km",
      factorUnitUsed: shipment.emissionFactorUnit || "kgCO2e/ton-km",
      factorSource: shipment.factorSource || shipment.emissionFactorSourceName || "CarbonFlow sample logistics factors",
      factorSourceName: shipment.emissionFactorSourceName || shipment.factorSource || null,
      factorSourceYear: shipment.emissionFactorSourceYear || null,
      factorIsSample,
      factorIsOfficial,
      factorIsCustom,
      emissionFactorId: shipment.emissionFactorId || null,
      calculationStatus: shipment.calculationStatus || (computed.factorKgPerTonKm > 0 ? "calculated" : "missing_factor"),
      formula: shipment.calculationFormula || null,
      activityData: {
        reference: shipment.reference,
        shipmentReference: shipment.shipmentReference || shipment.reference,
        bolNumber: shipment.bolNumber || null,
        containerId: shipment.containerId || null,
        origin: shipment.origin,
        destination: shipment.destination,
        carrier: shipment.carrier,
        supplierName: supplier?.name || null,
        distanceKm: computed.distanceKm,
        distanceUnit: shipment.distanceUnit || "km",
        weightKg: computed.weightKg,
        weightUnit: shipment.weightUnit || "kg",
        tonKm: computed.tonKm,
        transportMode: computed.transportMode,
        fuelType: shipment.fuelType || null,
        reportingPeriod: shipment.reportingPeriod || null,
      },
      metadata: {
        status: shipment.status,
        carbonCostUsd: Number(shipment.carbonCostUsd || 0),
        calculationStatus: shipment.calculationStatus || (computed.factorKgPerTonKm > 0 ? "calculated" : "missing_factor"),
        emissionFactorType: factorType,
        linkedSupplierSnapshot: shipment.linkedSupplierSnapshot || null,
        dataQualityWarnings: shipment.dataQualityWarnings || [],
      },
      occurredAt: shipment.shipmentDate || shipment.createdAt || new Date(),
    });
  }

  static async syncSupplierRecord(supplier) {
    return this.upsertRecord(supplier.companyId, `supplier:${supplier.id || supplier._id}`, {
      scope: 3,
      category: "Supplier",
      sourceType: "SUPPLIER",
      sourceId: supplier.id || supplier._id,
      supplierId: supplier.id || supplier._id,
      description: `${supplier.name} supplier footprint`,
      amountTonnes: round(Number(supplier.totalEmissions || 0)),
      costUsd: 0,
      factorValue: round(Number(supplier.emissionIntensity ?? supplier.emissionFactor ?? 0), 4),
      factorUnit: "tCO2e/intensity-unit",
      activityData: {
        supplierName: supplier.name,
        country: supplier.country,
        category: supplier.category,
        complianceScore: supplier.complianceScore,
        countryRiskIndex: supplier.countryRiskIndex,
        riskLevel: supplier.riskLevel,
      },
      metadata: {
        carbonScore: supplier.carbonScore,
        riskScore: supplier.riskScore,
      },
      occurredAt: supplier.updatedAt || supplier.createdAt || new Date(),
    });
  }

  static async syncOperationalRecords(companyId, settings) {
    const overrides = settings.emissionFactorOverrides || {};
    const operationalMetrics = settings.operationalMetrics || {};
    const scope1 = calculateScope1(operationalMetrics, overrides);
    const scope2 = calculateScope2({
      ...operationalMetrics,
      region: settings.region || "GLOBAL",
    }, overrides);
    const occurredAt = new Date();

    await Promise.all([
      this.upsertRecord(companyId, "operational:scope1", {
        scope: 1,
        category: "Direct Operations",
        sourceType: "SCOPE1_STATIONARY_FUEL",
        description: "Operational Scope 1 baseline",
        amountTonnes: scope1.totalTonnes,
        factorValue: 0,
        factorUnit: "mixed",
        activityData: {
          breakdown: scope1.breakdown,
          operationalMetrics,
        },
        metadata: {
          stationaryFuelType: operationalMetrics.stationaryFuelType || "DIESEL",
          mobileFuelType: operationalMetrics.mobileFuelType || "DIESEL",
        },
        occurredAt,
      }),
      this.upsertRecord(companyId, "operational:scope2", {
        scope: 2,
        category: "Purchased Electricity",
        sourceType: "SCOPE2_ELECTRICITY",
        description: "Operational Scope 2 baseline",
        amountTonnes: scope2.totalTonnes,
        factorValue: scope2.factorKgPerKwh,
        factorUnit: "kgCO2e/kWh",
        activityData: {
          electricityKwh: scope2.electricityKwh,
          renewableElectricityPct: scope2.renewableElectricityPct,
          locationBasedTonnes: scope2.locationBasedTonnes,
          marketBasedTonnes: scope2.marketBasedTonnes,
        },
        metadata: {
          region: scope2.region,
        },
        occurredAt,
      }),
    ]);
  }

  static async getSummary(companyId) {
    const records = await EmissionRecord.find({ companyId, dataStatus: "approved" }).lean();

    return records.reduce((accumulator, record) => {
      const amountTonnes = Number(record.amountTonnes || 0);
      accumulator.totalEmissions = round(accumulator.totalEmissions + amountTonnes);

      if (record.scope === 1) {
        accumulator.scope1 = round(accumulator.scope1 + amountTonnes);
      }

      if (record.scope === 2) {
        accumulator.scope2 = round(accumulator.scope2 + amountTonnes);
      }

      if (record.scope === 3) {
        accumulator.scope3 = round(accumulator.scope3 + amountTonnes);
      }

      return accumulator;
    }, {
      totalEmissions: 0,
      scope1: 0,
      scope2: 0,
      scope3: 0,
    });
  }
}

module.exports = EmissionRecordService;
