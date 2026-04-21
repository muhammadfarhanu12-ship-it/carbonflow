const ApiError = require("../utils/ApiError");
const { SUPPLIER_SCORING_CONFIG, resolveIndustryBaseline } = require("../config/supplierScoring");

const scoreCache = new Map();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cloneResult(value) {
  return JSON.parse(JSON.stringify(value));
}

function clearExpiredCache() {
  const now = Date.now();

  for (const [key, entry] of scoreCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      scoreCache.delete(key);
    }
  }
}

function buildCacheKey(normalizedSupplier) {
  return JSON.stringify({
    version: SUPPLIER_SCORING_CONFIG.version,
    id: normalizedSupplier.id,
    name: normalizedSupplier.name,
    totalEmissions: normalizedSupplier.totalEmissions,
    revenue: normalizedSupplier.revenue,
    providedIntensity: normalizedSupplier.providedIntensity,
    hasISO14001: normalizedSupplier.hasISO14001,
    hasSBTi: normalizedSupplier.hasSBTi,
    dataTransparencyScore: normalizedSupplier.dataTransparencyScore,
    lastReportedAt: normalizedSupplier.lastReportedAt?.toISOString() || null,
    industry: normalizedSupplier.industry,
    category: normalizedSupplier.category,
  });
}

function interpolatePercentile(ratio) {
  const anchors = SUPPLIER_SCORING_CONFIG.emissionNormalization.percentileAnchors;

  if (ratio <= anchors[0].ratio) {
    return anchors[0].percentile;
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const current = anchors[index];

    if (ratio <= current.ratio) {
      const span = current.ratio - previous.ratio || 1;
      const progress = (ratio - previous.ratio) / span;
      return round(previous.percentile + ((current.percentile - previous.percentile) * progress), 2);
    }
  }

  return anchors[anchors.length - 1].percentile;
}

function classifyRiskLevel(totalScore) {
  if (totalScore < SUPPLIER_SCORING_CONFIG.riskThresholds.high) {
    return "HIGH";
  }

  if (totalScore <= SUPPLIER_SCORING_CONFIG.riskThresholds.medium) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildInsight(type, message) {
  return { type, message };
}

function dedupeInsights(insights) {
  const seen = new Set();
  const deduped = [];

  for (const insight of insights) {
    const key = `${insight.type}:${insight.message}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(insight);
    }
  }

  return deduped;
}

function normalizeSupplierInput(supplier = {}) {
  return {
    id: String(supplier.id || supplier._id || ""),
    name: String(supplier.name || "").trim(),
    totalEmissions: toFiniteNumber(supplier.totalEmissions),
    revenue: toFiniteNumber(supplier.revenue),
    providedIntensity: toFiniteNumber(supplier.emissionIntensity ?? supplier.emissionFactor),
    hasISO14001: Boolean(supplier.hasISO14001),
    hasSBTi: Boolean(supplier.hasSBTi),
    dataTransparencyScore: clamp(
      toFiniteNumber(supplier.dataTransparencyScore ?? supplier.complianceScore) ?? 0,
      0,
      100,
    ),
    lastReportedAt: toDate(supplier.lastReportedAt),
    createdAt: toDate(supplier.createdAt) || new Date(),
    updatedAt: toDate(supplier.updatedAt) || new Date(),
    industry: String(supplier.industry || "").trim(),
    category: String(supplier.category || "").trim(),
  };
}

function resolveEmissionIntensity(normalizedSupplier, insights) {
  const { totalEmissions, revenue, providedIntensity } = normalizedSupplier;
  let computedIntensity = null;

  if (totalEmissions !== null && revenue !== null) {
    if (revenue > 0) {
      computedIntensity = totalEmissions / revenue;
    } else {
      insights.push(buildInsight("warning", "Revenue is zero, so emission intensity could not be computed from emissions and revenue."));
    }
  }

  if (providedIntensity !== null && computedIntensity !== null) {
    const denominator = Math.max(Math.abs(computedIntensity), 0.000001);
    const deviationPct = Math.abs(providedIntensity - computedIntensity) / denominator * 100;

    if (deviationPct > SUPPLIER_SCORING_CONFIG.emissionNormalization.mismatchTolerancePct) {
      insights.push(buildInsight(
        "warning",
        `Provided emission intensity differs from the calculated value by ${round(deviationPct, 1)}%. The engine used emissions divided by revenue as the auditable baseline.`,
      ));
    }

    return {
      emissionIntensity: computedIntensity,
      computedIntensity,
      source: "computed",
    };
  }

  if (computedIntensity !== null) {
    return {
      emissionIntensity: computedIntensity,
      computedIntensity,
      source: "computed",
    };
  }

  if (providedIntensity !== null) {
    if (totalEmissions === null) {
      insights.push(buildInsight("info", "Using provided emission intensity because total emissions were not supplied."));
    } else {
      insights.push(buildInsight("info", "Using provided emission intensity because revenue or activity denominator was not supplied."));
    }

    return {
      emissionIntensity: providedIntensity,
      computedIntensity: null,
      source: "provided",
    };
  }

  if (totalEmissions === null) {
    insights.push(buildInsight("warning", "Missing emission data; emission intensity could not be calculated."));
  } else {
    insights.push(buildInsight("warning", "Emission intensity is unavailable because revenue or another denominator is missing."));
  }

  return {
    emissionIntensity: null,
    computedIntensity: null,
    source: "unavailable",
  };
}

function calculateEmissionComponent(emissionIntensity, baseline, insights) {
  if (emissionIntensity === null) {
    return {
      weightedScore: 0,
      percentileRank: null,
      industryComparison: "UNKNOWN",
      isAboveIndustryAverage: null,
      variancePct: null,
    };
  }

  const minimum = baseline.averageIntensity * SUPPLIER_SCORING_CONFIG.emissionNormalization.minMultiplier;
  const maximum = baseline.averageIntensity * SUPPLIER_SCORING_CONFIG.emissionNormalization.maxMultiplier;
  const boundedIntensity = clamp(emissionIntensity, minimum, maximum);
  const rawScore = 100 - (((boundedIntensity - minimum) / (maximum - minimum || 1)) * 100);
  const weightedScore = rawScore * SUPPLIER_SCORING_CONFIG.weights.emissionIntensity;
  const variancePct = ((emissionIntensity - baseline.averageIntensity) / baseline.averageIntensity) * 100;
  const percentileRank = interpolatePercentile(emissionIntensity / baseline.averageIntensity);
  const tolerancePct = SUPPLIER_SCORING_CONFIG.emissionNormalization.atAverageTolerancePct;

  let industryComparison = "AT_AVERAGE";
  let isAboveIndustryAverage = null;

  if (Math.abs(variancePct) > tolerancePct) {
    if (variancePct > 0) {
      industryComparison = "ABOVE_AVERAGE";
      isAboveIndustryAverage = true;
      insights.push(buildInsight("warning", "High emission intensity compared to the industry baseline."));
    } else {
      industryComparison = "BELOW_AVERAGE";
      isAboveIndustryAverage = false;
      insights.push(buildInsight("info", "Emission intensity is below the industry average baseline."));
    }
  } else {
    insights.push(buildInsight("info", "Emission intensity is broadly aligned with the industry average."));
  }

  return {
    weightedScore: round(weightedScore, 2),
    percentileRank,
    industryComparison,
    isAboveIndustryAverage,
    variancePct: round(variancePct, 2),
  };
}

function calculateCertificationComponent(normalizedSupplier, insights) {
  let score = 0;

  if (normalizedSupplier.hasISO14001) {
    score += SUPPLIER_SCORING_CONFIG.certificationPoints.iso14001;
  } else {
    insights.push(buildInsight("warning", "Missing ISO 14001 certification."));
  }

  if (normalizedSupplier.hasSBTi) {
    score += SUPPLIER_SCORING_CONFIG.certificationPoints.sbti;
  } else {
    insights.push(buildInsight("warning", "Missing SBTi commitment."));
  }

  if (score === 30) {
    insights.push(buildInsight("info", "Supplier has both ISO 14001 and an SBTi commitment."));
  }

  return round(score, 2);
}

function calculateTransparencyComponent(normalizedSupplier, insights) {
  const weightedScore = normalizedSupplier.dataTransparencyScore * SUPPLIER_SCORING_CONFIG.weights.dataTransparency;

  if (normalizedSupplier.dataTransparencyScore < 50) {
    insights.push(buildInsight("warning", "Low data transparency score limits confidence in the supplier disclosure."));
  } else if (normalizedSupplier.dataTransparencyScore >= 80) {
    insights.push(buildInsight("info", "High data transparency strengthens the reliability of the supplier disclosure."));
  }

  return round(weightedScore, 2);
}

function addFreshnessInsights(normalizedSupplier, insights) {
  if (!normalizedSupplier.lastReportedAt) {
    insights.push(buildInsight("warning", "No supplier reporting date is available, which weakens ESG data freshness."));
    return;
  }

  const daysSinceReport = Math.max(
    (Date.now() - normalizedSupplier.lastReportedAt.getTime()) / (1000 * 60 * 60 * 24),
    0,
  );

  if (daysSinceReport > SUPPLIER_SCORING_CONFIG.freshnessWindowsDays.stale) {
    insights.push(buildInsight("warning", `Supplier data is stale: last reported ${Math.floor(daysSinceReport)} days ago.`));
    return;
  }

  if (daysSinceReport <= SUPPLIER_SCORING_CONFIG.freshnessWindowsDays.recent) {
    insights.push(buildInsight("info", `Supplier data was reported within the last ${Math.floor(daysSinceReport)} days.`));
  }
}

function calculateSupplierScore(supplier = {}) {
  clearExpiredCache();

  const normalizedSupplier = normalizeSupplierInput(supplier);
  const cacheKey = buildCacheKey(normalizedSupplier);
  const cached = scoreCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cloneResult(cached.result);
  }

  const insights = [];
  const baseline = resolveIndustryBaseline(
    supplier.industry,
    supplier.category,
    normalizedSupplier.industry,
    normalizedSupplier.category,
  );

  addFreshnessInsights(normalizedSupplier, insights);

  const intensityResolution = resolveEmissionIntensity(normalizedSupplier, insights);
  const emissionComponent = calculateEmissionComponent(intensityResolution.emissionIntensity, baseline, insights);
  const certificationScore = calculateCertificationComponent(normalizedSupplier, insights);
  const transparencyScore = calculateTransparencyComponent(normalizedSupplier, insights);
  const totalScore = round(clamp(
    emissionComponent.weightedScore + certificationScore + transparencyScore,
    0,
    100,
  ), 2);

  const result = {
    supplierId: normalizedSupplier.id || null,
    supplierName: normalizedSupplier.name,
    totalScore,
    riskLevel: classifyRiskLevel(totalScore),
    riskTrend: null,
    emissionIntensity: intensityResolution.emissionIntensity === null
      ? null
      : round(intensityResolution.emissionIntensity, 6),
    intensitySource: intensityResolution.source,
    breakdown: {
      emissionScore: emissionComponent.weightedScore,
      certificationScore,
      transparencyScore,
    },
    benchmark: {
      industryKey: baseline.key,
      industryLabel: baseline.label,
      industryAverageIntensity: round(baseline.averageIntensity, 4),
      percentileRank: emissionComponent.percentileRank,
      industryComparison: emissionComponent.industryComparison,
      isAboveIndustryAverage: emissionComponent.isAboveIndustryAverage,
      variancePct: emissionComponent.variancePct,
    },
    insights: dedupeInsights(insights),
    calculatedAt: new Date().toISOString(),
  };

  scoreCache.set(cacheKey, {
    expiresAt: Date.now() + SUPPLIER_SCORING_CONFIG.bulkProcessing.cacheTtlMs,
    result,
  });

  return cloneResult(result);
}

function toRiskScore(totalScore) {
  return round(100 - clamp(totalScore, 0, 100), 2);
}

function buildPersistedScoreFields(supplier = {}) {
  const normalizedSupplier = normalizeSupplierInput(supplier);
  const scoreResult = calculateSupplierScore({
    ...supplier,
    emissionIntensity: normalizedSupplier.providedIntensity,
    revenue: normalizedSupplier.revenue,
    dataTransparencyScore: normalizedSupplier.dataTransparencyScore,
  });

  return {
    revenue: normalizedSupplier.revenue,
    hasISO14001: normalizedSupplier.hasISO14001,
    hasSBTi: normalizedSupplier.hasSBTi,
    dataTransparencyScore: normalizedSupplier.dataTransparencyScore,
    lastReportedAt: normalizedSupplier.lastReportedAt,
    emissionIntensity: scoreResult.emissionIntensity ?? normalizedSupplier.providedIntensity ?? 0,
    carbonScore: scoreResult.totalScore,
    esgScore: scoreResult.totalScore,
    riskScore: toRiskScore(scoreResult.totalScore),
    riskLevel: scoreResult.riskLevel,
    supplierScoreBreakdown: scoreResult.breakdown,
    supplierScoreInsights: scoreResult.insights,
    supplierBenchmark: scoreResult.benchmark,
    riskTrend: scoreResult.riskTrend,
    scoreCalculatedAt: new Date(scoreResult.calculatedAt),
    scoreVersion: SUPPLIER_SCORING_CONFIG.version,
  };
}

async function calculateSupplierScoresBulk(suppliers = []) {
  if (!Array.isArray(suppliers)) {
    throw new ApiError(422, "Bulk scoring payload must be an array of suppliers.");
  }

  if (suppliers.length > SUPPLIER_SCORING_CONFIG.bulkProcessing.maxSuppliers) {
    throw new ApiError(
      422,
      `Bulk scoring supports up to ${SUPPLIER_SCORING_CONFIG.bulkProcessing.maxSuppliers} suppliers per request.`,
    );
  }

  const results = [];
  const chunkSize = SUPPLIER_SCORING_CONFIG.bulkProcessing.chunkSize;

  for (let index = 0; index < suppliers.length; index += chunkSize) {
    const chunk = suppliers.slice(index, index + chunkSize);

    for (const supplier of chunk) {
      results.push(calculateSupplierScore(supplier));
    }

    if (index + chunkSize < suppliers.length) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  const distribution = results.reduce((accumulator, item) => {
    accumulator[item.riskLevel] += 1;
    return accumulator;
  }, {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  });

  const avgScore = results.length
    ? round(results.reduce((sum, item) => sum + item.totalScore, 0) / results.length, 2)
    : 0;

  return {
    suppliers: results,
    stats: {
      avgScore,
      highRiskCount: distribution.HIGH,
      distribution,
    },
  };
}

module.exports = {
  calculateSupplierScore,
  calculateSupplierScoresBulk,
  buildPersistedScoreFields,
  normalizeSupplierInput,
  toRiskScore,
};
