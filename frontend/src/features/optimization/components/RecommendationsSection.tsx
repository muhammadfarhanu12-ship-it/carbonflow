import { CircleAlert, Loader2, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { RecommendationCard } from "./RecommendationCard";
import { OptimizationSummary } from "./OptimizationSummary";
import type { OptimizationAnalysisResult } from "../types";

type RecommendationsSectionProps = {
  loading: boolean;
  error: string | null;
  results: OptimizationAnalysisResult | null;
  onRetry: () => void;
};

function RecommendationSkeleton() {
  return (
    <Card className="border-border/70 bg-background/90 shadow-sm">
      <CardContent className="p-6">
        <div className="animate-pulse space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <div className="h-6 w-24 rounded-full bg-muted" />
              <div className="h-6 w-28 rounded-full bg-muted" />
            </div>
            <div className="h-11 w-11 rounded-2xl bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-6 w-3/4 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
          </div>
          <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/35 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-6 w-28 rounded bg-muted" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-6 w-24 rounded bg-muted" />
            </div>
          </div>
          <div className="h-10 rounded-md bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

export function RecommendationsSection({
  loading,
  error,
  results,
  onRetry,
}: RecommendationsSectionProps) {
  const hasRecommendations = Boolean(results?.recommendations.length);
  const hasResults = Boolean(results);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Top Recommendations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Refreshing optimization opportunities from your latest shipment and supplier data."
              : hasResults
                ? `Results for "${results?.query}".`
                : "Run an analysis to surface route, carrier, and supplier actions."}
          </p>
        </div>

        {loading ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analysis in progress
          </div>
        ) : null}
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Optimization analysis failed</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
            </div>

            <Button variant="outline" onClick={onRetry} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasResults && !loading ? <OptimizationSummary summary={results.summary} /> : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RecommendationSkeleton />
          <RecommendationSkeleton />
          <RecommendationSkeleton />
        </div>
      ) : hasRecommendations ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results?.recommendations.map((recommendation) => (
            <RecommendationCard key={recommendation.id} recommendation={recommendation} />
          ))}
        </div>
      ) : hasResults ? (
        <Card className="border-border/70 bg-background/90 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <SearchX className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No recommendations matched this query</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              CarbonFlow reviewed {results.summary.shipmentsAnalyzed.toLocaleString()} shipments and {results.summary.suppliersAnalyzed.toLocaleString()} suppliers, but this prompt did not produce a confident action set. Try a route-specific or carrier-specific question instead.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-border/80 bg-background/80">
          <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <SearchX className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Start with a supply-chain question</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Ask about emitting routes, carrier performance, or mode-shift scenarios and CarbonFlow will turn your live data into prioritized recommendations.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
