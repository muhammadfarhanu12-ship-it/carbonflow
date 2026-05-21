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
};
