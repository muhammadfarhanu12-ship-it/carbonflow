import { describe, expect, test } from "vitest";
import { validateShipmentPayload } from "./shipmentValidation";
import type { ShipmentPayload } from "@/src/services/shipmentService";

const validShipment: ShipmentPayload = {
  reference: "SHP-1001",
  origin: "Karachi",
  destination: "Rotterdam",
  distanceKm: 6200,
  distanceUnit: "km",
  transportMode: "OCEAN",
  carrier: "Maersk",
  vehicleType: "Vessel",
  fuelType: "Marine Fuel",
  weightKg: 14500,
  weightUnit: "kg",
  costUsd: 12000,
  currency: "USD",
  status: "IN_TRANSIT",
  shipmentDate: "2026-05-20",
};

describe("validateShipmentPayload", () => {
  test("accepts a complete shipment payload", () => {
    expect(validateShipmentPayload(validShipment)).toEqual({});
  });

  test("returns field-level errors for missing required fields and invalid numbers", () => {
    const errors = validateShipmentPayload({
      ...validShipment,
      reference: "",
      carrier: "",
      origin: "",
      destination: "",
      shipmentDate: "",
      distanceKm: 0,
      weightKg: 0,
      costUsd: -1,
      fuelType: "",
    });

    expect(errors.reference).toBeTruthy();
    expect(errors.carrier).toBeTruthy();
    expect(errors.origin).toBeTruthy();
    expect(errors.destination).toBeTruthy();
    expect(errors.shipmentDate).toBeTruthy();
    expect(errors.distanceKm).toBeTruthy();
    expect(errors.weightKg).toBeTruthy();
    expect(errors.costUsd).toBeTruthy();
    expect(errors.fuelType).toBeTruthy();
  });
});
