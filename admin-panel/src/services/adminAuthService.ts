import { apiClient } from './apiClient';
import type { AuthResponse, LoginData, AdminSessionUser } from '../types/admin';

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

  setSession(response: AuthResponse) {
    localStorage.setItem('adminToken', response.token);
    localStorage.setItem('adminUser', JSON.stringify(response.admin));
  }

  getSession() {
    const token = localStorage.getItem('adminToken');
    const userStr = localStorage.getItem('adminUser');
    let user: AdminSessionUser | null = null;
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch (_error) {
        // ignore
      }
    }
    return { token, user };
  }
}

export const adminAuthService = new AdminAuthService();
