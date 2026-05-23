const { EmissionRecord, SupplierEvidence, Supplier, MarketplaceBudgetRequest, OffsetTransaction, EmissionFactor } = require("../models");
const EmissionRecordService = require("./emissionRecord.service");
const SupplierService = require("./supplier.service");
const MarketplaceService = require("./marketplace.service");
const AuditService = require("./audit.service");
const ApiError = require("../utils/ApiError");
const { hasPermission } = require("../middlewares/rbac");

function actorCan(actor, permission) {
  if (!hasPermission(actor, permission)) {
    throw new ApiError(403, `Permission denied: ${permission}`);
  }
}

function priorityFor(type) {
  if (type === "marketplace_review" || type === "budget_request") return "high";
  if (type === "emission_record" || type === "supplier_evidence") return "medium";
  return "low";
}

class ApprovalsService {
  static async summary(companyId) {
    const [emissions, evidence, budgetRequests, marketplaceReviews, factorReviews, importIssues] = await Promise.all([
      EmissionRecord.countDocuments({ companyId, dataStatus: "submitted" }),
      SupplierEvidence.countDocuments({ companyId, status: { $in: ["submitted", "under_review"] } }),
      MarketplaceBudgetRequest.countDocuments({ companyId, status: "PENDING" }),
      OffsetTransaction.countDocuments({ companyId, $or: [{ paymentStatus: "pending" }, { registryRetirementStatus: { $in: ["pending", "manual_verification_required"] } }] }),
      EmissionFactor.countDocuments({ companyId, isCustom: true, isActive: false }),
      require("../models").AuditLog.countDocuments({ companyId, action: { $in: ["import_failed", "import_committed"] }, "details.status": { $in: ["failed", "partially_failed"] } }),
    ]);
    return {
      pendingEmissionApprovals: emissions,
      supplierEvidenceReviews: evidence,
      budgetRequests,
      marketplaceReviews,
      factorReviews,
      importIssues,
      totalPending: emissions + evidence + budgetRequests + marketplaceReviews + factorReviews + importIssues,
    };
  }

  static async list(companyId, query = {}) {
    const type = String(query.type || "all");
    const items = [];
    if (type === "all" || type === "emission_record") {
      const records = await EmissionRecord.find({ companyId, dataStatus: "submitted" }).sort({ submittedAt: -1, createdAt: -1 }).limit(50).lean();
      records.forEach((record) => items.push({
        id: record._id || record.id,
        type: "emission_record",
        title: `${record.category} emission record`,
        status: record.dataStatus,
        priority: priorityFor("emission_record"),
        submittedBy: record.submittedBy || record.createdBy || null,
        submittedAt: record.submittedAt || record.createdAt,
        relatedEntity: record._id || record.id,
        description: record.description || null,
      }));
    }
    if (type === "all" || type === "supplier_evidence") {
      const evidence = await SupplierEvidence.find({ companyId, status: { $in: ["submitted", "under_review"] } }).sort({ uploadedAt: -1, createdAt: -1 }).limit(50).lean();
      evidence.forEach((item) => items.push({
        id: item._id || item.id,
        type: "supplier_evidence",
        title: item.title,
        status: item.status,
        priority: priorityFor("supplier_evidence"),
        submittedBy: item.uploadedBy || item.createdBy || null,
        submittedAt: item.uploadedAt || item.createdAt,
        relatedEntity: item.supplierId,
        description: item.evidenceType,
      }));
    }
    if (type === "all" || type === "budget_request") {
      const requests = await MarketplaceBudgetRequest.find({ companyId, status: "PENDING" }).sort({ createdAt: -1 }).limit(50).lean();
      requests.forEach((request) => items.push({
        id: request._id || request.id,
        type: "budget_request",
        title: `Marketplace budget increase: $${Number(request.requestedAmount || 0).toLocaleString()}`,
        status: request.status,
        priority: priorityFor("budget_request"),
        submittedBy: request.requestedBy || null,
        submittedAt: request.createdAt,
        relatedEntity: request._id || request.id,
        description: request.reason || null,
      }));
    }
    if (type === "all" || type === "marketplace_review") {
      const transactions = await OffsetTransaction.find({ companyId, $or: [{ paymentStatus: "pending" }, { registryRetirementStatus: { $in: ["pending", "manual_verification_required"] } }] }).sort({ createdAt: -1 }).limit(50).lean();
      transactions.forEach((transaction) => items.push({
        id: transaction._id || transaction.id,
        type: "marketplace_review",
        title: transaction.projectName || "Marketplace transaction review",
        status: transaction.registryRetirementStatus || transaction.paymentStatus || transaction.lifecycleStatus,
        priority: priorityFor("marketplace_review"),
        submittedBy: transaction.createdBy || null,
        submittedAt: transaction.createdAt,
        relatedEntity: transaction._id || transaction.id,
        description: transaction.paymentReference || null,
      }));
    }
    return {
      data: items.sort((left, right) => new Date(right.submittedAt || 0) - new Date(left.submittedAt || 0)),
      pagination: { page: 1, pageSize: items.length, total: items.length, totalPages: 1 },
    };
  }

  static async approve(type, id, companyId, actor, payload = {}) {
    if (type === "emission_record") {
      actorCan(actor, "emission:approve");
      const result = await EmissionRecordService.updateStatus(companyId, id, "approved", actor, payload.notes || "Approved from review queue");
      await AuditService.log({ companyId, userId: actor?.id, userEmail: actor?.email, action: "approval_item_approved", entityType: "EmissionRecord", entityId: id, details: { type } });
      return result;
    }
    if (type === "supplier_evidence") {
      actorCan(actor, "supplier:evidence:verify");
      const evidence = await SupplierEvidence.findOne({ _id: id, companyId }).lean();
      if (!evidence) throw new ApiError(404, "Supplier evidence not found.");
      const result = await SupplierService.verifyEvidence(evidence.supplierId, id, companyId, actor);
      await AuditService.log({ companyId, userId: actor?.id, userEmail: actor?.email, action: "approval_item_approved", entityType: "SupplierEvidence", entityId: id, details: { type } });
      return result;
    }
    if (type === "budget_request") {
      actorCan(actor, "marketplace:budget:manage");
      const result = await MarketplaceService.approveBudgetRequest(id, companyId, actor, { reason: payload.notes || payload.reason });
      await AuditService.log({ companyId, userId: actor?.id, userEmail: actor?.email, action: "approval_item_approved", entityType: "MarketplaceBudgetRequest", entityId: id, details: { type } });
      return result;
    }
    throw new ApiError(422, "This approval type does not support approve.");
  }

  static async reject(type, id, companyId, actor, payload = {}) {
    const notes = String(payload.notes || payload.reason || "").trim();
    if (!notes) throw new ApiError(422, "A rejection reason is required.");
    if (type === "emission_record") {
      actorCan(actor, "emission:approve");
      const result = await EmissionRecordService.updateStatus(companyId, id, "rejected", actor, notes);
      await AuditService.log({ companyId, userId: actor?.id, userEmail: actor?.email, action: "approval_item_rejected", entityType: "EmissionRecord", entityId: id, details: { type, reason: notes } });
      return result;
    }
    if (type === "supplier_evidence") {
      actorCan(actor, "supplier:evidence:verify");
      const evidence = await SupplierEvidence.findOne({ _id: id, companyId }).lean();
      if (!evidence) throw new ApiError(404, "Supplier evidence not found.");
      const result = await SupplierService.rejectEvidence(evidence.supplierId, id, companyId, { notes }, actor);
      await AuditService.log({ companyId, userId: actor?.id, userEmail: actor?.email, action: "approval_item_rejected", entityType: "SupplierEvidence", entityId: id, details: { type, reason: notes } });
      return result;
    }
    if (type === "budget_request") {
      actorCan(actor, "marketplace:budget:manage");
      const result = await MarketplaceService.rejectBudgetRequest(id, companyId, actor, { reason: notes });
      await AuditService.log({ companyId, userId: actor?.id, userEmail: actor?.email, action: "approval_item_rejected", entityType: "MarketplaceBudgetRequest", entityId: id, details: { type, reason: notes } });
      return result;
    }
    throw new ApiError(422, "This approval type does not support reject.");
  }

  static async requestCorrection(type, id, companyId, actor, payload = {}) {
    const notes = String(payload.notes || payload.reason || "").trim();
    if (!notes) throw new ApiError(422, "A correction reason is required.");
    if (type === "emission_record") {
      actorCan(actor, "emission:approve");
      const result = await EmissionRecordService.updateStatus(companyId, id, "needs_correction", actor, notes);
      await AuditService.log({ companyId, userId: actor?.id, userEmail: actor?.email, action: "approval_item_correction_requested", entityType: "EmissionRecord", entityId: id, details: { type, reason: notes } });
      return result;
    }
    throw new ApiError(422, "This approval type does not support correction requests.");
  }
}

module.exports = ApprovalsService;
