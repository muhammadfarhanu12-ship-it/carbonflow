const UploadService = require("../services/upload.service");
const { sendSuccess } = require("../utils/apiResponse");
const AuditService = require("../services/audit.service");

exports.upload = async (req, res) => {
  if (!req.file) {
    const error = new Error("A CSV or Excel file is required");
    error.statusCode = 400;
    throw error;
  }

  const result = await UploadService.processFile(req.file, req.user.companyId);
  if (result.createdShipments.length > 0) {
    req.io.emit("uploadProcessed", result);
    req.io.emit("shipmentCreated", { count: result.createdCount });
  }

  await AuditService.logForRequest(req, {
    action: "upload.processed",
    entityType: "Upload",
    entityId: req.file.originalname,
    details: {
      fileName: req.file.originalname,
      createdCount: result.createdCount,
      errorCount: result.errorCount,
    },
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: "File uploaded successfully",
    data: result,
  });
};
