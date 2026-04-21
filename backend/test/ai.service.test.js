const test = require("node:test");
const assert = require("node:assert/strict");

const aiService = require("../services/ai.service.ts");

function createValidLedger() {
  return {
    shipments: [
      {
        origin: "New York, NY",
        destination: "Los Angeles, CA",
        distanceKm: 4500,
        weightKg: 1200,
        transportMode: "AIR",
        emissions: 12.5,
      },
      {
        origin: "New York, NY",
        destination: "Los Angeles, CA",
        distanceKm: 4500,
        weightKg: 1200,
        transportMode: "SEA",
        emissions: 4.1,
      },
      {
        origin: "Chicago, IL",
        destination: "Dallas, TX",
        distanceKm: 1500,
        weightKg: 900,
        transportMode: "ROAD",
        emissions: 3.2,
      },
    ],
    suppliers: [
      {
        name: "Supplier A",
        totalEmissions: 40,
        emissionIntensity: 0.12,
        sustainabilityScore: 55,
      },
      {
        name: "Supplier B",
        totalEmissions: 22,
        emissionIntensity: 0.08,
        sustainabilityScore: 84,
      },
    ],
    summary: {
      totalEmissions: 55.7,
      scopeBreakdown: {
        Scope1: 2.1,
        Scope2: 1.4,
        Scope3: 52.2,
      },
    },
  };
}

test("generateOptimizationRecommendations returns validated recommendations for a valid dataset", async () => {
  const expected = [
    {
      issue: "High emissions on New York, NY -> Los Angeles, CA | AIR",
      recommendation: "Shift part of the New York, NY to Los Angeles, CA lane from AIR to SEA using the same-lane SEA benchmark already present in the ledger.",
      estimatedSavings: 8.4,
      unit: "tCO2e",
      confidence: 0.9,
      implementationDifficulty: 2,
    },
  ];

  const recommendations = await aiService.generateOptimizationRecommendations(createValidLedger(), {
    provider: "openai",
    invokeProvider: async ({ payload, provider }) => {
      assert.equal(provider, "openai");
      assert.match(payload, /"carbonLedger"/);
      return JSON.stringify(expected);
    },
  });

  assert.deepEqual(recommendations, expected);
});

test("generateOptimizationRecommendations returns [] for incomplete datasets without calling the provider", async () => {
  let providerCalled = false;

  const recommendations = await aiService.generateOptimizationRecommendations({
    summary: {
      totalEmissions: 14.2,
      scopeBreakdown: {
        Scope3: 14.2,
      },
    },
  }, {
    invokeProvider: async () => {
      providerCalled = true;
      return "[]";
    },
  });

  assert.equal(providerCalled, false);
  assert.deepEqual(recommendations, []);
});

test("generateOptimizationRecommendations safely falls back to [] when the AI returns malformed JSON", async () => {
  const recommendations = await aiService.generateOptimizationRecommendations(createValidLedger(), {
    provider: "gemini",
    invokeProvider: async () => "{not-valid-json",
  });

  assert.deepEqual(recommendations, []);
});

test("generateOptimizationRecommendations handles large datasets without crashing", async () => {
  const shipments = Array.from({ length: 600 }, (_, index) => ({
    origin: `Origin ${index % 12}`,
    destination: `Destination ${index % 19}`,
    distanceKm: 900 + index,
    weightKg: 500 + (index % 25) * 20,
    transportMode: index % 2 === 0 ? "ROAD" : "AIR",
    emissions: 1.5 + (index % 7) * 0.6,
  }));

  const suppliers = [
    {
      name: "Supplier Alpha",
      totalEmissions: 120,
      emissionIntensity: 0.18,
      sustainabilityScore: 52,
    },
    {
      name: "Supplier Beta",
      totalEmissions: 84,
      emissionIntensity: 0.11,
      sustainabilityScore: 81,
    },
  ];

  const recommendations = await aiService.generateOptimizationRecommendations({
    shipments,
    suppliers,
  }, {
    provider: "openai",
    invokeProvider: async ({ payload }) => {
      assert.ok(payload.length > 1000);
      return "[]";
    },
  });

  assert.deepEqual(recommendations, []);
});
