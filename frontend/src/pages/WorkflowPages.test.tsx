import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { EmissionFactorsPage } from "./EmissionFactorsPage";
import { DataImportsPage } from "./DataImportsPage";
import { ApprovalsPage } from "./ApprovalsPage";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  factorList: vi.fn(),
  factorCreate: vi.fn(),
  factorPreviewImport: vi.fn(),
  importList: vi.fn(),
  importPreview: vi.fn(),
  importCommitById: vi.fn(),
  approvalsSummary: vi.fn(),
  approvalsList: vi.fn(),
  approvalsGet: vi.fn(),
  approvalsApprove: vi.fn(),
  approvalsReject: vi.fn(),
  approvalsCorrection: vi.fn(),
}));

vi.mock("@/src/hooks/useAuth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/src/services/factorLibraryService", () => ({
  factorLibraryService: {
    list: mocks.factorList,
    create: mocks.factorCreate,
    update: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    previewImport: mocks.factorPreviewImport,
    commitImport: vi.fn(),
  },
}));
vi.mock("@/src/components/providers/ToastProvider", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/src/services/importWorkflowService", () => ({
  importWorkflowService: {
    list: mocks.importList,
    templateUrl: () => "https://example.test/template.csv",
    errorReportUrl: () => "https://example.test/errors.csv",
    preview: mocks.importPreview,
    commitById: mocks.importCommitById,
    commit: vi.fn(),
  },
}));
vi.mock("@/src/services/approvalsService", () => ({
  approvalsService: {
    summary: mocks.approvalsSummary,
    list: mocks.approvalsList,
    get: mocks.approvalsGet,
    approve: mocks.approvalsApprove,
    reject: mocks.approvalsReject,
    requestCorrection: mocks.approvalsCorrection,
    assign: vi.fn(),
  },
}));

describe("new user-side workflow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.factorList.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 }, summary: { customFactors: 0, officialFactors: 0, sampleFactors: 0, missingFactorsReferenced: 0 } });
    mocks.factorCreate.mockResolvedValue({ id: "factor-1" });
    mocks.factorPreviewImport.mockResolvedValue({ totalRows: 1, validRows: 1, invalidRows: 0, duplicateWarnings: 0, rows: [{ rowNumber: 2, valid: true, errors: [], warnings: [], payload: { factorKey: "DIESEL" } }] });
    mocks.importList.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
    mocks.importPreview.mockResolvedValue({ previewId: "import-1", totalRows: 2, validRows: 1, invalidRows: 1, missingFactorRows: 1, sampleFactorRows: 0, warningRows: 1, estimatedCreatedRecords: 1, rows: [{ rowNumber: 2, valid: true, errors: [], warnings: ["Sample factor warning"], payload: {} }, { rowNumber: 3, valid: false, errors: ["activityAmount must be greater than 0"], warnings: [], payload: {} }] });
    mocks.importCommitById.mockResolvedValue({ previewId: "import-1", totalRows: 2, validRows: 1, invalidRows: 1, createdCount: 1, rows: [] });
    mocks.approvalsSummary.mockResolvedValue({ pendingEmissionApprovals: 0, supplierEvidenceReviews: 0, budgetRequests: 0, marketplaceReviews: 0, factorReviews: 0, importIssues: 0, totalPending: 0 });
    mocks.approvalsList.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 0, total: 0, totalPages: 1 } });
    mocks.approvalsGet.mockImplementation((_type, id) => Promise.resolve({ id, type: "emission_record", title: "Diesel record", status: "submitted", priority: "medium", submittedBy: "user-1", submittedAt: new Date().toISOString(), relatedEntityId: id, relatedEntityLabel: id, module: "emissions", dataQualityWarnings: [], riskFlags: [], availableActions: [{ action: "approve", enabled: true }, { action: "reject", enabled: true, requiresReason: true }, { action: "request_correction", enabled: true, requiresNotes: true }], dataSummary: { scope: 1, category: "Stationary combustion" }, reviewChecklist: ["Factor source reviewed"], auditTimeline: [] }));
    mocks.approvalsApprove.mockResolvedValue({});
    mocks.approvalsReject.mockResolvedValue({});
    mocks.approvalsCorrection.mockResolvedValue({});
  });

  test("Emission Factors empty state renders", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "ADMIN" } });
    render(<EmissionFactorsPage />);
    expect(await screen.findByText(/No factors found/i)).toBeInTheDocument();
  });

  test("Emission Factors read-only user sees library but not create form", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "VIEWER" } });
    render(<EmissionFactorsPage />);
    expect(await screen.findByText(/You can view emission factors/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create/i })).not.toBeInTheDocument();
  });

  test("Emission Factors no factor:view user sees permission denied", () => {
    mocks.useAuth.mockReturnValue({ user: { role: "DATA_ENTRY" } });
    render(<EmissionFactorsPage />);
    expect(screen.getByText("You do not have permission to view emission factors.")).toBeInTheDocument();
  });

  test("Emission Factors manager sees create form and sample warning", async () => {
    mocks.factorList.mockResolvedValue({
      data: [{ id: "sample:1", scope: 1, category: "Stationary combustion", activityType: "stationary_fuel", factorKey: "DIESEL", activityUnit: "liter", factorValue: 2.68, factorUnit: "kgCO2e/liter", sourceName: "CarbonFlow Sample Factor", sourceYear: 2026, region: "GLOBAL", isSample: true, isOfficial: false, isCustom: false, isActive: true }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      summary: { customFactors: 0, officialFactors: 0, sampleFactors: 1, missingFactorsReferenced: 0 },
    });
    mocks.useAuth.mockReturnValue({ user: { role: "MANAGER" } });
    render(<EmissionFactorsPage />);
    expect(await screen.findByText(/Sample factors are fallback placeholders/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create/i })).toBeInTheDocument();
  });

  test("Data Imports empty state renders", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "DATA_ENTRY" } });
    render(<MemoryRouter><DataImportsPage /></MemoryRouter>);
    expect(await screen.findByText(/No imports recorded yet/i)).toBeInTheDocument();
  });

  test("Data Imports read-only user sees history but upload disabled", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "VIEWER" } });
    render(<MemoryRouter><DataImportsPage /></MemoryRouter>);
    expect(await screen.findByText(/You can view import history/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Preview Import/i })).not.toBeInTheDocument();
  });

  test("Data Imports no import:view user sees permission denied", () => {
    mocks.useAuth.mockReturnValue({ user: { role: "NO_ACCESS", permissions: [] } });
    render(<MemoryRouter><DataImportsPage /></MemoryRouter>);
    expect(screen.getByText("You do not have permission to view imports.")).toBeInTheDocument();
  });

  test("Data Imports preview and detail drawer render row errors", async () => {
    mocks.importList.mockResolvedValue({
      data: [{ id: "import-1", importType: "emission_activity", fileName: "ledger.csv", status: "previewed", totalRows: 2, validRows: 1, invalidRows: 1, createdRecords: 0, uploadedBy: "user@example.com", uploadedAt: new Date().toISOString(), rowErrors: [{ rowNumber: 3, message: "activityAmount must be greater than 0" }], rowWarnings: [{ rowNumber: 2, message: "Sample factor warning" }] }],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    mocks.useAuth.mockReturnValue({ user: { role: "DATA_ENTRY" } });
    render(<MemoryRouter><DataImportsPage /></MemoryRouter>);
    expect(await screen.findByText("ledger.csv")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Paste CSV data/i), { target: { value: "scope,category\n1,Stationary combustion" } });
    fireEvent.click(screen.getByRole("button", { name: /Preview Import/i }));
    expect(await screen.findByText(/activityAmount must be greater than 0/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    expect(await screen.findByText(/Import Details/i)).toBeInTheDocument();
  });

  test("Approvals empty state renders", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "MANAGER" } });
    render(<ApprovalsPage />);
    expect(await screen.findByText(/No pending approvals/i)).toBeInTheDocument();
  });

  test("Approvals queue table and detail drawer render item data", async () => {
    mocks.approvalsSummary.mockResolvedValue({ pendingEmissionApprovals: 1, supplierEvidenceReviews: 0, budgetRequests: 0, marketplaceReviews: 0, factorReviews: 0, importIssues: 0, totalPending: 1 });
    mocks.approvalsList.mockResolvedValue({ data: [{ id: "record-1", type: "emission_record", title: "Diesel record", status: "submitted", priority: "medium", submittedBy: "user-1", submittedAt: new Date().toISOString(), relatedEntityId: "record-1", relatedEntityLabel: "record-1", module: "emissions", dataQualityWarnings: ["Sample factor used"], riskFlags: [], availableActions: [{ action: "approve", enabled: true }, { action: "reject", enabled: true, requiresReason: true }, { action: "request_correction", enabled: true, requiresNotes: true }] }], pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 } });
    mocks.approvalsGet.mockResolvedValueOnce({ id: "record-1", type: "emission_record", title: "Diesel record", status: "submitted", priority: "medium", submittedBy: "user-1", submittedAt: new Date().toISOString(), relatedEntityId: "record-1", relatedEntityLabel: "record-1", module: "emissions", dataQualityWarnings: ["Sample factor used"], riskFlags: [], availableActions: [{ action: "approve", enabled: true }, { action: "reject", enabled: true, requiresReason: true }, { action: "request_correction", enabled: true, requiresNotes: true }], dataSummary: { scope: 1, category: "Stationary combustion" }, reviewChecklist: ["Factor source reviewed"], auditTimeline: [] });
    mocks.useAuth.mockReturnValue({ user: { role: "MANAGER" } });
    render(<ApprovalsPage />);
    expect(await screen.findByText("Diesel record")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View Details/i }));
    expect(await screen.findByText(/Data Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Sample factor used/i)).toBeInTheDocument();
  });

  test("Approvals reject action requires reason", async () => {
    mocks.approvalsList.mockResolvedValue({ data: [{ id: "record-1", type: "emission_record", title: "Diesel record", status: "submitted", priority: "medium", submittedBy: "user-1", submittedAt: new Date().toISOString(), relatedEntityId: "record-1", relatedEntityLabel: "record-1", module: "emissions", dataQualityWarnings: [], riskFlags: [], availableActions: [{ action: "approve", enabled: true }, { action: "reject", enabled: true, requiresReason: true }, { action: "request_correction", enabled: true, requiresNotes: true }] }], pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 } });
    mocks.useAuth.mockReturnValue({ user: { role: "MANAGER" } });
    render(<ApprovalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /View Details/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Reject$/i }));
    expect(await screen.findByText(/Rejection reason is required/i)).toBeInTheDocument();
    expect(mocks.approvalsReject).not.toHaveBeenCalled();
  });

  test("permission denied state renders", () => {
    mocks.useAuth.mockReturnValue({ user: { role: "DATA_ENTRY" } });
    render(<ApprovalsPage />);
    expect(screen.getByText(/You do not have permission/i)).toBeInTheDocument();
  });
});
