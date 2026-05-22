function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function parseString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function getOptimizationAiConfig() {
  const enabled = parseBoolean(process.env.AI_ENABLED, false);
  const provider = parseString(process.env.AI_PROVIDER, "");
  const model = parseString(process.env.AI_MODEL, "");
  const hasApiKey = Boolean(parseString(process.env.AI_API_KEY, ""));
  const dataRetentionMode = parseString(process.env.AI_DATA_RETENTION_MODE, "none");
  const redactSensitiveData = parseBoolean(process.env.AI_REDACT_SENSITIVE_DATA, true);

  return {
    enabled: enabled && Boolean(provider) && hasApiKey,
    configured: Boolean(provider) && hasApiKey,
    provider,
    model,
    dataRetentionMode,
    redactSensitiveData,
    mode: enabled && Boolean(provider) && hasApiKey ? "ai_assisted" : "rule_based",
  };
}

function redactOptimizationPayload(payload = {}) {
  return {
    question: payload.question || payload.query || null,
    recommendationCount: Array.isArray(payload.recommendations) ? payload.recommendations.length : 0,
    analysisMode: payload.analysisMode || "rule_based",
  };
}

module.exports = {
  getOptimizationAiConfig,
  redactOptimizationPayload,
};
