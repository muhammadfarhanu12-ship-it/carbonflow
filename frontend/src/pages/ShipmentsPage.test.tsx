import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ShipmentsPage } from "./ShipmentsPage";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  showToast: vi.fn(),
  getShipments: vi.fn(),
  createShipment: vi.fn(),
  updateShipment: vi.fn(),
  recalculateShipment: vi.fn(),
  archiveShipment: vi.fn(),
  getSuppliers: vi.fn(),
  socketOn: vi.fn(),
}));

vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/src/components/providers/ToastProvider", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/src/services/shipmentService", () => ({
  shipmentService: {
    getShipments: mocks.getShipments,
    createShipment: mocks.createShipment,
    updateShipment: mocks.updateShipment,
    recalculateShipment: mocks.recalculateShipment,
    archiveShipment: mocks.archiveShipment,
  },
}));

vi.mock("@/src/services/supplierService", () => ({
  supplierService: {
    getSuppliers: mocks.getSuppliers,
  },
}));

vi.mock("@/src/services/socketService", () => ({
  socketService: {
    on: mocks.socketOn,
  },
}));

function renderShipmentsPage(path = "/app/shipments") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ShipmentsPage />
    </MemoryRouter>,
  );
}

describe("ShipmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    mocks.useAuth.mockReturnValue({
      user: {
        id: "manager-1",
        role: "MANAGER",
        companyId: "company-1",
        email: "manager@example.com",
        name: "Manager User",
      },
    });
    mocks.socketOn.mockReturnValue(() => undefined);
    mocks.getShipments.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    });
    mocks.getSuppliers.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
    });
    mocks.createShipment.mockResolvedValue({ id: "shipment-1", reference: "SHP-2026-001" });
  });

  test("allows saving a shipment without a linked supplier through the upgraded form", async () => {
    renderShipmentsPage("/app/shipments?compose=1");

    await screen.findByText("Scope 3 Shipment Workflow");
    await userEvent.type(screen.getByLabelText("Shipment Reference"), "SHP-2026-001");
    await userEvent.type(screen.getByLabelText("Origin"), "Karachi");
    await userEvent.type(screen.getByLabelText("Destination"), "Rotterdam");
    await userEvent.type(screen.getByLabelText("Carrier"), "Maersk");
    await userEvent.type(screen.getByLabelText("Distance Km"), "1200");
    await userEvent.type(screen.getByLabelText("Weight Kg"), "2500");
    await userEvent.type(screen.getByLabelText("Cost"), "500");
    await userEvent.type(screen.getByLabelText("Notes"), "Priority ocean shipment");

    await userEvent.click(screen.getByRole("button", { name: /add shipment/i }));

    await waitFor(() => {
      expect(mocks.createShipment).toHaveBeenCalledWith(expect.objectContaining({
        shipmentReference: "SHP-2026-001",
        reference: "SHP-2026-001",
        linkedSupplierId: "",
        notes: "Priority ocean shipment",
      }));
    });
  }, 10000);

  test("exposes the broader shipment status workflow", async () => {
    renderShipmentsPage();
    await screen.findByText("Scope 3 Shipment Workflow");

    const statusField = screen.getByLabelText("Status");
    await userEvent.click(statusField);

    ["DRAFT", "SUBMITTED", "PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED", "ARCHIVED"].forEach((status) => {
      expect(screen.getAllByRole("option", { name: status.replaceAll("_", " ") }).length).toBeGreaterThan(0);
    });
  });
});
