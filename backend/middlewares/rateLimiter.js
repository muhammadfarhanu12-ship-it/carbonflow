const rateLimit = require("express-rate-limit");

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
    },
  });
}

const apiRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 800,
  message: "Too many requests, please try again later",
});

const authRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: "Too many authentication attempts, please try again later",
});

const resendVerificationRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: "Too many verification email requests, please try again later",
});

const adminAuthRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many admin login attempts, please try again later",
});

const optimizationRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many optimization analysis requests, please try again shortly",
});

const aiOptimizationRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many AI optimization requests, please try again shortly",
});

const importRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many bulk import attempts, please wait before uploading again",
});

const checkoutRateLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many checkout attempts, please wait before trying again",
});

module.exports = {
  apiRateLimiter,
  authRateLimiter,
  resendVerificationRateLimiter,
  adminAuthRateLimiter,
  optimizationRateLimiter,
  aiOptimizationRateLimiter,
  importRateLimiter,
  checkoutRateLimiter,
};
