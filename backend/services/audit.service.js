const { AuditLog } = require("../models");

class AuditService {
  static async log({
    companyId = null,
    userId = null,
    userEmail = null,
    action,
    entityType = null,
    entityId = null,
    ipAddress = null,
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
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
      ...payload,
    });
  }
}

module.exports = AuditService;
