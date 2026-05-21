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
    region: normalizedSupplier.region,
    country: normalizedSupplier.country,
    complianceScore: normalizedSupplier.complianceScore,
    verificationStatus: normalizedSupplier.verificationStatus,
    invitationStatus: normalizedSupplier.invitationStatus,
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
  if (totalScore < SUPPLIER_SCORING_CONFIG.riskThresholds.critical) {
    return "CRITICAL";
  }

  if (totalScore < SUPPLIER_SCORING_CONFIG.riskThresholds.high) {
    return "HIGH";
  }

  if (totalScore < SUPPLIER_SCORING_CONFIG.riskThresholds.medium) {
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
    region: String(supplier.region || "GLOBAL").trim(),
    country: String(supplier.country || "").trim(),
    complianceScore: clamp(toFiniteNumber(supplier.complianceScore) ?? 0, 0, 100),
    verificationStatus: String(supplier.verificationStatus || "pending").trim().toLowerCase(),
    invitationStatus: String(supplier.invitationStatus || "not_sent").trim().toLowerCase(),
    questionnaireStatus: String(supplier.questionnaireStatus || supplier.invitationStatus || "not_sent").trim().toLowerCase(),
    evidenceSummary: supplier.evidenceSummary || null,
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
      rawScore: 0,
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
    rawScore: round(rawScore, 2),
    weightedScore: round(weightedScore, 2),
    percentileRank,
    industryComparison,
    isAboveIndustryAverage,
    variancePct: round(variancePct, 2),
  };
}

function calculateCertificationComponent(normalizedSupplier, insights) {
  let score = 0;
  const evidence = normalizedSupplier.evidenceSummary;
  const hasVerifiedISO14001 = normalizedSupplier.hasISO14001 || Boolean(evidence?.hasVerifiedISO14001);
  const hasVerifiedSBTi = normalizedSupplier.hasSBTi || Boolean(evidence?.hasVerifiedSBTi);

  if (hasVerifiedISO14001) {
    score += SUPPLIER_SCORING_CONFIG.certificationPoints.iso14001;
  } else {
    insights.push(buildInsight("warning", "Missing ISO 14001 certification."));
  }

  if (hasVerifiedSBTi) {
    score += SUPPLIER_SCORING_CONFIG.certificationPoints.sbti;
  } else {
    insights.push(buildInsight("warning", "Missing SBTi commitment."));
  }

  if (evidence?.hasExpiredEvidence) {
    score -= 20;
    insights.push(buildInsight("warning", "One or more supplier evidence documents are expired."));
  }

  if (score >= 100) {
    insights.push(buildInsight("info", "Supplier has verified ISO 14001 and an SBTi commitment."));
  }

  return {
    rawScore: round(clamp(score, 0, 100), 2),
    weightedScore: round(clamp(score, 0, 100) * SUPPLIER_SCORING_CONFIG.weights.certifications, 2),
  };
}

function calculateTransparencyComponent(normalizedSupplier, insights) {
  const weightedScore = normalizedSupplier.dataTransparencyScore * SUPPLIER_SCORING_CONFIG.weights.dataTransparency;

  if (normalizedSupplier.dataTransparencyScore < 50) {
    insights.push(buildInsight("warning", "Low data transparency score limits confidence in the supplier disclosure."));
  } else if (normalizedSupplier.dataTransparencyScore >= 80) {
    insights.push(buildInsight("info", "High data transparency strengthens the reliability of the supplier disclosure."));
  }

  return {
    rawScore: round(normalizedSupplier.dataTransparencyScore, 2),
    weightedScore: round(weightedScore, 2),
  };
}

function calculateFreshnessComponent(normalizedSupplier, insights) {
  if (!normalizedSupplier.lastReportedAt) {
    insights.push(buildInsight("warning", "No supplier reporting date is available, which weakens ESG data freshness."));
    return { rawScore: 0, weightedScore: 0, daysSinceReport: null };
  }

  const daysSinceReport = Math.max(
    (Date.now() - normalizedSupplier.lastReportedAt.getTime()) / (1000 * 60 * 60 * 24),
    0,
  );

  if (daysSinceReport > SUPPLIER_SCORING_CONFIG.freshnessWindowsDays.stale) {
    insights.push(buildInsight("warning", `Supplier data is stale: last reported ${Math.floor(daysSinceReport)} days ago.`));
    return { rawScore: 35, weightedScore: 35 * SUPPLIER_SCORING_CONFIG.weights.reportingFreshness, daysSinceReport: Math.floor(daysSinceReport) };
  }

  if (daysSinceReport <= SUPPLIER_SCORING_CONFIG.freshnessWindowsDays.recent) {
    insights.push(buildInsight("info", `Supplier data was reported within the last ${Math.floor(daysSinceReport)} days.`));
    return { rawScore: 100, weightedScore: 100 * SUPPLIER_SCORING_CONFIG.weights.reportingFreshness, daysSinceReport: Math.floor(daysSinceReport) };
  }

  return { rawScore: 70, weightedScore: 70 * SUPPLIER_SCORING_CONFIG.weights.reportingFreshness, daysSinceReport: Math.floor(daysSinceReport) };
}

function calculateComplianceComponent(normalizedSupplier, insights) {
  let verificationScore = 40;
  const evidence = normalizedSupplier.evidenceSummary;

  if (["third_party_verified", "verified"].includes(normalizedSupplier.verificationStatus)) verificationScore = 100;
  if (normalizedSupplier.verificationStatus === "self_reported") verificationScore = 70;
  if (["pending", "action_required"].includes(normalizedSupplier.verificationStatus)) verificationScore = 45;
  if (["expired", "rejected"].includes(normalizedSupplier.verificationStatus)) verificationScore = 0;
  if (evidence?.hasVerifiedGHGInventory) verificationScore = Math.max(verificationScore, 95);
  if (evidence?.hasUnderReviewEvidence) verificationScore = Math.max(verificationScore, 65);
  if (evidence?.hasExpiredEvidence) verificationScore = Math.min(verificationScore, 45);

  if (verificationScore < 50) {
    insights.push(buildInsight("warning", `Verification status is ${normalizedSupplier.verificationStatus.replace(/_/g, " ")}.`));
  }

  const rawScore = round((normalizedSupplier.complianceScore * 0.55) + (verificationScore * 0.45), 2);
  return {
    rawScore,
    weightedScore: round(rawScore * SUPPLIER_SCORING_CONFIG.weights.complianceVerification, 2),
    verificationScore,
  };
}

function calculateRegionRiskComponent(normalizedSupplier, baseline) {
  const key = String(normalizedSupplier.region || "GLOBAL").trim().replace(/[\s-]+/g, "_").toUpperCase();
  const regionScore = SUPPLIER_SCORING_CONFIG.regionRiskScores[key] ?? SUPPLIER_SCORING_CONFIG.regionRiskScores.GLOBAL;
  const industryScore = baseline.key === "energy" || baseline.key === "mining" ? 55 : baseline.key === "chemicals" ? 65 : 80;
  const rawScore = round((regionScore * 0.55) + (industryScore * 0.45), 2);

  return {
    rawScore,
    weightedScore: round(rawScore * SUPPLIER_SCORING_CONFIG.weights.categoryRegionRisk, 2),
  };
}

function calculateDataQualityComponent(normalizedSupplier) {
  const evidence = normalizedSupplier.evidenceSummary;
  const checks = [
    Boolean(normalizedSupplier.name),
    normalizedSupplier.totalEmissions !== null && normalizedSupplier.totalEmissions > 0,
    normalizedSupplier.revenue !== null && normalizedSupplier.revenue > 0,
    normalizedSupplier.providedIntensity !== null || (normalizedSupplier.totalEmissions !== null && normalizedSupplier.revenue !== null),
    normalizedSupplier.dataTransparencyScore > 0,
    Boolean(normalizedSupplier.lastReportedAt),
    Boolean(normalizedSupplier.category),
    Boolean(normalizedSupplier.country || normalizedSupplier.region),
    Boolean(evidence?.hasVerifiedGHGInventory),
    Boolean(evidence?.hasVerifiedISO14001),
  ];

  const rawScore = (checks.filter(Boolean).length / checks.length) * 100;
  const evidencePenalty = evidence?.hasExpiredEvidence ? 15 : 0;
  return round(clamp(rawScore - evidencePenalty, 0, 100), 2);
}

function buildRecommendedActions(normalizedSupplier, components, benchmark) {
  const actions = [];
  const add = (action) => {
    if (!actions.includes(action)) actions.push(action);
  };

  if (normalizedSupplier.totalEmissions === null || normalizedSupplier.totalEmissions <= 0) add("Request verified emissions data");
  if (normalizedSupplier.questionnaireStatus === "not_sent" || normalizedSupplier.invitationStatus === "not_sent") add("Questionnaire has not been sent.");
  if (normalizedSupplier.questionnaireStatus === "overdue" || normalizedSupplier.invitationStatus === "overdue") add("Questionnaire is overdue.");
  if (normalizedSupplier.questionnaireStatus === "submitted" || normalizedSupplier.invitationStatus === "submitted") add("Supplier submitted questionnaire, review evidence.");
  if (!normalizedSupplier.hasISO14001) add("Request ISO 14001 certificate");
  if (!normalizedSupplier.hasSBTi) add("Request GHG inventory");
  if (!normalizedSupplier.evidenceSummary?.hasVerifiedGHGInventory) add("Request verified GHG inventory evidence");
  if (normalizedSupplier.evidenceSummary?.hasExpiredEvidence) add("Update expired supplier evidence");
  if (normalizedSupplier.evidenceSummary?.hasUnderReviewEvidence) add("Review submitted supplier evidence");
  if (!normalizedSupplier.lastReportedAt) add("Update last reported date");
  if (benchmark.isAboveIndustryAverage) add("Review high emissions intensity");
  if (["self_reported", "pending"].includes(normalizedSupplier.verificationStatus)) add("Verify self-reported data");
  if (["expired", "rejected"].includes(normalizedSupplier.verificationStatus)) add("Request verified emissions data");
  if (components.dataQualityScore < 70) add("Complete missing supplier profile data");

  return actions;
}

function buildExplanation(riskLevel, normalizedSupplier, components, benchmark) {
  const reasons = [];

  if (benchmark.isAboveIndustryAverage) reasons.push("emissions intensity is above benchmark");
  if (["pending", "self_reported", "expired", "rejected"].includes(normalizedSupplier.verificationStatus)) reasons.push(`verification is ${normalizedSupplier.verificationStatus.replace(/_/g, " ")}`);
  if (!normalizedSupplier.hasISO14001 && !normalizedSupplier.hasSBTi) reasons.push("no certifications are available");
  if (!normalizedSupplier.lastReportedAt) reasons.push("no last reported date is available");
  if (components.dataQualityScore < 70) reasons.push("key supplier data is missing");
  if (normalizedSupplier.invitationStatus === "overdue") reasons.push("the supplier questionnaire is overdue");

  if (reasons.length === 0) {
    return `Supplier is ${riskLevel.toLowerCase()} risk because scoring inputs are complete, current, and broadly aligned with benchmark expectations.`;
  }

  return `Supplier is ${riskLevel.toLowerCase()} risk because ${reasons.join(", ")}.`;
}

function applyRiskPenalties(score, normalizedSupplier, components) {
  let adjusted = score;

  if (["expired", "rejected"].includes(normalizedSupplier.verificationStatus)) adjusted -= 18;
  if (!normalizedSupplier.lastReportedAt) adjusted -= 8;
  if (normalizedSupplier.totalEmissions === null || normalizedSupplier.totalEmissions <= 0) adjusted -= 10;
  if (normalizedSupplier.dataTransparencyScore <= 0) adjusted -= 8;
  if (components.dataQualityScore < 50) adjusted -= 10;
  if (normalizedSupplier.invitationStatus === "overdue") adjusted -= 8;

  return round(clamp(adjusted, 0, 100), 2);
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

  const intensityResolution = resolveEmissionIntensity(normalizedSupplier, insights);
  const emissionComponent = calculateEmissionComponent(intensityResolution.emissionIntensity, baseline, insights);
  const certificationScore = calculateCertificationComponent(normalizedSupplier, insights);
  const transparencyScore = calculateTransparencyComponent(normalizedSupplier, insights);
  const complianceScore = calculateComplianceComponent(normalizedSupplier, insights);
  const freshnessScore = calculateFreshnessComponent(normalizedSupplier, insights);
  const categoryRegionRiskScore = calculateRegionRiskComponent(normalizedSupplier, baseline);
  const dataQualityScore = calculateDataQualityComponent(normalizedSupplier);
  const prePenaltyScore = round(clamp(
    emissionComponent.weightedScore
      + certificationScore.weightedScore
      + transparencyScore.weightedScore
      + complianceScore.weightedScore
      + freshnessScore.weightedScore
      + categoryRegionRiskScore.weightedScore,
    0,
    100,
  ), 2);
  const totalScore = applyRiskPenalties(prePenaltyScore, normalizedSupplier, { dataQualityScore });
  const riskLevel = classifyRiskLevel(totalScore);
  const recommendedActions = buildRecommendedActions(normalizedSupplier, { dataQualityScore }, emissionComponent);
  const explanation = buildExplanation(riskLevel, normalizedSupplier, { dataQualityScore }, emissionComponent);

  const result = {
    supplierId: normalizedSupplier.id || null,
    supplierName: normalizedSupplier.name,
    totalScore,
    riskLevel,
    riskTrend: null,
    emissionIntensity: intensityResolution.emissionIntensity === null
      ? null
      : round(intensityResolution.emissionIntensity, 6),
    intensitySource: intensityResolution.source,
    breakdown: {
      emissionScore: emissionComponent.rawScore,
      emissionsScore: emissionComponent.rawScore,
      emissionWeightedScore: emissionComponent.weightedScore,
      certificationScore: certificationScore.rawScore,
      certificationWeightedScore: certificationScore.weightedScore,
      transparencyScore: transparencyScore.rawScore,
      transparencyWeightedScore: transparencyScore.weightedScore,
      complianceScore: complianceScore.rawScore,
      complianceWeightedScore: complianceScore.weightedScore,
      reportingFreshnessScore: round(freshnessScore.rawScore, 2),
      reportingFreshnessWeightedScore: round(freshnessScore.weightedScore, 2),
      categoryRegionRiskScore: categoryRegionRiskScore.rawScore,
      categoryRegionRiskWeightedScore: categoryRegionRiskScore.weightedScore,
      dataQualityScore,
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
    complianceScore: complianceScore.rawScore,
    certificationScore: certificationScore.rawScore,
    transparencyScore: transparencyScore.rawScore,
    reportingFreshnessScore: round(freshnessScore.rawScore, 2),
    dataQualityScore,
    benchmarkScore: emissionComponent.percentileRank,
    latestScoreExplanation: explanation,
    explanation,
    recommendedActions,
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
    dataQualityScore: scoreResult.dataQualityScore,
    benchmarkScore: scoreResult.benchmarkScore,
    latestScoreExplanation: scoreResult.latestScoreExplanation,
    recommendedActions: scoreResult.recommendedActions,
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
    CRITICAL: 0,
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
      highRiskCount: distribution.HIGH + distribution.CRITICAL,
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
