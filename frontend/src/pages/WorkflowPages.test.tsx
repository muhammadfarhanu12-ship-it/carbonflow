import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { EmissionFactorsPage } from "./EmissionFactorsPage";
import { DataImportsPage } from "./DataImportsPage";
import { ApprovalsPage } from "./ApprovalsPage";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  factorList: vi.fn(),
  importList: vi.fn(),
  approvalsSummary: vi.fn(),
  approvalsList: vi.fn(),
}));

vi.mock("@/src/hooks/useAuth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/src/services/factorLibraryService", () => ({
  factorLibraryService: {
    list: mocks.factorList,
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    previewImport: vi.fn(),
    commitImport: vi.fn(),
  },
}));
vi.mock("@/src/services/importWorkflowService", () => ({
  importWorkflowService: {
    list: mocks.importList,
    templateUrl: () => "https://example.test/template.csv",
    preview: vi.fn(),
    commit: vi.fn(),
  },
}));
vi.mock("@/src/services/approvalsService", () => ({
  approvalsService: {
    summary: mocks.approvalsSummary,
    list: mocks.approvalsList,
    approve: vi.fn(),
    reject: vi.fn(),
    requestCorrection: vi.fn(),
  },
}));

describe("new user-side workflow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.factorList.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 } });
    mocks.importList.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 } });
    mocks.approvalsSummary.mockResolvedValue({ pendingEmissionApprovals: 0, supplierEvidenceReviews: 0, budgetRequests: 0, marketplaceReviews: 0, factorReviews: 0, importIssues: 0, totalPending: 0 });
    mocks.approvalsList.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 0, total: 0, totalPages: 1 } });
  });

  test("Emission Factors empty state renders", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "ADMIN" } });
    render(<EmissionFactorsPage />);
    expect(await screen.findByText(/No custom emission factors yet/i)).toBeInTheDocument();
  });

  test("Data Imports empty state renders", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "DATA_ENTRY" } });
    render(<DataImportsPage />);
    expect(await screen.findByText(/No imports recorded yet/i)).toBeInTheDocument();
  });

  test("Approvals empty state renders", async () => {
    mocks.useAuth.mockReturnValue({ user: { role: "MANAGER" } });
    render(<ApprovalsPage />);
    expect(await screen.findByText(/No pending approvals/i)).toBeInTheDocument();
  });

  test("permission denied state renders", () => {
    mocks.useAuth.mockReturnValue({ user: { role: "DATA_ENTRY" } });
    render(<ApprovalsPage />);
    expect(screen.getByText(/You do not have permission/i)).toBeInTheDocument();
  });
});
