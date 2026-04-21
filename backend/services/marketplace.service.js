const crypto = require("crypto");
const { CarbonProject, Company, Transaction, User } = require("../models");
const env = require("../config/env");
const BaseService = require("./base.service");
const AuditService = require("./audit.service");
const { sendBudgetIncreaseRequestEmail } = require("./emailService");
const ApiError = require("../utils/ApiError");
const cache = require("../utils/cache");
const CheckoutLockService = require("./checkoutLock.service");
const { OFFSET_PROJECT_STATUSES } = require("../constants/platform");

const MANAGEABLE_MARKETPLACE_ROLES = new Set(["ADMIN", "SUPERADMIN", "MANAGER"]);
const STATUS_CHANGE_ACTION = "offsetProject.status_changed";
const LEGACY_PROJECT_STATUS_ALIASES = {
  ACTIVE: "PUBLISHED",
  INACTIVE: "DRAFT",
};
const PROJECT_STATUS_FILTER_MAP = {
  DRAFT: ["DRAFT", "INACTIVE"],
  PUBLISHED: ["PUBLISHED", "ACTIVE"],
  ARCHIVED: ["ARCHIVED"],
  SOLD_OUT: ["SOLD_OUT"],
};
const PUBLIC_MARKETPLACE_STATUSES = ["PUBLISHED"];
const PUBLIC_MARKETPLACE_WITH_SOLD_OUT_STATUSES = ["PUBLISHED", "SOLD_OUT"];
const BUDGET_ADMIN_ROLES = ["ADMIN", "SUPERADMIN"];

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
    currentProject?.registry || currentProject?.verificationStandard || currentProject?.certification || "Gold Standard",
  ) || "Gold Standard";
  const certification = normalizeRequiredText(
    pickDefined(payload.certification, requestedRegistry),
    currentProject?.certification || requestedRegistry || currentProject?.verificationStandard || "Gold Standard",
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
    pickDefined(payload.availableCredits, payload.totalSupply, currentProject?.availableCredits, 0),
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

  return {
    name: normalizeRequiredText(pickDefined(payload.name, payload.projectName), currentProject?.name, "name"),
    type: normalizeRequiredText(pickDefined(payload.type, payload.category), currentProject?.type, "type"),
    location: normalizeRequiredText(payload.location, currentProject?.location || "Marketplace", "location"),
    description: normalizeOptionalText(payload.description, currentProject?.description || null),
    coordinates: normalizeCoordinates(payload, currentProject),
    pddDocuments: normalizePddDocuments(payload.pddDocuments, currentProject?.pddDocuments || []),
    certification,
    registry,
    vintageYear: ensureFiniteNumber(payload.vintageYear ?? currentProject?.vintageYear ?? new Date().getUTCFullYear(), "vintageYear", { min: 2000 }),
    rating: ensureFiniteNumber(payload.rating ?? currentProject?.rating ?? 4.5, "rating", { min: 0, max: 5 }),
    pricePerCreditUsd: ensureFiniteNumber(
      pickDefined(payload.pricePerCreditUsd, payload.pricePerTonUsd, payload.price, currentProject?.pricePerCreditUsd, 0),
      "pricePerCreditUsd",
      { min: 0 },
    ),
    availableCredits,
    reservedCredits,
    retiredCredits,
    verificationStandard,
    status: shouldAutoMarkSoldOut ? "SOLD_OUT" : requestedStatus,
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
      action: STATUS_CHANGE_ACTION,
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
    const currentBudgetUsd = roundMoney(ensureFiniteNumber(payload.currentBudgetUsd, "currentBudgetUsd", { min: 0 }));
    const requestedBudgetUsd = roundMoney(ensureFiniteNumber(payload.requestedBudgetUsd, "requestedBudgetUsd", { min: 0 }));
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

    const delivery = await sendBudgetIncreaseRequestEmail({
      to: recipients,
      requesterName,
      requesterEmail,
      companyName,
      currentBudgetUsd,
      requestedBudgetUsd,
      remainingBudgetUsd,
      pendingTransactionsUsd,
      reason,
    });

    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      ipAddress: details.ipAddress || null,
      action: "offsetBudget.increase_requested",
      entityType: "MarketplaceBudget",
      entityId: String(companyId || ""),
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
    };
  }

  static async create(payload, companyId, actor = null) {
    const project = await CarbonProject.create({
      ...normalizeProjectPayload(payload),
      companyId,
    });

    this.removeDashboardCache(companyId);
    await AuditService.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "offsetProject.created",
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
    await project.update(normalizeProjectPayload(payload, project));
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
      action: "offsetProject.updated",
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
      registryRecordId: `REG-${new Date().getUTCFullYear()}-${id.replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      blockchainHash: `0x${crypto.createHash("sha256").update(`${id}:${requestedCredits}:${companyId}`).digest("hex").slice(0, 40)}`,
      credits: requestedCredits,
      price: pricePerTonUsd,
      pricePerTonUsd,
      subtotalUsd,
      platformFeeUsd,
      total: totalCostUsd,
      totalCostUsd,
      totalCost: totalCostUsd,
      retiredAt: new Date(),
      metadata: {
        projectName: updatedProject.name,
        verificationStandard: updatedProject.verificationStandard || updatedProject.certification,
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
      action: "offsetProject.purchased",
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
