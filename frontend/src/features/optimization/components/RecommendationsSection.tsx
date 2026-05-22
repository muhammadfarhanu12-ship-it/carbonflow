import { CircleAlert, Download, FileSpreadsheet, FileText, Loader2, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { RecommendationCard } from "./RecommendationCard";
import { OptimizationSummary } from "./OptimizationSummary";
import type { OptimizationAnalysisResult, OptimizationRun, OptimizationStatus } from "../types";

type RecommendationsSectionProps = {
  loading: boolean;
  error: string | null;
  results: OptimizationAnalysisResult | null;
  runs: OptimizationRun[];
  exporting: boolean;
  onRetry: () => void;
  onStatusChange: (id: string, status: OptimizationStatus) => void;
  onExport: (runId: string, format: "PDF" | "CSV") => void;
  onOpenRun: (runId: string) => void;
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
  runs,
  exporting,
  onRetry,
  onStatusChange,
  onExport,
  onOpenRun,
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

      {results?.runId ? (
        <Card className="border-border/70 bg-background/90 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Export latest optimization run</p>
              <p className="text-xs text-muted-foreground">
                Downloads use authenticated API requests and include data coverage, recommendations, assumptions, warnings, and limitations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => onExport(results.runId!, "PDF")} disabled={exporting}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                PDF
              </Button>
              <Button variant="outline" onClick={() => onExport(results.runId!, "CSV")} disabled={exporting}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

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

      {hasResults && !loading ? (
        <div className="space-y-4">
          <OptimizationSummary summary={results.summary} />
          <Card className="border-border/70 bg-background/90 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-foreground">{results.answerSummary}</p>
              {results.dataQualityIssues.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {results.dataQualityIssues.map((issue) => (
                    <div key={issue.code} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <span className="font-semibold capitalize">{issue.severity}: </span>
                      {issue.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RecommendationSkeleton />
          <RecommendationSkeleton />
          <RecommendationSkeleton />
        </div>
      ) : hasRecommendations ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results?.recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id || recommendation._id || recommendation.recommendationId}
              recommendation={recommendation}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      ) : hasResults ? (
        <Card className="border-border/70 bg-background/90 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <SearchX className="h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No recommendations matched this query</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              CarbonFlow reviewed {results.summary.totalShipmentsAnalyzed.toLocaleString()} shipments and {results.summary.suppliersAnalyzed.toLocaleString()} suppliers, but this prompt did not produce a confident action set. No fake recommendations were generated.
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

      {runs.length ? (
        <Card className="border-border/70 bg-background/90 shadow-sm">
          <CardContent className="p-0">
            <div className="border-b px-5 py-4">
              <h3 className="font-semibold text-foreground">Recent Optimization Runs</h3>
              <p className="text-sm text-muted-foreground">Open or export saved company-scoped analyses.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Question</th>
                    <th className="px-5 py-3 font-medium">Mode</th>
                    <th className="px-5 py-3 font-medium">Recommendations</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.slice(0, 8).map((run) => {
                    const runId = run.id || run._id || "";
                    return (
                      <tr key={runId}>
                        <td className="max-w-md px-5 py-3 font-medium text-foreground">{run.question}</td>
                        <td className="px-5 py-3">{run.analysisMode.replace("_", " ")}</td>
                        <td className="px-5 py-3">{run.recommendationCount ?? run.recommendations?.length ?? 0}</td>
                        <td className="px-5 py-3">{new Date(run.createdAt).toLocaleString()}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => onOpenRun(runId)}>Open</Button>
                            <Button variant="ghost" size="sm" onClick={() => onExport(runId, "CSV")} disabled={exporting}>
                              <Download className="mr-1.5 h-4 w-4" />
                              CSV
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
