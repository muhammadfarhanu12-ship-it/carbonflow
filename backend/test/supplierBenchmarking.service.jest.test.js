const {
  calculateDatasetBenchmark,
  calculateSupplierBenchmark,
  resolveSupplierBenchmark,
} = require("../services/supplierBenchmarking.service");

const suppliers = [
  { _id: "a", name: "Alpha", category: "Manufacturing", region: "North America", emissionIntensity: 10 },
  { _id: "b", name: "Beta", category: "Manufacturing", region: "North America", emissionIntensity: 20 },
  { _id: "c", name: "Gamma", category: "Manufacturing", region: "Europe", emissionIntensity: 30 },
  { _id: "d", name: "Delta", category: "Logistics", region: "Europe", emissionIntensity: 40 },
];

describe("Supplier peer benchmarking", () => {
  test("returns benchmark unavailable when insufficient category data exists", () => {
    const benchmark = calculateSupplierBenchmark(suppliers[3], suppliers);

    expect(benchmark.isBenchmarkAvailable).toBe(false);
    expect(benchmark.comparisonMessage).toBe("Benchmark unavailable because fewer than 3 suppliers exist in this category.");
  });

  test("calculates category average intensity", () => {
    const benchmark = calculateSupplierBenchmark(suppliers[1], suppliers);

    expect(benchmark.categoryAverageIntensity).toBe(20);
  });

  test("calculates region average intensity", () => {
    const benchmark = calculateSupplierBenchmark(suppliers[1], suppliers);

    expect(benchmark.regionAverageIntensity).toBe(15);
  });

  test("calculates percentile with lower intensity treated as better", () => {
    const benchmark = calculateSupplierBenchmark(suppliers[0], suppliers);

    expect(benchmark.percentile).toBeCloseTo(83.33, 2);
    expect(benchmark.comparisonMessage).toBe("This supplier performs better than 83.33% of suppliers in Manufacturing.");
  });

  test("detects best performer in category", () => {
    const benchmark = calculateSupplierBenchmark(suppliers[0], suppliers);

    expect(benchmark.bestPerformerIntensity).toBe(10);
    expect(benchmark.bestPerformerSupplierName).toBe("Alpha");
    expect(benchmark.isBestInClass).toBe(true);
  });

  test("labels supplier above and below category average", () => {
    const above = calculateSupplierBenchmark(suppliers[2], suppliers);
    const below = calculateSupplierBenchmark(suppliers[0], suppliers);

    expect(above.benchmarkLabel).toBe("ABOVE_AVERAGE");
    expect(above.comparisonMessage).toBe("Supplier intensity is above category average and should be reviewed.");
    expect(below.benchmarkLabel).toBe("BELOW_AVERAGE");
  });

  test("uses external benchmark provider when available", async () => {
    const benchmark = await resolveSupplierBenchmark({
      supplier: suppliers[0],
      companySuppliers: suppliers,
      providers: [{
        name: "externalBenchmarkProvider",
        resolve: async () => ({
          isBenchmarkAvailable: true,
          benchmarkSource: "external_provider",
          benchmarkSourceName: "Configured external feed",
          benchmarkLabel: "BELOW_AVERAGE",
        }),
      }],
    });

    expect(benchmark.benchmarkSource).toBe("external_provider");
    expect(benchmark.benchmarkSourceName).toBe("Configured external feed");
  });

  test("falls back to internal benchmark when external benchmark is missing", async () => {
    const benchmark = await resolveSupplierBenchmark({
      supplier: suppliers[0],
      companySuppliers: suppliers,
      providers: [
        { name: "externalBenchmarkProvider", resolve: async () => null },
        { name: "internalCompanyBenchmarkProvider", resolve: async ({ supplier, companySuppliers }) => calculateSupplierBenchmark(supplier, companySuppliers) },
      ],
    });

    expect(benchmark.isBenchmarkAvailable).toBe(true);
    expect(benchmark.benchmarkSource).toBe("internal_company_data");
  });

  test("returns unavailable when no provider and insufficient internal data exist", async () => {
    const benchmark = await resolveSupplierBenchmark({
      supplier: suppliers[3],
      companySuppliers: suppliers,
      providers: [{ name: "externalBenchmarkProvider", resolve: async () => null }],
    });

    expect(benchmark.isBenchmarkAvailable).toBe(false);
    expect(benchmark.benchmarkSource).toBe("unavailable");
  });

  test("includes sample benchmark warning and source metadata", () => {
    const benchmark = calculateDatasetBenchmark(suppliers[1], {
      category: "Manufacturing",
      region: "GLOBAL",
      averageIntensity: 12,
      medianIntensity: 10,
      percentile25: 8,
      percentile75: 18,
      sourceName: "Uploaded sample set",
      sourceYear: 2026,
      version: "v2",
      isOfficial: false,
      isSample: true,
    }, "customCsvBenchmarkProvider");

    expect(benchmark.isBenchmarkAvailable).toBe(true);
    expect(benchmark.benchmarkSource).toBe("uploaded_benchmark_dataset");
    expect(benchmark.benchmarkSourceName).toBe("Uploaded sample set");
    expect(benchmark.benchmarkSourceYear).toBe(2026);
    expect(benchmark.benchmarkWarning).toContain("sample data");
  });
});
