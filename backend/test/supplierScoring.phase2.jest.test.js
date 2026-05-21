const { calculateSupplierScore } = require("../services/supplierScoring.service");

describe("Supplier ESG scoring Phase 2", () => {
  test("calculates a rich ESG scorecard with component scores", () => {
    const score = calculateSupplierScore({
      name: "Verified Low Risk Supplier",
      category: "technology",
      region: "Europe",
      totalEmissions: 100,
      revenue: 1000,
      dataTransparencyScore: 90,
      complianceScore: 95,
      verificationStatus: "third_party_verified",
      invitationStatus: "submitted",
      hasISO14001: true,
      hasSBTi: true,
      lastReportedAt: new Date().toISOString(),
    });

    expect(score.totalScore).toBeGreaterThanOrEqual(80);
    expect(score.riskLevel).toBe("LOW");
    expect(score.breakdown).toEqual(expect.objectContaining({
      emissionScore: expect.any(Number),
      transparencyScore: expect.any(Number),
      complianceScore: expect.any(Number),
      certificationScore: expect.any(Number),
      reportingFreshnessScore: expect.any(Number),
      dataQualityScore: expect.any(Number),
    }));
    expect(score.explanation).toMatch(/Supplier is low risk/i);
  });

  test("applies missing data penalties and generates recommended actions", () => {
    const score = calculateSupplierScore({
      name: "Missing Data Supplier",
      category: "manufacturing",
      verificationStatus: "pending",
      invitationStatus: "not_sent",
      dataTransparencyScore: 0,
      complianceScore: 20,
    });

    expect(score.riskLevel).toBe("CRITICAL");
    expect(score.dataQualityScore).toBeLessThan(70);
    expect(score.recommendedActions).toEqual(expect.arrayContaining([
      "Request verified emissions data",
      "Questionnaire has not been sent.",
      "Update last reported date",
    ]));
  });

  test("certifications boost certification score", () => {
    const withoutCerts = calculateSupplierScore({
      name: "No Cert Supplier",
      totalEmissions: 100,
      revenue: 1000,
      dataTransparencyScore: 70,
      complianceScore: 70,
      lastReportedAt: new Date().toISOString(),
    });
    const withCerts = calculateSupplierScore({
      name: "Certified Supplier",
      totalEmissions: 100,
      revenue: 1000,
      dataTransparencyScore: 70,
      complianceScore: 70,
      hasISO14001: true,
      hasSBTi: true,
      lastReportedAt: new Date().toISOString(),
    });

    expect(withCerts.certificationScore).toBeGreaterThan(withoutCerts.certificationScore);
    expect(withCerts.totalScore).toBeGreaterThan(withoutCerts.totalScore);
  });

  test("expired verification penalizes risk and recommends verified data", () => {
    const score = calculateSupplierScore({
      name: "Expired Supplier",
      totalEmissions: 100,
      revenue: 1000,
      dataTransparencyScore: 80,
      complianceScore: 80,
      verificationStatus: "expired",
      lastReportedAt: new Date().toISOString(),
    });

    expect(score.riskLevel).not.toBe("LOW");
    expect(score.recommendedActions).toContain("Request verified emissions data");
    expect(score.explanation).toMatch(/verification is expired/i);
  });

  test("verified evidence improves certification and compliance scoring", () => {
    const withoutEvidence = calculateSupplierScore({
      name: "Evidence Gap Supplier",
      totalEmissions: 100,
      revenue: 1000,
      dataTransparencyScore: 70,
      complianceScore: 50,
      verificationStatus: "pending",
      lastReportedAt: new Date().toISOString(),
    });
    const withEvidence = calculateSupplierScore({
      name: "Evidence Ready Supplier",
      totalEmissions: 100,
      revenue: 1000,
      dataTransparencyScore: 70,
      complianceScore: 50,
      verificationStatus: "pending",
      lastReportedAt: new Date().toISOString(),
      evidenceSummary: {
        hasVerifiedISO14001: true,
        hasVerifiedSBTi: true,
        hasVerifiedGHGInventory: true,
        hasExpiredEvidence: false,
        hasUnderReviewEvidence: false,
      },
    });

    expect(withEvidence.certificationScore).toBeGreaterThan(withoutEvidence.certificationScore);
    expect(withEvidence.complianceScore).toBeGreaterThan(withoutEvidence.complianceScore);
    expect(withEvidence.recommendedActions).not.toContain("Request verified GHG inventory evidence");
  });

  test("expired evidence lowers data quality and creates recommendation", () => {
    const score = calculateSupplierScore({
      name: "Expired Evidence Supplier",
      totalEmissions: 100,
      revenue: 1000,
      dataTransparencyScore: 70,
      complianceScore: 80,
      verificationStatus: "third_party_verified",
      lastReportedAt: new Date().toISOString(),
      evidenceSummary: {
        hasVerifiedISO14001: true,
        hasVerifiedSBTi: false,
        hasVerifiedGHGInventory: true,
        hasExpiredEvidence: true,
        hasUnderReviewEvidence: false,
      },
    });

    expect(score.dataQualityScore).toBeLessThan(100);
    expect(score.recommendedActions).toContain("Update expired supplier evidence");
  });
});
