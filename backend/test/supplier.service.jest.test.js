const SupplierService = require("../services/supplier.service");

describe("SupplierService payload normalization", () => {
  test("normalizes Phase 1 supplier fields for creation/update", () => {
    const payload = SupplierService.enrichPayload({
      name: "  Supplier One  ",
      contactEmail: " sustainability@supplier.example ",
      country: "US",
      region: "North America",
      category: "Manufacturing",
      status: "submitted",
      verificationStatus: "self_reported",
      invitationStatus: "sent",
      totalEmissionsTco2e: 123,
      revenueOrActivityBase: 1000,
      dataTransparencyScore: 70,
      complianceScore: 80,
      certifications: ["ISO 14001"],
    });

    expect(payload.name).toBe("Supplier One");
    expect(payload.contactEmail).toBe("sustainability@supplier.example");
    expect(payload.status).toBe("submitted");
    expect(payload.verificationStatus).toBe("self_reported");
    expect(payload.invitationStatus).toBe("sent");
    expect(payload.totalEmissions).toBe(123);
    expect(payload.totalEmissionsTco2e).toBe(123);
    expect(payload.revenue).toBe(1000);
    expect(payload.revenueOrActivityBase).toBe(1000);
    expect(payload.certifications).toEqual(["ISO 14001"]);
  });

  test("maps legacy supplier statuses without breaking existing data", () => {
    const payload = SupplierService.enrichPayload({
      name: "Supplier Two",
      country: "US",
      category: "Manufacturing",
      verificationStatus: "VERIFIED",
      invitationStatus: "NOT_SENT",
      totalEmissions: 0,
    });

    expect(payload.verificationStatus).toBe("third_party_verified");
    expect(payload.invitationStatus).toBe("not_sent");
  });
});
