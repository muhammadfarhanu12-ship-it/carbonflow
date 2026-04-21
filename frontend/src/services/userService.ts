import { apiClient } from "./apiClient";
import type { ManagedUser, PaginatedResponse, UserRole } from "@/src/types/platform";

export interface ManagedUserPayload {
  name: string;
  email: string;
  role: UserRole;
  status?: "ACTIVE" | "INVITED" | "SUSPENDED";
  password?: string;
}

export const userService = {
  listUsers: (params = "") => apiClient.get<PaginatedResponse<ManagedUser>>(`/users${params}`),
  createUser: (data: ManagedUserPayload) => apiClient.post<ManagedUser>("/users", data),
  updateUser: (id: string, data: Partial<ManagedUserPayload>) => apiClient.put<ManagedUser>(`/users/${id}`, data),
  deleteUser: (id: string) => apiClient.delete<{ id: string }>(`/users/${id}`),
};
