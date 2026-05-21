import type { ShipmentPayload } from "@/src/services/shipmentService";

export type ShipmentFieldErrors = Partial<Record<keyof ShipmentPayload, string>>;

const FUEL_REQUIRED_MODES = new Set(["ROAD", "AIR", "OCEAN", "RAIL"]);

export function validateShipmentPayload(payload: ShipmentPayload): ShipmentFieldErrors {
  const errors: ShipmentFieldErrors = {};
  const reference = payload.reference.trim();
  const carrier = payload.carrier.trim();
  const origin = payload.origin.trim();
  const destination = payload.destination.trim();
  const shipmentDate = String(payload.shipmentDate || "").trim();
  const fuelType = String(payload.fuelType || "").trim();

  if (!reference) errors.reference = "Shipment reference is required.";
  if (!carrier) errors.carrier = "Carrier is required.";
  if (!origin) errors.origin = "Origin is required.";
  if (!destination) errors.destination = "Destination is required.";
  if (!shipmentDate) errors.shipmentDate = "Shipment date is required.";
  if (!payload.transportMode) errors.transportMode = "Transport mode is required.";
  if (!Number.isFinite(payload.distanceKm) || payload.distanceKm <= 0) errors.distanceKm = "Distance must be greater than 0 km.";
  if (!Number.isFinite(payload.weightKg) || payload.weightKg <= 0) errors.weightKg = "Weight must be greater than 0 kg.";
  if (!Number.isFinite(payload.costUsd) || payload.costUsd < 0) errors.costUsd = "Shipment cost cannot be negative.";
  if (payload.transportMode && FUEL_REQUIRED_MODES.has(payload.transportMode) && !fuelType) {
    errors.fuelType = "Fuel type is required for this transport mode.";
  }

  return errors;
}

export function hasShipmentErrors(errors: ShipmentFieldErrors) {
  return Object.keys(errors).length > 0;
}
