import { BarChart3, Building2, CircleDollarSign, Leaf, Route } from "lucide-react";
import { Card, CardContent } from "@/src/components/ui/card";
import type { OptimizationSummary as OptimizationSummaryType } from "../types";

type OptimizationSummaryProps = {
  summary: OptimizationSummaryType;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatEmissionTonnes(value: number) {
  return `${value.toFixed(1)} tCO2e`;
}

function formatSignedCurrency(value: number) {
  const absoluteValue = currencyFormatter.format(Math.abs(value));

  if (value < 0) {
    return `-${absoluteValue}`;
  }

  if (value > 0) {
    return `+${absoluteValue}`;
  }

  return absoluteValue;
}

export function OptimizationSummary({ summary }: OptimizationSummaryProps) {
  const costToneClassName = summary.potentialCostImpact < 0
    ? "text-emerald-600"
    : summary.potentialCostImpact > 0
      ? "text-amber-600"
      : "text-foreground";

  const summaryItems = [
    {
      title: "Shipments analyzed",
      value: summary.shipmentsAnalyzed.toLocaleString(),
      detail: `${summary.routesAnalyzed} routes and ${summary.carriersAnalyzed} carriers`,
      icon: BarChart3,
    },
    {
      title: "Reduction opportunity",
      value: formatEmissionTonnes(summary.potentialEmissionReduction),
      detail: `${formatEmissionTonnes(summary.totalBaselineEmissions)} baseline emissions`,
      icon: Leaf,
    },
    {
      title: "Cost impact",
      value: formatSignedCurrency(summary.potentialCostImpact),
      detail: summary.potentialCostImpact < 0 ? "Estimated savings" : "Estimated investment",
      icon: CircleDollarSign,
      valueClassName: costToneClassName,
    },
    {
      title: "Supplier coverage",
      value: summary.suppliersAnalyzed.toLocaleString(),
      detail: currencyFormatter.format(summary.totalBaselineCost),
      icon: Building2,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {summaryItems.map((item) => (
        <Card key={item.title} className="border-border/70 bg-background/80 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{item.title}</p>
                <p className={`mt-3 text-2xl font-semibold tracking-tight text-foreground ${item.valueClassName || ""}`}>{item.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="md:col-span-2 xl:col-span-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Route className="h-3.5 w-3.5" />
          Analysis generated {new Date(summary.generatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
