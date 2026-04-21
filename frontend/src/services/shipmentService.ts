import { apiClient } from "./apiClient";
import type {
  PaginatedResponse,
  Shipment,
  ShipmentImportMetadata,
  ShipmentImportResult,
  ShipmentImportRowPayload,
  TransportMode,
} from "@/src/types/platform";

export interface ShipmentPayload {
  supplierId: string;
  reference: string;
  origin: string;
  destination: string;
  distanceKm: number;
  transportMode: TransportMode;
  carrier: string;
  vehicleType?: string;
  fuelType?: string;
  weightKg: number;
  costUsd: number;
  status?: Shipment["status"];
  shipmentDate?: string;
  notes?: string;
}

export const shipmentService = {
  getShipments: (params = "") => apiClient.get<PaginatedResponse<Shipment>>(`/shipments${params}`),
  getActiveShipments: () => apiClient.get<PaginatedResponse<Shipment>>("/shipments?activeOnly=true&pageSize=50"),
  createShipment: (data: ShipmentPayload) => apiClient.post<Shipment>("/shipments", data),
  updateShipment: (id: string, data: Partial<ShipmentPayload>) => apiClient.put<Shipment>(`/shipments/${id}`, data),
  deleteShipment: (id: string) => apiClient.delete<{ success: boolean }>(`/shipments/${id}`),
  importShipments: (payload: { shipments: ShipmentImportRowPayload[]; metadata: ShipmentImportMetadata }) => (
    apiClient.post<ShipmentImportResult>("/shipments/import", payload)
  ),
};
