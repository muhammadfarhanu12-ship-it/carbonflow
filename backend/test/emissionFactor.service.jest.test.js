const EmissionFactorService = require("../services/emissionFactor.service");
const { validateFactorPayload, selectBestMatchingFactor } = require("../services/emissionFactor.service");
const AuditService = require("../services/audit.service");
const { EmissionFactor } = require("../models");

const baseFactor = {
  name: "Diesel factor",
  scope: 1,
  category: "Stationary combustion",
  activityType: "stationary_fuel",
  factorKey: "DIESEL",
  activityUnit: "liter",
  factorValue: 2.68,
  factorUnit: "kgCO2e/liter",
  sourceName: "Verified source",
  sourceYear: 2025,
  country: "GLOBAL",
  region: "GLOBAL",
  version: "v1",
  isSample: false,
  isOfficial: true,
  isCustom: false,
};

describe("EmissionFactorService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("creates official global factor with source metadata", async () => {
    jest.spyOn(EmissionFactor, "create").mockResolvedValue({ id: "factor-1", toObject: () => ({ id: "factor-1" }) });
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    await EmissionFactorService.create(baseFactor, { id: "admin-1", email: "admin@example.com", role: "superadmin" });

    expect(EmissionFactor.create).toHaveBeenCalledWith(expect.objectContaining({
      isOfficial: true,
      isCustom: false,
      isSample: false,
      sourceName: "Verified source",
      sourceYear: 2025,
    }));
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "emission_factor_created" }));
  });

  test("creates custom company-scoped factor", () => {
    expect(validateFactorPayload({
      ...baseFactor,
      companyId: "company-1",
      isOfficial: false,
      isCustom: true,
    })).toEqual(expect.objectContaining({
      companyId: "company-1",
      isCustom: true,
      isOfficial: false,
    }));
  });

  test("rejects invalid factor value", () => {
    expect(() => validateFactorPayload({ ...baseFactor, factorValue: 0 })).toThrow(/factorValue must be greater than 0/);
  });

  test("rejects missing source metadata", () => {
    expect(() => validateFactorPayload({ ...baseFactor, sourceName: "" })).toThrow(/sourceName is required/);
    expect(() => validateFactorPayload({ ...baseFactor, sourceYear: "" })).toThrow(/sourceYear must be a valid year/);
  });

  test("rejects sample factors marked official", () => {
    expect(() => validateFactorPayload({ ...baseFactor, isSample: true, isOfficial: true })).toThrow(/sample factors cannot be official/);
  });

  test("rejects custom factor without company scope", () => {
    expect(() => validateFactorPayload({ ...baseFactor, isOfficial: false, isCustom: true, companyId: "" })).toThrow(/custom factors must be scoped/);
  });

  test("factor matching prefers company custom over sample", () => {
    const sample = { ...baseFactor, id: "sample", isSample: true, isOfficial: false, factorValue: 2.68 };
    const custom = { ...baseFactor, id: "custom", companyId: "company-1", isOfficial: false, isCustom: true, factorValue: 2.5 };

    expect(selectBestMatchingFactor([sample, custom], {
      companyId: "company-1",
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      factorKey: "DIESEL",
      activityUnit: "liter",
    }).id).toBe("custom");
  });

  test("factor matching prefers official global over sample", () => {
    const sample = { ...baseFactor, id: "sample", isSample: true, isOfficial: false, factorValue: 2.68 };
    const official = { ...baseFactor, id: "official", isSample: false, isOfficial: true, factorValue: 2.6 };

    expect(selectBestMatchingFactor([sample, official], {
      companyId: "company-1",
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      factorKey: "DIESEL",
      activityUnit: "liter",
    }).id).toBe("official");
  });

  test("CSV import preview validates rows and commit saves only valid rows", async () => {
    jest.spyOn(EmissionFactor, "find").mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    jest.spyOn(EmissionFactor, "create").mockResolvedValue({ id: "factor-1", toObject: () => ({ id: "factor-1" }), toJSON: () => ({ id: "factor-1" }) });
    jest.spyOn(AuditService, "log").mockResolvedValue({});
    const csv = [
      "scope,category,activityType,factorKey,activityUnit,factorValue,factorUnit,sourceName,sourceYear,sourceUrl,country,region,version,effectiveFrom,effectiveTo,isOfficial,isCustom",
      "1,Stationary combustion,stationary_fuel,DIESEL,liter,2.68,kgCO2e/liter,Verified source,2025,,GLOBAL,GLOBAL,v1,,,true,false",
      "1,Stationary combustion,stationary_fuel,DIESEL,liter,0,kgCO2e/liter,,2025,,GLOBAL,GLOBAL,v1,,,true,false",
    ].join("\n");

    const result = await EmissionFactorService.commitImport(csv, { id: "admin-1", role: "superadmin" });

    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.createdCount).toBe(1);
    expect(AuditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "emission_factor_imported" }));
  });
});
