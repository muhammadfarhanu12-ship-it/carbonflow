import { describe, expect, it } from "vitest";
import { buildLedgerFactorMessage } from "./ledgerFactorMessage";

describe("buildLedgerFactorMessage", () => {
  it("shows the sample factor warning for sample factors", () => {
    expect(buildLedgerFactorMessage({
      scope: 1,
      category: "Stationary combustion",
      activityType: "stationary_fuel",
      factorKey: "DIESEL",
      activityUnit: "liter",
      unit: "liter",
      factorValue: 2.68,
      value: 2.68,
      factorUnit: "kgCO2e/liter",
      sourceName: "CarbonFlow Sample Factor",
      sourceYear: 2026,
      region: "GLOBAL",
      isSample: true,
    })).toBe("This activity uses a sample emission factor. Replace with an official/custom factor before official reporting.");
  });

  it("shows the official/custom source message for non-sample factors", () => {
    expect(buildLedgerFactorMessage({
      scope: 2,
      category: "Purchased electricity",
      activityType: "electricity",
      factorKey: "US",
      activityUnit: "kWh",
      unit: "kWh",
      factorValue: 0.31,
      value: 0.31,
      factorUnit: "kgCO2e/kWh",
      sourceName: "Utility contract",
      sourceYear: 2026,
      region: "US",
      isSample: false,
      isOfficial: true,
    })).toBe("Using official emission factor: Utility contract 2026, 0.31 kgCO2e/kWh.");
  });

  it("shows the no-match message when no factor is found", () => {
    expect(buildLedgerFactorMessage(null)).toBe("No matching emission factor found for this scope/category/activity/unit/fuel.");
  });
});
