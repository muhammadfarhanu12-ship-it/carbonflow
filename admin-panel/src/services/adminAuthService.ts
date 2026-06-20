import { apiClient } from './apiClient';
import type { AuthResponse, LoginData, AdminSessionUser } from '../types/admin';

function isAdminSessionUser(value: unknown): value is AdminSessionUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.email === 'string'
    && typeof candidate.adminRole === 'string'
    && Array.isArray(candidate.adminPermissions)
    && typeof candidate.adminStatus === 'string';
}

class AdminAuthService {
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/admin/auth/login', data);
    this.setSession(response);
    return response;
  }

  async getCurrentAdmin(): Promise<AdminSessionUser> {
    return apiClient.get<AdminSessionUser>('/admin/auth/me');
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<AdminSessionUser> {
    return apiClient.put<AdminSessionUser>('/admin/auth/password', data);
  }

  logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
  }

  setStoredUser(user: AdminSessionUser) {
    localStorage.setItem('adminUser', JSON.stringify(user));
  }

  setSession(response: AuthResponse) {
    localStorage.setItem('adminToken', response.token);
    this.setStoredUser(response.admin);
  }

  getSession() {
    const token = localStorage.getItem('adminToken');
    const userStr = localStorage.getItem('adminUser');
    let user: AdminSessionUser | null = null;

    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        if (isAdminSessionUser(parsed)) {
          user = parsed;
        } else {
          this.logout();
        }
      } catch (_error) {
        this.logout();
      }
    }

    return { token, user };
  }
}

export const adminAuthService = new AdminAuthService();
