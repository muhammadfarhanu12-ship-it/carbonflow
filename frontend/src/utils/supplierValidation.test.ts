import { describe, expect, test } from "vitest";
import { validateSupplierPayload } from "./supplierValidation";
import type { SupplierPayload } from "@/src/services/supplierService";

const validSupplier: SupplierPayload = {
  name: "Supplier One",
  contactEmail: "sustainability@supplier.example",
  country: "US",
  region: "North America",
  category: "Manufacturing",
  status: "submitted",
  emissionFactor: 0.25,
  emissionIntensity: 0.25,
  intensityUnit: "tCO2e/USD",
  complianceScore: 80,
  verificationStatus: "self_reported",
  onTimeDeliveryRate: 95,
  renewableRatio: 0.2,
  complianceFlags: 0,
  totalEmissions: 100,
  revenue: 1000,
  revenueOrActivityBase: 1000,
  hasISO14001: false,
  hasSBTi: false,
  dataTransparencyScore: 70,
  lastReportedAt: "2026-05-01",
  invitationStatus: "sent",
  certifications: [],
  notes: "",
};

describe("validateSupplierPayload", () => {
  test("accepts a valid supplier", () => {
    expect(validateSupplierPayload(validSupplier)).toEqual({});
  });

  test("returns field-level validation errors", () => {
    const errors = validateSupplierPayload({
      ...validSupplier,
      name: "",
      contactEmail: "bad-email",
      country: "",
      category: "",
      totalEmissions: -1,
      revenue: 0,
      dataTransparencyScore: 120,
      complianceScore: -1,
      lastReportedAt: "2999-01-01",
      verificationStatus: undefined,
      invitationStatus: undefined,
    });

    expect(errors.name).toBeTruthy();
    expect(errors.contactEmail).toBeTruthy();
    expect(errors.country).toBeTruthy();
    expect(errors.category).toBeTruthy();
    expect(errors.totalEmissions).toBeTruthy();
    expect(errors.revenue).toBeTruthy();
    expect(errors.dataTransparencyScore).toBeTruthy();
    expect(errors.complianceScore).toBeTruthy();
    expect(errors.lastReportedAt).toBeTruthy();
    expect(errors.verificationStatus).toBeTruthy();
    expect(errors.invitationStatus).toBeTruthy();
  });
});
