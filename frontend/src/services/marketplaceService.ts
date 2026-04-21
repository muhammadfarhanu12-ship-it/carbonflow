import { apiClient } from "./apiClient";
import type { CarbonProject, MarketplaceOverview, MarketplaceListingStatus } from "@/src/types/platform";

export interface ProjectPayload {
  name: string;
  type: string;
  location: string;
  description?: string | null;
  coordinates?: {
    latitude: number | null;
    longitude: number | null;
  };
  pddDocuments?: Array<{
    name: string;
    url: string;
  }>;
  certification: string;
  registry?: string;
  vintageYear?: number;
  verificationStandard?: string;
  rating: number;
  pricePerCreditUsd: number;
  pricePerTonUsd?: number;
  availableCredits: number;
  reservedCredits?: number;
  retiredCredits?: number;
  status?: MarketplaceListingStatus;
}

export interface ProjectManagementPayload {
  projectName: string;
  category: "Forestry" | "Renewable Energy" | "Blue Carbon" | "Methane";
  registry: "Gold Standard" | "Verra";
  description: string;
  location: string;
  latitude: number | "";
  longitude: number | "";
  status: Extract<MarketplaceListingStatus, "DRAFT" | "PUBLISHED">;
  pddDocuments: Array<{
    name: string;
    url: string;
  }>;
  vintageYear: number;
  totalSupply: number;
  price: number;
}

export interface MarketplaceProjectActionResult {
  success: boolean;
  action: "archived" | "published" | "drafted" | "deleted" | "sold_out";
  hardDeleted: boolean;
  id: string;
  reason?: string;
  project?: CarbonProject;
}

export const marketplaceService = {
  getProjects: (params = "") => apiClient.get<MarketplaceOverview>(`/marketplace${params}`),
  createProject: (data: ProjectPayload) => apiClient.post<CarbonProject>("/marketplace", data),
  createManagedProject: (data: ProjectManagementPayload) => apiClient.post<CarbonProject>("/marketplace/projects", data),
  updateProject: (id: string, data: Partial<ProjectPayload>) => apiClient.put<CarbonProject>(`/marketplace/${id}`, data),
  updateProjectStatus: (id: string, status: MarketplaceListingStatus) => apiClient.put<CarbonProject>(`/marketplace/${id}`, { status }),
  toggleProjectStatus: (id: string) => apiClient.patch<MarketplaceProjectActionResult>(`/marketplace/${id}/toggle-status`),
  archiveProject: (id: string) => apiClient.patch<CarbonProject>(`/marketplace/${id}/archive`),
  deactivateProject: (id: string) => apiClient.patch<CarbonProject>(`/marketplace/${id}/deactivate`),
  markProjectSoldOut: (id: string) => apiClient.patch<CarbonProject>(`/marketplace/${id}/sold-out`),
  buyCredits: (id: string, credits: number) => apiClient.post<CarbonProject>(`/marketplace/${id}/buy`, { credits }),
  deleteProject: (id: string) => apiClient.delete<MarketplaceProjectActionResult>(`/marketplace/${id}`),
};
