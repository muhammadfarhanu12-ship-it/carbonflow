const {
  calculateActivityEmission,
  calculateScope1,
  calculateScope2,
  resolveSampleFactor,
} = require("../services/carbonEngine");

describe("carbonEngine", () => {
  test("calculates Scope 1 stationary combustion in kgCO2e and tCO2e", () => {
    const result = calculateScope1({ stationaryFuelLiters: 100, stationaryFuelType: "DIESEL" });

    expect(result.totalTonnes).toBe(0.268);
    expect(result.breakdown[0]).toMatchObject({
      key: "stationaryFuel",
      factor: 2.68,
      amountTonnes: 0.268,
    });
  });

  test("calculates Scope 2 market-based electricity with renewable share", () => {
    const result = calculateScope2({ electricityKwh: 1000, renewableElectricityPct: 25, region: "US" });

    expect(result.locationBasedTonnes).toBe(0.385);
    expect(result.marketBasedTonnes).toBe(0.2888);
    expect(result.totalTonnes).toBe(0.2888);
  });

  test("calculates practical Scope 3 activity from sample factors", () => {
    const factor = resolveSampleFactor({
      scope: 3,
      activityType: "business_travel_air",
      unit: "km",
      region: "GLOBAL",
    });
    const result = calculateActivityEmission({ activityAmount: 1500, activityUnit: "km" }, factor);

    expect(factor.isSample).toBe(true);
    expect(result.emissionsKgCo2e).toBe(234);
    expect(result.emissionsTCo2e).toBe(0.234);
  });
});
