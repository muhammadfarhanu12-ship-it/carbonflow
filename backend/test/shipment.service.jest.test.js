const ShipmentService = require("../services/shipment.service");
const EmissionFactorService = require("../services/emissionFactor.service");
const AuditService = require("../services/audit.service");
const { Shipment } = require("../models");

describe("ShipmentService emissions calculation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("calculates ROAD shipment emissions from tonne-km", async () => {
    jest.spyOn(EmissionFactorService, "resolveBestMatch").mockResolvedValue(null);

    const result = await ShipmentService.calculateFields({
      distanceKm: 100,
      weightKg: 1000,
      transportMode: "ROAD",
      carbonPricePerTon: 50,
    }, "company-1");

    expect(result.tonKm).toBe(100);
    expect(result.emissionFactor).toBe(0.098);
    expect(result.emissionsKgCo2e).toBe(9.8);
    expect(result.emissionsTonnes).toBe(0.0098);
    expect(result.calculationStatus).toBe("estimated");
    expect(result.emissionFactorType).toBe("sample");
  });

  test("marks shipment calculation as missing_factor when no factor is available", async () => {
    jest.spyOn(EmissionFactorService, "resolveBestMatch").mockResolvedValue(null);
    const carbonEngine = require("../services/carbonEngine");
    const originalFactor = carbonEngine.DEFAULT_EMISSION_FACTORS.scope3.transportKgPerTonKm.RAIL;
    carbonEngine.DEFAULT_EMISSION_FACTORS.scope3.transportKgPerTonKm.RAIL = 0;
    try {
      const result = await ShipmentService.calculateFields({
        distanceKm: 100,
        weightKg: 1000,
        transportMode: "RAIL",
        carbonPricePerTon: 50,
      }, "company-1");

      expect(result.emissionFactor).toBe(0);
      expect(result.emissionsTonnes).toBe(0);
      expect(result.calculationStatus).toBe("missing_factor");
      expect(result.factorSource).toBe("Emission factor missing");
    } finally {
      carbonEngine.DEFAULT_EMISSION_FACTORS.scope3.transportKgPerTonKm.RAIL = originalFactor;
    }
  });

  test("prefers a company custom factor over the sample fallback", async () => {
    jest.spyOn(EmissionFactorService, "resolveBestMatch").mockResolvedValue({
      _id: "factor-custom-1",
      companyId: "company-1",
      factorKey: "ROAD_FREIGHT",
      factorValue: 0.111,
      factorUnit: "kgCO2e/ton-km",
      sourceName: "Company logistics contract",
      sourceYear: 2026,
      isSample: false,
      isCustom: true,
      isOfficial: false,
    });

    const result = await ShipmentService.calculateFields({
      distanceKm: 200,
      weightKg: 5000,
      transportMode: "ROAD",
    }, "company-1");

    expect(result.emissionFactor).toBe(0.111);
    expect(result.emissionFactorType).toBe("custom");
    expect(result.calculationStatus).toBe("calculated");
    expect(result.emissionFactorId).toBe("factor-custom-1");
    expect(result.dataQualityWarnings).toEqual([]);
  });

  test("returns invalid_input when distance or weight is missing", async () => {
    const result = await ShipmentService.calculateFields({
      distanceKm: 0,
      weightKg: 0,
      transportMode: "AIR",
    }, "company-1");

    expect(result.calculationStatus).toBe("invalid_input");
    expect(result.emissionFactorType).toBe("missing");
    expect(result.dataQualityWarnings[0]).toMatch(/greater than zero/i);
  });
});

describe("ShipmentService importRows", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses shared shipment create path and logs per-shipment import lineage for new shipments", async () => {
    jest.spyOn(Shipment, "findOne").mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });
    jest.spyOn(ShipmentService, "create").mockResolvedValue({
      id: "shipment-1",
      shipmentReference: "SHP-1",
      reference: "SHP-1",
      calculationStatus: "calculated",
      emissionFactorId: "factor-1",
      emissionFactorKey: "ROAD_FREIGHT",
      emissionFactorValue: 0.1,
      emissionFactorUnit: "kgCO2e/ton-km",
      emissionFactorSourceName: "Official source",
      emissionFactorSourceYear: 2026,
      emissionFactorType: "official",
    });
    jest.spyOn(ShipmentService, "update").mockResolvedValue(null);
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const result = await ShipmentService.importRows([
      {
        rowIndex: 2,
        shipmentReference: "SHP-1",
        reference: "SHP-1",
        origin: "Karachi",
        destination: "Rotterdam",
      },
    ], "company-1", 55, { id: "user-1", email: "user@example.com" }, { importId: "import-1", source: "csv" });

    expect(ShipmentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentReference: "SHP-1",
        metadata: expect.objectContaining({ importId: "import-1" }),
      }),
      "company-1",
      55,
      expect.objectContaining({ id: "user-1" }),
    );
    expect(ShipmentService.update).not.toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "shipment_imported_created",
      entityId: "shipment-1",
      details: expect.objectContaining({
        importId: "import-1",
        shipmentReference: "SHP-1",
        calculationStatus: "calculated",
      }),
    }));
    expect(result.summary.inserted).toBe(1);
    expect(result.createdRecords[0].id).toBe("shipment-1");
  });

  test("uses shared shipment update path for existing shipment imports", async () => {
    jest.spyOn(Shipment, "findOne").mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "shipment-1", reference: "SHP-1" }),
      }),
    });
    jest.spyOn(ShipmentService, "create").mockResolvedValue(null);
    jest.spyOn(ShipmentService, "update").mockResolvedValue({
      id: "shipment-1",
      shipmentReference: "SHP-1",
      reference: "SHP-1",
      calculationStatus: "estimated",
      emissionFactorId: null,
      emissionFactorKey: "ROAD_FREIGHT",
      emissionFactorValue: 0.098,
      emissionFactorUnit: "kgCO2e/ton-km",
      emissionFactorSourceName: "Sample source",
      emissionFactorSourceYear: 2026,
      emissionFactorType: "sample",
    });
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const result = await ShipmentService.importRows([
      {
        rowIndex: 2,
        shipmentReference: "SHP-1",
        reference: "SHP-1",
        origin: "Karachi",
        destination: "Rotterdam",
      },
    ], "company-1", 55, { id: "user-1", email: "user@example.com" }, { importId: "import-2", source: "csv" });

    expect(ShipmentService.update).toHaveBeenCalledWith(
      "shipment-1",
      expect.objectContaining({
        shipmentReference: "SHP-1",
      }),
      "company-1",
      55,
      expect.objectContaining({ id: "user-1" }),
    );
    expect(ShipmentService.create).not.toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: "shipment_imported_updated",
      details: expect.objectContaining({
        importId: "import-2",
        shipmentReference: "SHP-1",
      }),
    }));
    expect(result.summary.updated).toBe(1);
  });
});
