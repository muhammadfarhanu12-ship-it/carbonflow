import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, test, vi } from "vitest";
import { MarketplaceEmptyState } from "./MarketplaceEmptyState";
import { TransactionStatus } from "@/src/components/TransactionStatus";
import type { CarbonCreditTransaction } from "@/src/types/platform";

vi.mock("@/src/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/src/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

describe("marketplace production guardrails", () => {
  test("empty state does not present fake recommended listings", () => {
    render(<MarketplaceEmptyState recommendations={[]} />);

    expect(screen.getByText("No published carbon credit inventory is available")).toBeInTheDocument();
    expect(screen.getByText(/Add or publish a verified listing from admin before checkout/)).toBeInTheDocument();
    expect(screen.queryByText(/Delta Mangrove Restoration/)).not.toBeInTheDocument();
  });

  test("transaction status uses registry reference copy and demo disclaimer", () => {
    const transaction = {
      id: "txn-1",
      companyId: "company-1",
      companyName: "Acme",
      projectName: "Project",
      registry: "Registry not provided",
      vintageYear: 2026,
      pricePerTon: 10,
      pricePerTonUsd: 10,
      quantity: 1,
      credits: 1,
      totalCost: 10.2,
      totalCostUsd: 10.2,
      tCO2eRetired: 1,
      serialNumber: "CF-RET-2026-ABC123",
      status: "COMPLETED",
      paymentReference: "PAY-1",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      retiredAt: new Date().toISOString(),
      isDemo: true,
    } satisfies CarbonCreditTransaction;

    render(<TransactionStatus state="SUCCESS" transaction={transaction} />);

    expect(screen.getByText("Registry / Reference")).toBeInTheDocument();
    expect(screen.getByText(/Demo certificates are not valid for real offset claims/)).toBeInTheDocument();
    expect(screen.queryByText(/Registry \/ Hash/)).not.toBeInTheDocument();
  });
});
