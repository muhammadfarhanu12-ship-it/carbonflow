const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const TransactionService = require("../services/transaction.service");
const DocumentStorageService = require("../services/documentStorage.service");
const { sendSuccess } = require("../utils/apiResponse");

exports.checkout = async (req, res) => {
  const result = await TransactionService.processCarbonCreditCheckout(
    req.body,
    req.user.companyId,
    req.user,
    {
      idempotencyKey: req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body.idempotencyKey || null,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    },
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: "Carbon credit checkout created successfully",
    data: result,
  });
};

exports.getById = async (req, res) => {
  const transaction = await TransactionService.getTransactionById(
    req.params.id,
    req.user.companyId,
    req.user,
    {
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
    },
  );

  return sendSuccess(res, {
    message: "Carbon credit transaction fetched successfully",
    data: transaction,
  });
};

async function getCertificateById(req, res) {
  const { id } = req.params;

  logger.info("credits.certificate.download.requested", {
    path: req.originalUrl,
    transactionId: id || null,
    companyId: req.user?.companyId || null,
  });

  if (!id || !String(id).trim()) {
    throw new ApiError(400, "Certificate id is required.");
  }

  let file;
  try {
    file = await TransactionService.getCertificateDownload(
      id,
      req.user.companyId,
      req.user,
      {
        ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
      },
    );
  } catch (error) {
    if (error?.statusCode === 404) {
      throw new ApiError(404, "Certificate not found");
    }

    throw error;
  }

  if (!file?.storagePath) {
    throw new ApiError(404, "Certificate not found");
  }

  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName || `certificate-${id}.pdf`}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const stream = DocumentStorageService.createReadStream(file.storagePath);
  stream.on("error", (error) => {
    res.destroy(error);
  });
  return stream.pipe(res);
}

exports.getCertificateById = getCertificateById;
exports.downloadCertificate = getCertificateById;
