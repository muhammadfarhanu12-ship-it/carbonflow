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
  createUser: (data: ManagedUserPayload) => apiClient.post<ManagedUser>("/users", data),
  updateUser: (id: string, data: Partial<ManagedUserPayload>) => apiClient.put<ManagedUser>(`/users/${id}`, data),
  deleteUser: (id: string) => apiClient.delete<{ id: string }>(`/users/${id}`),
};
