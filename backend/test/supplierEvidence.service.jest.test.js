const { evidenceStatusSummary, isExpired } = require("../services/supplierEvidence.service");

describe("supplier evidence summary", () => {
  test("detects expired evidence", () => {
    const evidence = {
      status: "verified",
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    };

    expect(isExpired(evidence)).toBe(true);
  });

  test("reports complete evidence when required documents are verified", () => {
    const summary = evidenceStatusSummary([
      { evidenceType: "iso_14001_certificate", status: "verified" },
      { evidenceType: "ghg_inventory", status: "verified" },
    ]);

    expect(summary.indicator).toBe("complete");
    expect(summary.hasVerifiedISO14001).toBe(true);
    expect(summary.hasVerifiedGHGInventory).toBe(true);
    expect(summary.missingTypes).toEqual([]);
  });

  test("reports missing and under-review evidence states", () => {
    const missing = evidenceStatusSummary([]);
    const underReview = evidenceStatusSummary([
      { evidenceType: "ghg_inventory", status: "submitted" },
    ]);

    expect(missing.indicator).toBe("missing");
    expect(underReview.indicator).toBe("under_review");
  });
});
