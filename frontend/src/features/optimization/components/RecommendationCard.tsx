import { ArrowRight, ArrowRightLeft, Building2, Leaf, Route } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import type { OptimizationRecommendation } from "../types";

type RecommendationCardProps = {
  recommendation: OptimizationRecommendation;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const impactBadgeClasses = {
  High: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Medium: "border-sky-200 bg-sky-50 text-sky-700",
  Low: "border-slate-200 bg-slate-100 text-slate-700",
} satisfies Record<OptimizationRecommendation["impactLevel"], string>;

const iconByType = {
  "Route Optimization": Route,
  "Carrier Switch": ArrowRightLeft,
  "Supplier Collaboration": Building2,
} satisfies Record<string, typeof Route>;

function formatEmissionReduction(value: number) {
  const absoluteValue = Math.abs(value).toFixed(1);
  return `${value < 0 ? "-" : "+"}${absoluteValue} tCO2e`;
}

function formatSignedCurrency(value: number) {
  const absoluteValue = currencyFormatter.format(Math.abs(value));
  return `${value < 0 ? "-" : value > 0 ? "+" : ""}${absoluteValue}`;
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const Icon = iconByType[recommendation.type] || Leaf;
  const costToneClassName = recommendation.costImpact < 0
    ? "text-emerald-600"
    : recommendation.costImpact > 0
      ? "text-amber-600"
      : "text-foreground";
  const costLabel = recommendation.costImpact < 0 ? "Estimated Cost Savings" : "Estimated Cost Impact";

  return (
    <Card className="h-full border-border/70 bg-background/90 shadow-sm">
      <CardContent className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${impactBadgeClasses[recommendation.impactLevel]}`}>
              {recommendation.impactLevel} Impact
            </span>
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {recommendation.type}
            </span>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{recommendation.title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{recommendation.description}</p>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl border border-border/60 bg-muted/35 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Emission Reduction</p>
            <p className="mt-2 text-lg font-semibold text-emerald-600">{formatEmissionReduction(recommendation.emissionReduction)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{costLabel}</p>
            <p className={`mt-2 text-lg font-semibold ${costToneClassName}`}>{formatSignedCurrency(recommendation.costImpact)}</p>
          </div>
        </div>

        <div className="mt-6">
          <Button asChild variant="outline" className="w-full justify-between">
            <Link to={recommendation.actionUrl}>
              {recommendation.actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
