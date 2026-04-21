import { apiClient } from './apiClient';
import type {
  AdminSettings,
  AdminUserRecord,
  AnalyticsData,
  CarbonDataRecord,
  DashboardData,
  PaginatedResponse,
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
};
