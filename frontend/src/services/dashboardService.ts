import { apiClient } from "./apiClient";
import type { DashboardData } from "@/src/types/platform";

export const dashboardService = {
  getMetrics: () => apiClient.get<DashboardData>("/dashboard/summary"),
};
