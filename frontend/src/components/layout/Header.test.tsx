import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Header } from "./Header";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  navigate: vi.fn(),
  showToast: vi.fn(),
  getMetrics: vi.fn(),
  getReports: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/src/components/providers/ToastProvider", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/src/services/dashboardService", () => ({
  dashboardService: { getMetrics: mocks.getMetrics },
}));

vi.mock("@/src/services/reportsService", () => ({
  reportsService: { getReports: mocks.getReports },
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: {
        id: "manager-1",
        role: "MANAGER",
        companyId: "company-1",
        email: "manager@example.com",
        name: "Manager User",
      },
    });
    mocks.getMetrics.mockResolvedValue({ summary: { highRiskSuppliers: 2, totalEmissions: 12.5 } });
    mocks.getReports.mockResolvedValue({ data: [] });
  });

  test("routes upload and add shipment actions to governed workflows", async () => {
    renderHeader();

    await userEvent.click(screen.getByRole("button", { name: /add shipment/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/app/shipments?compose=1");

    await userEvent.click(screen.getByRole("button", { name: /upload data/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/app/imports?type=shipment");
  });

  test("hides shipment entry points when the user lacks shipment create/import permissions", async () => {
    mocks.useAuth.mockReturnValue({
      user: {
        id: "viewer-1",
        role: "NO_ACCESS",
        companyId: "company-1",
        email: "viewer@example.com",
        name: "Viewer User",
        permissions: ["report:view"],
      },
    });

    renderHeader();
    await waitFor(() => {
      expect(mocks.getMetrics).toHaveBeenCalled();
    });

    expect(screen.queryByRole("button", { name: /add shipment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload data/i })).not.toBeInTheDocument();
  });
});
