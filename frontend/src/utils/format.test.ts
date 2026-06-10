// frontend/src/utils/format.test.ts
import { describe, expect, test } from "vitest";
import { deriveReportingMonth, financialTextClassName, formatMonthYear, joinDisplayLabel, normalizeMonthLabel, uniqueMessages } from "./format";

describe("format utilities", () => {
  test("formats month-year labels without ambiguous two-digit years", () => {
    expect(formatMonthYear("2026-01")).toBe("Jan 2026");
    expect(normalizeMonthLabel("May 26")).toBe("May 2026");
  });

  test("derives reporting month from reportingPeriodStart before activity date", () => {
    expect(deriveReportingMonth({ reportingPeriodStart: "2026-06-01", occurredAt: "2026-05-28" })).toBe("2026-06");
  });

  test("deduplicates messages and trims display labels", () => {
    expect(uniqueMessages([" Sample warning ", "Sample warning", ""])).toEqual(["Sample warning"]);
    expect(joinDisplayLabel(["Sample ", " CarbonFlow Sample Factor 2026"])).toBe("Sample CarbonFlow Sample Factor 2026");
    expect(joinDisplayLabel(["", " Factor "])).toBe("Factor");
    expect(joinDisplayLabel(["Sample", " Factor "])).not.toMatch(/\s{2}/);
  });

  test("uses neutral color semantics for zero financial values", () => {
    expect(financialTextClassName(0)).toBe("text-muted-foreground");
    expect(financialTextClassName(-1)).toBe("text-destructive");
    expect(financialTextClassName(1)).toBe("text-foreground");
  });
});
