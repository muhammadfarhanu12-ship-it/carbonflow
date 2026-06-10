import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { ToastProvider } from "@/src/components/providers/ToastProvider";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  rotateApiKey: vi.fn(),
  testIntegration: vi.fn(),
  syncIntegration: vi.fn(),
  socketOn: vi.fn(),
  getSession: vi.fn(),
  listTeam: vi.fn(),
  listPendingInvites: vi.fn(),
  inviteUser: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserStatus: vi.fn(),
  resendInvite: vi.fn(),
  cancelInvite: vi.fn(),
}));

vi.mock("@/src/services/settingsService", () => ({
  settingsService: {
    getSettings: mocks.getSettings,
    updateSettings: mocks.updateSettings,
    createApiKey: mocks.createApiKey,
    revokeApiKey: mocks.revokeApiKey,
    rotateApiKey: mocks.rotateApiKey,
    testIntegration: mocks.testIntegration,
    syncIntegration: mocks.syncIntegration,
  },
}));

vi.mock("@/src/services/socketService", () => ({
  socketService: { on: mocks.socketOn },
}));

vi.mock("@/src/services/authService", () => ({
  authService: { getSession: mocks.getSession },
}));

vi.mock("@/src/services/userService", () => ({
  userService: {
    listTeam: mocks.listTeam,
    listPendingInvites: mocks.listPendingInvites,
    inviteUser: mocks.inviteUser,
    updateUserRole: mocks.updateUserRole,
    updateUserStatus: mocks.updateUserStatus,
    resendInvite: mocks.resendInvite,
    cancelInvite: mocks.cancelInvite,
  },
}));

const settings = {
  id: "settings-1",
  companyId: "company-1",
  profile: { name: "Admin User", email: "admin@example.com", emailVerified: true, role: "ADMIN", companyName: "Acme Carbon" },
  company: {},
  organization: {
    companyName: "Acme Carbon",
    legalName: "",
    industry: "Logistics",
    headquarters: "Remote",
    region: "GLOBAL",
    country: "US",
    currency: "USD",
    fiscalYearStartMonth: 1,
    reportingYear: 2026,
    carbonPricePerTon: 55,
    netZeroTargetYear: 2040,
    revenueUsd: 1000000,
    annualShipmentWeightKg: 0,
    preferredUnits: "metric",
    defaultReportingBoundary: "operational_control",
    defaultReportInclusionPolicy: "approved_only",
    dataRetentionYears: 7,
  },
  operationalMetrics: {
    revenueUsd: 1000000,
    annualShipmentWeightKg: 0,
    electricityConsumptionKwh: 0,
    renewableElectricityPct: 0,
    stationaryFuelLiters: 0,
    mobileFuelLiters: 0,
    companyVehicleKm: 0,
    stationaryFuelType: "DIESEL",
    mobileFuelType: "DIESEL",
  },
  emissionFactors: { transport: {}, electricity: {}, fuels: {}, fleet: {} },
  emissionFactorMetadata: {},
  preferences: {
    notificationsEnabled: true,
    securityAlertsEnabled: true,
    reportNotificationsEnabled: true,
    integrationSyncNotificationsEnabled: true,
    marketplaceNotificationsEnabled: true,
  },
  security: { mfaStatus: "not_configured", activeSessionsSupported: false, ssoStatus: "not_configured" },
  integrations: [{ name: "ERP Feed", status: "not_configured", lastSync: null, lastError: null }],
  apiKeys: [{ id: "key-1", label: "Primary", maskedKey: "cf_••••••••1234", status: "active", scopes: ["reports:read"], createdAt: "2026-05-22T00:00:00.000Z" }],
};

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.socketOn.mockReturnValue(() => undefined);
    mocks.getSession.mockReturnValue({ user: { id: "admin-1", role: "ADMIN", companyId: "company-1", name: "Admin", email: "admin@example.com" } });
    mocks.getSettings.mockResolvedValue(settings);
    mocks.updateSettings.mockResolvedValue(settings);
    mocks.createApiKey.mockResolvedValue({ ...settings, oneTimeApiKey: "generated-key-value", oneTimeApiKeyId: "key-2" });
    mocks.revokeApiKey.mockResolvedValue({ ...settings, apiKeys: [{ ...settings.apiKeys[0], status: "revoked" }] });
    mocks.listTeam.mockResolvedValue([]);
    mocks.listPendingInvites.mockResolvedValue([]);
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  test("renders profile and saves backend-driven profile settings", async () => {
    renderSettings();

    expect(await screen.findByText("Profile settings")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Full name"));
    await userEvent.type(screen.getByLabelText("Full name"), "Admin Updated");
    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(mocks.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
        profile: expect.objectContaining({ name: "Admin Updated" }),
      }));
    });
  });

  test("shows masked API keys and one-time reveal after generation", async () => {
    renderSettings();
    await screen.findByText("Profile settings");
    await userEvent.click(screen.getByRole("button", { name: /api keys/i }));

    expect(await screen.findByText("cf_••••••••1234")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^generate api key$/i }));
    expect(await screen.findByText("generated-key-value")).toBeInTheDocument();
  });

  test("viewer sees permission denial for team management", async () => {
    mocks.getSession.mockReturnValue({ user: { id: "viewer-1", role: "VIEWER", companyId: "company-1", name: "Viewer", email: "viewer@example.com" } });
    renderSettings();
    await screen.findByText("Profile settings");
    await userEvent.click(screen.getByRole("button", { name: /team/i }));

    expect(await screen.findByText(/ask an owner or admin for access/i)).toBeInTheDocument();
  });

  test("integration not configured state is honest", async () => {
    renderSettings();
    await screen.findByText("Profile settings");
    await userEvent.click(screen.getByRole("button", { name: /api keys/i }));

    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync now/i })).toBeDisabled();
  });
});
