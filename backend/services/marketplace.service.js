const { CarbonProject, Company, Transaction, User, MarketplaceBudget, MarketplaceBudgetRequest, AutoOffsetRule, Shipment } = require("../models");
const env = require("../config/env");
const BaseService = require("./base.service");
const AuditService = require("./audit.service");
const { sendBudgetIncreaseRequestEmail } = require("./emailService");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const cache = require("../utils/cache");
const CheckoutLockService = require("./checkoutLock.service");
const { OFFSET_PROJECT_STATUSES } = require("../constants/platform");
const { getRegistryProvider } = require("./registry");
const { getPaymentProvider } = require("./payment");

const MANAGEABLE_MARKETPLACE_ROLES = new Set(["ADMIN", "SUPERADMIN", "MANAGER"]);
const STATUS_CHANGE_ACTION = "offsetProject.status_changed";
const LEGACY_PROJECT_STATUS_ALIASES = {
  ACTIVE: "PUBLISHED",
  INACTIVE: "DRAFT",
};
const PROJECT_STATUS_FILTER_MAP = {
  DRAFT: ["DRAFT", "INACTIVE"],
  PENDING_REVIEW: ["PENDING_REVIEW"],
  PUBLISHED: ["PUBLISHED", "ACTIVE"],
  PAUSED: ["PAUSED"],
  ARCHIVED: ["ARCHIVED"],
  SOLD_OUT: ["SOLD_OUT"],
};
const PUBLIC_MARKETPLACE_STATUSES = ["PUBLISHED"];
const PUBLIC_MARKETPLACE_WITH_SOLD_OUT_STATUSES = ["PUBLISHED", "SOLD_OUT"];
const BUDGET_ADMIN_ROLES = ["ADMIN", "SUPERADMIN"];
const BUDGET_EMAIL_TIMEOUT_MS = 10000;
const STATUS_AUDIT_ACTIONS = {
  PUBLISHED: "marketplace_listing_published",
  PAUSED: "marketplace_listing_paused",
  ARCHIVED: "marketplace_listing_archived",
};

function normalizeEvidenceLinks(payload = {}, currentProject = null) {
  return normalizePddDocuments(
    pickDefined(payload.evidenceDocuments, payload.evidenceLinks, payload.evidence),
    currentProject?.evidenceDocuments || [],
  );
}

function assertPublishableProject(project) {
  const isDemo = Boolean(project.isDemo || project.isSample);
  const isRealInventory = Boolean(project.isRealInventory);
  const evidenceDocuments = Array.isArray(project.evidenceDocuments) ? project.evidenceDocuments : [];
  const totalQuantity = Number(project.totalQuantityTco2e || 0);
  const availableCredits = Number(project.availableCredits || 0);
  const reservedCredits = Number(project.reservedCredits || 0);
  const retiredCredits = Number(project.retiredCredits || 0);

  if (isDemo && isRealInventory) {
    throw new ApiError(422, "Demo listings cannot be marked as real inventory.");
  }

  if (availableCredits + reservedCredits + retiredCredits > totalQuantity) {
    throw new ApiError(422, "Available, reserved, and retired inventory cannot exceed total inventory.");
  }

  if (isRealInventory) {
    const hasRegistryMetadata = Boolean((project.registryName || project.registry) && project.registryProjectId && project.registryUrl);
    if (!hasRegistryMetadata || evidenceDocuments.length === 0) {
      throw new ApiError(422, "Registry name, project ID, registry URL, and evidence metadata are required before publishing real inventory.");
    }
  }
}

function isTruthyQueryFlag(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function canManageMarketplace(actor) {
  return MANAGEABLE_MARKETPLACE_ROLES.has(String(actor?.role || "").toUpperCase());
}

function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function normalizeRequiredText(value, fallbackValue, fieldName) {
  const normalized = String(value ?? fallbackValue ?? "").trim();
  if (!normalized) {
    throw new ApiError(422, `${fieldName} is required.`);
  }
  return normalized;
}

function normalizeOptionalText(value, fallbackValue = null) {
  if (value === null) {
    return null;
  }

  const normalized = String(value ?? fallbackValue ?? "").trim();
  return normalized || null;
}

function ensureFiniteNumber(value, fieldName, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new ApiError(422, `${fieldName} must be a valid number.`);
  }

  if (normalized < min || normalized > max) {
    throw new ApiError(422, `${fieldName} must be between ${min} and ${max}.`);
  }

  return normalized;
}

function roundMoney(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }

  return Number(normalized.toFixed(2));
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutId));
}

function normalizeOptionalNumber(value, fallbackValue = null, fieldName, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const candidate = value ?? fallbackValue;
  if (candidate === undefined || candidate === null || candidate === "") {
    return null;
  }

  return ensureFiniteNumber(candidate, fieldName, { min, max });
}

function toCanonicalProjectStatus(status) {
  if (status === undefined || status === null || status === "") {
    return undefined;
  }

  const normalized = String(status).trim().toUpperCase();
  return LEGACY_PROJECT_STATUS_ALIASES[normalized] || normalized;
}

function normalizeProjectStatus(status) {
  if (status === undefined || status === null || status === "") {
    return undefined;
  }

  const normalized = toCanonicalProjectStatus(status);
  if (!OFFSET_PROJECT_STATUSES.includes(normalized)) {
    throw new ApiError(422, `Invalid marketplace status. Expected one of: ${OFFSET_PROJECT_STATUSES.join(", ")}.`);
  }

  return normalized;
}

function expandProjectStatuses(statuses) {
  const requested = Array.isArray(statuses) ? statuses : [statuses];
  const expanded = requested
    .map((status) => normalizeProjectStatus(status))
    .filter(Boolean)
    .flatMap((status) => PROJECT_STATUS_FILTER_MAP[status] || [status]);

  return [...new Set(expanded)];
}

function resolveStatusFilter(statuses) {
  const expanded = expandProjectStatuses(statuses);
  if (expanded.length === 0) {
    return undefined;
  }

  return expanded.length === 1 ? expanded[0] : { $in: expanded };
}

function normalizePddDocuments(value, fallbackValue = []) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(fallbackValue)
      ? fallbackValue
      : [];

  return source.reduce((documents, document, index) => {
    if (!document || typeof document !== "object") {
      return documents;
    }

    const url = normalizeOptionalText(document.url, null);
    if (!url) {
      return documents;
    }

    documents.push({
      name: normalizeOptionalText(document.name, null) || `Project Design Document ${index + 1}`,
      url,
    });

    return documents;
  }, []);
}

function normalizeCoordinates(payload = {}, currentProject = null) {
  const latitude = normalizeOptionalNumber(
    payload.coordinates?.latitude ?? payload.latitude,
    currentProject?.coordinates?.latitude ?? null,
    "latitude",
    { min: -90, max: 90 },
  );
  const longitude = normalizeOptionalNumber(
    payload.coordinates?.longitude ?? payload.longitude,
    currentProject?.coordinates?.longitude ?? null,
    "longitude",
    { min: -180, max: 180 },
  );

  if ((latitude === null) !== (longitude === null)) {
    throw new ApiError(422, "Both latitude and longitude are required when saving project coordinates.");
  }

  return latitude === null || longitude === null
    ? { latitude: null, longitude: null }
    : { latitude, longitude };
}

function serializeProject(project, lifecycle = null) {
  const record = typeof project?.toJSON === "function" ? project.toJSON() : { ...project };
  const reservedCredits = Math.max(Number(record.reservedCredits || 0), 0);
  const availableCredits = Math.max(Number(record.availableCredits || 0), 0);
  record.status = toCanonicalProjectStatus(record.status) || record.status;
  record.projectName = record.name;
  record.projectDescription = record.description || null;
  record.projectType = record.type;
  record.category = record.type;
  record.methodology = record.methodology || null;
  record.registryName = record.registryName || record.registry || record.verificationStandard || null;
  record.registryProjectId = record.registryProjectId || null;
  record.registryUrl = record.registryUrl || null;
  record.creditUnit = "tCO2e";
  record.totalQuantityTco2e = Number(record.totalQuantityTco2e || record.availableCredits + record.retiredCredits + reservedCredits || 0);
  record.availableQuantityTco2e = availableCredits;
  record.retiredQuantityTco2e = Number(record.retiredCredits || 0);
  record.reservedQuantityTco2e = reservedCredits;
  record.pricePerTco2e = Number(record.pricePerCreditUsd || 0);
  record.currency = record.currency || "USD";
  record.verificationStatus = record.verificationStatus || "UNVERIFIED";
  record.isDemo = Boolean(record.isDemo);
  record.isSample = Boolean(record.isSample);
  record.isRealInventory = Boolean(record.isRealInventory);
  record.evidenceDocuments = Array.isArray(record.evidenceDocuments) && record.evidenceDocuments.length > 0
    ? record.evidenceDocuments
    : record.pddDocuments || [];
  record.notes = record.notes || null;
  record.verificationDetails = {
    ...(record.verificationDetails || {}),
    registries: record.registryName || record.registry
      ? [String(record.registryName || record.registry).toUpperCase().replace(/[.\s-]+/g, "_")]
      : [],
    verificationStatus: record.verificationStatus === "REGISTRY_VERIFIED" || record.verificationStatus === "THIRD_PARTY_VERIFIED"
      ? "VERIFIED"
      : record.verificationStatus === "REJECTED" || record.verificationStatus === "EXPIRED"
        ? "ACTION_REQUIRED"
        : "PENDING",
    registryProjectId: record.registryProjectId || null,
    methodology: record.methodology || null,
    vintageYear: Number(record.vintageYear || 0),
    sdgGoals: [],
  };
  record.reservedCredits = reservedCredits;
  record.availableToPurchase = Math.max(availableCredits - reservedCredits, 0);
  if (lifecycle) {
    record.lifecycle = lifecycle;
  }
  return record;
}

function resolveMarketplaceSort(query = {}) {
  const requestedSort = String(query.sort || "").trim().toLowerCase();
  const requestedSortBy = String(query.sortBy || "").trim().toLowerCase();
  const requestedSortOrder = String(query.sortOrder || "").trim().toLowerCase();

  if (requestedSort === "price_asc" || (requestedSortBy === "price" && requestedSortOrder === "asc")) {
    return { pricePerCreditUsd: 1, createdAt: -1 };
  }

  if (requestedSort === "rating_desc" || (requestedSortBy === "rating" && requestedSortOrder === "desc")) {
    return { rating: -1, createdAt: -1 };
  }

  return { createdAt: -1 };
}

function buildLifecycle(project, usage = {}) {
  const transactionCount = Number(usage.transactionCount || 0);
  const completedTransactionCount = Number(usage.completedTransactionCount || 0);
  const certificateCount = Number(usage.certificateCount || 0);
  const purchasedCredits = Math.max(Number(usage.purchasedCredits || 0), Number(project?.retiredCredits || 0));
  const isImmutable = completedTransactionCount > 0 || certificateCount > 0 || purchasedCredits > 0;

  return {
    hasTransactionHistory: transactionCount > 0,
    transactionCount,
    completedTransactionCount,
    certificateCount,
    purchasedCredits,
    isImmutable,
    canHardDelete: transactionCount === 0 && certificateCount === 0 && purchasedCredits === 0,
  };
}

function normalizeProjectPayload(payload = {}, currentProject = null) {
  const requestedRegistry = normalizeOptionalText(
    pickDefined(payload.registry, payload.verificationStandard, payload.certification),
    currentProject?.registry || currentProject?.verificationStandard || currentProject?.certification || null,
  );
  const certification = normalizeRequiredText(
    pickDefined(payload.certification, requestedRegistry),
    currentProject?.certification || requestedRegistry || currentProject?.verificationStandard || "Registry not provided",
    "certification",
  );
  const verificationStandard = normalizeOptionalText(
    payload.verificationStandard,
    currentProject?.verificationStandard || requestedRegistry || certification,
  ) || certification;
  const registry = normalizeOptionalText(
    payload.registry,
    currentProject?.registry || requestedRegistry || verificationStandard || certification,
  ) || verificationStandard || certification;
  const availableCredits = ensureFiniteNumber(
    pickDefined(payload.availableQuantityTco2e, payload.availableCredits, payload.totalSupply, currentProject?.availableCredits, 0),
    "availableCredits",
    { min: 0 },
  );
  const retiredCredits = ensureFiniteNumber(
    pickDefined(payload.retiredCredits, payload.creditsRetired, currentProject?.retiredCredits, 0),
    "retiredCredits",
    { min: 0 },
  );
  const reservedCredits = ensureFiniteNumber(
    pickDefined(payload.reservedCredits, currentProject?.reservedCredits, 0),
    "reservedCredits",
    { min: 0 },
  );
  const requestedStatus = normalizeProjectStatus(payload.status ?? currentProject?.status ?? "DRAFT") || "DRAFT";
  const shouldAutoMarkSoldOut = availableCredits === 0
    && requestedStatus !== "DRAFT"
    && (payload.status === undefined || requestedStatus === "PUBLISHED" || requestedStatus === "SOLD_OUT");

  if (availableCredits < reservedCredits) {
    throw new ApiError(409, "availableCredits cannot be lower than reserved credits.");
  }

  const evidenceDocuments = normalizeEvidenceLinks(payload, currentProject);
  const isDemo = Boolean(payload.isDemo ?? currentProject?.isDemo ?? false);
  const isSample = Boolean(payload.isSample ?? currentProject?.isSample ?? false);
  const isRealInventory = Boolean(payload.isRealInventory ?? currentProject?.isRealInventory ?? false);

  if ((isDemo || isSample) && isRealInventory) {
    throw new ApiError(422, "Demo listings cannot be marked as real inventory.");
  }

  return {
    name: normalizeRequiredText(pickDefined(payload.name, payload.projectName), currentProject?.name, "name"),
    type: normalizeRequiredText(pickDefined(payload.type, payload.projectType, payload.category), currentProject?.type, "type"),
    location: normalizeRequiredText(payload.location, currentProject?.location || "Marketplace", "location"),
    description: normalizeOptionalText(pickDefined(payload.description, payload.projectDescription), currentProject?.description || null),
    methodology: normalizeOptionalText(payload.methodology, currentProject?.methodology || null),
    registryName: normalizeOptionalText(payload.registryName, currentProject?.registryName || registry || null),
    registryProjectId: normalizeOptionalText(payload.registryProjectId, currentProject?.registryProjectId || null),
    registryUrl: normalizeOptionalText(payload.registryUrl, currentProject?.registryUrl || null),
    country: normalizeOptionalText(payload.country, currentProject?.country || null),
    region: normalizeOptionalText(payload.region, currentProject?.region || null),
    coordinates: normalizeCoordinates(payload, currentProject),
    pddDocuments: normalizePddDocuments(payload.pddDocuments, currentProject?.pddDocuments || []),
    certification,
    registry,
    vintageYear: ensureFiniteNumber(payload.vintageYear ?? currentProject?.vintageYear ?? new Date().getUTCFullYear(), "vintageYear", { min: 2000 }),
    rating: ensureFiniteNumber(payload.rating ?? currentProject?.rating ?? 4.5, "rating", { min: 0, max: 5 }),
    pricePerCreditUsd: ensureFiniteNumber(
      pickDefined(payload.pricePerTco2e, payload.pricePerCreditUsd, payload.pricePerTonUsd, payload.price, currentProject?.pricePerCreditUsd, 0),
      "pricePerCreditUsd",
      { min: 0 },
    ),
    availableCredits,
    totalQuantityTco2e: ensureFiniteNumber(
      pickDefined(payload.totalQuantityTco2e, payload.totalSupply, currentProject?.totalQuantityTco2e, availableCredits + retiredCredits + reservedCredits),
      "totalQuantityTco2e",
      { min: availableCredits + reservedCredits + retiredCredits },
    ),
    reservedCredits,
    retiredCredits,
    verificationStandard,
    verificationStatus: normalizeOptionalText(payload.verificationStatus, currentProject?.verificationStatus || "UNVERIFIED") || "UNVERIFIED",
    isDemo,
    isSample,
    isRealInventory,
    evidenceDocuments,
    currency: normalizeOptionalText(payload.currency, currentProject?.currency || "USD") || "USD",
    notes: normalizeOptionalText(payload.notes, currentProject?.notes || null),
    status: shouldAutoMarkSoldOut ? "SOLD_OUT" : requestedStatus,
  };
}

function serializeBudget(budget, spend = {}) {
  const totalBudget = Number(budget?.totalBudget || 0);
  const settledSpend = Number(spend.settledSpend || 0);
  const pendingSpend = Number(spend.pendingSpend || 0);
  return {
    id: budget?.id || budget?._id || null,
    companyId: budget?.companyId || null,
    totalBudget,
    settledSpend,
    pendingSpend,
    remainingBudget: Math.max(totalBudget - settledSpend - pendingSpend, 0),
    currency: budget?.currency || "USD",
    monthlyBudget: budget?.monthlyBudget ?? null,
    approvalRequiredThreshold: budget?.approvalRequiredThreshold ?? null,
    updatedAt: budget?.updatedAt || null,
    isConfigured: Boolean(budget),
  };
}

class MarketplaceService extends BaseService {
  static removeDashboardCache(companyId) {
    cache.removeByPrefix(`dashboard:${companyId}:`);
  }

  static async getProjectOrFail(id, companyId) {
    const project = await CarbonProject.findOne({ _id: id, companyId });
    if (!project) {
      throw new ApiError(404, "Carbon project not found.");
    }

    return project;
  }

  static async getLifecycleUsage(projectId, companyId) {
    const [usage] = await Transaction.aggregate([
      {
        $match: {
          companyId,
          projectId,
        },
      },
      {
        $group: {
          _id: "$projectId",
          transactionCount: { $sum: 1 },
          completedTransactionCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0],
            },
          },
          certificateCount: {
            $sum: {
              $cond: [
                {
                  $gt: [
                    {
                      $strLenCP: {
                        $ifNull: ["$certificate.certificateId", ""],
                      },
                    },
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },
          purchasedCredits: {
            $sum: {
              $cond: [{ $eq: ["$status", "COMPLETED"] }, "$credits", 0],
            },
          },
        },
      },
    ]);

    return usage || {};
  }

  static async getLifecycleUsageMap(projectIds, companyId) {
    if (!projectIds.length) {
      return new Map();
    }

    const usageRows = await Transaction.aggregate([
      {
        $match: {
          companyId,
          projectId: { $in: projectIds },
        },
      },
      {
        $group: {
          _id: "$projectId",
          transactionCount: { $sum: 1 },
          completedTransactionCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0],
            },
          },
          certificateCount: {
            $sum: {
              $cond: [
                {
                  $gt: [
                    {
                      $strLenCP: {
                        $ifNull: ["$certificate.certificateId", ""],
                      },
                    },
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },
          purchasedCredits: {
            $sum: {
              $cond: [{ $eq: ["$status", "COMPLETED"] }, "$credits", 0],
            },
          },
        },
      },
    ]);

    return usageRows.reduce((accumulator, row) => {
      accumulator.set(row._id, row);
      return accumulator;
    }, new Map());
  }

  static async logStatusTransition(project, previousStatus, newStatus, actor = null, details = {}) {
    const previousCanonicalStatus = toCanonicalProjectStatus(previousStatus) || previousStatus;
    const nextCanonicalStatus = toCanonicalProjectStatus(newStatus) || newStatus;

    if (!project || previousCanonicalStatus === nextCanonicalStatus) {
      return;
    }

    await AuditService.log({
      companyId: project.companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
        action: STATUS_AUDIT_ACTIONS[nextCanonicalStatus] || STATUS_CHANGE_ACTION,
      entityType: "OffsetProject",
      entityId: project.id,
      details: {
        name: project.name,
        previousStatus: previousCanonicalStatus,
        newStatus: nextCanonicalStatus,
        source: details.source || "manual",
        reason: details.reason || null,
      },
    });
  }

  static async applyStatusTransition(project, newStatus, actor = null, details = {}) {
    const normalizedStatus = normalizeProjectStatus(newStatus);
    if (!normalizedStatus) {
      throw new ApiError(422, "A marketplace status is required.");
    }

    const lifecycle = buildLifecycle(project, await this.getLifecycleUsage(project.id, project.companyId));
    const currentStatus = toCanonicalProjectStatus(project.status) || project.status;

    if (currentStatus === "ARCHIVED" && normalizedStatus !== "ARCHIVED" && lifecycle.isImmutable) {
      throw new ApiError(409, "Archived listings with retired credits cannot be restored.");
    }

    if (project.status === normalizedStatus) {
      return serializeProject(project, lifecycle);
    }

    const previousStatus = currentStatus;
    project.status = normalizedStatus;
    if (normalizedStatus === "PUBLISHED") {
      assertPublishableProject(project);
    }
    project.updatedBy = actor?.id || null;
    if (normalizedStatus === "PUBLISHED") {
      project.publishedBy = actor?.id || null;
      project.publishedAt = new Date();
    }
    if (normalizedStatus === "ARCHIVED") {
      project.archivedBy = actor?.id || null;
      project.archivedAt = new Date();
    }
    await project.save();
    this.removeDashboardCache(project.companyId);
    await this.logStatusTransition(project, previousStatus, normalizedStatus, actor, details);

    const reloaded = await project.reload();
    const updatedLifecycle = buildLifecycle(reloaded, await this.getLifecycleUsage(reloaded.id, reloaded.companyId));
    return serializeProject(reloaded, updatedLifecycle);
  }

  static async updateStatus(id, newStatus, companyId, actor = null, details = {}) {
    const project = await this.getProjectOrFail(id, companyId);
    return this.applyStatusTransition(project, newStatus, actor, details);
  }

  static async toggleStatus(id, companyId, actor = null, details = {}) {
    const project = await this.getProjectOrFail(id, companyId);
    const usage = await this.getLifecycleUsage(id, companyId);
    const lifecycle = buildLifecycle(project, usage);
    const creditsRetired = Math.max(Number(project.retiredCredits || 0), Number(lifecycle.purchasedCredits || 0));
    const currentStatus = toCanonicalProjectStatus(project.status) || project.status;

    if (currentStatus === "ARCHIVED") {
      if (creditsRetired > 0 || lifecycle.hasTransactionHistory || lifecycle.certificateCount > 0) {
        return {
          success: true,
          action: "archived",
          hardDeleted: false,
          id: project.id,
          project: serializeProject(project, lifecycle),
          reason: "Project remains archived because retired credits or historical transactions must stay intact.",
        };
      }

      const restoredStatus = Number(project.availableCredits) > 0 ? "PUBLISHED" : "SOLD_OUT";
      const restoredProject = await this.applyStatusTransition(project, restoredStatus, actor, {
        source: details.source || "manual.toggle_status",
        reason: details.reason || "Project restored from archived status.",
        ipAddress: details.ipAddress || null,
      });

      return {
        success: true,
        action: restoredStatus === "PUBLISHED" ? "published" : "sold_out",
        hardDeleted: false,
        id: project.id,
        project: restoredProject,
        reason: restoredStatus === "PUBLISHED"
          ? "Project restored to published status."
          : "Project restored as sold out because there are no available credits.",
      };
    }

    const archivedProject = await this.applyStatusTransition(project, "ARCHIVED", actor, {
      source: details.source || "manual.toggle_status",
      reason: creditsRetired > 0
        ? "Project archived because retired credits must remain historically traceable."
        : details.reason || "Project archived by status toggle.",
      ipAddress: details.ipAddress || null,
    });

    return {
      success: true,
      action: "archived",
      hardDeleted: false,
      id: project.id,
      project: archivedProject,
      reason: creditsRetired > 0
        ? "Project has retired credits and was archived to preserve transaction history."
        : "Project status toggled to archived.",
    };
  }

  static async markSoldOutIfNeeded(projectId, companyId, actor = null, details = {}) {
    const project = await this.getProjectOrFail(projectId, companyId);
    const currentStatus = toCanonicalProjectStatus(project.status) || project.status;

    if (Number(project.availableCredits) > 0 || currentStatus === "ARCHIVED" || currentStatus === "DRAFT") {
      const lifecycle = buildLifecycle(project, await this.getLifecycleUsage(project.id, project.companyId));
      return serializeProject(project, lifecycle);
    }

    return this.applyStatusTransition(project, "SOLD_OUT", actor, {
      source: details.source || "system.inventory_depleted",
      reason: details.reason || "Available credits reached zero.",
      ipAddress: details.ipAddress || null,
    });
  }

  static async adjustInventory(id, companyId, payload = {}, actor = null, details = {}) {
    const project = await this.getProjectOrFail(id, companyId);
    const reason = normalizeRequiredText(payload.reason, null, "reason");
    const previous = {
      totalQuantityTco2e: Number(project.totalQuantityTco2e || 0),
      availableCredits: Number(project.availableCredits || 0),
      reservedCredits: Number(project.reservedCredits || 0),
      retiredCredits: Number(project.retiredCredits || 0),
      status: toCanonicalProjectStatus(project.status) || project.status,
    };

    const totalQuantityTco2e = normalizeOptionalNumber(
      payload.totalQuantityTco2e,
      project.totalQuantityTco2e,
      "totalQuantityTco2e",
      { min: 0 },
    );
    const availableCredits = normalizeOptionalNumber(
      payload.availableQuantityTco2e ?? payload.availableCredits,
      project.availableCredits,
      "availableQuantityTco2e",
      { min: 0 },
    );
    const reservedCredits = normalizeOptionalNumber(
      payload.reservedQuantityTco2e ?? payload.reservedCredits,
      project.reservedCredits,
      "reservedQuantityTco2e",
      { min: 0 },
    );
    const retiredCredits = normalizeOptionalNumber(
      payload.retiredQuantityTco2e ?? payload.retiredCredits,
      project.retiredCredits,
      "retiredQuantityTco2e",
      { min: 0 },
    );

    if (availableCredits + reservedCredits + retiredCredits > totalQuantityTco2e) {
      throw new ApiError(422, "Available, reserved, and retired inventory cannot exceed total inventory.");
    }

    project.totalQuantityTco2e = totalQuantityTco2e;
    project.availableCredits = availableCredits;
    project.reservedCredits = reservedCredits;
    project.retiredCredits = retiredCredits;
    project.updatedBy = actor?.id || null;

    if (availableCredits === 0 && (toCanonicalProjectStatus(project.status) || project.status) === "PUBLISHED") {
      project.status = "SOLD_OUT";
    }

    await project.save();
    this.removeDashboardCache(companyId);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_inventory_adjusted",
      entityType: "OffsetProject",
      entityId: project.id,
      oldValue: previous,
      newValue: {
        totalQuantityTco2e,
        availableCredits,
        reservedCredits,
        retiredCredits,
        status: toCanonicalProjectStatus(project.status) || project.status,
      },
      details: { reason },
    });

    const reloaded = await project.reload();
    return serializeProject(reloaded, buildLifecycle(reloaded, await this.getLifecycleUsage(reloaded.id, companyId)));
  }

  static async list(query = {}, companyId, actor = null) {
    await CheckoutLockService.releaseExpiredLocks({
      companyId,
      limit: 25,
    });

    const filter = {
      companyId,
      ...this.getLikeFilter(["name", "type", "location", "certification", "verificationStandard"], query.search),
    };

    const requestedStatus = normalizeProjectStatus(query.status);
    const includeAllStatuses = canManageMarketplace(actor) && isTruthyQueryFlag(query.includeAllStatuses);
    const includeSoldOut = includeAllStatuses || isTruthyQueryFlag(query.includeSoldOut);

    if (requestedStatus) {
      if (!includeAllStatuses && !PUBLIC_MARKETPLACE_WITH_SOLD_OUT_STATUSES.includes(requestedStatus)) {
        throw new ApiError(403, "You do not have permission to view that marketplace status.");
      }

      if (!includeAllStatuses && requestedStatus === "SOLD_OUT" && !includeSoldOut) {
        filter.status = resolveStatusFilter(PUBLIC_MARKETPLACE_STATUSES);
      } else {
        filter.status = resolveStatusFilter(requestedStatus);
      }
    } else if (!includeAllStatuses) {
      filter.status = resolveStatusFilter(includeSoldOut
        ? PUBLIC_MARKETPLACE_WITH_SOLD_OUT_STATUSES
        : PUBLIC_MARKETPLACE_STATUSES);
    }

    const requestedCategory = String(query.category || query.type || "").trim();
    if (requestedCategory && requestedCategory.toUpperCase() !== "ALL") {
      filter.type = requestedCategory;
    }

    const sort = resolveMarketplaceSort(query);

    const [projects, transactions] = await Promise.all([
      this.buildListResult(CarbonProject, { query, filter, sort }),
      Transaction.find({ companyId, status: { $in: ["COMPLETED", "PENDING"] } }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    const projectIds = projects.data.map((project) => project.id || project._id);
    const lifecycleUsageMap = await this.getLifecycleUsageMap(projectIds, companyId);

    const normalizedTransactions = transactions.map((transaction) => ({
      id: transaction.id || transaction._id,
      ...transaction,
      companyName: transaction.companyName || null,
      projectName: transaction.projectName || transaction.metadata?.projectName || transaction.projectId || "Offset project",
      registry: transaction.registry || transaction.metadata?.verificationStandard || null,
      registryRecordId: transaction.registryRecordId || null,
      blockchainHash: transaction.blockchainHash || null,
      vintageYear: Number(transaction.vintageYear || 0),
      pricePerTon: Number(transaction.pricePerTon || transaction.pricePerTonUsd || transaction.price || 0),
      quantity: Number(transaction.quantity || transaction.credits || 0),
      subtotalUsd: Number(transaction.subtotalUsd || (transaction.quantity || transaction.credits || 0) * (transaction.pricePerTon || transaction.pricePerTonUsd || transaction.price || 0)),
      platformFeeUsd: Number(transaction.platformFeeUsd || 0),
      shipmentId: transaction.shipmentId || null,
      shipmentReference: transaction.shipmentReference || null,
      shipmentStatus: transaction.shipmentStatus || null,
      totalCost: Number(transaction.totalCost || transaction.totalCostUsd || transaction.total || 0),
      tCO2eRetired: Number(transaction.tCO2eRetired || transaction.credits || 0),
      totalCostUsd: Number(transaction.totalCostUsd || transaction.total || 0),
    }));
    const completedTransactions = normalizedTransactions.filter((transaction) => transaction.status === "COMPLETED");

    return {
      ...projects,
      data: projects.data.map((project) => serializeProject(project, buildLifecycle(project, lifecycleUsageMap.get(project.id || project._id)))),
      transactions: normalizedTransactions,
      summary: {
        totalCreditsRetired: completedTransactions.reduce((sum, transaction) => sum + Number(transaction.credits || 0), 0),
        totalSpendUsd: completedTransactions.reduce((sum, transaction) => sum + Number(transaction.totalCostUsd || transaction.total || 0), 0),
      },
    };
  }

  static async getById(id, companyId, actor = null) {
    const includeAllStatuses = canManageMarketplace(actor);
    const filter = { _id: id, companyId };

    if (!includeAllStatuses) {
      filter.status = { $in: PUBLIC_MARKETPLACE_WITH_SOLD_OUT_STATUSES };
    }

    const project = await CarbonProject.findOne(filter);
    if (!project) {
      throw new ApiError(404, "Marketplace listing not found.");
    }

    return serializeProject(project, buildLifecycle(project, await this.getLifecycleUsage(project.id, companyId)));
  }

  static async calculateBudgetSpend(companyId) {
    const [settled, pending] = await Promise.all([
      Transaction.aggregate([
        { $match: { companyId, status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$totalCostUsd" } } },
      ]),
      Transaction.aggregate([
        { $match: { companyId, status: { $in: ["PENDING", "RESERVED"] } } },
        { $group: { _id: null, total: { $sum: "$totalCostUsd" } } },
      ]),
    ]);

    return {
      settledSpend: roundMoney(settled[0]?.total || 0),
      pendingSpend: roundMoney(pending[0]?.total || 0),
    };
  }

  static async getBudget(companyId) {
    const [budget, spend, requests] = await Promise.all([
      MarketplaceBudget.findOne({ companyId }).lean(),
      this.calculateBudgetSpend(companyId),
      MarketplaceBudgetRequest.find({ companyId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return {
      budget: serializeBudget(budget, spend),
      requests: requests.map((request) => ({
        id: request._id || request.id,
        companyId: request.companyId,
        requestedAmount: Number(request.requestedAmount || 0),
        currentBudget: Number(request.currentBudget || 0),
        reason: request.reason || null,
        status: String(request.status || "PENDING").toLowerCase(),
        requestedBy: request.requestedBy || null,
        reviewedBy: request.reviewedBy || null,
        reviewedAt: request.reviewedAt || null,
        createdAt: request.createdAt,
      })),
    };
  }

  static async getBudgetRequest(id, companyId) {
    const request = await MarketplaceBudgetRequest.findOne({ _id: id, companyId }).lean();
    if (!request) {
      throw new ApiError(404, "Budget request not found.");
    }
    return {
      id: request._id || request.id,
      companyId: request.companyId,
      requestedAmount: Number(request.requestedAmount || 0),
      currentBudget: Number(request.currentBudget || 0),
      reason: request.reason || null,
      reviewReason: request.reviewReason || null,
      status: String(request.status || "PENDING").toLowerCase(),
      requestedBy: request.requestedBy || null,
      reviewedBy: request.reviewedBy || null,
      reviewedAt: request.reviewedAt || null,
      createdAt: request.createdAt,
    };
  }

  static async approveBudgetRequest(id, companyId, actor = null, payload = {}, details = {}) {
    if (!BUDGET_ADMIN_ROLES.includes(String(actor?.role || "").toUpperCase())) {
      throw new ApiError(403, "Only owners and admins can approve budget requests.");
    }

    const request = await MarketplaceBudgetRequest.findOne({ _id: id, companyId });
    if (!request) {
      throw new ApiError(404, "Budget request not found.");
    }
    if (request.status !== "PENDING") {
      throw new ApiError(409, "Only pending budget requests can be approved.");
    }
    if (request.requestedBy && actor?.id && String(request.requestedBy) === String(actor.id) && String(actor.role || "").toUpperCase() !== "SUPERADMIN") {
      throw new ApiError(403, "Requester cannot approve their own budget request.");
    }

    const previousBudget = await MarketplaceBudget.findOne({ companyId }).lean();
    const budget = await MarketplaceBudget.findOneAndUpdate(
      { companyId },
      {
        $set: {
          totalBudget: Number(request.requestedAmount || 0),
          updatedBy: actor?.id || null,
        },
        $setOnInsert: {
          companyId,
          currency: "USD",
          createdBy: actor?.id || null,
        },
      },
      { new: true, upsert: true },
    );
    request.status = "APPROVED";
    request.reviewedBy = actor?.id || null;
    request.reviewedAt = new Date();
    request.reviewReason = normalizeOptionalText(payload.reason, null);
    await request.save();

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "budget_increase_approved",
      entityType: "MarketplaceBudgetRequest",
      entityId: request.id,
      oldValue: previousBudget,
      newValue: budget.toJSON ? budget.toJSON() : budget,
    });

    return this.getBudgetRequest(request.id, companyId);
  }

  static async rejectBudgetRequest(id, companyId, actor = null, payload = {}, details = {}) {
    if (!BUDGET_ADMIN_ROLES.includes(String(actor?.role || "").toUpperCase())) {
      throw new ApiError(403, "Only owners and admins can reject budget requests.");
    }
    const request = await MarketplaceBudgetRequest.findOne({ _id: id, companyId });
    if (!request) {
      throw new ApiError(404, "Budget request not found.");
    }
    if (request.status !== "PENDING") {
      throw new ApiError(409, "Only pending budget requests can be rejected.");
    }
    request.status = "REJECTED";
    request.reviewedBy = actor?.id || null;
    request.reviewedAt = new Date();
    request.reviewReason = normalizeOptionalText(payload.reason, null) || "Rejected by administrator.";
    await request.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "budget_increase_rejected",
      entityType: "MarketplaceBudgetRequest",
      entityId: request.id,
      details: { reason: request.reviewReason },
    });
    return this.getBudgetRequest(request.id, companyId);
  }

  static async cancelBudgetRequest(id, companyId, actor = null, details = {}) {
    const request = await MarketplaceBudgetRequest.findOne({ _id: id, companyId });
    if (!request) {
      throw new ApiError(404, "Budget request not found.");
    }
    const isRequester = request.requestedBy && actor?.id && String(request.requestedBy) === String(actor.id);
    const isAdmin = BUDGET_ADMIN_ROLES.includes(String(actor?.role || "").toUpperCase());
    if (!isRequester && !isAdmin) {
      throw new ApiError(403, "Only the requester or an admin can cancel this budget request.");
    }
    if (request.status !== "PENDING") {
      throw new ApiError(409, "Only pending budget requests can be cancelled.");
    }
    request.status = "CANCELLED";
    request.reviewedBy = actor?.id || null;
    request.reviewedAt = new Date();
    await request.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "budget_increase_cancelled",
      entityType: "MarketplaceBudgetRequest",
      entityId: request.id,
    });
    return this.getBudgetRequest(request.id, companyId);
  }

  static async getTransactionOrFail(id, companyId) {
    const transaction = await Transaction.findOne({ _id: id, companyId });
    if (!transaction) {
      throw new ApiError(404, "Marketplace transaction not found.");
    }
    return transaction;
  }

  static async getRetirementStatus(id, companyId) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    return {
      transactionId: transaction.id,
      registryProvider: transaction.registryProvider || getRegistryProvider().name,
      registryRetirementStatus: transaction.registryRetirementStatus || "pending",
      registryRetirementId: transaction.registryRetirementId || null,
      registryRetirementUrl: transaction.registryRetirementUrl || null,
      registryRetiredAt: transaction.registryRetiredAt || null,
      registryError: transaction.registryError || null,
    };
  }

  static async submitRetirement(id, companyId, actor = null, details = {}) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    const provider = getRegistryProvider();
    const result = await provider.submitRetirement(transaction);
    transaction.registryProvider = result.provider || provider.name;
    transaction.registryRetirementStatus = result.status || "manual_verification_required";
    transaction.registryRetirementId = result.retirementId || null;
    transaction.registryRetirementUrl = result.retirementUrl || null;
    transaction.registryRetiredAt = result.retiredAt || null;
    transaction.registryResponseSnapshot = result.responseSnapshot || {};
    transaction.registryError = result.error || null;
    transaction.lifecycleStatus = transaction.registryRetirementStatus === "retired" ? "completed" : "pending_registry_retirement";
    await transaction.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_retirement_submitted",
      entityType: "CarbonCreditTransaction",
      entityId: transaction.id,
      details: { provider: provider.name, status: transaction.registryRetirementStatus },
    });
    return this.getRetirementStatus(id, companyId);
  }

  static async manualRetirement(id, companyId, payload = {}, actor = null, details = {}) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    if (transaction.isDemo) {
      throw new ApiError(422, "Demo transactions cannot be marked as real registry retirements.");
    }
    const retirementId = normalizeRequiredText(payload.registryRetirementId, null, "registryRetirementId");
    const evidenceReferences = Array.isArray(payload.evidenceReferences) ? payload.evidenceReferences : [];
    if (evidenceReferences.length === 0 && !normalizeOptionalText(payload.registryRetirementUrl, null)) {
      throw new ApiError(422, "Manual retirement requires evidence reference or registry URL.");
    }
    transaction.registryProvider = "manual";
    transaction.registryRetirementStatus = "manually_verified";
    transaction.registryRetirementId = retirementId;
    transaction.registryRetirementUrl = normalizeOptionalText(payload.registryRetirementUrl, null);
    transaction.registryRetiredAt = payload.registryRetiredAt ? new Date(payload.registryRetiredAt) : new Date();
    transaction.registryResponseSnapshot = { manual: true, status: "manually_verified" };
    transaction.registryError = null;
    transaction.isRealRetirement = true;
    transaction.lifecycleStatus = transaction.paymentStatus === "paid" || transaction.paymentStatus === "not_required"
      ? "completed"
      : "pending_payment";
    transaction.verifierUserId = actor?.id || null;
    transaction.verifierName = actor?.name || null;
    transaction.verifierEmail = actor?.email || null;
    transaction.verificationNotes = normalizeOptionalText(payload.verificationNotes, null);
    transaction.evidenceReferences = evidenceReferences;
    await transaction.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_manual_retirement_verified",
      entityType: "CarbonCreditTransaction",
      entityId: transaction.id,
      details: {
        registryRetirementId: retirementId,
        evidenceCount: evidenceReferences.length,
      },
    });
    return this.getRetirementStatus(id, companyId);
  }

  static async getPaymentStatus(id, companyId) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    return {
      transactionId: transaction.id,
      paymentProvider: transaction.paymentProvider || getPaymentProvider().name,
      paymentStatus: transaction.paymentStatus || "pending",
      paymentReference: transaction.paymentReference || null,
      invoiceNumber: transaction.invoiceNumber || null,
      invoiceUrl: transaction.invoiceUrl || null,
      paidAt: transaction.paidAt || null,
      settledAt: transaction.settledAt || null,
      settlementNotes: transaction.settlementNotes || null,
    };
  }

  static async createInvoice(id, companyId, actor = null, details = {}) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    const provider = getPaymentProvider();
    const invoice = await provider.createInvoice(transaction);
    transaction.paymentProvider = invoice.provider || provider.name;
    transaction.paymentStatus = invoice.status || "pending";
    transaction.invoiceNumber = invoice.invoiceNumber || transaction.invoiceNumber || null;
    transaction.invoiceUrl = invoice.invoiceUrl || transaction.invoiceUrl || null;
    transaction.paymentReference = invoice.paymentReference || transaction.paymentReference || null;
    transaction.lifecycleStatus = "pending_payment";
    await transaction.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_invoice_created",
      entityType: "CarbonCreditTransaction",
      entityId: transaction.id,
      details: { provider: provider.name, invoiceNumber: transaction.invoiceNumber },
    });
    return this.getPaymentStatus(id, companyId);
  }

  static async markPaid(id, companyId, payload = {}, actor = null, details = {}) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    const reference = normalizeRequiredText(payload.paymentReference || transaction.paymentReference, null, "paymentReference");
    transaction.paymentProvider = transaction.paymentProvider || getPaymentProvider().name;
    transaction.paymentStatus = "paid";
    transaction.paymentReference = reference;
    transaction.paidAt = payload.paidAt ? new Date(payload.paidAt) : new Date();
    transaction.settledAt = payload.settledAt ? new Date(payload.settledAt) : transaction.paidAt;
    transaction.settlementNotes = normalizeOptionalText(payload.settlementNotes || payload.reason, null);
    transaction.lifecycleStatus = ["retired", "manually_verified", "not_required"].includes(transaction.registryRetirementStatus)
      ? "completed"
      : "pending_registry_retirement";
    await transaction.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_payment_marked_paid",
      entityType: "CarbonCreditTransaction",
      entityId: transaction.id,
      details: { paymentReference: reference },
    });
    return this.getPaymentStatus(id, companyId);
  }

  static async refund(id, companyId, payload = {}, actor = null, details = {}) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    transaction.paymentStatus = "refunded";
    transaction.lifecycleStatus = "refunded";
    transaction.settlementNotes = normalizeOptionalText(payload.reason, null) || transaction.settlementNotes;
    await transaction.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_payment_refunded",
      entityType: "CarbonCreditTransaction",
      entityId: transaction.id,
      details: { reason: transaction.settlementNotes },
    });
    return this.getPaymentStatus(id, companyId);
  }

  static async markPaymentFailed(id, companyId, payload = {}, actor = null, details = {}) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    const reason = normalizeRequiredText(payload.reason || payload.settlementNotes, null, "reason");
    transaction.paymentStatus = "failed";
    transaction.lifecycleStatus = "failed";
    transaction.settlementNotes = reason;
    await transaction.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_payment_failed",
      entityType: "CarbonCreditTransaction",
      entityId: transaction.id,
      details: { reason },
    });
    return this.getPaymentStatus(id, companyId);
  }

  static async cancelPayment(id, companyId, payload = {}, actor = null, details = {}) {
    const transaction = await this.getTransactionOrFail(id, companyId);
    const reason = normalizeRequiredText(payload.reason || payload.settlementNotes, null, "reason");
    transaction.paymentStatus = "cancelled";
    transaction.lifecycleStatus = "cancelled";
    transaction.settlementNotes = reason;
    await transaction.save();
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_payment_cancelled",
      entityType: "CarbonCreditTransaction",
      entityId: transaction.id,
      details: { reason },
    });
    return this.getPaymentStatus(id, companyId);
  }

  static async getOperationalReview(companyId) {
    const [transactions, budgetRequests, listings] = await Promise.all([
      Transaction.find({ companyId }).sort({ createdAt: -1 }).limit(100).lean(),
      MarketplaceBudgetRequest.find({ companyId, status: "PENDING" }).sort({ createdAt: -1 }).lean(),
      CarbonProject.find({ companyId }).sort({ updatedAt: -1 }).limit(200).lean(),
    ]);
    const pendingPayment = transactions.filter((tx) => ["pending", "invoice_sent"].includes(tx.paymentStatus));
    const pendingRegistry = transactions.filter((tx) => ["pending", "submitted", "manual_verification_required"].includes(tx.registryRetirementStatus));
    const failedTransactions = transactions.filter((tx) => tx.status === "FAILED" || tx.lifecycleStatus === "failed" || tx.registryRetirementStatus === "failed");
    const missingRegistry = listings.filter((listing) => listing.status === "PUBLISHED" && (!listing.registryProjectId || !(listing.registryName || listing.registry)));
    const lowInventory = listings.filter((listing) => Number(listing.availableCredits || 0) > 0 && Number(listing.availableCredits || 0) <= 10);
    const soldOut = listings.filter((listing) => listing.status === "SOLD_OUT" || Number(listing.availableCredits || 0) === 0);
    return {
      cards: {
        pendingBudgetApprovals: budgetRequests.length,
        pendingPaymentVerification: pendingPayment.length,
        pendingRegistryRetirements: pendingRegistry.length,
        failedTransactions: failedTransactions.length,
        lowInventoryListings: lowInventory.length,
        soldOutListings: soldOut.length,
        listingsMissingRegistryMetadata: missingRegistry.length,
        demoListings: listings.filter((listing) => listing.isDemo || listing.isSample).length,
        realInventoryListings: listings.filter((listing) => listing.isRealInventory && !listing.isDemo && !listing.isSample).length,
      },
      queues: {
        budgetRequests,
        pendingPayment,
        pendingRegistry,
        failedTransactions,
        missingRegistry,
        lowInventory,
        soldOut,
      },
    };
  }

  static async updateBudget(payload = {}, companyId, actor = null, details = {}) {
    if (!BUDGET_ADMIN_ROLES.includes(String(actor?.role || "").toUpperCase())) {
      throw new ApiError(403, "Only owners and admins can manage marketplace budgets.");
    }

    const totalBudget = ensureFiniteNumber(payload.totalBudget ?? payload.totalBudgetUsd, "totalBudget", { min: 0 });
    const monthlyBudget = normalizeOptionalNumber(payload.monthlyBudget, null, "monthlyBudget", { min: 0 });
    const approvalRequiredThreshold = normalizeOptionalNumber(payload.approvalRequiredThreshold, null, "approvalRequiredThreshold", { min: 0 });
    const previous = await MarketplaceBudget.findOne({ companyId }).lean();
    const budget = await MarketplaceBudget.findOneAndUpdate(
      { companyId },
      {
        $set: {
          totalBudget,
          monthlyBudget,
          approvalRequiredThreshold,
          currency: normalizeOptionalText(payload.currency, "USD") || "USD",
          updatedBy: actor?.id || null,
        },
        $setOnInsert: {
          companyId,
          createdBy: actor?.id || null,
        },
      },
      { new: true, upsert: true },
    );

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "marketplace_budget_updated",
      entityType: "MarketplaceBudget",
      entityId: budget.id,
      oldValue: previous || null,
      newValue: budget.toJSON ? budget.toJSON() : budget,
    });

    return (await this.getBudget(companyId)).budget;
  }

  static async resolveBudgetRequestRecipients(companyId) {
    const adminUsers = await User.find({
      companyId,
      role: { $in: BUDGET_ADMIN_ROLES },
      status: { $in: ["ACTIVE", "INVITED"] },
    })
      .select("email")
      .lean();

    const recipients = [...new Set(
      adminUsers
        .map((user) => normalizeOptionalText(user.email, null))
        .filter(Boolean),
    )];

    if (recipients.length === 0) {
      const fallbackRecipient = normalizeOptionalText(env.admin.bootstrapEmail, null);
      if (fallbackRecipient) {
        recipients.push(fallbackRecipient);
      }
    }

    if (recipients.length === 0) {
      throw new ApiError(409, "No admin recipients are configured for budget increase notifications.");
    }

    return recipients;
  }

  static async requestBudgetIncrease(payload = {}, companyId, actor = null, details = {}) {
    const budgetState = await this.getBudget(companyId);
    const currentBudgetUsd = roundMoney(ensureFiniteNumber(payload.currentBudgetUsd ?? budgetState.budget.totalBudget, "currentBudgetUsd", { min: 0 }));
    const requestedBudgetUsd = roundMoney(ensureFiniteNumber(payload.requestedBudgetUsd ?? payload.requestedAmount, "requestedBudgetUsd", { min: 0 }));
    const remainingBudgetUsd = roundMoney(ensureFiniteNumber(payload.remainingBudgetUsd ?? 0, "remainingBudgetUsd", { min: 0 }));
    const pendingTransactionsUsd = roundMoney(ensureFiniteNumber(payload.pendingTransactionsUsd ?? 0, "pendingTransactionsUsd", { min: 0 }));

    if (requestedBudgetUsd <= currentBudgetUsd) {
      throw new ApiError(422, "requestedBudgetUsd must be greater than currentBudgetUsd.");
    }

    const company = await Company.findById(companyId).select("name").lean();
    const recipients = await this.resolveBudgetRequestRecipients(companyId);
    const requesterName = normalizeOptionalText(actor?.name, null) || "CarbonFlow User";
    const requesterEmail = normalizeOptionalText(actor?.email, null) || "noreply@carbonflow.local";
    const companyName = normalizeOptionalText(payload.companyName, company?.name) || "CarbonFlow Company";
    const reason = normalizeOptionalText(payload.reason, null);

    let delivery = null;

    try {
      delivery = await withTimeout(
        sendBudgetIncreaseRequestEmail({
          to: recipients,
          requesterName,
          requesterEmail,
          companyName,
          currentBudgetUsd,
          requestedBudgetUsd,
          remainingBudgetUsd,
          pendingTransactionsUsd,
          reason,
        }),
        BUDGET_EMAIL_TIMEOUT_MS,
        "Budget increase notification email timed out.",
      );
    } catch (error) {
      logger.warn("marketplace.budget_request.email_failed", {
        companyId,
        requesterEmail,
        recipientCount: recipients.length,
        message: error.message,
        stack: env.isProduction ? undefined : error.stack,
      });
    }

    const request = await MarketplaceBudgetRequest.create({
      companyId,
      requestedAmount: requestedBudgetUsd,
      currentBudget: currentBudgetUsd,
      reason,
      status: "PENDING",
      requestedBy: actor?.id || null,
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "budget_increase_requested",
      entityType: "MarketplaceBudget",
      entityId: request.id,
      details: {
        currentBudgetUsd,
        requestedBudgetUsd,
        remainingBudgetUsd,
        pendingTransactionsUsd,
        reason,
        recipientCount: recipients.length,
        emailDelivered: Boolean(delivery?.messageId),
      },
    });

    return {
      success: true,
      currentBudgetUsd,
      requestedBudgetUsd,
      remainingBudgetUsd,
      pendingTransactionsUsd,
      recipientCount: recipients.length,
      emailDelivered: Boolean(delivery?.messageId),
      requestId: request.id,
    };
  }

  static async getAutoOffsetRule(companyId) {
    const rule = await AutoOffsetRule.findOne({ companyId }).lean();
    return {
      enabled: Boolean(rule?.enabled),
      carbonIntensityThreshold: Number(rule?.carbonIntensityThreshold ?? 0.8),
      intensityThreshold: Number(rule?.carbonIntensityThreshold ?? 0.8),
      maxSpendPerMonth: rule?.maxSpendPerMonth ?? null,
      preferredProjectTypes: rule?.preferredProjectTypes || [],
      preferredRegistries: rule?.preferredRegistries || [],
      requireApproval: rule?.requireApproval !== false,
      lastEvaluatedAt: rule?.lastEvaluatedAt || null,
      lastEvaluation: rule?.lastEvaluation || {},
      isConfigured: Boolean(rule),
    };
  }

  static async updateAutoOffsetRule(payload = {}, companyId, actor = null, details = {}) {
    const previous = await AutoOffsetRule.findOne({ companyId }).lean();
    const carbonIntensityThreshold = ensureFiniteNumber(
      payload.carbonIntensityThreshold ?? payload.intensityThreshold ?? 0.8,
      "carbonIntensityThreshold",
      { min: 0 },
    );
    const rule = await AutoOffsetRule.findOneAndUpdate(
      { companyId },
      {
        $set: {
          enabled: Boolean(payload.enabled),
          carbonIntensityThreshold,
          maxSpendPerMonth: normalizeOptionalNumber(payload.maxSpendPerMonth, null, "maxSpendPerMonth", { min: 0 }),
          preferredProjectTypes: Array.isArray(payload.preferredProjectTypes) ? payload.preferredProjectTypes.map(String) : [],
          preferredRegistries: Array.isArray(payload.preferredRegistries) ? payload.preferredRegistries.map(String) : [],
          requireApproval: payload.requireApproval !== false,
          updatedBy: actor?.id || null,
        },
        $setOnInsert: {
          companyId,
          createdBy: actor?.id || null,
        },
      },
      { new: true, upsert: true },
    );

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "auto_offset_rule_updated",
      entityType: "AutoOffsetRule",
      entityId: rule.id,
      oldValue: previous || null,
      newValue: rule.toJSON ? rule.toJSON() : rule,
    });

    return this.getAutoOffsetRule(companyId);
  }

  static async evaluateAutoOffsetRule(companyId, actor = null, details = {}) {
    const rule = await AutoOffsetRule.findOne({ companyId });
    const threshold = Number(rule?.carbonIntensityThreshold ?? 0.8);
    const eligibleShipments = rule?.enabled
      ? await Shipment.find({
        companyId,
        emissionsTonnes: { $gt: threshold },
        status: { $in: ["PLANNED", "IN_TRANSIT", "DELAYED"] },
      }).limit(50).lean()
      : [];
    const eligibleListings = rule?.enabled
      ? await CarbonProject.countDocuments({
        companyId,
        status: { $in: PROJECT_STATUS_FILTER_MAP.PUBLISHED },
        availableCredits: { $gt: 0 },
        isDemo: { $ne: true },
        isRealInventory: true,
      })
      : 0;
    const evaluation = {
      eligibleShipmentsCount: eligibleShipments.length,
      eligibleListingsCount: eligibleListings,
      estimatedBudgetImpact: 0,
      warning: rule?.enabled && eligibleListings === 0 ? "No eligible real published listing exists for auto-offset." : null,
      evaluatedAt: new Date(),
    };

    if (rule) {
      rule.lastEvaluatedAt = evaluation.evaluatedAt;
      rule.lastEvaluation = evaluation;
      await rule.save();
    }

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "auto_offset_evaluated",
      entityType: "AutoOffsetRule",
      entityId: rule?.id || String(companyId),
      details: evaluation,
    });

    return evaluation;
  }

  static async create(payload, companyId, actor = null) {
    const normalizedPayload = normalizeProjectPayload(payload);
    if ((toCanonicalProjectStatus(normalizedPayload.status) || normalizedPayload.status) === "PUBLISHED") {
      assertPublishableProject(normalizedPayload);
    }
    const project = await CarbonProject.create({
      ...normalizedPayload,
      companyId,
      createdBy: actor?.id || null,
      updatedBy: actor?.id || null,
    });

    this.removeDashboardCache(companyId);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "marketplace_listing_created",
      entityType: "OffsetProject",
      entityId: project.id,
      details: {
        name: project.name,
        type: project.type,
        status: project.status,
      },
    });

    return serializeProject(project, buildLifecycle(project));
  }

  static async update(id, payload, companyId, actor = null) {
    const project = await this.getProjectOrFail(id, companyId);
    const lifecycle = buildLifecycle(project, await this.getLifecycleUsage(id, companyId));
    const changedFields = Object.keys(payload || {}).filter((field) => !["id", "companyId", "createdAt", "updatedAt"].includes(field));
    const currentStatus = toCanonicalProjectStatus(project.status) || project.status;

    if (changedFields.length === 0) {
      return serializeProject(project, lifecycle);
    }

    if (currentStatus === "ARCHIVED" && !(changedFields.length === 1 && changedFields[0] === "status" && normalizeProjectStatus(payload.status) === "ARCHIVED")) {
      throw new ApiError(409, "Archived listings are read-only.");
    }

    const nonStatusFields = changedFields.filter((field) => field !== "status");
    if (lifecycle.isImmutable && nonStatusFields.length > 0) {
      throw new ApiError(409, "Listing with purchase history is immutable. Only status changes are allowed.");
    }

    if (changedFields.length === 1 && changedFields[0] === "status") {
      return this.updateStatus(id, payload.status, companyId, actor, {
        source: "manual.update",
        reason: "Listing status updated from edit workflow",
      });
    }

    const previousStatus = currentStatus;
    Object.assign(project, normalizeProjectPayload(payload, project));
    if ((toCanonicalProjectStatus(project.status) || project.status) === "PUBLISHED") {
      assertPublishableProject(project);
    }
    project.updatedBy = actor?.id || null;
    if ((toCanonicalProjectStatus(project.status) || project.status) === "PUBLISHED" && previousStatus !== "PUBLISHED") {
      project.publishedBy = actor?.id || null;
      project.publishedAt = new Date();
    }
    if ((toCanonicalProjectStatus(project.status) || project.status) === "ARCHIVED" && previousStatus !== "ARCHIVED") {
      project.archivedBy = actor?.id || null;
      project.archivedAt = new Date();
    }
    await project.save();
    this.removeDashboardCache(companyId);

    if (previousStatus !== (toCanonicalProjectStatus(project.status) || project.status)) {
      await this.logStatusTransition(project, previousStatus, project.status, actor, {
        source: "manual.update",
        reason: "Listing status updated from edit workflow",
      });
    }

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "marketplace_listing_updated",
      entityType: "OffsetProject",
      entityId: id,
      details: {
        name: project.name,
        changedFields,
      },
    });

    const reloaded = await project.reload();
    return serializeProject(reloaded, buildLifecycle(reloaded, await this.getLifecycleUsage(reloaded.id, companyId)));
  }

  static async remove(id, companyId, actor = null, details = {}) {
    const project = await this.getProjectOrFail(id, companyId);
    const lifecycle = buildLifecycle(project, await this.getLifecycleUsage(id, companyId));
    const creditsRetired = Math.max(Number(project.retiredCredits || 0), Number(lifecycle.purchasedCredits || 0));
    const currentStatus = toCanonicalProjectStatus(project.status) || project.status;

    if (creditsRetired > 0 || !lifecycle.canHardDelete) {
      const archivedProject = currentStatus === "ARCHIVED"
        ? serializeProject(project, lifecycle)
        : await this.applyStatusTransition(project, "ARCHIVED", actor, {
          source: "manual.smart_delete",
          reason: "Project archived instead of deleted because historical credits or transactions exist.",
          ipAddress: details.ipAddress || null,
        });

      await AuditService.log({
        companyId,
        userId: actor?.id || null,
        userEmail: actor?.email || null,
        ipAddress: details.ipAddress || null,
        action: "offsetProject.archived_instead_of_deleted",
        entityType: "OffsetProject",
        entityId: id,
        details: {
          name: project.name,
          transactionCount: lifecycle.transactionCount,
          certificateCount: lifecycle.certificateCount,
          purchasedCredits: lifecycle.purchasedCredits,
          creditsRetired,
        },
      });

      return {
        success: true,
        action: "archived",
        hardDeleted: false,
        id,
        project: archivedProject,
        reason: "Project has retired credits or transaction history and was archived instead of deleted.",
      };
    }

    await project.destroy();
    this.removeDashboardCache(companyId);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "offsetProject.deleted",
      entityType: "OffsetProject",
      entityId: id,
      details: {
        name: project.name,
      },
    });
    return {
      success: true,
      action: "deleted",
      hardDeleted: true,
      id,
      reason: "Project permanently deleted.",
    };
  }

  static async buyCredits(id, credits, companyId, actor = null) {
    const requestedCredits = Number(credits);

    if (!Number.isFinite(requestedCredits) || requestedCredits <= 0) {
      throw new ApiError(400, "Credits must be greater than zero.");
    }

    const updatedProject = await CarbonProject.findOneAndUpdate(
      {
        _id: id,
        companyId,
        status: { $in: PROJECT_STATUS_FILTER_MAP.PUBLISHED },
        availableCredits: { $gte: requestedCredits },
        $expr: {
          $gte: [
            {
              $subtract: [
                "$availableCredits",
                { $ifNull: ["$reservedCredits", 0] },
              ],
            },
            requestedCredits,
          ],
        },
      },
      {
        $inc: {
          availableCredits: -requestedCredits,
          retiredCredits: requestedCredits,
        },
      },
      { new: true },
    );

    if (!updatedProject) {
      const project = await this.getProjectOrFail(id, companyId);
      const currentStatus = toCanonicalProjectStatus(project.status) || project.status;

      if (currentStatus !== "PUBLISHED") {
        if (currentStatus === "SOLD_OUT" || Number(project.availableCredits) === 0) {
          await this.markSoldOutIfNeeded(project.id, companyId, actor, {
            source: "system.inventory_depleted",
            reason: "Direct marketplace purchase found zero available credits.",
          });
          throw new ApiError(409, "This listing is sold out.");
        }

        throw new ApiError(409, "This listing is not currently available for purchase.");
      }

      throw new ApiError(400, "Not enough available credits.");
    }

    const pricePerTonUsd = Number(updatedProject.pricePerCreditUsd || 0);
    const subtotalUsd = Number((requestedCredits * pricePerTonUsd).toFixed(2));
    const platformFeeUsd = Number((subtotalUsd * 0.02).toFixed(2));
    const totalCostUsd = Number((subtotalUsd + platformFeeUsd).toFixed(2));

    await Transaction.create({
      companyId,
      projectId: id,
      userId: actor?.id || null,
      type: "PURCHASE",
      status: "COMPLETED",
      registryProjectId: updatedProject.registryProjectId || null,
      registryRecordId: null,
      registryRetirementId: null,
      blockchainHash: null,
      credits: requestedCredits,
      price: pricePerTonUsd,
      pricePerTonUsd,
      subtotalUsd,
      platformFeeUsd,
      total: totalCostUsd,
      totalCostUsd,
      totalCost: totalCostUsd,
      retiredAt: new Date(),
      certificateId: null,
      isDemo: Boolean(updatedProject.isDemo || updatedProject.isSample),
      isRealRetirement: false,
      metadata: {
        projectName: updatedProject.name,
        verificationStandard: updatedProject.verificationStandard || updatedProject.certification,
        disclaimer: updatedProject.isDemo || updatedProject.isSample
          ? "Demo transaction - not valid for real offset claims."
          : "CarbonFlow transaction record only. No registry retirement reference was provided.",
      },
    });

    let serializedProject = serializeProject(
      updatedProject,
      buildLifecycle(updatedProject, await this.getLifecycleUsage(updatedProject.id, companyId)),
    );

    if (updatedProject.availableCredits === 0) {
      serializedProject = await this.markSoldOutIfNeeded(id, companyId, actor, {
        source: "system.inventory_depleted",
        reason: "Available credits were exhausted by a direct marketplace purchase.",
      });
    }

    this.removeDashboardCache(companyId);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "marketplace_checkout_completed",
      entityType: "OffsetProject",
      entityId: id,
      details: {
        projectName: updatedProject.name,
        credits: requestedCredits,
        totalCostUsd,
      },
    });
    return serializedProject;
  }
}

module.exports = MarketplaceService;
