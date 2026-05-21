const ApiError = require("../utils/ApiError");
const env = require("../config/env");

function requireCronSecret(req, _res, next) {
  const providedSecret = req.headers["x-cron-secret"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!env.cronSecret) {
    return next(new ApiError(503, "CRON_SECRET is not configured."));
  }

  if (providedSecret !== env.cronSecret) {
    return next(new ApiError(401, "Invalid cron secret."));
  }

  return next();
}

module.exports = {
  requireCronSecret,
};
