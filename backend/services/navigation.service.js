const { EmissionRecord, AuditLog, Report } = require("../models");
const ApprovalsService = require("./approvals.service");

class NavigationService {
  static async summary(companyId) {
    const [approvals, failedImports, missingFactors, criticalAuditEvents, failedReports] = await Promise.all([
      ApprovalsService.summary(companyId),
      AuditLog.countDocuments({ companyId, action: { $in: ["import_failed", "import_committed"] }, "details.status": { $in: ["failed", "partially_failed"] } }),
      EmissionRecord.countDocuments({ companyId, dataStatus: { $ne: "archived" }, $or: [{ calculationStatus: "missing_factor" }, { factorValue: null }, { factorValue: 0 }, { factorUnit: null }] }),
      AuditLog.countDocuments({ companyId, severity: { $in: ["high", "critical"] } }),
      Report.countDocuments({ companyId, status: { $in: ["failed", "FAILED"] } }),
    ]);
    return {
      pendingApprovals: approvals.totalPending || 0,
      failedImports,
      missingFactors,
      criticalAuditEvents,
      failedReports,
    };
  }
}

module.exports = NavigationService;
