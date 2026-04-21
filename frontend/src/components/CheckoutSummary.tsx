import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

interface CheckoutSummaryProps {
  companyName: string;
  projectName: string;
  registry: string;
  vintageYear: number;
  quantity: number;
  pricePerTon: number;
  shipmentReference?: string | null;
  subtotal: number;
  platformFee: number;
  totalCost: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function CheckoutSummary({
  companyName,
  projectName,
  registry,
  vintageYear,
  quantity,
  pricePerTon,
  shipmentReference,
  subtotal,
  platformFee,
  totalCost,
}: CheckoutSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Checkout Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SummaryRow label="Company Name" value={companyName || "Enter company name"} />
        <SummaryRow label="Project Name" value={projectName || "Select a project"} />
        <SummaryRow label="Registry" value={registry || "Not available"} />
        <SummaryRow label="Vintage Year" value={String(vintageYear || "-")} />
        <SummaryRow label="Linked Shipment" value={shipmentReference || "No shipment linked"} />
        <SummaryRow label="Quantity (tCO2e)" value={quantity.toLocaleString()} />
        <SummaryRow label="Price per ton" value={formatCurrency(pricePerTon)} />
        <div className="rounded-xl border border-border bg-muted/20 px-3 py-3">
          <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
          <SummaryRow label="Platform Fee (2%)" value={formatCurrency(platformFee)} />
          <div className="mt-3 border-t border-border pt-3">
            <SummaryRow label="Total Cost" value={formatCurrency(totalCost)} emphasized />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasized ? "font-semibold text-foreground" : "font-medium text-foreground"}>{value}</span>
    </div>
  );
}
