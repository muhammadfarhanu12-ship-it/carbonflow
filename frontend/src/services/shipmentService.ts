import { apiClient } from "./apiClient";
import type {
  PaginatedResponse,
  Shipment,
  TransportMode,
} from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface ShipmentPayload {
  supplierId?: string;
  linkedSupplierId?: string;
  reference: string;
  shipmentReference?: string;
  bolNumber?: string;
  containerId?: string;
  origin: string;
  originCountry?: string;
  originRegion?: string;
  destination: string;
  destinationCountry?: string;
  destinationRegion?: string;
  distanceKm: number;
  distanceUnit?: "km";
  transportMode: TransportMode;
  carrier: string;
  carrierId?: string;
  vehicleType?: string;
  fuelType?: string;
  weightKg: number;
  weightUnit?: "kg" | "tonnes";
  costUsd: number;
  cost?: number;
  currency?: string;
  status?: Shipment["status"];
  shipmentDate?: string;
  reportingPeriod?: string;
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
  updateShipment: (id: string, data: Partial<ShipmentPayload>) => apiClient.patch<Shipment>(`/shipments/${id}`, data),
  recalculateShipment: (id: string) => apiClient.post<Shipment>(`/shipments/${id}/recalculate`, {}),
  archiveShipment: (id: string) => apiClient.patch<Shipment>(`/shipments/${id}/archive`, {}),
  deleteShipment: (id: string) => apiClient.delete<{ success: boolean }>(`/shipments/${id}`),
};
