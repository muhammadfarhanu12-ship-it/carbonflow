import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuditLogsPage } from "./AuditLogsPage";
import { ToastProvider } from "@/src/components/providers/ToastProvider";

const mocks = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  getSummary: vi.fn(),
  exportAuditLogs: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/src/services/auditLogsService", () => ({
  auditLogsService: {
    getAuditLogs: mocks.getAuditLogs,
    getSummary: mocks.getSummary,
    exportAuditLogs: mocks.exportAuditLogs,
  },
}));

vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

function renderAuditLogs() {
  return render(
    <ToastProvider>
      <AuditLogsPage />
    </ToastProvider>,
  );
}

const auditLog = {
  id: "audit-1",
  companyId: "company-1",
  userId: "user-1",
  userEmail: "admin@example.com",
  action: "emission_record_approved",
  actionLabel: "Emission record approved",
  entityType: "EmissionRecord",
  entityId: "record-1",
  module: "ledger",
  severity: "medium",
  category: "approve",
  source: "web",
  status: "success",
  requestId: "req-1",
  oldValue: { dataStatus: "submitted" },
  newValue: { dataStatus: "approved", password: "[REDACTED]" },
  changesSummary: ["dataStatus"],
  createdAt: "2026-05-22T10:00:00.000Z",
};

describe("AuditLogsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: { id: "admin-1", role: "ADMIN", companyId: "company-1", name: "Admin", email: "admin@example.com" },
    });
    mocks.getAuditLogs.mockResolvedValue({
      data: [auditLog],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mocks.getSummary.mockResolvedValue({
      totalEvents: 1,
      highCriticalEvents: 0,
      failedActions: 0,
      exportsDownloads: 0,
      permissionSecurityEvents: 0,
      eventsInSelectedPeriod: 1,
    });
    mocks.exportAuditLogs.mockResolvedValue({ blob: new Blob(["id,action"]), filename: "audit-logs.csv" });
    URL.createObjectURL = vi.fn(() => "blob:audit");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  test("renders summary cards and backend audit rows", async () => {
    renderAuditLogs();

    expect(await screen.findByText("Audit Logs")).toBeInTheDocument();
    expect(await screen.findByText("Emission record approved")).toBeInTheDocument();
    expect(screen.getByText("Total events")).toBeInTheDocument();
    expect(screen.getByText("Selected period")).toBeInTheDocument();
  });

  test("applies and resets filters", async () => {
    renderAuditLogs();
    await screen.findByText("Emission record approved");

    await userEvent.type(screen.getByLabelText("Action"), "report_downloaded");
    await userEvent.click(screen.getByRole("button", { name: /^apply$/i }));

    await waitFor(() => {
      expect(mocks.getAuditLogs).toHaveBeenLastCalledWith(expect.stringContaining("action=report_downloaded"));
    });

    await userEvent.click(screen.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      expect(mocks.getAuditLogs).toHaveBeenLastCalledWith("?pageSize=50");
    });
  });

  test("opens detail drawer and renders old and new values safely", async () => {
    renderAuditLogs();
    await screen.findByText("Emission record approved");

    await userEvent.click(screen.getByRole("button", { name: /details/i }));

    expect(await screen.findByText("Audit event details")).toBeInTheDocument();
    expect(screen.getByText("Raw action")).toBeInTheDocument();
    expect(screen.getByText(/submitted/)).toBeInTheDocument();
    expect(screen.getByText(/\[REDACTED\]/)).toBeInTheDocument();
  });

  test("exports through authenticated service", async () => {
    renderAuditLogs();
    await screen.findByText("Emission record approved");

    await userEvent.click(screen.getByRole("button", { name: /^csv$/i }));

    await waitFor(() => {
      expect(mocks.exportAuditLogs).toHaveBeenCalledWith(expect.any(URLSearchParams), "csv");
    });
  });

  test("shows permission denial for blocked roles", async () => {
    mocks.useAuth.mockReturnValue({
      user: { id: "viewer-1", role: "VIEWER", companyId: "company-1", name: "Viewer", email: "viewer@example.com" },
    });

    renderAuditLogs();

    expect(await screen.findByText("You do not have permission to perform this action.")).toBeInTheDocument();
    expect(mocks.getAuditLogs).not.toHaveBeenCalled();
  });

  test("shows empty state without crashing", async () => {
    mocks.getAuditLogs.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    });

    renderAuditLogs();

    expect(await screen.findByText("No audit events found yet.")).toBeInTheDocument();
  });
});
