const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const {
  AI_RUNTIME_CONFIG,
  OPTIMIZATION_RECOMMENDATIONS_SCHEMA,
  RECOMMENDATION_KEYS,
  SYSTEM_INSTRUCTION,
} = require("../config/ai.config.ts");

const PROVIDERS = Object.freeze({
  OPENAI: "openai",
  GEMINI: "gemini",
});

let openAIClient = null;
let geminiClient = null;

class AIServiceFallbackError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AIServiceFallbackError";
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new ApiError(400, "carbonLedger must be JSON-serializable", {
      reason: error.message,
    });
  }
}

function validateCarbonLedgerShape(carbonLedger) {
  if (!isPlainObject(carbonLedger)) {
    throw new ApiError(400, "carbonLedger must be a non-null object");
  }

  if ("shipments" in carbonLedger && !Array.isArray(carbonLedger.shipments)) {
    throw new ApiError(400, "carbonLedger.shipments must be an array when provided");
  }

  if ("suppliers" in carbonLedger && !Array.isArray(carbonLedger.suppliers)) {
    throw new ApiError(400, "carbonLedger.suppliers must be an array when provided");
  }

  if ("summary" in carbonLedger && !isPlainObject(carbonLedger.summary)) {
    throw new ApiError(400, "carbonLedger.summary must be an object when provided");
  }
}

function buildLedgerMetrics(carbonLedger) {
  const shipments = Array.isArray(carbonLedger.shipments) ? carbonLedger.shipments : [];
  const suppliers = Array.isArray(carbonLedger.suppliers) ? carbonLedger.suppliers : [];

  const usableShipments = shipments.filter((shipment) => (
    isPlainObject(shipment)
    && isNonEmptyString(shipment.origin)
    && isNonEmptyString(shipment.destination)
    && isNonEmptyString(shipment.transportMode)
    && isPositiveNumber(shipment.emissions)
  )).length;

  const usableSuppliers = suppliers.filter((supplier) => (
    isPlainObject(supplier)
    && isNonEmptyString(supplier.name)
    && isPositiveNumber(supplier.totalEmissions)
    && isPositiveNumber(supplier.emissionIntensity)
  )).length;

  return {
    shipmentsCount: shipments.length,
    suppliersCount: suppliers.length,
    usableShipments,
    usableSuppliers,
    requestSizeBytes: Buffer.byteLength(safeStringify({ carbonLedger }), "utf8"),
  };
}

function hasSufficientLedgerData(metrics) {
  return metrics.usableShipments > 0 || metrics.usableSuppliers >= 2;
}

function resolveProvider(requestedProvider, allowUnconfigured = false) {
  const configuredProvider = String(requestedProvider || AI_RUNTIME_CONFIG.provider || "auto")
    .trim()
    .toLowerCase();
  const hasOpenAI = isNonEmptyString(process.env.OPENAI_API_KEY);
  const hasGemini = isNonEmptyString(process.env.GEMINI_API_KEY) || isNonEmptyString(process.env.GOOGLE_API_KEY);

  if (configuredProvider === PROVIDERS.OPENAI) {
    if (allowUnconfigured) {
      return PROVIDERS.OPENAI;
    }

    if (!hasOpenAI) {
      throw new ApiError(500, "OPENAI_API_KEY is required when AI_PROVIDER=openai");
    }

    return PROVIDERS.OPENAI;
  }

  if (configuredProvider === PROVIDERS.GEMINI) {
    if (allowUnconfigured) {
      return PROVIDERS.GEMINI;
    }

    if (!hasGemini) {
      throw new ApiError(500, "GEMINI_API_KEY or GOOGLE_API_KEY is required when AI_PROVIDER=gemini");
    }

    return PROVIDERS.GEMINI;
  }

  if (hasOpenAI) {
    return PROVIDERS.OPENAI;
  }

  if (hasGemini) {
    return PROVIDERS.GEMINI;
  }

  throw new ApiError(500, "No AI provider is configured for optimization recommendations");
}

function getOpenAIClient() {
  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: AI_RUNTIME_CONFIG.timeoutMs,
      maxRetries: 0,
    });
  }

  return openAIClient;
}

function getGeminiClient() {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    });
  }

  return geminiClient;
}

function buildTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timeoutId),
  };
}

function getOpenAIMessageText(message) {
  if (!message) {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (isPlainObject(part) && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function getGeminiResponseText(response) {
  if (!response) {
    return "";
  }

  if (typeof response.text === "function") {
    return response.text();
  }

  if (typeof response.text === "string") {
    return response.text;
  }

  return "";
}

function isTimeoutError(error) {
  const name = String(error?.name || "");
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  const causeMessage = String(error?.cause?.message || "");

  return name === "AbortError"
    || name === "APIConnectionTimeoutError"
    || name === "APIUserAbortError"
    || code === "ETIMEDOUT"
    || /timed out/i.test(message)
    || /timed out/i.test(causeMessage)
    || /aborted/i.test(message)
    || /aborted/i.test(causeMessage);
}

async function callOpenAIModel(payload, signal, modelOverride) {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: modelOverride || AI_RUNTIME_CONFIG.openaiModel,
    temperature: AI_RUNTIME_CONFIG.temperature,
    seed: AI_RUNTIME_CONFIG.seed,
    max_completion_tokens: AI_RUNTIME_CONFIG.maxOutputTokens,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "carbon_optimization_recommendations",
        strict: true,
        schema: OPTIMIZATION_RECOMMENDATIONS_SCHEMA,
      },
    },
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: payload },
    ],
  }, {
    timeout: AI_RUNTIME_CONFIG.timeoutMs,
    signal,
  });

  return getOpenAIMessageText(completion?.choices?.[0]?.message).trim();
}

async function callGeminiModel(payload, signal, modelOverride) {
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: modelOverride || AI_RUNTIME_CONFIG.geminiModel,
    contents: payload,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: AI_RUNTIME_CONFIG.temperature,
      seed: AI_RUNTIME_CONFIG.seed,
      maxOutputTokens: AI_RUNTIME_CONFIG.maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: OPTIMIZATION_RECOMMENDATIONS_SCHEMA,
    },
    abortSignal: signal,
  });

  return getGeminiResponseText(response).trim();
}

async function invokeConfiguredProvider({ provider, payload, signal, modelOverride }) {
  if (provider === PROVIDERS.OPENAI) {
    return callOpenAIModel(payload, signal, modelOverride);
  }

  if (provider === PROVIDERS.GEMINI) {
    return callGeminiModel(payload, signal, modelOverride);
  }

  throw new ApiError(500, `Unsupported AI provider: ${provider}`);
}

function createFormatError(message, details = {}) {
  return new AIServiceFallbackError("AI_INVALID_FORMAT", message, details);
}

function normalizeRecommendation(entry, index) {
  if (!isPlainObject(entry)) {
    throw createFormatError("AI response items must be objects", { index });
  }

  const keys = Object.keys(entry);
  const hasExactKeys = keys.length === RECOMMENDATION_KEYS.length
    && RECOMMENDATION_KEYS.every((key) => keys.includes(key));

  if (!hasExactKeys) {
    throw createFormatError("AI response schema mismatch", { index, keys });
  }

  if (!isNonEmptyString(entry.issue)) {
    throw createFormatError("Recommendation issue must be a non-empty string", { index });
  }

  if (!isNonEmptyString(entry.recommendation)) {
    throw createFormatError("Recommendation text must be a non-empty string", { index });
  }

  if (!isFiniteNumber(entry.estimatedSavings) || entry.estimatedSavings <= 0) {
    throw createFormatError("estimatedSavings must be a positive number", { index });
  }

  if (entry.unit !== "tCO2e") {
    throw createFormatError("unit must equal tCO2e", { index });
  }

  if (!isFiniteNumber(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
    throw createFormatError("confidence must be a number between 0 and 1", { index });
  }

  if (!Number.isInteger(entry.implementationDifficulty)
    || entry.implementationDifficulty < 1
    || entry.implementationDifficulty > 5) {
    throw createFormatError("implementationDifficulty must be an integer between 1 and 5", { index });
  }

  return {
    issue: entry.issue.trim(),
    recommendation: entry.recommendation.trim(),
    estimatedSavings: Number(entry.estimatedSavings),
    unit: "tCO2e",
    confidence: Number(entry.confidence),
    implementationDifficulty: Number(entry.implementationDifficulty),
  };
}

function parseRecommendations(rawText) {
  if (!isNonEmptyString(rawText)) {
    throw createFormatError("AI returned an empty response");
  }

  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw createFormatError("AI returned invalid JSON", {
      reason: error.message,
      responseLength: rawText.length,
    });
  }

  if (!Array.isArray(parsed)) {
    throw createFormatError("AI response must be an array");
  }

  if (parsed.length > 3) {
    throw createFormatError("AI response exceeded the maximum recommendation count");
  }

  return parsed.map((entry, index) => normalizeRecommendation(entry, index));
}

function toSafeFailureMessage(error) {
  return error?.code || error?.name || "unknown";
}

async function generateOptimizationRecommendations(carbonLedger, runtimeOptions = {}) {
  validateCarbonLedgerShape(carbonLedger);

  const metrics = buildLedgerMetrics(carbonLedger);

  logger.info("ai.optimization.requested", {
    providerPreference: runtimeOptions.provider || AI_RUNTIME_CONFIG.provider,
    requestSizeBytes: metrics.requestSizeBytes,
    shipmentsCount: metrics.shipmentsCount,
    suppliersCount: metrics.suppliersCount,
    usableShipments: metrics.usableShipments,
    usableSuppliers: metrics.usableSuppliers,
  });

  if (!hasSufficientLedgerData(metrics)) {
    logger.warn("ai.optimization.insufficient_data", {
      requestSizeBytes: metrics.requestSizeBytes,
      usableShipments: metrics.usableShipments,
      usableSuppliers: metrics.usableSuppliers,
    });
    return [];
  }

  const provider = resolveProvider(runtimeOptions.provider, Boolean(runtimeOptions.invokeProvider));
  const payload = safeStringify({ carbonLedger });
  const startedAt = Date.now();
  const timeout = buildTimeoutSignal(runtimeOptions.timeoutMs || AI_RUNTIME_CONFIG.timeoutMs);
  const invokeProvider = runtimeOptions.invokeProvider || invokeConfiguredProvider;

  try {
    const rawResponse = await invokeProvider({
      provider,
      payload,
      signal: timeout.signal,
      modelOverride: runtimeOptions.model,
    });
    const recommendations = parseRecommendations(String(rawResponse || "").trim());

    logger.info("ai.optimization.completed", {
      provider,
      latencyMs: Date.now() - startedAt,
      requestSizeBytes: metrics.requestSizeBytes,
      recommendationCount: recommendations.length,
    });

    return recommendations;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    if (error instanceof AIServiceFallbackError) {
      logger.warn("ai.optimization.safe_fallback", {
        provider,
        latencyMs,
        requestSizeBytes: metrics.requestSizeBytes,
        reason: toSafeFailureMessage(error),
        details: error.details,
      });
      return [];
    }

    if (isTimeoutError(error) || timeout.signal.aborted) {
      logger.warn("ai.optimization.timeout_fallback", {
        provider,
        latencyMs,
        requestSizeBytes: metrics.requestSizeBytes,
      });
      return [];
    }

    logger.error("ai.optimization.failed", {
      provider,
      latencyMs,
      requestSizeBytes: metrics.requestSizeBytes,
      reason: error.message,
      code: error.code,
      status: error.status,
    });

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(500, "AI optimization request failed");
  } finally {
    timeout.dispose();
  }
}

function resetClientsForTests() {
  openAIClient = null;
  geminiClient = null;
}

module.exports = {
  generateOptimizationRecommendations,
  __internal: {
    buildLedgerMetrics,
    hasSufficientLedgerData,
    parseRecommendations,
    resetClientsForTests,
    resolveProvider,
    validateCarbonLedgerShape,
  },
};
