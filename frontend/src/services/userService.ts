import { apiClient } from "./apiClient";
import type { ManagedUser, PaginatedResponse, UserRole } from "@/src/types/platform";
import { normalizePaginatedResponse } from "@/src/utils/apiResponse";

export interface ManagedUserPayload {
  name: string;
  email: string;
  role: UserRole;
  status?: "ACTIVE" | "INVITED" | "SUSPENDED";
  password?: string;
}

export const userService = {
  listUsers: async (params = ""): Promise<PaginatedResponse<ManagedUser>> => (
    normalizePaginatedResponse<ManagedUser>(await apiClient.get<unknown>(`/users${params}`))
  ),
  listTeam: () => apiClient.get<ManagedUser[]>("/users/team"),
  listPendingInvites: () => apiClient.get<ManagedUser[]>("/users/invites"),
  createUser: (data: ManagedUserPayload) => apiClient.post<ManagedUser>("/users", data),
  inviteUser: (data: ManagedUserPayload) => apiClient.post<ManagedUser>("/users/invite", data),
  updateUser: (id: string, data: Partial<ManagedUserPayload>) => apiClient.put<ManagedUser>(`/users/${id}`, data),
  updateUserRole: (id: string, role: UserRole) => apiClient.patch<ManagedUser>(`/users/${id}/role`, { role }),
  updateUserStatus: (id: string, status: "ACTIVE" | "INVITED" | "SUSPENDED") => apiClient.patch<ManagedUser>(`/users/${id}/status`, { status }),
  resendInvite: (id: string) => apiClient.post<ManagedUser>(`/users/invites/${id}/resend`),
  cancelInvite: (id: string) => apiClient.patch<ManagedUser>(`/users/invites/${id}/cancel`),
  deleteUser: (id: string) => apiClient.delete<{ id: string }>(`/users/${id}`),
};
