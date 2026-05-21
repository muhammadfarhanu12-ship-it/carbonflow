import { apiClient } from "./apiClient";
import type {
  PaginatedResponse,
  Shipment,
  ShipmentImportMetadata,
  ShipmentImportResult,
  ShipmentImportRowPayload,
  TransportMode,
} from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface ShipmentPayload {
  supplierId?: string;
  reference: string;
  origin: string;
  destination: string;
  distanceKm: number;
  distanceUnit?: "km";
  transportMode: TransportMode;
  carrier: string;
  vehicleType?: string;
  fuelType?: string;
  weightKg: number;
  weightUnit?: "kg" | "tonnes";
  costUsd: number;
  currency?: string;
  status?: Shipment["status"];
  shipmentDate?: string;
  notes?: string;
}

export const shipmentService = {
  getShipments: async (params = ""): Promise<PaginatedResponse<Shipment>> => (
    normalizePaginatedResponse<Shipment>(await apiClient.get<unknown>(`/shipments${params}`))
  ),
  getActiveShipments: async (): Promise<PaginatedResponse<Shipment>> => (
    normalizePaginatedResponse<Shipment>(await apiClient.get<unknown>("/shipments?activeOnly=true&pageSize=50"), 50)
  ),
  createShipment: (data: ShipmentPayload) => apiClient.post<Shipment>("/shipments", data),
  updateShipment: (id: string, data: Partial<ShipmentPayload>) => apiClient.put<Shipment>(`/shipments/${id}`, data),
  deleteShipment: (id: string) => apiClient.delete<{ success: boolean }>(`/shipments/${id}`),
  importShipments: (payload: { shipments: ShipmentImportRowPayload[]; metadata: ShipmentImportMetadata }) => (
    apiClient.post<ShipmentImportResult>("/shipments/import", payload)
  ),
};
