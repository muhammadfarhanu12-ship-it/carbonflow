const path = require("path");
const env = require("./env");

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const CARBON_CREDITS_CONFIG = Object.freeze({
  idempotencyWindowMs: parseNumber(process.env.CREDITS_IDEMPOTENCY_WINDOW_MS, 10 * 60 * 1000),
  checkoutLockDurationMs: parseNumber(process.env.CREDITS_CHECKOUT_LOCK_DURATION_MS, 5 * 60 * 1000),
  checkoutLockCleanupIntervalMs: parseNumber(process.env.CREDITS_CHECKOUT_LOCK_CLEANUP_INTERVAL_MS, 30 * 1000),
  processingLockTimeoutMs: parseNumber(process.env.CREDITS_PROCESSING_LOCK_TIMEOUT_MS, 60 * 1000),
  certificateStorageDir: process.env.CERTIFICATE_STORAGE_DIR
    ? path.resolve(process.env.CERTIFICATE_STORAGE_DIR)
    : path.resolve(__dirname, "..", "storage", "certificates"),
  certificateDownloadBaseUrl: `${env.baseUrl}/api/credits`,
});

module.exports = {
  CARBON_CREDITS_CONFIG,
};
