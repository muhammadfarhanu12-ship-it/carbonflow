const ApiError = require("../utils/ApiError");
const { sendError } = require("../utils/apiResponse");
const logger = require("../utils/logger");

function normalizeError(error) {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      errors: error.details || undefined,
    };
  }

  if (error.name === "ValidationError") {
    return {
      statusCode: 422,
      message: "Validation failed",
      errors: Object.values(error.errors || {}).map((item) => ({
        field: item.path,
        message: item.message,
      })),
    };
  }

  if (error.name === "CastError") {
    return {
      statusCode: 400,
      message: `Invalid ${error.path}`,
    };
  }

  if (error.code === 11000) {
    return {
      statusCode: 409,
      message: "A record with that value already exists",
      errors: error.keyValue || undefined,
    };
  }

  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    return {
      statusCode: 401,
      message: "Authentication token is invalid or expired",
    };
  }

  return {
    statusCode: error.statusCode || error.status || 500,
    message: error.message || "Internal server error",
    errors: error.errors || error.details || undefined,
  };
}

function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(error, req, res, _next) {
  const normalized = normalizeError(error);

  logger.error(normalized.message, {
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    stack: error.stack,
  });

  return sendError(res, {
    statusCode: normalized.statusCode,
    message: normalized.message,
    errors: normalized.errors,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
