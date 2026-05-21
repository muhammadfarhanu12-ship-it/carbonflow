const ShipmentService = require("../services/shipment.service");

describe("ShipmentService emissions calculation", () => {
  test("calculates ROAD shipment emissions from tonne-km", () => {
    const result = ShipmentService.calculateFields({
      distanceKm: 100,
      weightKg: 1000,
      transportMode: "ROAD",
      carbonPricePerTon: 50,
    });

    expect(result.tonKm).toBe(100);
    expect(result.emissionFactor).toBe(0.098);
    expect(result.emissionsKgCo2e).toBe(9.8);
    expect(result.emissionsTonnes).toBe(0.0098);
    expect(result.calculationStatus).toBe("calculated");
  });

  test("marks shipment calculation as missing_factor when a mode factor is zero", () => {
    const result = ShipmentService.calculateFields({
      distanceKm: 100,
      weightKg: 1000,
      transportMode: "RAIL",
      carbonPricePerTon: 50,
    }, {
      transport: { RAIL: 0 },
    });

    expect(result.emissionFactor).toBe(0);
    expect(result.emissionsTonnes).toBe(0);
    expect(result.calculationStatus).toBe("missing_factor");
    expect(result.factorSource).toBe("Emission factor missing");
  });
});
