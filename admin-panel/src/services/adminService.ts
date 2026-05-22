import { apiClient } from './apiClient';
import type {
  AdminSettings,
  AdminUserRecord,
  AnalyticsData,
  CarbonDataRecord,
  DashboardData,
  PaginatedResponse,
  SupplierBenchmarkRecord,
} from '../types/admin';

const DEFAULT_PAGE_SIZE = 10;

export const adminService = {
  getDashboard: () => apiClient.get<DashboardData>('/admin/dashboard'),
  getUsers: (params: { search?: string; page?: number; pageSize?: number } = {}) => {
    const search = params.search ? `&search=${encodeURIComponent(params.search)}` : '';
    const page = params.page || 1;
    const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
    return apiClient.get<PaginatedResponse<AdminUserRecord>>(`/admin/users?page=${page}&pageSize=${pageSize}${search}`);
  },
  updateUserStatus: (id: string, status: AdminUserRecord['status']) => apiClient.patch<AdminUserRecord>(`/admin/users/${id}/status`, { status }),
  deleteUser: (id: string) => apiClient.delete<{ id: string }>(`/admin/users/${id}`),
  getAnalytics: (months = 6) => apiClient.get<AnalyticsData>(`/admin/analytics?months=${months}`),
  getCarbonData: (params: { search?: string; page?: number; pageSize?: number } = {}) => {
    const search = params.search ? `&search=${encodeURIComponent(params.search)}` : '';
    const page = params.page || 1;
    const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
    return apiClient.get<PaginatedResponse<CarbonDataRecord>>(`/admin/carbon-data?page=${page}&pageSize=${pageSize}${search}`);
  },
  getSettings: () => apiClient.get<AdminSettings>('/admin/settings'),
  updateSettings: (data: Partial<AdminSettings>) => apiClient.put<AdminSettings>('/admin/settings', data),
  getSupplierBenchmarks: (params: { search?: string; category?: string; region?: string; sourceName?: string; sourceYear?: string; page?: number; pageSize?: number } = {}) => {
    const query = new URLSearchParams();
    query.set('page', String(params.page || 1));
    query.set('pageSize', String(params.pageSize || DEFAULT_PAGE_SIZE));
    if (params.search) query.set('search', params.search);
    if (params.category) query.set('category', params.category);
    if (params.region) query.set('region', params.region);
    if (params.sourceName) query.set('sourceName', params.sourceName);
    if (params.sourceYear) query.set('sourceYear', params.sourceYear);
    return apiClient.get<PaginatedResponse<SupplierBenchmarkRecord>>(`/admin/supplier-benchmarks?${query.toString()}`);
  },
  uploadSupplierBenchmarkCsv: (csv: string) => apiClient.post<{ created: number; data: SupplierBenchmarkRecord[] }>('/admin/supplier-benchmarks/upload-csv', { csv }),
  deactivateSupplierBenchmark: (id: string) => apiClient.patch<SupplierBenchmarkRecord>(`/admin/supplier-benchmarks/${id}/deactivate`, {}),
  getMarketplace: (companyId: string) => apiClient.get<AdminMarketplaceOverview>(`/admin/marketplace?companyId=${encodeURIComponent(companyId)}`),
  createMarketplaceListing: (companyId: string, payload: AdminMarketplaceListingPayload) => (
    apiClient.post<AdminMarketplaceListing>(`/admin/marketplace/listings?companyId=${encodeURIComponent(companyId)}`, payload)
  ),
  updateMarketplaceListing: (companyId: string, listingId: string, payload: Partial<AdminMarketplaceListingPayload>) => (
    apiClient.patch<AdminMarketplaceListing>(`/admin/marketplace/listings/${listingId}?companyId=${encodeURIComponent(companyId)}`, payload)
  ),
  adjustMarketplaceInventory: (companyId: string, listingId: string, payload: AdminInventoryAdjustmentPayload) => (
    apiClient.patch<AdminMarketplaceListing>(`/admin/marketplace/listings/${listingId}/inventory?companyId=${encodeURIComponent(companyId)}`, payload)
  ),
  approveMarketplaceBudgetRequest: (companyId: string, requestId: string, reason?: string) => (
    apiClient.patch(`/admin/marketplace/budget/requests/${requestId}/approve?companyId=${encodeURIComponent(companyId)}`, { reason })
  ),
  rejectMarketplaceBudgetRequest: (companyId: string, requestId: string, reason?: string) => (
    apiClient.patch(`/admin/marketplace/budget/requests/${requestId}/reject?companyId=${encodeURIComponent(companyId)}`, { reason })
  ),
  createMarketplaceInvoice: (companyId: string, transactionId: string) => (
    apiClient.post(`/admin/marketplace/transactions/${transactionId}/create-invoice?companyId=${encodeURIComponent(companyId)}`)
  ),
  markMarketplacePaid: (companyId: string, transactionId: string, paymentReference: string, settlementNotes?: string) => (
    apiClient.patch(`/admin/marketplace/transactions/${transactionId}/mark-paid?companyId=${encodeURIComponent(companyId)}`, { paymentReference, settlementNotes })
  ),
  markMarketplacePaymentFailed: (companyId: string, transactionId: string, reason: string) => (
    apiClient.patch(`/admin/marketplace/transactions/${transactionId}/mark-failed?companyId=${encodeURIComponent(companyId)}`, { reason })
  ),
  cancelMarketplacePayment: (companyId: string, transactionId: string, reason: string) => (
    apiClient.patch(`/admin/marketplace/transactions/${transactionId}/cancel?companyId=${encodeURIComponent(companyId)}`, { reason })
  ),
  refundMarketplacePayment: (companyId: string, transactionId: string, reason: string) => (
    apiClient.patch(`/admin/marketplace/transactions/${transactionId}/refund?companyId=${encodeURIComponent(companyId)}`, { reason })
  ),
  submitMarketplaceRetirement: (companyId: string, transactionId: string) => (
    apiClient.post(`/admin/marketplace/transactions/${transactionId}/submit-retirement?companyId=${encodeURIComponent(companyId)}`)
  ),
  manualMarketplaceRetirement: (
    companyId: string,
    transactionId: string,
    payload: { registryRetirementId: string; registryRetirementUrl?: string; registryRetiredAt?: string; verificationNotes?: string; evidenceReferences?: Array<{ name: string; url: string }> },
  ) => (
    apiClient.patch(`/admin/marketplace/transactions/${transactionId}/manual-retirement?companyId=${encodeURIComponent(companyId)}`, payload)
  ),
};

export interface AdminMarketplaceOverview {
  listings: {
    data: AdminMarketplaceListing[];
    transactions: AdminMarketplaceTransaction[];
  };
  budget: {
    budget: {
      totalBudget: number;
      settledSpend: number;
      pendingSpend: number;
      remainingBudget: number;
      isConfigured: boolean;
    };
    requests: Array<{
      id: string;
      requestedAmount: number;
      currentBudget: number;
      status: string;
      reason?: string | null;
      createdAt: string;
    }>;
  };
  operations: {
    cards: Record<string, number>;
    queues: {
      budgetRequests: unknown[];
      pendingPayment: AdminMarketplaceTransaction[];
      pendingRegistry: AdminMarketplaceTransaction[];
      failedTransactions: AdminMarketplaceTransaction[];
      missingRegistry: unknown[];
      lowInventory: unknown[];
      soldOut: unknown[];
    };
  };
}

export interface AdminMarketplaceListing {
  id: string;
  name: string;
  projectName?: string;
  description?: string | null;
  projectDescription?: string | null;
  status: string;
  type: string;
  projectType?: string;
  category?: string;
  methodology?: string | null;
  registryName?: string | null;
  registry?: string | null;
  registryProjectId?: string | null;
  registryUrl?: string | null;
  country?: string | null;
  region?: string | null;
  vintageYear?: number;
  creditUnit?: string;
  totalQuantityTco2e?: number;
  availableQuantityTco2e?: number;
  reservedQuantityTco2e?: number;
  retiredQuantityTco2e?: number;
  availableCredits: number;
  reservedCredits?: number;
  retiredCredits?: number;
  pricePerCreditUsd: number;
  pricePerTco2e?: number;
  currency?: string;
  verificationStatus?: string;
  isDemo?: boolean;
  isSample?: boolean;
  isRealInventory?: boolean;
  evidenceDocuments?: Array<{ name: string; url: string; type?: string }>;
  notes?: string | null;
}

export interface AdminMarketplaceListingPayload {
  projectName: string;
  projectDescription?: string | null;
  projectType?: string;
  category: string;
  methodology?: string | null;
  registryName?: string | null;
  registryProjectId?: string | null;
  registryUrl?: string | null;
  country?: string | null;
  region?: string | null;
  vintageYear: number;
  creditUnit?: string;
  totalQuantityTco2e: number;
  availableQuantityTco2e: number;
  pricePerTco2e: number;
  currency: string;
  verificationStatus: string;
  status: string;
  isDemo: boolean;
  isSample: boolean;
  isRealInventory: boolean;
  evidenceDocuments: Array<{ name: string; url: string; type?: string }>;
  notes?: string | null;
}

export interface AdminInventoryAdjustmentPayload {
  totalQuantityTco2e: number;
  availableQuantityTco2e: number;
  reservedQuantityTco2e: number;
  retiredQuantityTco2e: number;
  reason: string;
}

export interface AdminMarketplaceTransaction {
  _id?: string;
  id?: string;
  projectName?: string;
  companyName?: string;
  status?: string;
  lifecycleStatus?: string;
  paymentStatus?: string;
  paymentReference?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  registryRetirementStatus?: string;
  registryRetirementId?: string;
  registryRetirementUrl?: string;
  isDemo?: boolean;
  isRealRetirement?: boolean;
  certificate?: unknown;
  totalCostUsd?: number;
  quantity?: number;
  credits?: number;
  createdAt?: string;
}
