const { EmissionRecord, SupplierEvidence, Supplier, MarketplaceBudgetRequest, OffsetTransaction, EmissionFactor, AuditLog } = require("../models");
const EmissionRecordService = require("./emissionRecord.service");
const SupplierService = require("./supplier.service");
const MarketplaceService = require("./marketplace.service");
const AuditService = require("./audit.service");
const ApiError = require("../utils/ApiError");
const { hasPermission, normalizeRole } = require("../middlewares/rbac");

const OPEN_STATUSES = ["submitted", "pending_review", "under_review", "PENDING", "pending", "manual_verification_required", "failed", "partially_committed"];

const TYPE_ALIASES = {
  all: "all",
  budget_request: "marketplace_budget_request",
  marketplace_review: "marketplace_review",
  emission_record: "emission_record",
  supplier_evidence: "supplier_evidence",
  marketplace_budget_request: "marketplace_budget_request",
  marketplace_payment_review: "marketplace_payment_review",
  marketplace_registry_review: "marketplace_registry_review",
  emission_factor_change: "emission_factor_change",
  import_issue: "import_issue",
};

const ACTION_PERMISSIONS = {
  emission_record: "emission:approve",
  supplier_evidence: "supplier:evidence:verify",
  marketplace_budget_request: "marketplace:budget:manage",
  marketplace_payment_review: "marketplace:payment:verify",
  marketplace_registry_review: "marketplace:registry:verify",
  emission_factor_change: "factor:approve",
  import_issue: "import:review",
};

function toId(value) {
  return value ? String(value._id || value.id || value) : null;
}

function normalizeType(type) {
  return TYPE_ALIASES[String(type || "all").trim()] || null;
}

function normalizeStatus(status) {
  return String(status || "pending_review").trim().toLowerCase();
}

function normalizePriority(priority) {
  const value = String(priority || "medium").trim().toLowerCase();
  return ["low", "medium", "high", "critical"].includes(value) ? value : "medium";
}

function priorityFor(type, warnings = []) {
  if (warnings.some((warning) => /missing|failed|invalid|manual/i.test(String(warning)))) return "high";
  if (type === "marketplace_budget_request" || type === "marketplace_payment_review" || type === "marketplace_registry_review") return "high";
  if (type === "emission_factor_change" || type === "import_issue") return "high";
  return "medium";
}

function actorCan(actor, permission) {
  if (!hasPermission(actor, permission)) {
    throw new ApiError(403, `Permission denied: ${permission}`);
  }
}

function canAct(actor, type) {
  const permission = ACTION_PERMISSIONS[type];
  return Boolean(permission && hasPermission(actor, permission));
}

function isOwnerOrAdmin(actor) {
  return ["owner", "admin"].includes(normalizeRole(actor?.role));
}

function actionSet(actor, item, options = {}) {
  const permitted = canAct(actor, item.type);
  const disabledReason = permitted ? null : `Requires ${ACTION_PERMISSIONS[item.type] || "module approval"} permission.`;
  const highRiskNeedsNotes = item.priority === "high" || item.priority === "critical" || (item.riskFlags || []).length > 0;
  const baseActions = [
    { action: "approve", enabled: permitted && options.approve !== false, requiresNotes: highRiskNeedsNotes, disabledReason: options.approve === false ? options.reason || "Approval is not supported for this item." : disabledReason },
    { action: "reject", enabled: permitted && options.reject !== false, requiresReason: true, disabledReason: options.reject === false ? options.reason || "Rejection is not supported for this item." : disabledReason },
    { action: "request_correction", enabled: permitted && options.correction !== false, requiresNotes: true, disabledReason: options.correction === false ? options.reason || "Correction is not supported for this item." : disabledReason },
  ];
  return baseActions;
}

function safeText(value, fallback = null) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text || fallback;
}

async function auditApproval(companyId, actor, action, item, oldStatus, newStatus, payload = {}) {
  await AuditService.log({
    companyId,
    userId: actor?.id || null,
    userEmail: actor?.email || null,
    ipAddress: actor?.ipAddress || null,
    userAgent: actor?.userAgent || null,
    action,
    entityType: item.relatedEntityType || item.type,
    entityId: item.relatedEntityId || item.id,
    module: "approvals",
    category: "approval",
    severity: item.priority === "critical" ? "critical" : item.priority === "high" ? "high" : "info",
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
    details: {
      approvalType: item.type,
      entityId: item.id,
      oldStatus,
      newStatus,
      reason: payload.reason || payload.notes || null,
    },
  });
}

class ApprovalsService {
  static async summary(companyId) {
    const [emissions, evidence, budgetRequests, paymentReviews, registryReviews, factorReviews, importIssues] = await Promise.all([
      EmissionRecord.countDocuments({ companyId, dataStatus: "submitted" }),
      SupplierEvidence.countDocuments({ companyId, status: { $in: ["submitted", "under_review"] } }),
      MarketplaceBudgetRequest.countDocuments({ companyId, status: "PENDING" }),
      OffsetTransaction.countDocuments({ companyId, paymentStatus: { $in: ["pending", "invoice_sent"] } }),
      OffsetTransaction.countDocuments({ companyId, registryRetirementStatus: { $in: ["pending", "submitted", "manual_verification_required"] } }),
      EmissionFactor.countDocuments({ companyId, isCustom: true, isActive: false }),
      AuditLog.countDocuments({ companyId, action: { $in: ["import_failed", "import_partially_committed", "import_committed"] }, $or: [{ "details.invalidRows": { $gt: 0 } }, { "details.status": { $in: ["failed", "partially_committed", "partially_failed"] } }] }),
    ]);
    const marketplaceReviews = paymentReviews + registryReviews;
    return {
      pendingEmissionApprovals: emissions,
      supplierEvidenceReviews: evidence,
      budgetRequests,
      marketplaceReviews,
      factorReviews,
      importIssues,
      highPriority: budgetRequests + marketplaceReviews + factorReviews + importIssues,
      criticalPriority: importIssues,
      totalPending: emissions + evidence + budgetRequests + marketplaceReviews + factorReviews + importIssues,
    };
  }

  static async list(companyId, query = {}, actor = null) {
    const requestedType = normalizeType(query.type) || "all";
    const items = [];
    const limit = Math.min(Math.max(Number(query.pageSize || 100), 1), 200);

    if (requestedType === "all" || requestedType === "emission_record") {
      const records = await EmissionRecord.find({ companyId, dataStatus: "submitted" }).sort({ submittedAt: -1, createdAt: -1 }).limit(limit).lean();
      records.forEach((record) => items.push(this.mapEmissionRecord(record, actor)));
    }
    if (requestedType === "all" || requestedType === "supplier_evidence") {
      const evidence = await SupplierEvidence.find({ companyId, status: { $in: ["submitted", "under_review"] } }).sort({ uploadedAt: -1, createdAt: -1 }).limit(limit).lean();
      evidence.forEach((item) => items.push(this.mapSupplierEvidence(item, actor)));
    }
    if (requestedType === "all" || requestedType === "marketplace_budget_request") {
      const requests = await MarketplaceBudgetRequest.find({ companyId, status: "PENDING" }).sort({ createdAt: -1 }).limit(limit).lean();
      requests.forEach((request) => items.push(this.mapBudgetRequest(request, actor)));
    }
    if (requestedType === "all" || requestedType === "marketplace_review" || requestedType === "marketplace_payment_review") {
      const transactions = await OffsetTransaction.find({ companyId, paymentStatus: { $in: ["pending", "invoice_sent"] } }).sort({ createdAt: -1 }).limit(limit).lean();
      transactions.forEach((transaction) => items.push(this.mapMarketplaceTransaction(transaction, "marketplace_payment_review", actor)));
    }
    if (requestedType === "all" || requestedType === "marketplace_review" || requestedType === "marketplace_registry_review") {
      const transactions = await OffsetTransaction.find({ companyId, registryRetirementStatus: { $in: ["pending", "submitted", "manual_verification_required"] } }).sort({ createdAt: -1 }).limit(limit).lean();
      transactions.forEach((transaction) => items.push(this.mapMarketplaceTransaction(transaction, "marketplace_registry_review", actor)));
    }
    if (requestedType === "all" || requestedType === "emission_factor_change") {
      const factors = await EmissionFactor.find({ companyId, isCustom: true, isActive: false }).sort({ updatedAt: -1, createdAt: -1 }).limit(limit).lean();
      factors.forEach((factor) => items.push(this.mapFactorChange(factor, actor)));
    }
    if (requestedType === "all" || requestedType === "import_issue") {
      const imports = await AuditLog.find({ companyId, action: { $in: ["import_failed", "import_partially_committed", "import_committed"] }, $or: [{ "details.invalidRows": { $gt: 0 } }, { "details.status": { $in: ["failed", "partially_committed", "partially_failed"] } }] }).sort({ createdAt: -1 }).limit(limit).lean();
      imports.forEach((entry) => items.push(this.mapImportIssue(entry, actor)));
    }

    const filtered = this.applyFilters(items, query);
    return {
      data: filtered.slice(0, limit),
      pagination: { page: 1, pageSize: filtered.length, total: filtered.length, totalPages: 1 },
    };
  }

  static applyFilters(items, query = {}) {
    const status = safeText(query.status);
    const priority = safeText(query.priority);
    const submittedBy = safeText(query.submittedBy || query.createdBy);
    const assignedTo = safeText(query.assignedTo);
    const moduleName = safeText(query.module);
    const search = safeText(query.search);
    const from = query.dateFrom ? new Date(query.dateFrom) : null;
    const to = query.dateTo ? new Date(query.dateTo) : null;
    return items
      .filter((item) => !status || item.status === normalizeStatus(status))
      .filter((item) => !priority || item.priority === normalizePriority(priority))
      .filter((item) => !submittedBy || String(item.submittedBy || "").toLowerCase().includes(submittedBy.toLowerCase()) || String(item.submittedByEmail || "").toLowerCase().includes(submittedBy.toLowerCase()))
      .filter((item) => !assignedTo || String(item.assignedTo || "").toLowerCase().includes(assignedTo.toLowerCase()))
      .filter((item) => !moduleName || item.module === moduleName)
      .filter((item) => !search || [item.title, item.description, item.relatedEntityLabel, item.relatedEntityId].some((value) => String(value || "").toLowerCase().includes(search.toLowerCase())))
      .filter((item) => !from || new Date(item.submittedAt || item.createdAt || 0) >= from)
      .filter((item) => !to || new Date(item.submittedAt || item.createdAt || 0) <= to)
      .sort((left, right) => {
        const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
        const priorityDelta = (priorityRank[right.priority] || 0) - (priorityRank[left.priority] || 0);
        if (priorityDelta) return priorityDelta;
        return new Date(right.submittedAt || right.createdAt || 0) - new Date(left.submittedAt || left.createdAt || 0);
      });
  }

  static mapEmissionRecord(record, actor = null) {
    const warnings = [];
    if (record.calculationStatus === "missing_factor" || !record.factorValue) warnings.push("Missing factor");
    if (record.factorIsSample) warnings.push("Sample factor used");
    const item = {
      id: toId(record),
      type: "emission_record",
      title: `${record.category || "Emission"} record`,
      description: record.description || record.notes || null,
      status: normalizeStatus(record.dataStatus || "submitted"),
      priority: priorityFor("emission_record", warnings),
      submittedBy: record.submittedBy || record.createdBy || null,
      submittedByEmail: null,
      submittedAt: record.submittedAt || record.createdAt,
      assignedTo: record.reviewedBy || null,
      relatedEntityType: "EmissionRecord",
      relatedEntityId: toId(record),
      relatedEntityLabel: record.recordKey || record.description || toId(record),
      module: "emissions",
      riskFlags: warnings.filter((warning) => /missing/i.test(warning)),
      dataQualityWarnings: warnings,
      actionRequiredByRole: "emission:approve",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      dataSummary: {
        scope: record.scope,
        category: record.category,
        activity: record.activityData?.activityType || record.sourceType,
        factorSource: record.factorSourceName || record.factorSource || null,
        factorType: record.factorIsCustom ? "custom" : record.factorIsOfficial ? "official" : record.factorIsSample ? "sample" : "unknown",
        kgCO2e: record.emissionsKgCo2e,
        tCO2e: record.emissionsTCo2e || record.amountTonnes,
        formula: record.formula || record.activityData?.calculationFormula || null,
      },
    };
    item.availableActions = actionSet(actor, item);
    return item;
  }

  static mapSupplierEvidence(evidence, actor = null) {
    const warnings = [];
    if (evidence.expiresAt && new Date(evidence.expiresAt) < new Date()) warnings.push("Evidence expired");
    const item = {
      id: toId(evidence),
      type: "supplier_evidence",
      title: evidence.title || "Supplier evidence",
      description: evidence.evidenceType || evidence.notes || null,
      status: normalizeStatus(evidence.status),
      priority: priorityFor("supplier_evidence", warnings),
      submittedBy: evidence.uploadedBy || evidence.createdBy || null,
      submittedByEmail: null,
      submittedAt: evidence.uploadedAt || evidence.createdAt,
      assignedTo: evidence.verifiedBy || null,
      relatedEntityType: "Supplier",
      relatedEntityId: evidence.supplierId,
      relatedEntityLabel: evidence.supplierId,
      module: "suppliers",
      riskFlags: warnings,
      dataQualityWarnings: warnings,
      actionRequiredByRole: "supplier:evidence:verify",
      createdAt: evidence.createdAt,
      updatedAt: evidence.updatedAt,
      dataSummary: {
        supplier: evidence.supplierId,
        evidenceType: evidence.evidenceType,
        verificationStatus: evidence.status,
        expiryDate: evidence.expiresAt,
        fileName: evidence.fileName,
        fileSize: evidence.fileSize,
        mimeType: evidence.mimeType,
      },
    };
    item.availableActions = actionSet(actor, item);
    return item;
  }

  static mapBudgetRequest(request, actor = null) {
    const item = {
      id: toId(request),
      type: "marketplace_budget_request",
      title: `Marketplace budget request: $${Number(request.requestedAmount || 0).toLocaleString()}`,
      description: request.reason || null,
      status: normalizeStatus(request.status),
      priority: priorityFor("marketplace_budget_request"),
      submittedBy: request.requestedBy || null,
      submittedByEmail: null,
      submittedAt: request.createdAt,
      assignedTo: request.reviewedBy || null,
      relatedEntityType: "MarketplaceBudgetRequest",
      relatedEntityId: toId(request),
      relatedEntityLabel: `Budget request ${toId(request)}`,
      module: "marketplace",
      riskFlags: [],
      dataQualityWarnings: [],
      actionRequiredByRole: "marketplace:budget:manage",
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      dataSummary: {
        requestedAmount: request.requestedAmount,
        currentBudget: request.currentBudget,
        reason: request.reason,
        requester: request.requestedBy,
      },
    };
    item.availableActions = actionSet(actor, item);
    return item;
  }

  static mapMarketplaceTransaction(transaction, type, actor = null) {
    const isRegistry = type === "marketplace_registry_review";
    const warnings = [];
    if (transaction.isDemo) warnings.push("Demo transaction cannot be verified as real registry retirement");
    if (isRegistry && !transaction.registryRetirementId && transaction.registryRetirementStatus === "manual_verification_required") warnings.push("Manual registry evidence required");
    const item = {
      id: toId(transaction),
      type,
      title: transaction.projectName || "Marketplace transaction review",
      description: isRegistry ? transaction.registryRetirementStatus : transaction.paymentReference,
      status: normalizeStatus(isRegistry ? transaction.registryRetirementStatus : transaction.paymentStatus),
      priority: priorityFor(type, warnings),
      submittedBy: transaction.userId || transaction.createdBy || null,
      submittedByEmail: null,
      submittedAt: transaction.createdAt,
      assignedTo: transaction.verifierUserId || null,
      relatedEntityType: "OffsetTransaction",
      relatedEntityId: toId(transaction),
      relatedEntityLabel: transaction.projectName || transaction.paymentReference || toId(transaction),
      module: "marketplace",
      riskFlags: warnings,
      dataQualityWarnings: warnings,
      actionRequiredByRole: isRegistry ? "marketplace:registry:verify" : "marketplace:payment:verify",
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      dataSummary: {
        transaction: toId(transaction),
        listing: transaction.projectName,
        amount: transaction.totalCostUsd || transaction.total,
        paymentStatus: transaction.paymentStatus,
        paymentReference: transaction.paymentReference,
        registryRetirementStatus: transaction.registryRetirementStatus,
        certificateStatus: transaction.certificate?.certificateUrl ? "issued" : "not_issued",
      },
    };
    const approveSupported = type === "marketplace_payment_review" && Boolean(transaction.paymentReference);
    item.availableActions = actionSet(actor, item, {
      approve: approveSupported,
      correction: false,
      reason: approveSupported ? null : "Marketplace registry approvals require registry evidence in the marketplace workflow.",
    });
    return item;
  }

  static mapFactorChange(factor, actor = null) {
    const warnings = [];
    if (!factor.sourceName || !factor.sourceYear) warnings.push("Source metadata incomplete");
    const item = {
      id: toId(factor),
      type: "emission_factor_change",
      title: `${factor.factorKey || factor.name || "Emission factor"} change`,
      description: factor.notes || factor.methodology || null,
      status: "pending_review",
      priority: priorityFor("emission_factor_change", warnings),
      submittedBy: factor.createdBy || null,
      submittedByEmail: null,
      submittedAt: factor.createdAt,
      assignedTo: factor.updatedBy || null,
      relatedEntityType: "EmissionFactor",
      relatedEntityId: toId(factor),
      relatedEntityLabel: factor.factorKey || factor.name || toId(factor),
      module: "factors",
      riskFlags: warnings,
      dataQualityWarnings: warnings,
      actionRequiredByRole: "factor:approve",
      createdAt: factor.createdAt,
      updatedAt: factor.updatedAt,
      dataSummary: {
        factorKey: factor.factorKey,
        value: factor.factorValue ?? factor.value,
        unit: factor.factorUnit || factor.unit,
        sourceYear: factor.sourceYear,
        sourceName: factor.sourceName || factor.source,
        effectiveFrom: factor.effectiveFrom,
        effectiveTo: factor.effectiveTo,
        reason: factor.notes,
      },
    };
    item.availableActions = actionSet(actor, item);
    return item;
  }

  static mapImportIssue(log, actor = null) {
    const details = log.details || {};
    const warnings = [];
    if (Number(details.invalidRows || 0) > 0) warnings.push(`${details.invalidRows} invalid rows`);
    if (details.status === "failed") warnings.push("Import failed");
    const item = {
      id: toId(log),
      type: "import_issue",
      title: `${details.importType || "Import"} issue: ${details.fileName || toId(log)}`,
      description: details.error || details.message || null,
      status: normalizeStatus(details.status || (Number(details.invalidRows || 0) > 0 ? "failed" : "pending_review")),
      priority: priorityFor("import_issue", warnings),
      submittedBy: log.userEmail || log.userId || null,
      submittedByEmail: log.userEmail || null,
      submittedAt: log.createdAt,
      assignedTo: null,
      relatedEntityType: "ImportAuditLog",
      relatedEntityId: toId(log),
      relatedEntityLabel: details.fileName || toId(log),
      module: "imports",
      riskFlags: warnings,
      dataQualityWarnings: warnings,
      actionRequiredByRole: "import:review",
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
      dataSummary: {
        importType: details.importType,
        fileName: details.fileName,
        invalidRows: details.invalidRows,
        errorSummary: details.error || details.message || null,
        errorReportUrl: `/api/imports/${toId(log)}/error-report`,
      },
    };
    item.availableActions = actionSet(actor, item, { approve: false, correction: false, reason: "Import issues are reviewed from Data Imports after row validation." });
    return item;
  }

  static async get(type, id, companyId, actor = null) {
    const normalizedType = normalizeType(type);
    if (!normalizedType || normalizedType === "all" || normalizedType === "marketplace_review") throw new ApiError(422, "Unsupported approval type.");
    const item = await this.getItem(normalizedType, id, companyId, actor);
    const timeline = await AuditLog.find({
      companyId,
      $or: [
        { entityId: id },
        { "details.entityId": id },
        { "details.approvalType": normalizedType, entityId: id },
      ],
    }).sort({ createdAt: 1 }).limit(50).lean();
    return {
      ...item,
      auditTimeline: timeline.map((log) => ({
        id: toId(log),
        action: log.action,
        timestamp: log.createdAt,
        userId: log.userId || null,
        userEmail: log.userEmail || null,
        notes: log.reason || log.details?.reason || log.details?.notes || null,
      })),
      previousComments: timeline
        .map((log) => log.reason || log.details?.reason || log.details?.notes || null)
        .filter(Boolean),
      reviewChecklist: this.reviewChecklistFor(item),
    };
  }

  static async getItem(type, id, companyId, actor = null) {
    if (type === "emission_record") {
      const record = await EmissionRecord.findOne({ _id: id, companyId }).lean();
      if (!record) throw new ApiError(404, "Approval item not found.");
      return this.mapEmissionRecord(record, actor);
    }
    if (type === "supplier_evidence") {
      const evidence = await SupplierEvidence.findOne({ _id: id, companyId }).lean();
      if (!evidence) throw new ApiError(404, "Approval item not found.");
      const item = this.mapSupplierEvidence(evidence, actor);
      const supplier = await Supplier.findOne({ _id: evidence.supplierId, companyId }).select("_id name country region category riskLevel verificationStatus").lean();
      if (supplier) {
        item.relatedEntityLabel = supplier.name;
        item.dataSummary.supplier = supplier.name;
        item.dataSummary.supplierRisk = supplier.riskLevel;
      }
      return item;
    }
    if (type === "marketplace_budget_request") {
      const request = await MarketplaceBudgetRequest.findOne({ _id: id, companyId }).lean();
      if (!request) throw new ApiError(404, "Approval item not found.");
      return this.mapBudgetRequest(request, actor);
    }
    if (type === "marketplace_payment_review" || type === "marketplace_registry_review") {
      const transaction = await OffsetTransaction.findOne({ _id: id, companyId }).lean();
      if (!transaction) throw new ApiError(404, "Approval item not found.");
      return this.mapMarketplaceTransaction(transaction, type, actor);
    }
    if (type === "emission_factor_change") {
      const factor = await EmissionFactor.findOne({ _id: id, companyId, isCustom: true }).lean();
      if (!factor) throw new ApiError(404, "Approval item not found.");
      return this.mapFactorChange(factor, actor);
    }
    if (type === "import_issue") {
      const log = await AuditLog.findOne({ _id: id, companyId }).lean();
      if (!log) throw new ApiError(404, "Approval item not found.");
      return this.mapImportIssue(log, actor);
    }
    throw new ApiError(422, "Unsupported approval type.");
  }

  static reviewChecklistFor(item) {
    if (item.type === "emission_record") return ["Activity data reviewed", "Factor source reviewed", "Warnings resolved or documented", "Calculation snapshot understood"];
    if (item.type === "supplier_evidence") return ["Supplier identity confirmed", "Evidence metadata reviewed", "Expiry and verification status checked"];
    if (item.type === "marketplace_budget_request") return ["Requester reviewed", "Budget impact reviewed", "Reason documented"];
    if (item.type.includes("marketplace")) return ["Transaction reviewed", "Payment/registry state checked", "Evidence reviewed in marketplace workflow"];
    if (item.type === "emission_factor_change") return ["Factor value and unit reviewed", "Source/year reviewed", "Effective dates reviewed"];
    if (item.type === "import_issue") return ["Invalid rows reviewed", "Error report available", "No invalid rows committed"];
    return ["Record reviewed"];
  }

  static async approve(type, id, companyId, actor, payload = {}) {
    const normalizedType = normalizeType(type);
    actorCan(actor, ACTION_PERMISSIONS[normalizedType]);
    const item = await this.getItem(normalizedType, id, companyId, actor);
    const notes = safeText(payload.notes || payload.reason);
    if ((item.priority === "high" || item.priority === "critical" || item.riskFlags.length > 0) && !notes) {
      throw new ApiError(422, "Approval notes are required for high-risk approval items.");
    }
    if (item.submittedBy && actor?.id && String(item.submittedBy) === String(actor.id) && !isOwnerOrAdmin(actor)) {
      throw new ApiError(403, "Users cannot approve their own submitted item.");
    }
    const oldStatus = item.status;
    let result;
    if (normalizedType === "emission_record") {
      result = await EmissionRecordService.updateStatus(companyId, id, "approved", actor, notes || "Approved from review queue");
    } else if (normalizedType === "supplier_evidence") {
      const evidence = await SupplierEvidence.findOne({ _id: id, companyId }).lean();
      if (!evidence) throw new ApiError(404, "Supplier evidence not found.");
      result = await SupplierService.verifyEvidence(evidence.supplierId, id, companyId, actor);
    } else if (normalizedType === "marketplace_budget_request") {
      result = await MarketplaceService.approveBudgetRequest(id, companyId, actor, { reason: notes });
    } else if (normalizedType === "marketplace_payment_review") {
      result = await MarketplaceService.markPaid(id, companyId, { paymentReference: payload.paymentReference, settlementNotes: notes }, actor);
    } else if (normalizedType === "emission_factor_change") {
      const factor = await EmissionFactor.findOneAndUpdate({ _id: id, companyId, isCustom: true }, { $set: { isActive: true, updatedBy: actor?.id || null, notes: notes || item.description || null } }, { new: true });
      if (!factor) throw new ApiError(404, "Emission factor change not found.");
      result = factor;
    } else {
      throw new ApiError(422, "This approval type does not support approve.");
    }
    await auditApproval(companyId, actor, "approval_item_approved", item, oldStatus, "approved", { notes });
    return result;
  }

  static async reject(type, id, companyId, actor, payload = {}) {
    const normalizedType = normalizeType(type);
    const notes = safeText(payload.notes || payload.reason);
    if (!notes) throw new ApiError(422, "A rejection reason is required.");
    actorCan(actor, ACTION_PERMISSIONS[normalizedType]);
    const item = await this.getItem(normalizedType, id, companyId, actor);
    const oldStatus = item.status;
    let result;
    if (normalizedType === "emission_record") {
      result = await EmissionRecordService.updateStatus(companyId, id, "rejected", actor, notes);
    } else if (normalizedType === "supplier_evidence") {
      const evidence = await SupplierEvidence.findOne({ _id: id, companyId }).lean();
      if (!evidence) throw new ApiError(404, "Supplier evidence not found.");
      result = await SupplierService.rejectEvidence(evidence.supplierId, id, companyId, { notes }, actor);
    } else if (normalizedType === "marketplace_budget_request") {
      result = await MarketplaceService.rejectBudgetRequest(id, companyId, actor, { reason: notes });
    } else if (normalizedType === "marketplace_payment_review") {
      result = await MarketplaceService.markPaymentFailed(id, companyId, { reason: notes }, actor);
    } else if (normalizedType === "emission_factor_change") {
      const factor = await EmissionFactor.findOneAndUpdate({ _id: id, companyId, isCustom: true }, { $set: { isActive: false, updatedBy: actor?.id || null, notes } }, { new: true });
      if (!factor) throw new ApiError(404, "Emission factor change not found.");
      result = factor;
    } else if (normalizedType === "import_issue") {
      result = item;
    } else {
      throw new ApiError(422, "This approval type does not support reject.");
    }
    await auditApproval(companyId, actor, "approval_item_rejected", item, oldStatus, "rejected", { reason: notes });
    return result;
  }

  static async requestCorrection(type, id, companyId, actor, payload = {}) {
    const normalizedType = normalizeType(type);
    const notes = safeText(payload.notes || payload.reason);
    if (!notes) throw new ApiError(422, "Correction notes are required.");
    actorCan(actor, ACTION_PERMISSIONS[normalizedType]);
    const item = await this.getItem(normalizedType, id, companyId, actor);
    const oldStatus = item.status;
    let result;
    if (normalizedType === "emission_record") {
      result = await EmissionRecordService.updateStatus(companyId, id, "needs_correction", actor, notes);
    } else if (normalizedType === "supplier_evidence") {
      result = await SupplierEvidence.findOneAndUpdate({ _id: id, companyId }, { $set: { status: "under_review", notes, updatedBy: actor?.id || null } }, { new: true });
    } else if (normalizedType === "emission_factor_change") {
      result = await EmissionFactor.findOneAndUpdate({ _id: id, companyId, isCustom: true }, { $set: { isActive: false, notes, updatedBy: actor?.id || null } }, { new: true });
    } else {
      throw new ApiError(422, "This approval type does not support correction requests.");
    }
    await auditApproval(companyId, actor, "approval_item_correction_requested", item, oldStatus, "needs_correction", { notes });
    return result;
  }

  static async assign(type, id, companyId, actor, payload = {}) {
    actorCan(actor, "approvals:assign");
    const normalizedType = normalizeType(type);
    const item = await this.getItem(normalizedType, id, companyId, actor);
    const assignee = safeText(payload.assignedTo || actor?.id);
    if (!assignee) throw new ApiError(422, "assignedTo is required.");
    await auditApproval(companyId, actor, "approval_item_assigned", item, item.assignedTo || null, assignee, { notes: payload.notes });
    return { ...item, assignedTo: assignee };
  }
}

module.exports = ApprovalsService;
