const ShipmentEmissionsService = require("../services/shipmentEmissions.service");
const EmissionRecordService = require("../services/emissionRecord.service");
const EmissionFactorService = require("../services/emissionFactor.service");
const EmissionImportService = require("../services/emissionImport.service");
const AuditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/apiResponse");

function actorFromRequest(req) {
  return {
    ...req.user,
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

exports.calculateShipmentEmissions = async (req, res) => {
  const data = await ShipmentEmissionsService.buildShipmentEmissionsReport(req.body);

  return res.status(200).json({
    success: true,
    data,
  });
};

exports.listActivities = async (req, res) => sendSuccess(res, {
  message: "Emission activities fetched successfully",
  data: await EmissionRecordService.list(req.user.companyId, req.query),
});

exports.createActivity = async (req, res) => {
  const record = await EmissionRecordService.createActivity(req.user.companyId, req.body, actorFromRequest(req));
  req.io.emit("emissionActivityCreated", record);
  req.io.emit("ledgerUpdated", record);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Emission activity calculated and recorded successfully",
    data: record,
  });
};

exports.listFactors = async (req, res) => sendSuccess(res, {
  message: "Emission factors fetched successfully",
  data: await EmissionFactorService.listForCompany(req.user.companyId, req.query),
});

exports.getFactor = async (req, res) => sendSuccess(res, {
  message: "Emission factor fetched successfully",
  data: await EmissionFactorService.getForCompany(req.params.id, req.user.companyId),
});

exports.createFactor = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Company custom emission factor created successfully",
  data: await EmissionFactorService.createCompanyCustom(req.body, req.user.companyId, actorFromRequest(req)),
});

exports.updateFactor = async (req, res) => sendSuccess(res, {
  message: "Company custom emission factor updated successfully",
  data: await EmissionFactorService.updateCompanyCustom(req.params.id, req.body, req.user.companyId, actorFromRequest(req)),
});

exports.deactivateFactor = async (req, res) => sendSuccess(res, {
  message: "Company custom emission factor deactivated successfully",
  data: await EmissionFactorService.deactivateCompanyCustom(req.params.id, req.user.companyId, actorFromRequest(req)),
});

exports.reactivateFactor = async (req, res) => sendSuccess(res, {
  message: "Company custom emission factor reactivated successfully",
  data: await EmissionFactorService.reactivateCompanyCustom(req.params.id, req.user.companyId, actorFromRequest(req)),
});

exports.previewFactorImport = async (req, res) => sendSuccess(res, {
  message: "Emission factor import preview generated successfully",
  data: await EmissionFactorService.previewCompanyImport(req.body.csv, { ...actorFromRequest(req), companyId: req.user.companyId }),
});

exports.commitFactorImport = async (req, res) => sendSuccess(res, {
  statusCode: 201,
  message: "Emission factor import saved successfully",
  data: await EmissionFactorService.commitImport(req.body.csv, { ...actorFromRequest(req), companyId: req.user.companyId }),
});

exports.matchFactor = async (req, res) => sendSuccess(res, {
  message: "Emission factor match fetched successfully",
  data: await EmissionRecordService.resolveActivityFactor({
    ...req.query,
    companyId: req.user.companyId,
  }),
});

exports.updateStatus = async (req, res) => {
  const record = await EmissionRecordService.updateStatus(req.user.companyId, req.params.id, req.body.dataStatus, actorFromRequest(req), req.body.notes);
  req.io.emit("emissionRecordStatusChanged", record);
  req.io.emit("ledgerUpdated", record);

  return sendSuccess(res, {
    message: "Emission record status updated successfully",
    data: record,
  });
};

exports.updateActivity = async (req, res) => {
  const record = await EmissionRecordService.updateActivity(req.user.companyId, req.params.id, req.body, actorFromRequest(req));
  req.io.emit("emissionActivityUpdated", record);
  req.io.emit("ledgerUpdated", record);
  return sendSuccess(res, {
    message: "Emission record updated successfully",
    data: record,
  });
};

exports.recalculateRecord = async (req, res) => {
  const record = await EmissionRecordService.recalculate(req.user.companyId, req.params.id, actorFromRequest(req), req.body?.reason || req.body?.editReason || null);
  req.io.emit("emissionRecordStatusChanged", record);
  req.io.emit("ledgerUpdated", record);
  return sendSuccess(res, {
    message: "Emission record recalculated successfully",
    data: record,
  });
};

exports.auditTimeline = async (req, res) => sendSuccess(res, {
  message: "Emission record audit timeline fetched successfully",
  data: await EmissionRecordService.getAuditTimeline(req.user.companyId, req.params.id, actorFromRequest(req)),
});

exports.previewImport = async (req, res) => {
  const result = await EmissionImportService.preview(req.body.csv, req.user.companyId);
  await AuditService.logForRequest(req, {
    action: "csv_import_previewed",
    entityType: "EmissionRecord",
    details: {
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
    },
  });

  return sendSuccess(res, {
    message: "Emission activity import preview generated successfully",
    data: result,
  });
};

exports.commitImport = async (req, res) => {
  const result = await EmissionImportService.commit(req.body.csv, req.user.companyId, actorFromRequest(req));
  await AuditService.logForRequest(req, {
    action: "csv_import_committed",
    entityType: "EmissionRecord",
    details: {
      totalRows: result.totalRows,
      createdCount: result.createdCount,
      invalidRows: result.invalidRows,
    },
  });
  req.io.emit("emissionActivityCreated", result);
  req.io.emit("ledgerUpdated", result);
  return sendSuccess(res, {
    statusCode: 201,
    message: "Emission activity import saved successfully",
    data: result,
  });
};

exports.downloadTemplate = async (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"emission-activity-template.csv\"");
  return res.send(EmissionImportService.getTemplate());
};
