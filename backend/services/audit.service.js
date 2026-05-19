const { AuditLog } = require("../models");

class AuditService {
  static normalizeLog(log) {
    return {
      id: log._id || log.id,
      companyId: log.companyId || null,
      userId: log.userId || null,
      userEmail: log.userEmail || null,
      action: log.action,
      entityType: log.entityType || null,
      entityId: log.entityId || null,
      ipAddress: log.ipAddress || null,
      userAgent: log.userAgent || null,
      oldValue: log.oldValue || null,
      newValue: log.newValue || null,
      details: log.details || null,
      createdAt: log.createdAt,
    };
  }

  static async log({
    companyId = null,
    userId = null,
    userEmail = null,
    action,
    entityType = null,
    entityId = null,
    ipAddress = null,
    userAgent = null,
    oldValue = null,
    newValue = null,
    details = null,
  } = {}) {
    if (!action) {
      return null;
    }

    try {
      return await AuditLog.create({
        companyId,
        userId,
        userEmail,
        action,
        entityType,
        entityId,
        ipAddress,
        userAgent,
        oldValue,
        newValue,
        details,
      });
    } catch (_error) {
      return null;
    }
  }

  static async logForRequest(req, payload = {}) {
    return this.log({
      companyId: req.user?.companyId || null,
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
      userAgent: req.headers?.["user-agent"] || null,
      ...payload,
    });
  }

  static async list(companyId, query = {}) {
    const filter = { companyId };
    if (query.action) filter.action = String(query.action).trim();
    if (query.entityType) filter.entityType = String(query.entityType).trim();
    if (query.userId) filter.userId = String(query.userId).trim();

    const dateFilter = {};
    if (query.startDate) {
      const startDate = new Date(query.startDate);
      if (!Number.isNaN(startDate.getTime())) dateFilter.$gte = startDate;
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
      if (!Number.isNaN(endDate.getTime())) dateFilter.$lte = endDate;
    }
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;

    const pageSize = Math.min(Math.max(Number(query.pageSize || 50), 1), 100);
    const page = Math.max(Number(query.page || 1), 1);
    const [rows, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      data: rows.map((log) => this.normalizeLog(log)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }
}

module.exports = AuditService;
