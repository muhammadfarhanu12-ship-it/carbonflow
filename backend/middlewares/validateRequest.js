const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

function validateRequest(req, _res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  return next(new ApiError(422, "Validation failed", result.array()));
}

module.exports = validateRequest;
