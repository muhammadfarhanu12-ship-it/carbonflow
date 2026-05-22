import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { ReportsPage } from "./ReportsPage";
import { ToastProvider } from "@/src/components/providers/ToastProvider";

const mocks = vi.hoisted(() => ({
  getReports: vi.fn(),
  checkReadiness: vi.fn(),
  generateReport: vi.fn(),
  downloadReportFile: vi.fn(),
  archiveReport: vi.fn(),
  regenerateReport: vi.fn(),
  socketOn: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/src/services/reportsService", () => ({
  reportsService: {
    getReports: mocks.getReports,
    checkReadiness: mocks.checkReadiness,
    generateReport: mocks.generateReport,
    downloadReportFile: mocks.downloadReportFile,
    archiveReport: mocks.archiveReport,
    regenerateReport: mocks.regenerateReport,
  },
}));

vi.mock("@/src/services/socketService", () => ({
  socketService: {
    on: mocks.socketOn,
  },
}));

vi.mock("@/src/services/authService", () => ({
  authService: {
    getSession: mocks.getSession,
  },
}));

function renderReports() {
  return render(
    <ToastProvider>
      <ReportsPage />
    </ToastProvider>,
  );
}

const readiness = {
  approvedRecordsCount: 3,
  draftRecordsCount: 1,
  submittedRecordsCount: 1,
  rejectedRecordsCount: 0,
  needsCorrectionRecordsCount: 0,
  missingFactorCount: 1,
  sampleFactorCount: 2,
  staleFactorCount: 0,
  zeroAmountCount: 0,
  calculationErrorCount: 0,
  supplierLinkedCount: 2,
  unlinkedSupplierCount: 1,
  officialFactorCount: 1,
  customFactorCount: 0,
  reportingPeriodCoverage: { recordCount: 5 },
  canGenerateApprovedReport: false,
  canGenerateInternalReport: true,
  blockers: [],
  warnings: ["1 records have missing emission factors.", "2 records use sample emission factors."],
  recommendations: [],
};

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.socketOn.mockReturnValue(() => undefined);
    mocks.getSession.mockReturnValue({ token: "token", refreshToken: null, user: { id: "user-1", role: "ADMIN", companyId: "company-1", name: "Admin", email: "admin@example.com" } });
    mocks.checkReadiness.mockResolvedValue(readiness);
    mocks.getReports.mockResolvedValue({
      data: [{
        id: "report-1",
        name: "Approved ESG Report",
        type: "ESG",
        reportType: "esg_pdf",
        format: "PDF",
        generatedAt: "2026-05-22T00:00:00.000Z",
        status: "completed",
        downloadUrl: "/api/reports/report-1/download",
        missingFactorCount: 1,
        sampleFactorCount: 2,
        unapprovedRecordCount: 0,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    mocks.generateReport.mockResolvedValue({});
    mocks.downloadReportFile.mockResolvedValue({ blob: new Blob(["pdf"]), fileName: "report.pdf" });
    URL.createObjectURL = vi.fn(() => "blob:report");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  test("renders readiness warnings and recent reports", async () => {
    renderReports();

    expect(await screen.findByText("Compliance & Reporting")).toBeInTheDocument();
    expect(await screen.findByText("Approved ESG Report")).toBeInTheDocument();
    expect(screen.getByText("Missing Factors")).toBeInTheDocument();
    expect(screen.getByText(/sample emission factors/i)).toBeInTheDocument();
  });

  test("opens generate modal and submits approved-only report payload", async () => {
    renderReports();
    await screen.findByText("Approved ESG Report");

    await userEvent.click(screen.getByRole("button", { name: /generate new report/i }));
    expect(await screen.findByRole("heading", { name: "Generate New Report" })).toBeInTheDocument();
    expect(screen.getByText("Approved records only")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^generate$/i }));

    await waitFor(() => {
      expect(mocks.generateReport).toHaveBeenCalledWith(expect.objectContaining({
        reportType: "esg_pdf",
        outputFormat: "PDF",
        inclusionPolicy: "approved_only",
      }));
    });
  });

  test("uses authenticated report service for downloads", async () => {
    renderReports();
    await screen.findByText("Approved ESG Report");

    await userEvent.click(screen.getByRole("button", { name: /download approved esg report/i }));

    await waitFor(() => {
      expect(mocks.downloadReportFile).toHaveBeenCalled();
    });
  });

  test("shows permission denial for users without generate permission", async () => {
    mocks.getSession.mockReturnValue({ token: "token", refreshToken: null, user: { id: "viewer-1", role: "VIEWER", companyId: "company-1", name: "Viewer", email: "viewer@example.com" } });
    renderReports();

    expect(await screen.findByText("You do not have permission to perform this action.")).toBeInTheDocument();
  });
});
