const { SupplierEvidence } = require("../models");
const ApiError = require("../utils/ApiError");
const { buildStorageKey, getEvidenceStorageAdapter } = require("./storage/evidenceStorage.service");

const REQUIRED_EVIDENCE_TYPES = ["iso_14001_certificate", "ghg_inventory"];

function isExpired(evidence, now = new Date()) {
  if (evidence.status === "expired") return true;
  if (!evidence.expiresAt) return false;
  const expiresAt = new Date(evidence.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime();
}

function normalizeEvidenceType(value) {
  return String(value || "other").trim().toLowerCase().replace(/[\s/-]+/g, "_");
}

function normalizeStatus(value, fallback = "requested") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ["requested", "submitted", "under_review", "verified", "rejected", "expired"].includes(normalized)
    ? normalized
    : fallback;
}

function normalizeUploadedVia(value) {
  const normalized = String(value || "app").trim().toLowerCase();
  return normalized === "questionnaire" ? "questionnaire" : "app";
}

function evidenceStatusSummary(evidence = []) {
  const counts = evidence.reduce((accumulator, item) => {
    const status = isExpired(item) ? "expired" : item.status;
    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {
    requested: 0,
    submitted: 0,
    under_review: 0,
    verified: 0,
    rejected: 0,
    expired: 0,
  });
  const verifiedTypes = new Set(
    evidence
      .filter((item) => item.status === "verified" && !isExpired(item))
      .map((item) => item.evidenceType),
  );
  const missingTypes = REQUIRED_EVIDENCE_TYPES.filter((type) => !verifiedTypes.has(type));
  let indicator = "missing";

  if (counts.expired > 0) {
    indicator = "expired";
  } else if (counts.under_review > 0 || counts.submitted > 0) {
    indicator = "under_review";
  } else if (missingTypes.length === 0) {
    indicator = "complete";
  }

  return {
    indicator,
    total: evidence.length,
    counts,
    verifiedTypes: Array.from(verifiedTypes),
    missingTypes,
    hasVerifiedISO14001: verifiedTypes.has("iso_14001_certificate"),
    hasVerifiedSBTi: verifiedTypes.has("sbti_commitment"),
    hasVerifiedGHGInventory: verifiedTypes.has("ghg_inventory"),
    hasExpiredEvidence: counts.expired > 0,
    hasUnderReviewEvidence: counts.under_review > 0 || counts.submitted > 0,
  };
}

function toEvidenceView(evidence) {
  const item = typeof evidence.toJSON === "function" ? evidence.toJSON() : { ...evidence };
  const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
  const daysUntilExpiry = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  return {
    ...item,
    isExpired: isExpired(item),
    isExpiringSoon: daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30 && !isExpired(item),
    daysUntilExpiry,
    reminderSent: Boolean(item.lastReminderSentAt || item.expiryReminder7SentAt || item.expiryReminder30SentAt),
  };
}

class SupplierEvidenceService {
  static async list(supplierId, companyId) {
    const evidence = await SupplierEvidence.find({ supplierId, companyId }).sort({ createdAt: -1 });
    return evidence.map(toEvidenceView);
  }

  static async summaryForSuppliers(supplierIds = [], companyId) {
    if (supplierIds.length === 0) return new Map();
    const evidence = await SupplierEvidence.find({ companyId, supplierId: { $in: supplierIds } }).lean();
    const grouped = new Map();
    evidence.forEach((item) => {
      const current = grouped.get(item.supplierId) || [];
      current.push(item);
      grouped.set(item.supplierId, current);
    });
    return new Map(supplierIds.map((supplierId) => {
      const items = grouped.get(supplierId) || [];
      return [supplierId, {
        ...evidenceStatusSummary(items),
        items: items.map(toEvidenceView),
      }];
    }));
  }

  static async getById(supplierId, evidenceId, companyId) {
    const evidence = await SupplierEvidence.findOne({ _id: evidenceId, supplierId, companyId });
    if (!evidence) {
      const error = new Error("Supplier evidence not found");
      error.status = 404;
      throw error;
    }
    return evidence;
  }

  static async create(supplier, payload = {}, actor = null) {
    const now = new Date();
    const evidence = await SupplierEvidence.create({
      supplierId: supplier.id || supplier._id,
      companyId: supplier.companyId,
      evidenceType: normalizeEvidenceType(payload.evidenceType),
      title: String(payload.title || payload.evidenceType || "Supplier evidence").trim(),
      status: normalizeStatus(payload.status),
      fileUrl: payload.fileUrl || null,
      fileName: payload.fileName || null,
      fileSize: payload.fileSize || null,
      mimeType: payload.mimeType || null,
      storageKey: payload.storageKey || null,
      signedUrl: payload.signedUrl || null,
      uploadedAt: payload.uploadedAt ? new Date(payload.uploadedAt) : (payload.status === "submitted" ? now : null),
      uploadedBy: payload.uploadedBy || actor?.id || null,
      uploadedVia: payload.uploadedVia ? normalizeUploadedVia(payload.uploadedVia) : null,
      virusScanStatus: payload.virusScanStatus || "not_scanned",
      verifiedAt: payload.status === "verified" ? now : null,
      verifiedBy: payload.status === "verified" ? (actor?.id || payload.verifiedBy || null) : null,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      notes: payload.notes || null,
      createdBy: actor?.id || null,
      updatedBy: actor?.id || null,
    });
    return toEvidenceView(evidence);
  }

  static async update(supplierId, evidenceId, companyId, payload = {}, actor = null) {
    const evidence = await this.getById(supplierId, evidenceId, companyId);
    await evidence.update({
      evidenceType: payload.evidenceType ? normalizeEvidenceType(payload.evidenceType) : evidence.evidenceType,
      title: payload.title !== undefined ? String(payload.title).trim() : evidence.title,
      status: payload.status ? normalizeStatus(payload.status, evidence.status) : evidence.status,
      fileUrl: payload.fileUrl !== undefined ? payload.fileUrl : evidence.fileUrl,
      fileName: payload.fileName !== undefined ? payload.fileName : evidence.fileName,
      fileSize: payload.fileSize !== undefined ? payload.fileSize : evidence.fileSize,
      mimeType: payload.mimeType !== undefined ? payload.mimeType : evidence.mimeType,
      storageKey: payload.storageKey !== undefined ? payload.storageKey : evidence.storageKey,
      signedUrl: payload.signedUrl !== undefined ? payload.signedUrl : evidence.signedUrl,
      uploadedAt: payload.uploadedAt !== undefined ? (payload.uploadedAt ? new Date(payload.uploadedAt) : null) : evidence.uploadedAt,
      uploadedBy: payload.uploadedBy !== undefined ? payload.uploadedBy : evidence.uploadedBy,
      uploadedVia: payload.uploadedVia !== undefined ? normalizeUploadedVia(payload.uploadedVia) : evidence.uploadedVia,
      virusScanStatus: payload.virusScanStatus !== undefined ? payload.virusScanStatus : evidence.virusScanStatus,
      expiresAt: payload.expiresAt !== undefined ? (payload.expiresAt ? new Date(payload.expiresAt) : null) : evidence.expiresAt,
      notes: payload.notes !== undefined ? payload.notes : evidence.notes,
      updatedBy: actor?.id || null,
    });
    return toEvidenceView(evidence);
  }

  static async verify(supplierId, evidenceId, companyId, actor = null) {
    const evidence = await this.getById(supplierId, evidenceId, companyId);
    await evidence.update({
      status: "verified",
      verifiedAt: new Date(),
      verifiedBy: actor?.id || null,
      updatedBy: actor?.id || null,
    });
    return toEvidenceView(evidence);
  }

  static async reject(supplierId, evidenceId, companyId, payload = {}, actor = null) {
    const evidence = await this.getById(supplierId, evidenceId, companyId);
    await evidence.update({
      status: "rejected",
      notes: payload.notes !== undefined ? payload.notes : evidence.notes,
      updatedBy: actor?.id || null,
    });
    return toEvidenceView(evidence);
  }

  static async uploadFile(supplier, file, payload = {}, actor = null, uploadedVia = "app") {
    if (!file) {
      throw new ApiError(422, "Evidence file is required.", [{ field: "file", message: "Evidence file is required." }]);
    }

    const now = new Date();
    const key = buildStorageKey({
      companyId: supplier.companyId,
      supplierId: supplier.id || supplier._id,
      originalName: file.originalname,
    });
    const adapter = getEvidenceStorageAdapter();
    const storedFile = await adapter.upload({
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });
    const evidence = await SupplierEvidence.create({
      supplierId: supplier.id || supplier._id,
      companyId: supplier.companyId,
      evidenceType: normalizeEvidenceType(payload.evidenceType),
      title: String(payload.title || file.originalname || payload.evidenceType || "Supplier evidence").trim(),
      status: normalizeStatus(payload.status, "submitted"),
      fileUrl: storedFile.fileUrl || null,
      fileName: file.originalname || null,
      fileSize: file.size || null,
      mimeType: file.mimetype || null,
      storageKey: storedFile.storageKey,
      uploadedAt: now,
      uploadedBy: actor?.id || null,
      uploadedVia: normalizeUploadedVia(uploadedVia),
      virusScanStatus: "not_scanned",
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      notes: payload.notes || null,
      createdBy: actor?.id || null,
      updatedBy: actor?.id || null,
    });

    return toEvidenceView(evidence);
  }

  static async getDownload(id, evidenceId, companyId) {
    const evidence = await this.getById(id, evidenceId, companyId);

    if (!evidence.storageKey && !evidence.fileUrl) {
      throw new ApiError(404, "Supplier evidence file is not available.");
    }

    if (evidence.storageKey) {
      const adapter = getEvidenceStorageAdapter();
      const file = await adapter.getFile(evidence.storageKey);
      return {
        evidence,
        stream: file.stream,
        fileName: evidence.fileName || evidence.title || "supplier-evidence",
        mimeType: evidence.mimeType || "application/octet-stream",
      };
    }

    return {
      evidence,
      redirectUrl: evidence.fileUrl,
      fileName: evidence.fileName || evidence.title || "supplier-evidence",
      mimeType: evidence.mimeType || "application/octet-stream",
    };
  }
}

module.exports = {
  REQUIRED_EVIDENCE_TYPES,
  SupplierEvidenceService,
  evidenceStatusSummary,
  isExpired,
};
