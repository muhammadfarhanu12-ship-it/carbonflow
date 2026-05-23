import { apiClient } from "./apiClient";

export interface NavigationSummary {
  pendingApprovals: number;
  failedImports: number;
  missingFactors: number;
  criticalAuditEvents: number;
  failedReports: number;
}

export const navigationService = {
  getSummary: () => apiClient.get<NavigationSummary>("/navigation/summary"),
};
