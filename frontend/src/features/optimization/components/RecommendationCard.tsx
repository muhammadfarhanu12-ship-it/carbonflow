import { ArrowRight, ArrowRightLeft, Building2, CircleDollarSign, Database, Leaf, Route, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import type { OptimizationRecommendation, OptimizationStatus } from "../types";

type RecommendationCardProps = {
  recommendation: OptimizationRecommendation;
  onStatusChange: (id: string, status: OptimizationStatus) => void;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const priorityClasses = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-sky-200 bg-sky-50 text-sky-700",
  low: "border-slate-200 bg-slate-100 text-slate-700",
} satisfies Record<OptimizationRecommendation["priority"], string>;

const iconByCategory = {
  route: Route,
  mode_shift: ArrowRightLeft,
  carrier: ArrowRightLeft,
  supplier: Building2,
  data_quality: Database,
  financial: CircleDollarSign,
} satisfies Record<OptimizationRecommendation["category"], typeof Route>;

function formatTco2e(value: number | null) {
  if (value === null || value === undefined) return "Insufficient data";
  return `${value.toFixed(1)} tCO2e`;
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "Insufficient data";
  const absoluteValue = currencyFormatter.format(Math.abs(value));
  return `${value < 0 ? "-" : value > 0 ? "+" : ""}${absoluteValue}`;
}

function recommendationId(recommendation: OptimizationRecommendation) {
  return recommendation.id || recommendation._id || recommendation.recommendationId;
}

export function RecommendationCard({ recommendation, onStatusChange }: RecommendationCardProps) {
  const Icon = iconByCategory[recommendation.category] || Leaf;
  const id = recommendationId(recommendation);

  return (
    <Card className="h-full border-border/70 bg-background/90 shadow-sm">
      <CardContent className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${priorityClasses[recommendation.priority]}`}>
              {recommendation.priority}
            </span>
            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
              {recommendation.category.replace("_", " ")}
            </span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
              {recommendation.status || "suggested"}
            </span>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{recommendation.title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{recommendation.explanation}</p>
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-border/60 bg-muted/35 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Savings</p>
            <p className="mt-2 text-base font-semibold text-emerald-600">{formatTco2e(recommendation.estimatedTco2eSavings)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cost</p>
            <p className="mt-2 text-base font-semibold text-foreground">{formatCurrency(recommendation.estimatedCostImpact)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Confidence</p>
            <p className="mt-2 text-base font-semibold text-foreground">{Math.round(recommendation.confidenceScore * 100)}%</p>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div>
            <p className="font-semibold text-foreground">Calculation basis</p>
            <p className="mt-1 text-muted-foreground">{recommendation.calculationBasis || "Insufficient data to estimate savings"}</p>
          </div>
          {recommendation.assumptions.length ? (
            <div>
              <p className="font-semibold text-foreground">Assumptions</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {recommendation.assumptions.slice(0, 3).map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {recommendation.nextActions.length ? (
            <div>
              <p className="font-semibold text-foreground">Next actions</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {recommendation.nextActions.slice(0, 3).map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-auto pt-6">
          <div className="grid grid-cols-2 gap-2">
            {(["planned", "in_progress", "implemented", "dismissed"] as OptimizationStatus[]).map((status) => (
              <Button
                key={status}
                type="button"
                variant="outline"
                className="h-9 justify-center text-xs capitalize"
                onClick={() => onStatusChange(id, status)}
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                {status.replace("_", " ")}
              </Button>
            ))}
          </div>
          <Button asChild variant="outline" className="mt-3 w-full justify-between">
            <Link to={recommendation.affectedShipments.length ? `/app/shipments?search=${recommendation.affectedShipments[0]}` : "/app/ledger"}>
              Review affected data
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
