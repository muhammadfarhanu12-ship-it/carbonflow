import { render, screen } from "@testing-library/react";
import { EvidenceStatusBadge, QuestionnaireStatusBadge } from "./SuppliersPage";

describe("QuestionnaireStatusBadge", () => {
  test("renders supplier questionnaire status badges", () => {
    render(
      <div>
        <QuestionnaireStatusBadge status="not_sent" />
        <QuestionnaireStatusBadge status="sent" />
        <QuestionnaireStatusBadge status="submitted" />
        <QuestionnaireStatusBadge status="overdue" />
      </div>,
    );

    expect(screen.getByText("Not Sent")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });
});

describe("EvidenceStatusBadge", () => {
  test("renders evidence empty and warning states", () => {
    render(
      <div>
        <EvidenceStatusBadge status="missing" />
        <EvidenceStatusBadge status="expired" />
        <EvidenceStatusBadge status="under_review" />
        <EvidenceStatusBadge status="complete" />
      </div>,
    );

    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });
});
