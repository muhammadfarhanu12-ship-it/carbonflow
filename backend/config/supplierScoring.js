const SUPPLIER_SCORING_CONFIG = Object.freeze({
  version: "2026-05-20-phase2",
  weights: {
    emissionIntensity: 0.3,
    dataTransparency: 0.2,
    complianceVerification: 0.2,
    certifications: 0.1,
    reportingFreshness: 0.1,
    categoryRegionRisk: 0.1,
  },
  certificationPoints: {
    iso14001: 50,
    sbti: 50,
  },
  riskThresholds: {
    critical: 40,
    high: 60,
    medium: 80,
  },
  regionRiskScores: {
    GLOBAL: 70,
    NORTH_AMERICA: 90,
    EUROPE: 90,
    APAC: 72,
    MIDDLE_EAST: 68,
    AFRICA: 62,
    SOUTH_AMERICA: 70,
  },
  emissionNormalization: {
    minMultiplier: 0.35,
    maxMultiplier: 2.5,
    mismatchTolerancePct: 5,
    atAverageTolerancePct: 5,
    percentileAnchors: [
      { ratio: 0.35, percentile: 99 },
      { ratio: 0.5, percentile: 95 },
      { ratio: 0.75, percentile: 80 },
      { ratio: 1, percentile: 60 },
      { ratio: 1.25, percentile: 45 },
      { ratio: 1.5, percentile: 30 },
      { ratio: 2, percentile: 15 },
      { ratio: 3, percentile: 3 },
    ],
  },
  freshnessWindowsDays: {
    recent: 180,
    stale: 365,
  },
  bulkProcessing: {
    chunkSize: 250,
    cacheTtlMs: 15 * 60 * 1000,
    maxSuppliers: 5000,
  },
  industryBaselines: {
    default: {
      key: "default",
      label: "Cross-industry",
      averageIntensity: 1.25,
      aliases: ["default", "general", "unknown"],
    },
    manufacturing: {
      key: "manufacturing",
      label: "Manufacturing",
      averageIntensity: 2.1,
      aliases: ["manufacturing", "industrial", "production", "factory"],
    },
    logistics: {
      key: "logistics",
      label: "Logistics",
      averageIntensity: 1.6,
      aliases: ["logistics", "transport", "shipping", "freight", "carrier"],
    },
    agriculture: {
      key: "agriculture",
      label: "Agriculture",
      averageIntensity: 2.8,
      aliases: ["agriculture", "farming", "food", "agribusiness"],
    },
    retail: {
      key: "retail",
      label: "Retail",
      averageIntensity: 0.95,
      aliases: ["retail", "consumer", "commerce"],
    },
    technology: {
      key: "technology",
      label: "Technology",
      averageIntensity: 0.45,
      aliases: ["technology", "software", "it", "electronics", "saas"],
    },
    energy: {
      key: "energy",
      label: "Energy",
      averageIntensity: 3.4,
      aliases: ["energy", "utilities", "power", "oil", "gas"],
    },
    chemicals: {
      key: "chemicals",
      label: "Chemicals",
      averageIntensity: 2.6,
      aliases: ["chemicals", "chemical", "materials"],
    },
    construction: {
      key: "construction",
      label: "Construction",
      averageIntensity: 2.3,
      aliases: ["construction", "infrastructure", "building"],
    },
    mining: {
      key: "mining",
      label: "Mining",
      averageIntensity: 3.1,
      aliases: ["mining", "metals", "extractives"],
    },
  },
});

function normalizeIndustryKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const INDUSTRY_BASELINE_LOOKUP = Object.values(SUPPLIER_SCORING_CONFIG.industryBaselines)
  .reduce((lookup, baseline) => {
    lookup[baseline.key] = baseline;

    for (const alias of baseline.aliases || []) {
      lookup[normalizeIndustryKey(alias)] = baseline;
    }

    return lookup;
  }, {});

function resolveIndustryBaseline(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeIndustryKey(candidate);

    if (normalized && INDUSTRY_BASELINE_LOOKUP[normalized]) {
      return INDUSTRY_BASELINE_LOOKUP[normalized];
    }
  }

  return SUPPLIER_SCORING_CONFIG.industryBaselines.default;
}

module.exports = {
  SUPPLIER_SCORING_CONFIG,
  normalizeIndustryKey,
  resolveIndustryBaseline,
};
