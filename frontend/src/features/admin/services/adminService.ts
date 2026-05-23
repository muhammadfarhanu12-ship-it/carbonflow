import { apiClient } from "@/src/services/apiClient";
import type {
  AdminDashboardMetrics,
  AdminPaginated,
  AdminPlatformSettings,
  AdminProfile,
  AdminShipment,
  AdminSystemLog,
  AdminUser,
  BillingOverview,
  EmissionFactor,
  EmissionFactorImportPreview,
  Invoice,
  AdminCompany,
  AdminMarketplaceProject,
} from "../types";
import type { MarketplaceOverview } from "@/src/types/platform";

const DEFAULT_PAGE_SIZE = 100;

export const adminService = {
  getDashboardMetrics: () => apiClient.get<AdminDashboardMetrics>("/admin/dashboard"),

  getUsers: (pageSize = DEFAULT_PAGE_SIZE) => apiClient.get<AdminPaginated<AdminUser>>(`/admin/users?pageSize=${pageSize}`),
  createUser: (data: Partial<AdminUser> & { password: string }) => apiClient.post<AdminUser>("/admin/users", data),
  updateUser: (id: string, data: Partial<AdminUser> & { password?: string }) => apiClient.put<AdminUser>(`/admin/users/${id}`, data),
  deleteUser: (id: string) => apiClient.delete<{ id: string }>(`/admin/users/${id}`),

  getCompanies: (pageSize = DEFAULT_PAGE_SIZE) => apiClient.get<AdminPaginated<AdminCompany>>(`/admin/companies?pageSize=${pageSize}`),
  updateCompany: (id: string, data: Partial<AdminCompany>) => apiClient.put<AdminCompany>(`/admin/companies/${id}`, data),

  getShipments: (pageSize = DEFAULT_PAGE_SIZE) => apiClient.get<AdminPaginated<AdminShipment>>(`/admin/shipments?pageSize=${pageSize}`),

  getEmissionFactors: (params = `?pageSize=${DEFAULT_PAGE_SIZE}`) => apiClient.get<AdminPaginated<EmissionFactor>>(`/admin/emission-factors${params}`),
  createEmissionFactor: (data: Partial<EmissionFactor>) => apiClient.post<EmissionFactor>("/admin/emission-factors", data),
  updateEmissionFactor: (id: string, data: Partial<EmissionFactor>) => apiClient.patch<EmissionFactor>(`/admin/emission-factors/${id}`, data),
  deactivateEmissionFactor: (id: string) => apiClient.patch<EmissionFactor>(`/admin/emission-factors/${id}/deactivate`),
  reactivateEmissionFactor: (id: string) => apiClient.patch<EmissionFactor>(`/admin/emission-factors/${id}/reactivate`),
  previewEmissionFactorCsv: (csv: string, companyId?: string) => apiClient.post<EmissionFactorImportPreview>("/admin/emission-factors/import/preview", { csv, companyId }),
  commitEmissionFactorCsv: (csv: string, companyId?: string) => apiClient.post<EmissionFactorImportPreview>("/admin/emission-factors/import/commit", { csv, companyId }),

  getMarketplaceProjects: async (pageSize = DEFAULT_PAGE_SIZE) => {
    const response = await apiClient.get<MarketplaceOverview>(`/marketplace?pageSize=${pageSize}&includeAllStatuses=true`);
    return {
      data: response.data.map((project) => ({
        id: project.id,
        name: project.name,
        registry: project.registry || project.verificationStandard || project.certification,
        pricePerTon: Number(project.pricePerTonUsd ?? project.pricePerCreditUsd),
        carbonCreditsAvailable: Number(project.availableCredits),
        retiredCredits: Number(project.retiredCredits),
        immutable: Boolean(project.lifecycle?.isImmutable),
        status: project.status,
      })),
      pagination: response.pagination,
    } satisfies AdminPaginated<AdminMarketplaceProject>;
  },
  createMarketplaceProject: (data: Record<string, unknown>) => apiClient.post<AdminMarketplaceProject>("/marketplace", data),
  updateMarketplaceProject: (id: string, data: Record<string, unknown>) => apiClient.put<AdminMarketplaceProject>(`/marketplace/${id}`, data),
  deleteMarketplaceProject: (id: string) => apiClient.delete<{ success: boolean }>(`/marketplace/${id}`),
  archiveMarketplaceProject: (id: string) => apiClient.patch<AdminMarketplaceProject>(`/marketplace/${id}/archive`),
  deactivateMarketplaceProject: (id: string) => apiClient.patch<AdminMarketplaceProject>(`/marketplace/${id}/deactivate`),
  markMarketplaceProjectSoldOut: (id: string) => apiClient.patch<AdminMarketplaceProject>(`/marketplace/${id}/sold-out`),

  getSystemLogs: (pageSize = DEFAULT_PAGE_SIZE) => apiClient.get<AdminPaginated<AdminSystemLog>>(`/admin/system-logs?pageSize=${pageSize}`),

  getProfile: () => apiClient.get<AdminProfile>("/admin/profile"),
  updateProfile: (data: Partial<AdminProfile> & { currentPassword?: string; newPassword?: string }) => apiClient.put<AdminProfile>("/admin/profile", data),

  getPlatformSettings: () => apiClient.get<AdminPlatformSettings>("/admin/settings"),
  updatePlatformSettings: (data: Partial<AdminPlatformSettings>) => apiClient.put<AdminPlatformSettings>("/admin/settings", data),

  getBillingOverview: () => apiClient.get<BillingOverview>("/admin/billing/overview"),
  getInvoices: (pageSize = 10) => apiClient.get<AdminPaginated<Invoice>>(`/admin/billing/invoices?pageSize=${pageSize}`),
};
