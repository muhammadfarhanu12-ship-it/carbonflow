import { apiClient } from "./apiClient";
import type { SettingsPayload, UserSettings } from "@/src/types/platform";

export const settingsService = {
  getSettings: () => apiClient.get<UserSettings>("/user/settings"),
  updateSettings: (data: SettingsPayload) => apiClient.put<UserSettings>("/user/settings", data),
  createApiKey: (label?: string) => apiClient.post<UserSettings>("/user/settings/api-keys", { label }),
  syncIntegration: (name: string) => apiClient.post<UserSettings>(`/user/settings/integrations/${encodeURIComponent(name)}/sync`),
};
