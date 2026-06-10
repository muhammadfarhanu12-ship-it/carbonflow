const ImportService = require("../services/import.service");
const AuditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/apiResponse");

function actorFromRequest(req) {
  return {
    ...req.user,
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || null,
    userAgent: req.headers?.["user-agent"] || null,
  };
}

exports.importShipments = async (req, res) => {
  const result = await ImportService.importShipments(req.body, req.user.companyId, actorFromRequest(req));
  const deprecationWarning = "Deprecated endpoint. Use /api/imports/shipment/preview and /api/imports/:id/commit for the governed shipment import workflow.";

  if (result.summary.successful > 0) {
    req.io.emit("shipmentCreated", { count: result.summary.successful });
    req.io.emit("shipmentImportCompleted", result);
  }

  await AuditService.logForRequest(req, {
    action: "shipment.imported",
    entityType: "ShipmentImport",
    entityId: req.body?.metadata?.uploadId || req.body?.metadata?.fileName || "bulk-import",
    details: {
      fileName: req.body?.metadata?.fileName || null,
      source: req.body?.metadata?.source || null,
      totalRows: result.summary.total,
      successful: result.summary.successful,
      failed: result.summary.failed,
      deprecationWarning,
    },
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: result.summary.failed > 0
      ? `Shipment import completed with partial success. ${deprecationWarning}`
      : `Shipment import completed successfully. ${deprecationWarning}`,
    data: {
      ...result,
      deprecationWarning,
    },
  });
};
