import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LedgerPage } from "./LedgerPage";

const mocks = vi.hoisted(() => ({
  getEntries: vi.fn(),
  createEntry: vi.fn(),
  getShipments: vi.fn(),
  getSuppliers: vi.fn(),
  matchFactor: vi.fn(),
  createActivity: vi.fn(),
  updateStatus: vi.fn(),
  updateActivity: vi.fn(),
  recalculate: vi.fn(),
  getAuditTimeline: vi.fn(),
  previewImport: vi.fn(),
  commitImport: vi.fn(),
  generateReport: vi.fn(),
  downloadReport: vi.fn(),
}));

vi.mock("@/src/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", companyId: "company-1", role: "ADMIN", email: "admin@example.com", name: "Admin" } }),
}));

vi.mock("@/src/services/socketService", () => ({
  socketService: { on: vi.fn(() => vi.fn()) },
}));

vi.mock("@/src/services/ledgerService", () => ({
  ledgerService: {
    getEntries: mocks.getEntries,
    createEntry: mocks.createEntry,
  },
}));

vi.mock("@/src/services/shipmentService", () => ({
  shipmentService: { getShipments: mocks.getShipments },
}));

vi.mock("@/src/services/supplierService", () => ({
  supplierService: { getSuppliers: mocks.getSuppliers },
}));

vi.mock("@/src/services/emissionsService", () => ({
  emissionsService: {
    matchFactor: mocks.matchFactor,
    createActivity: mocks.createActivity,
    updateStatus: mocks.updateStatus,
    updateActivity: mocks.updateActivity,
    recalculate: mocks.recalculate,
    getAuditTimeline: mocks.getAuditTimeline,
    previewImport: mocks.previewImport,
    commitImport: mocks.commitImport,
  },
}));

vi.mock("@/src/services/reportsService", () => ({
  reportsService: {
    generateReport: mocks.generateReport,
    downloadReport: mocks.downloadReport,
  },
}));

function buildLedgerResponse(records = [buildRecord()]) {
  return {
    data: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    records,
    summary: {
      totalSpend: 1200,
      totalCarbonTax: 50,
      totalCarbonCost: 75,
      totalEmissions: 1.25,
      carbonCostRatio: 4.2,
      scope1: 0.5,
      scope2: 0.25,
      scope3: 0.5,
      approvedRecords: 1,
      draftRecords: 1,
      submittedRecords: 1,
      missingFactorRecords: 1,
      sampleFactorRecords: 1,
      zeroAmountRecords: 0,
      calculationErrorRecords: 0,
      totalRecords: 3,
    },
    breakdowns: {
      byCategory: [{ name: "Stationary combustion", value: 0.5 }],
      bySupplier: [{ supplierId: "supplier-1", name: "Acme Fuels", value: 0.5, recordCount: 1, sharePct: 40, riskLevel: "MEDIUM", linkStatus: "linked" }],
      byMonth: [{ name: "May 26", scope1: 0.5, scope2: 0.25, scope3: 0.5, missingFactorCount: 1 }],
    },
    categoryBreakdown: [{ name: "Stationary combustion", value: 0.5 }],
    supplierBreakdown: [{ supplierId: "supplier-1", name: "Acme Fuels", value: 0.5, recordCount: 1, sharePct: 40, riskLevel: "MEDIUM", linkStatus: "linked" }],
    monthlyBreakdown: [{ name: "May 26", scope1: 0.5, scope2: 0.25, scope3: 0.5, missingFactorCount: 1 }],
  };
}

function buildRecord(overrides = {}) {
  return {
    id: "record-1",
    companyId: "company-1",
    scope: 1,
    category: "Stationary combustion",
    sourceType: "ACTIVITY",
    supplierId: "supplier-1",
    supplierName: "Acme Fuels",
    supplierRiskLevel: "MEDIUM",
    amountTonnes: 0.5,
    emissionsKgCo2e: 500,
    emissionsTCo2e: 0.5,
    costUsd: 0,
    factorValue: 2.68,
    factorUnit: "kgCO2e/liter",
    factorSource: "CarbonFlow sample factors",
    factorSourceYear: 2026,
    factorIsSample: true,
    activityAmount: 186.57,
    activityUnit: "liter",
    reportingPeriod: "2026-05",
    dataStatus: "submitted",
    calculationStatus: "calculated",
    factorValueUsed: 2.68,
    factorUnitUsed: "kgCO2e/liter",
    factorSourceName: "CarbonFlow sample factors",
    factorVersion: "v1",
    factorStillActive: true,
    isStaleFactor: false,
    canRecalculateWithLatestFactor: false,
    activityData: { activityType: "stationary_fuel", fuelType: "DIESEL", supplierName: "Acme Fuels" },
    metadata: { factorKey: "DIESEL" },
    occurredAt: "2026-05-15T00:00:00.000Z",
    periodMonth: 5,
    periodYear: 2026,
    ...overrides,
  };
}

async function renderLedger() {
  render(<LedgerPage />);
  await screen.findByText("Carbon Ledger");
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:report");
  URL.revokeObjectURL = vi.fn();
  mocks.getEntries.mockResolvedValue(buildLedgerResponse());
  mocks.getShipments.mockResolvedValue({ data: [] });
  mocks.getSuppliers.mockResolvedValue({
    data: [{ id: "supplier-1", name: "Acme Fuels", category: "Fuel", country: "US", riskLevel: "MEDIUM" }],
    pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
  });
  mocks.matchFactor.mockResolvedValue({
    factorValue: 2.68,
    value: 2.68,
    factorUnit: "kgCO2e/liter",
    sourceName: "CarbonFlow sample factors",
    sourceYear: 2026,
    isSample: true,
  });
  mocks.previewImport.mockResolvedValue({
    totalRows: 2,
    validRows: 1,
    invalidRows: 1,
    missingFactorRows: 1,
    estimatedTCo2e: 0.5,
    rows: [
      { rowNumber: 2, valid: true, errors: [], payload: { category: "Stationary combustion" }, factor: { name: "Sample factor", isSample: true }, calculation: { emissionsKgCo2e: 500, emissionsTCo2e: 0.5 } },
      { rowNumber: 3, valid: false, errors: ["activityAmount must be greater than 0"], payload: { category: "Bad row" }, factor: null, calculation: null },
    ],
  });
  mocks.generateReport.mockResolvedValue({
    id: "report-1",
    name: "Carbon Ledger Report",
    type: "ESG",
    format: "CSV",
    status: "READY",
    downloadUrl: "/api/reports/download/report.csv",
    generatedAt: "2026-05-21T00:00:00.000Z",
  });
  mocks.downloadReport.mockResolvedValue(new Blob(["ok"], { type: "text/csv" }));
  mocks.getAuditTimeline.mockResolvedValue([
    { id: "log-1", action: "emission_record_created", timestamp: "2026-05-15T00:00:00.000Z", userEmail: "admin@example.com", source: "manual", newValueSummary: { dataStatus: "draft" } },
  ]);
  mocks.updateActivity.mockResolvedValue(buildRecord({ activityAmount: 200, emissionsKgCo2e: 536, emissionsTCo2e: 0.536 }));
});

describe("LedgerPage", () => {
  test("renders summary cards and activity form", async () => {
    await renderLedger();

    expect(screen.getByText("Approved Total Emissions")).toBeInTheDocument();
    expect(screen.getAllByText("Approved Scope 1").length).toBeGreaterThan(0);
    expect(screen.getByText("Record Emission Activity")).toBeInTheDocument();
    expect(screen.getByLabelText("Activity Amount")).toBeInTheDocument();
  });

  test("validates submitted activity amount and shows calculation preview states", async () => {
    await renderLedger();

    await screen.findByText("Calculation preview");
    expect(screen.getByText(/sample factor and should not be used for official reporting/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /submit for review/i }));
    expect(await screen.findByText("Activity amount must be greater than 0 before submitting.")).toBeInTheDocument();

    mocks.matchFactor.mockImplementation((query = "") => (
      String(query).includes("UNKNOWN")
        ? Promise.resolve(null)
        : Promise.resolve({
          factorValue: 2.68,
          value: 2.68,
          factorUnit: "kgCO2e/liter",
          sourceName: "CarbonFlow sample factors",
          sourceYear: 2026,
          isSample: true,
        })
    ));
    await userEvent.clear(screen.getByLabelText("Factor Key / Fuel"));
    await userEvent.type(screen.getByLabelText("Factor Key / Fuel"), "UNKNOWN");
    expect(await screen.findByText(/Missing factor warning/i)).toBeInTheDocument();
  });

  test("opens record details and filters records by status and factor status", async () => {
    await renderLedger();

    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText("Emission Record Details")).toBeInTheDocument();
    expect(screen.getByText(/Linked supplier supplier-1/i)).toBeInTheDocument();
    expect(await screen.findByText("Audit Timeline")).toBeInTheDocument();
    expect(await screen.findByText(/emission record created/i)).toBeInTheDocument();
    expect(screen.getByText("Factor Governance")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await userEvent.selectOptions(screen.getByDisplayValue("All statuses"), "submitted");
    await userEvent.selectOptions(screen.getByDisplayValue("All factor statuses"), "sample");

    await waitFor(() => {
      expect(mocks.getEntries).toHaveBeenLastCalledWith(expect.stringContaining("status=submitted"));
      expect(mocks.getEntries).toHaveBeenLastCalledWith(expect.stringContaining("factorStatus=sample"));
    });
  });

  test("edit form validates and saves recalculated record", async () => {
    await renderLedger();

    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const amountInput = screen.getByPlaceholderText("Activity amount");
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, "200");
    await userEvent.type(screen.getByPlaceholderText("Edit reason required"), "Corrected utility reading");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateActivity).toHaveBeenCalledWith("record-1", expect.objectContaining({
        activityAmount: 200,
        editReason: "Corrected utility reading",
      }));
    });
  });

  test("audit timeline failure is shown without crashing", async () => {
    mocks.getAuditTimeline.mockRejectedValueOnce(new Error("Timeline unavailable"));
    await renderLedger();

    await userEvent.click(screen.getByRole("button", { name: /details/i }));

    expect(await screen.findByText("Timeline unavailable")).toBeInTheDocument();
  });

  test("loads and selects supplier picker and supplier filter", async () => {
    await renderLedger();

    await userEvent.selectOptions(screen.getByLabelText("Linked Supplier"), "supplier-1");
    await userEvent.selectOptions(screen.getByDisplayValue("All suppliers"), "supplier-1");

    await waitFor(() => {
      expect(mocks.getEntries).toHaveBeenLastCalledWith(expect.stringContaining("supplierId=supplier-1"));
    });
    expect(screen.getAllByText(/Acme Fuels/).length).toBeGreaterThan(0);
  });

  test("opens Generate Report modal and calls report API", async () => {
    await renderLedger();

    await userEvent.click(screen.getByRole("button", { name: /generate report/i }));
    expect(screen.getByText("Generate Carbon Ledger Report")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Output"), "CSV");
    await userEvent.selectOptions(screen.getByLabelText("Record selection"), "all_records");
    await userEvent.click(within(screen.getByText("Generate Carbon Ledger Report").closest("div")!.parentElement!).getByRole("button", { name: /generate report/i }));

    await waitFor(() => {
      expect(mocks.generateReport).toHaveBeenCalledWith(expect.objectContaining({
        format: "CSV",
        metadata: expect.objectContaining({
          recordSelection: "all_records",
          includeUnapproved: true,
        }),
      }));
    });
    expect(await screen.findByText(/is ready/i)).toBeInTheDocument();
  });

  test("CSV import preview shows valid and invalid row counts", async () => {
    await renderLedger();

    await userEvent.type(screen.getByPlaceholderText(/scope,category/i), "scope,category\n1,Stationary combustion");
    await userEvent.click(screen.getByRole("button", { name: /preview csv/i }));

    expect(await screen.findByText("Total rows")).toBeInTheDocument();
    expect(screen.getAllByText("Valid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Invalid").length).toBeGreaterThan(0);
    expect(screen.getByText("activityAmount must be greater than 0")).toBeInTheDocument();
  });

  test("does not crash on empty API responses and empty suppliers", async () => {
    mocks.getEntries.mockResolvedValue(buildLedgerResponse([]));
    mocks.getSuppliers.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 } });

    await renderLedger();

    expect(screen.getByText("No suppliers available. Create a supplier first or save record without supplier.")).toBeInTheDocument();
    expect(screen.getByText("No emission records found.")).toBeInTheDocument();
  });
});
