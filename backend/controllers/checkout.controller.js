const TransactionService = require("../services/transaction.service");
const { sendSuccess } = require("../utils/apiResponse");

function getRequestIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || null;
}

exports.start = async (req, res) => {
  const result = await TransactionService.startCheckout(
    req.body,
    req.user.companyId,
    req.user,
    {
      idempotencyKey: req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body.idempotencyKey || null,
      ipAddress: getRequestIp(req),
    },
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: "Checkout reservation created successfully",
    data: result,
  });
};

exports.complete = async (req, res) => {
  const transaction = await TransactionService.finalizeTransaction(
    req.body.transactionId,
    req.user.companyId,
    req.user,
    {
      ipAddress: getRequestIp(req),
    },
  );

  return sendSuccess(res, {
    message: "Checkout completed successfully",
    data: transaction,
  });
};
