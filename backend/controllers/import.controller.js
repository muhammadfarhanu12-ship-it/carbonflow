const ImportService = require("../services/import.service");
const AuditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.importShipments = async (req, res) => {
  const result = await ImportService.importShipments(req.body, req.user.companyId);

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
    },
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: result.summary.failed > 0
      ? "Shipment import completed with partial success"
      : "Shipment import completed successfully",
    data: result,
  });
};
