import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { SupplierQuestionnairePage } from "./SupplierQuestionnairePage";
import { publicQuestionnaireService } from "../services/publicQuestionnaireService";

vi.mock("../services/publicQuestionnaireService", () => ({
  publicQuestionnaireService: {
    getQuestionnaire: vi.fn(),
    submitQuestionnaire: vi.fn(),
  },
}));

function renderPage(token = "public-token") {
  return render(
    <MemoryRouter initialEntries={[`/supplier-questionnaire/${token}`]}>
      <Routes>
        <Route path="/supplier-questionnaire/:token" element={<SupplierQuestionnairePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SupplierQuestionnairePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders expired token state without requiring login", async () => {
    vi.mocked(publicQuestionnaireService.getQuestionnaire).mockResolvedValue({
      supplierId: "supplier-1",
      supplierName: "Expired Supplier",
      requestingCompanyName: "Acme Corp",
      companyName: "Acme Corp",
      dueDate: null,
      tokenExpiresAt: null,
      requestedFields: [],
      status: "expired",
      alreadySubmitted: false,
      expired: true,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Questionnaire expired")).toBeInTheDocument();
    });
  });

  test("renders public questionnaire form for a valid token", async () => {
    vi.mocked(publicQuestionnaireService.getQuestionnaire).mockResolvedValue({
      supplierId: "supplier-1",
      supplierName: "Good Supplier",
      requestingCompanyName: "Acme Corp",
      companyName: "Acme Corp",
      dueDate: "2026-06-01T00:00:00.000Z",
      tokenExpiresAt: "2026-06-08T00:00:00.000Z",
      requestedFields: ["Total emissions"],
      status: "opened",
      alreadySubmitted: false,
      expired: false,
    });

    renderPage();

    expect(await screen.findByText("Supplier Identity")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Good Supplier")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit questionnaire/i })).toBeInTheDocument();
  });
});
