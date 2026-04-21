const test = require("node:test");
const assert = require("node:assert/strict");

const controller = require("../controllers/ai.controller.ts");
const aiService = require("../services/ai.service.ts");

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test("ai controller returns the expected machine-readable response shape", async () => {
  const original = aiService.generateOptimizationRecommendations;
  const expected = [
    {
      issue: "Issue",
      recommendation: "Recommendation",
      estimatedSavings: 4.2,
      unit: "tCO2e",
      confidence: 0.8,
      implementationDifficulty: 2,
    },
  ];

  aiService.generateOptimizationRecommendations = async () => expected;

  try {
    const req = {
      body: {
        carbonLedger: {
          shipments: [],
          suppliers: [],
        },
      },
      originalUrl: "/api/ai/optimize",
    };
    const res = createMockResponse();

    await controller.optimize(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      success: true,
      data: expected,
    });
  } finally {
    aiService.generateOptimizationRecommendations = original;
  }
});

test("ai controller rejects invalid input with a 400-ready ApiError", async () => {
  await assert.rejects(
    () => controller.optimize({ body: {}, originalUrl: "/api/ai/optimize" }, createMockResponse()),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /carbonLedger is required/i);
      return true;
    },
  );
});
