import { apiClient, axiosClient } from "./apiClient";
import type {
  AutoOffsetRule,
  CarbonCreditTransaction,
  CarbonProject,
  CreditCheckoutPayload,
  MarketplaceBudget,
  MarketplaceBudgetRequest,
  MarketplaceOverview,
  MarketplaceListingStatus,
} from "@/src/types/platform";
import { asArray, asNumber, isRecord, normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface ProjectPayload {
  name: string;
  type: string;
  location: string;
  description?: string | null;
  methodology?: string | null;
  registryName?: string | null;
  registryProjectId?: string | null;
  registryUrl?: string | null;
  country?: string | null;
  region?: string | null;
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
  currency?: string;
  totalQuantityTco2e?: number;
  availableCredits: number;
  reservedCredits?: number;
  retiredCredits?: number;
  status?: MarketplaceListingStatus;
  verificationStatus?: CarbonProject["verificationStatus"];
  isDemo?: boolean;
  isSample?: boolean;
  isRealInventory?: boolean;
  evidenceDocuments?: ProjectPayload["pddDocuments"];
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

export interface BudgetIncreaseRequestPayload {
  currentBudgetUsd?: number;
  requestedBudgetUsd?: number;
  requestedAmount?: number;
  remainingBudgetUsd?: number;
  pendingTransactionsUsd?: number;
  companyName?: string;
  reason?: string;
}

export interface BudgetIncreaseRequestResult {
  success: boolean;
  currentBudgetUsd: number;
  requestedBudgetUsd: number;
  remainingBudgetUsd: number;
  pendingTransactionsUsd: number;
  recipientCount: number;
  emailDelivered: boolean;
}

function normalizeMarketplaceOverview(payload: unknown): MarketplaceOverview {
  const paginated = normalizePaginatedResponse<CarbonProject>(payload);
  const source = isRecord(payload) ? payload : {};
  const summary = isRecord(source.summary) ? source.summary : {};

  return {
    ...paginated,
    transactions: asArray<CarbonCreditTransaction>(source.transactions),
    summary: {
      totalCreditsRetired: asNumber(summary.totalCreditsRetired),
      totalSpendUsd: asNumber(summary.totalSpendUsd),
    },
  };
}

export const marketplaceService = {
  getProjects: async (params = "") => normalizeMarketplaceOverview(await apiClient.get<unknown>(`/marketplace${params}`)),
  getListing: (id: string) => apiClient.get<CarbonProject>(`/marketplace/listings/${id}`),
  getBudget: () => apiClient.get<{ budget: MarketplaceBudget; requests: MarketplaceBudgetRequest[] }>("/marketplace/budget"),
  updateBudget: (data: Partial<MarketplaceBudget>) => apiClient.patch<MarketplaceBudget>("/marketplace/budget", data),
  getBudgetRequests: () => apiClient.get<MarketplaceBudgetRequest[]>("/marketplace/budget/requests"),
  createProject: (data: ProjectPayload) => apiClient.post<CarbonProject>("/marketplace", data),
  createManagedProject: (data: ProjectManagementPayload) => apiClient.post<CarbonProject>("/marketplace/projects", data),
  updateProject: (id: string, data: Partial<ProjectPayload>) => apiClient.put<CarbonProject>(`/marketplace/${id}`, data),
  updateProjectStatus: (id: string, status: MarketplaceListingStatus) => apiClient.put<CarbonProject>(`/marketplace/${id}`, { status }),
  toggleProjectStatus: (id: string) => apiClient.patch<MarketplaceProjectActionResult>(`/marketplace/${id}/toggle-status`),
  archiveProject: (id: string) => apiClient.patch<CarbonProject>(`/marketplace/${id}/archive`),
  deactivateProject: (id: string) => apiClient.patch<CarbonProject>(`/marketplace/${id}/deactivate`),
  markProjectSoldOut: (id: string) => apiClient.patch<CarbonProject>(`/marketplace/${id}/sold-out`),
  getAutoOffsetRule: () => apiClient.get<AutoOffsetRule>("/marketplace/auto-offset-rule"),
  updateAutoOffsetRule: (data: Partial<AutoOffsetRule>) => apiClient.patch<AutoOffsetRule>("/marketplace/auto-offset-rule", data),
  evaluateAutoOffsetRule: () => apiClient.post<Record<string, unknown>>("/marketplace/auto-offset-rule/evaluate"),
  checkout: async (payload: CreditCheckoutPayload) => {
    const response = await axiosClient.post("/marketplace/checkout", payload, {
      headers: payload.idempotencyKey
        ? { "Idempotency-Key": payload.idempotencyKey }
        : undefined,
    });
    return response.data?.data as CarbonCreditTransaction;
  },
  requestBudgetIncrease: (data: BudgetIncreaseRequestPayload) => (
    apiClient.post<BudgetIncreaseRequestResult>("/marketplace/budget/request-increase", data)
  ),
  buyCredits: (id: string, credits: number) => apiClient.post<CarbonProject>(`/marketplace/${id}/buy`, { credits }),
  deleteProject: (id: string) => apiClient.delete<MarketplaceProjectActionResult>(`/marketplace/${id}`),
};
