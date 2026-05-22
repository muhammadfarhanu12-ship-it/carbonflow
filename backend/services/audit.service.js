const crypto = require("crypto");
const { AuditLog } = require("../models");
const ApiError = require("../utils/ApiError");

const SENSITIVE_KEY_PATTERN = /(password|token|secret|api[-_]?key|apikey|authorization|jwt|refresh|smtp|credential|private[-_]?key|payment[-_]?api|registry[-_]?api)/i;
const RETENTION_YEARS = 7;

function humanize(value) {
  return String(value || "")
    .replace(/[_:.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function inferModule(action = "", entityType = "") {
  const text = `${action} ${entityType}`.toLowerCase();
  if (text.includes("auth") || text.includes("login") || text.includes("password")) return "auth";
  if (text.includes("user") || text.includes("role")) return "user";
  if (text.includes("supplier")) return "supplier";
  if (text.includes("shipment")) return "shipment";
  if (text.includes("emission") || text.includes("factor")) return "emission";
  if (text.includes("ledger")) return "ledger";
  if (text.includes("report")) return "report";
  if (text.includes("marketplace") || text.includes("offset") || text.includes("certificate") || text.includes("budget")) return "marketplace";
  if (text.includes("optimization") || text.includes("recommendation")) return "optimization";
  if (text.includes("admin")) return "admin";
  if (text.includes("setting")) return "settings";
  if (text.includes("import") || text.includes("upload")) return "import";
  return "system";
}

function inferCategory(action = "") {
  const text = String(action).toLowerCase();
  if (text.includes("created")) return "create";
  if (text.includes("updated") || text.includes("changed")) return "update";
  if (text.includes("deleted")) return "delete";
  if (text.includes("archived")) return "archive";
  if (text.includes("approved")) return "approve";
  if (text.includes("rejected")) return "reject";
  if (text.includes("login")) return "login";
  if (text.includes("export")) return "export";
  if (text.includes("download")) return "download";
  if (text.includes("import") || text.includes("upload")) return "import";
  if (text.includes("permission") || text.includes("role")) return "permission";
  if (text.includes("failed") || text.includes("unauthorized")) return "security";
  return "system";
}

function inferSeverity(action = "", status = "success") {
  const text = String(action).toLowerCase();
  if (status === "failed" || text.includes("failed") || text.includes("denied")) return "high";
  if (text.includes("deleted") || text.includes("role") || text.includes("password") || text.includes("secret")) return "critical";
  if (text.includes("approved") || text.includes("rejected") || text.includes("archived") || text.includes("download") || text.includes("export")) return "medium";
  if (text.includes("created") || text.includes("updated")) return "low";
  return "info";
}

function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 6) return "[Truncated]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.entries(value).reduce((accumulator, [key, nested]) => {
    accumulator[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeValue(nested, depth + 1);
    return accumulator;
  }, {});
}

function summarizeChanges(oldValue, newValue) {
  if (!oldValue || !newValue || typeof oldValue !== "object" || typeof newValue !== "object") return [];
  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
  return Array.from(keys).filter((key) => JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])).slice(0, 50);
}

function buildRetentionDate() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + RETENTION_YEARS);
  return date;
}

function buildIntegrityHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify({
    companyId: payload.companyId || null,
    userId: payload.userId || null,
    action: payload.action,
    entityType: payload.entityType || null,
    entityId: payload.entityId || null,
    oldValue: payload.oldValue || null,
    newValue: payload.newValue || null,
    metadata: payload.metadata || payload.details || null,
    createdAt: payload.createdAt || null,
    previousHash: payload.previousHash || null,
  })).digest("hex");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

class AuditService {
  static normalizeLog(log) {
    const action = log.action || "unknown";
    const status = log.status || "success";
    return {
      id: String(log._id || log.id),
      companyId: log.companyId || null,
      userId: log.userId || null,
      userEmail: log.userEmail || null,
      userName: log.userName || null,
      action,
      actionLabel: log.actionLabel || humanize(action),
      entityType: log.entityType || null,
      entityId: log.entityId || null,
      entityLabel: log.entityLabel || null,
      module: log.module || inferModule(action, log.entityType),
      severity: log.severity || inferSeverity(action, status),
      category: log.category || inferCategory(action),
      ipAddress: log.ipAddress || null,
      userAgent: log.userAgent || null,
      requestId: log.requestId || null,
      source: log.source || "web",
      status,
      errorCode: log.errorCode || null,
      oldValue: sanitizeValue(log.oldValue || null),
      newValue: sanitizeValue(log.newValue || null),
      changesSummary: log.changesSummary || summarizeChanges(log.oldValue, log.newValue),
      reason: log.reason || log.details?.reason || null,
      metadata: sanitizeValue(log.metadata || log.details || null),
      details: sanitizeValue(log.details || null),
      retentionUntil: log.retentionUntil || null,
      retentionPolicy: log.retentionPolicy || "standard_7_years",
      integrityHash: log.integrityHash || null,
      previousHash: log.previousHash || null,
      createdAt: log.createdAt,
    };
  }

  static async log(payload = {}) {
    if (!payload.action) return null;
    try {
      const oldValue = sanitizeValue(payload.oldValue || null);
      const newValue = sanitizeValue(payload.newValue || null);
      const metadata = sanitizeValue(payload.metadata || payload.details || null);
      const action = String(payload.action);
      const status = payload.status || "success";
      const previous = await AuditLog.findOne({ companyId: payload.companyId || null }).sort({ createdAt: -1 }).select("integrityHash").lean();
      const record = {
        companyId: payload.companyId || null,
        userId: payload.userId || null,
        userEmail: payload.userEmail || null,
        userName: payload.userName || null,
        action,
        actionLabel: payload.actionLabel || humanize(action),
        entityType: payload.entityType || null,
        entityId: payload.entityId || null,
        entityLabel: payload.entityLabel || null,
        module: payload.module || inferModule(action, payload.entityType),
        severity: payload.severity || inferSeverity(action, status),
        category: payload.category || inferCategory(action),
        ipAddress: payload.ipAddress || null,
        userAgent: payload.userAgent || null,
        requestId: payload.requestId || payload.details?.requestId || null,
        source: payload.source || "web",
        status,
        errorCode: payload.errorCode || null,
        oldValue,
        newValue,
        changesSummary: payload.changesSummary || summarizeChanges(oldValue, newValue),
        reason: payload.reason || payload.details?.reason || null,
        metadata,
        details: metadata,
        retentionUntil: payload.retentionUntil || buildRetentionDate(),
        retentionPolicy: payload.retentionPolicy || "standard_7_years",
        previousHash: previous?.integrityHash || null,
      };
      record.integrityHash = buildIntegrityHash(record);
      return await AuditLog.create(record);
    } catch (_error) {
      return null;
    }
  }

  static async logForRequest(req, payload = {}) {
    return this.log({
      companyId: req.user?.companyId || null,
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      userName: req.user?.name || null,
      ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
      userAgent: req.headers?.["user-agent"] || null,
      requestId: req.headers?.["x-request-id"] || req.headers?.["x-correlation-id"] || null,
      source: req.headers?.["x-admin-client"] ? "admin_panel" : "api",
      ...payload,
    });
  }

  static buildFilter(companyId, query = {}) {
    const filter = { companyId };
    ["action", "module", "entityType", "entityId", "userId", "severity", "category", "status", "source", "requestId"].forEach((field) => {
      if (query[field]) filter[field] = String(query[field]).trim();
    });
    if (query.userEmail) filter.userEmail = new RegExp(escapeRegex(query.userEmail), "i");
    if (query.search) {
      const pattern = new RegExp(escapeRegex(query.search), "i");
      filter.$or = [{ action: pattern }, { actionLabel: pattern }, { entityType: pattern }, { entityId: pattern }, { userEmail: pattern }, { requestId: pattern }];
    }
    const dateFilter = {};
    if (query.startDate) {
      const startDate = new Date(query.startDate);
      if (!Number.isNaN(startDate.getTime())) dateFilter.$gte = startDate;
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      if (!Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
        dateFilter.$lte = endDate;
      }
    }
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;
    return filter;
  }

  static resolveSort(query = {}) {
    const sortBy = String(query.sortBy || "createdAt");
    const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
    const allowed = new Set(["createdAt", "severity", "userEmail", "module", "action"]);
    return { [allowed.has(sortBy) ? sortBy : "createdAt"]: sortOrder };
  }

  static async list(companyId, query = {}) {
    const filter = this.buildFilter(companyId, query);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 50), 1), 100);
    const page = Math.max(Number(query.page || 1), 1);
    const [rows, total] = await Promise.all([
      AuditLog.find(filter).sort(this.resolveSort(query)).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AuditLog.countDocuments(filter),
    ]);
    return {
      data: rows.map((log) => this.normalizeLog(log)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  static async getById(companyId, id) {
    const log = await AuditLog.findOne({ _id: id, companyId }).lean();
    if (!log) throw new ApiError(404, "Audit log not found.");
    return this.normalizeLog(log);
  }

  static async listByEntity(companyId, entityType, entityId, query = {}) {
    return this.list(companyId, { ...query, entityType, entityId });
  }

  static async summary(companyId, query = {}) {
    const filter = this.buildFilter(companyId, query);
    const [total, highCritical, failed, exportsDownloads, permissionSecurity] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.countDocuments({ ...filter, severity: { $in: ["high", "critical"] } }),
      AuditLog.countDocuments({ ...filter, status: "failed" }),
      AuditLog.countDocuments({ ...filter, category: { $in: ["export", "download"] } }),
      AuditLog.countDocuments({ ...filter, category: { $in: ["permission", "security"] } }),
    ]);
    return { totalEvents: total, highCriticalEvents: highCritical, failedActions: failed, exportsDownloads, permissionSecurityEvents: permissionSecurity, eventsInSelectedPeriod: total };
  }

  static async export(companyId, query = {}, actor = null, requestMeta = {}) {
    const format = String(query.format || "csv").toLowerCase();
    if (!["csv", "json"].includes(format)) throw new ApiError(422, "format must be csv or json.");
    const pageSize = Math.min(Math.max(Number(query.limit || 1000), 1), 5000);
    const rows = await AuditLog.find(this.buildFilter(companyId, query)).sort({ createdAt: -1 }).limit(pageSize).lean();
    const data = rows.map((log) => this.normalizeLog(log));
    await this.log({
      companyId,
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action: "audit_log_exported",
      entityType: "AuditLog",
      entityId: companyId,
      module: "admin",
      category: "export",
      severity: "medium",
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      requestId: requestMeta.requestId || null,
      metadata: { format, exportedCount: data.length, filters: sanitizeValue(query) },
    });
    if (format === "json") {
      return { fileName: `audit-logs-${Date.now()}.json`, contentType: "application/json; charset=utf-8", content: JSON.stringify(data, null, 2) };
    }
    const headers = ["createdAt", "severity", "module", "userEmail", "action", "entityType", "entityId", "status", "source", "requestId", "summary"];
    const csv = [headers.map(csvCell).join(","), ...data.map((log) => headers.map((key) => csvCell(key === "summary" ? (log.changesSummary || []).join("; ") : log[key])).join(","))].join("\n");
    return { fileName: `audit-logs-${Date.now()}.csv`, contentType: "text/csv; charset=utf-8", content: csv };
  }
}

module.exports = AuditService;
module.exports.sanitizeValue = sanitizeValue;
module.exports.csvCell = csvCell;
