const UNAVAILABLE_MESSAGE = "Benchmark unavailable until more supplier data is collected.";
const MIN_CATEGORY_SUPPLIERS = 3;
const SupplierBenchmarkDatasetService = require("./supplierBenchmarkDataset.service");

function round(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return null;
  }

  return Number(Number(value).toFixed(digits));
}

function normalizeText(value, fallback = "Uncategorized") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function supplierId(supplier = {}) {
  return String(supplier.id || supplier._id || "");
}

function supplierIntensity(supplier = {}) {
  const provided = Number(supplier.emissionIntensity ?? supplier.emissionFactor);
  if (Number.isFinite(provided) && provided > 0) {
    return provided;
  }

  const totalEmissions = Number(supplier.totalEmissionsTco2e ?? supplier.totalEmissions);
  const revenue = Number(supplier.revenueOrActivityBase ?? supplier.revenue);
  if (Number.isFinite(totalEmissions) && Number.isFinite(revenue) && totalEmissions > 0 && revenue > 0) {
    return totalEmissions / revenue;
  }

  return null;
}

function toBenchmarkSupplier(supplier = {}) {
  return {
    id: supplierId(supplier),
    name: supplier.name || "Unnamed supplier",
    category: normalizeText(supplier.category),
    region: normalizeText(supplier.region || supplier.country || "Global", "Global"),
    riskLevel: supplier.riskLevel || "LOW",
    intensity: supplierIntensity(supplier),
  };
}

function averageIntensity(suppliers) {
  const values = suppliers.map((supplier) => supplier.intensity).filter((value) => value !== null);
  if (values.length === 0) {
    return null;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function calculatePercentile(current, peers) {
  const values = peers.map((supplier) => supplier.intensity).filter((value) => value !== null);
  if (current === null || values.length === 0) {
    return null;
  }

  const betterThan = values.filter((value) => value > current).length;
  const equal = values.filter((value) => value === current).length;
  return round(((betterThan + (equal * 0.5)) / values.length) * 100, 2);
}

function compareToAverage(current, average) {
  if (current === null || average === null) {
    return "UNKNOWN";
  }

  const tolerance = Math.max(Math.abs(average) * 0.02, 0.000001);
  if (current > average + tolerance) return "ABOVE_AVERAGE";
  if (current < average - tolerance) return "BELOW_AVERAGE";
  return "AT_AVERAGE";
}

function buildUnavailableBenchmark(reason) {
  return {
    categoryAverageIntensity: null,
    regionAverageIntensity: null,
    companyAverageIntensity: null,
    bestPerformerIntensity: null,
    worstPerformerIntensity: null,
    percentile: null,
    benchmarkLabel: "UNAVAILABLE",
    comparisonMessage: reason || UNAVAILABLE_MESSAGE,
    isBenchmarkAvailable: false,
    bestPerformerSupplierId: null,
    bestPerformerSupplierName: null,
    worstPerformerSupplierId: null,
    worstPerformerSupplierName: null,
    categorySupplierCount: 0,
    regionSupplierCount: 0,
    categoryComparison: "UNKNOWN",
    regionComparison: "UNKNOWN",
    companyComparison: "UNKNOWN",
    isBestInClass: false,
    isAboveCategoryAverage: null,
    benchmarkSource: "unavailable",
    benchmarkSourceName: null,
    benchmarkSourceYear: null,
    benchmarkSourceVersion: null,
    benchmarkProvider: null,
    benchmarkIsOfficial: false,
    benchmarkIsSample: false,
    benchmarkWarning: null,
  };
}

function calculateSupplierBenchmark(supplier, companySuppliers = []) {
  const current = toBenchmarkSupplier(supplier);
  const peers = companySuppliers
    .map(toBenchmarkSupplier)
    .filter((item) => item.intensity !== null);
  const categoryPeers = peers.filter((item) => item.category.toLowerCase() === current.category.toLowerCase());
  const regionPeers = peers.filter((item) => item.region.toLowerCase() === current.region.toLowerCase());

  if (current.intensity === null) {
    return {
      ...buildUnavailableBenchmark("Benchmark unavailable because supplier intensity data is missing."),
      categorySupplierCount: categoryPeers.length,
      regionSupplierCount: regionPeers.length,
    };
  }

  if (categoryPeers.length < MIN_CATEGORY_SUPPLIERS) {
    return {
      ...buildUnavailableBenchmark(`Benchmark unavailable because fewer than ${MIN_CATEGORY_SUPPLIERS} suppliers exist in this category.`),
      categorySupplierCount: categoryPeers.length,
      regionSupplierCount: regionPeers.length,
      companyAverageIntensity: averageIntensity(peers),
      regionAverageIntensity: averageIntensity(regionPeers),
    };
  }

  const categoryAverageIntensity = averageIntensity(categoryPeers);
  const regionAverageIntensity = averageIntensity(regionPeers);
  const companyAverageIntensity = averageIntensity(peers);
  const sortedCategory = [...categoryPeers].sort((left, right) => left.intensity - right.intensity);
  const bestPerformer = sortedCategory[0] || null;
  const worstPerformer = sortedCategory[sortedCategory.length - 1] || null;
  const percentile = calculatePercentile(current.intensity, categoryPeers);
  const categoryComparison = compareToAverage(current.intensity, categoryAverageIntensity);
  const regionComparison = compareToAverage(current.intensity, regionAverageIntensity);
  const companyComparison = compareToAverage(current.intensity, companyAverageIntensity);
  const categoryLabel = current.category;
  let comparisonMessage = `This supplier performs better than ${percentile}% of suppliers in ${categoryLabel}.`;

  if (categoryComparison === "ABOVE_AVERAGE") {
    comparisonMessage = "Supplier intensity is above category average and should be reviewed.";
  }

  return {
    categoryAverageIntensity,
    regionAverageIntensity,
    companyAverageIntensity,
    bestPerformerIntensity: round(bestPerformer?.intensity),
    worstPerformerIntensity: round(worstPerformer?.intensity),
    percentile,
    benchmarkLabel: categoryComparison,
    comparisonMessage,
    isBenchmarkAvailable: true,
    bestPerformerSupplierId: bestPerformer?.id || null,
    bestPerformerSupplierName: bestPerformer?.name || null,
    worstPerformerSupplierId: worstPerformer?.id || null,
    worstPerformerSupplierName: worstPerformer?.name || null,
    categorySupplierCount: categoryPeers.length,
    regionSupplierCount: regionPeers.length,
    categoryComparison,
    regionComparison,
    companyComparison,
    isBestInClass: Boolean(bestPerformer && bestPerformer.id === current.id),
    isAboveCategoryAverage: categoryComparison === "ABOVE_AVERAGE",
    benchmarkSource: "internal_company_data",
    benchmarkSourceName: "Internal company supplier data",
    benchmarkSourceYear: new Date().getUTCFullYear(),
    benchmarkSourceVersion: "live",
    benchmarkProvider: "internalCompanyBenchmarkProvider",
    benchmarkIsOfficial: false,
    benchmarkIsSample: false,
    benchmarkWarning: "Internal company benchmarks are based only on suppliers currently available in CarbonFlow.",
  };
}

function calculateDatasetBenchmark(supplier, datasetRow, providerName) {
  const current = toBenchmarkSupplier(supplier);
  if (!datasetRow || current.intensity === null) {
    return buildUnavailableBenchmark("Benchmark unavailable because supplier intensity data is missing.");
  }

  const average = round(datasetRow.averageIntensity);
  const comparison = compareToAverage(current.intensity, average);
  const percentile = datasetRow.percentile25 !== null && datasetRow.percentile75 !== null
    ? null
    : null;
  const sourceLabel = providerName === "externalBenchmarkProvider" ? "external_provider" : "uploaded_benchmark_dataset";
  const warning = datasetRow.isSample
    ? "Benchmark source is marked as sample data and must not be treated as official."
    : datasetRow.isOfficial
      ? null
      : "Benchmark source is configured data but is not marked official.";

  return {
    categoryAverageIntensity: average,
    regionAverageIntensity: null,
    companyAverageIntensity: null,
    bestPerformerIntensity: round(datasetRow.percentile25),
    worstPerformerIntensity: round(datasetRow.percentile75),
    percentile,
    benchmarkLabel: comparison,
    comparisonMessage: comparison === "ABOVE_AVERAGE"
      ? "Supplier intensity is above the configured benchmark dataset and should be reviewed."
      : comparison === "BELOW_AVERAGE"
        ? "Supplier intensity is below the configured benchmark dataset."
        : "Supplier intensity is aligned with the configured benchmark dataset.",
    isBenchmarkAvailable: true,
    bestPerformerSupplierId: null,
    bestPerformerSupplierName: null,
    worstPerformerSupplierId: null,
    worstPerformerSupplierName: null,
    categorySupplierCount: null,
    regionSupplierCount: null,
    categoryComparison: comparison,
    regionComparison: "UNKNOWN",
    companyComparison: "UNKNOWN",
    isBestInClass: false,
    isAboveCategoryAverage: comparison === "ABOVE_AVERAGE",
    benchmarkSource: sourceLabel,
    benchmarkSourceName: datasetRow.sourceName,
    benchmarkSourceYear: datasetRow.sourceYear,
    benchmarkSourceVersion: datasetRow.version,
    benchmarkProvider: providerName,
    benchmarkIsOfficial: Boolean(datasetRow.isOfficial),
    benchmarkIsSample: Boolean(datasetRow.isSample),
    benchmarkWarning: warning,
    benchmarkMetadata: {
      medianIntensity: datasetRow.medianIntensity ?? null,
      percentile25: datasetRow.percentile25 ?? null,
      percentile75: datasetRow.percentile75 ?? null,
      country: datasetRow.country || null,
      region: datasetRow.region || null,
      industryCode: datasetRow.industryCode || null,
    },
  };
}

const internalCompanyBenchmarkProvider = {
  name: "internalCompanyBenchmarkProvider",
  async resolve({ supplier, companySuppliers }) {
    const benchmark = calculateSupplierBenchmark(supplier, companySuppliers);
    return benchmark.isBenchmarkAvailable ? benchmark : null;
  },
};

const customCsvBenchmarkProvider = {
  name: "customCsvBenchmarkProvider",
  async resolve({ supplier, asOfDate = new Date() }) {
    const row = await SupplierBenchmarkDatasetService.findBestMatch({
      category: supplier.category,
      region: supplier.region,
      country: supplier.country,
      industryCode: supplier.industryCode || supplier.industry,
      asOfDate,
    });
    return row ? calculateDatasetBenchmark(supplier, row, this.name) : null;
  },
};

const externalBenchmarkProvider = {
  name: "externalBenchmarkProvider",
  async resolve() {
    return null;
  },
};

async function resolveSupplierBenchmark({
  supplier,
  companySuppliers = [],
  providers = [externalBenchmarkProvider, customCsvBenchmarkProvider, internalCompanyBenchmarkProvider],
  asOfDate = new Date(),
} = {}) {
  for (const provider of providers) {
    const benchmark = await provider.resolve({ supplier, companySuppliers, asOfDate });
    if (benchmark?.isBenchmarkAvailable) {
      return benchmark;
    }
  }

  return calculateSupplierBenchmark(supplier, companySuppliers);
}

function enrichSupplierBenchmarks(suppliers = []) {
  return suppliers.map((supplier) => ({
    supplier,
    benchmark: calculateSupplierBenchmark(supplier, suppliers),
  }));
}

function buildSupplierIntelligenceSummary(suppliers = []) {
  const enriched = enrichSupplierBenchmarks(suppliers);
  const available = enriched.filter((item) => item.benchmark.isBenchmarkAvailable);
  const byIntensity = [...available].sort((left, right) => supplierIntensity(left.supplier) - supplierIntensity(right.supplier));
  const riskCategories = new Map();

  enriched.forEach(({ supplier, benchmark }) => {
    if (!benchmark.isBenchmarkAvailable || benchmark.benchmarkLabel !== "ABOVE_AVERAGE") return;
    const category = normalizeText(supplier.category);
    const current = riskCategories.get(category) || { category, supplierCount: 0, aboveBenchmarkCount: 0 };
    current.supplierCount += 1;
    current.aboveBenchmarkCount += 1;
    riskCategories.set(category, current);
  });

  return {
    bestPerformingSupplier: byIntensity[0]?.supplier?.name || null,
    worstPerformingSupplier: byIntensity[byIntensity.length - 1]?.supplier?.name || null,
    categoriesWithHighestSupplierRisk: Array.from(riskCategories.values())
      .sort((left, right) => right.aboveBenchmarkCount - left.aboveBenchmarkCount)
      .slice(0, 3),
    suppliersAboveBenchmark: available.filter((item) => item.benchmark.benchmarkLabel === "ABOVE_AVERAGE").length,
    suppliersMissingBenchmarkData: enriched.filter((item) => !item.benchmark.isBenchmarkAvailable).length,
  };
}

module.exports = {
  MIN_CATEGORY_SUPPLIERS,
  UNAVAILABLE_MESSAGE,
  buildSupplierIntelligenceSummary,
  calculateDatasetBenchmark,
  calculateSupplierBenchmark,
  customCsvBenchmarkProvider,
  enrichSupplierBenchmarks,
  externalBenchmarkProvider,
  internalCompanyBenchmarkProvider,
  resolveSupplierBenchmark,
  supplierIntensity,
};
