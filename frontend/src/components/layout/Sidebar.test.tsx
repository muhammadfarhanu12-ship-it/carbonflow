import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sidebar } from "./Sidebar";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getSummary: vi.fn(),
}));

vi.mock("@/src/hooks/useAuth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/src/services/navigationService", () => ({
  navigationService: { getSummary: mocks.getSummary },
}));

function renderSidebar(path = "/app") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSummary.mockReturnValue(new Promise(() => undefined));
  });

  test("renders existing pages and new workflow pages for authorized user", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "ADMIN" } });
    renderSidebar("/app/emission-factors");

    ["Dashboard", "Shipments", "Suppliers", "Carbon Ledger", "Optimization", "Marketplace", "Reports", "Audit Logs", "Settings", "Emission Factors", "Data Imports", "Approvals"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText("Emission Factors").closest("a")).toHaveClass("text-primary");
  });

  test("hides restricted approval and audit pages for viewer", () => {
    mocks.useAuth.mockReturnValue({ user: { role: "VIEWER" } });
    renderSidebar();

    expect(screen.getByText("Emission Factors")).toBeInTheDocument();
    expect(screen.getByText("Data Imports")).toBeInTheDocument();
    expect(screen.queryByText("Approvals")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();
  });

  test("missing permission data does not crash sidebar", () => {
    mocks.useAuth.mockReturnValue({ user: null });
    renderSidebar();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
