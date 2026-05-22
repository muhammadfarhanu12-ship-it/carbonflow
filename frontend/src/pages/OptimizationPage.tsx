import { useEffect, useRef, useState } from "react";
import { useToast } from "@/src/components/providers/ToastProvider";
import { OptimizationQueryPanel } from "@/src/features/optimization/components/OptimizationQueryPanel";
import { RecommendationsSection } from "@/src/features/optimization/components/RecommendationsSection";
import { useDebouncedValue } from "@/src/features/optimization/hooks/useDebouncedValue";
import { useOptimizationStore } from "@/src/features/optimization/hooks/useOptimizationStore";
import { optimizationService } from "@/src/features/optimization/services/optimizationService";

export function OptimizationPage() {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastErrorRef = useRef("");
  const [inputValue, setInputValue] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const debouncedInputValue = useDebouncedValue(inputValue, 500);
  const {
    loading,
    error,
    results,
    context,
    runs,
    exporting,
    lastSubmittedQuery,
    loadContext,
    loadRuns,
    analyze,
    retry,
    updateStatus,
    exportRun,
    openRun,
    clearError,
  } = useOptimizationStore();

  useEffect(() => {
    void loadContext();
    void loadRuns();
  }, [loadContext, loadRuns]);

  useEffect(() => {
    if (error && error !== lastErrorRef.current) {
      showToast({
        tone: "error",
        title: "Optimization analysis failed",
        description: error,
      });
      lastErrorRef.current = error;
      return;
    }

    if (!error) {
      lastErrorRef.current = "";
    }
  }, [error, showToast]);

  useEffect(() => {
    if (error && debouncedInputValue.trim()) {
      clearError();
    }
  }, [clearError, debouncedInputValue, error]);

  const helperText = loading
    ? `Analyzing "${lastSubmittedQuery || optimizationService.normalizeQuery(inputValue) || "your query"}" against live shipment and supplier data.`
    : debouncedInputValue.trim() && debouncedInputValue.trim() !== results?.query
      ? `Ready to analyze "${debouncedInputValue.trim()}".`
      : "Try a route, carrier, or cost-carbon question to generate data-backed recommendations.";

  async function runAnalysis(nextQuery: string) {
    try {
      const normalizedQuery = optimizationService.normalizeQuery(nextQuery);

      if (normalizedQuery) {
        setInputValue(normalizedQuery);
      }

      await analyze(nextQuery, filters);
    } catch {
      if (!optimizationService.normalizeQuery(nextQuery)) {
        inputRef.current?.focus();
      }
    }
  }

  async function downloadOptimizationRun(runId: string, format: "PDF" | "CSV") {
    try {
      const blob = await exportRun(runId, format);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `optimization-${runId}.${format.toLowerCase()}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      showToast({
        tone: "success",
        title: "Optimization export ready",
        description: `${format} export downloaded using your authenticated session.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Optimization export failed",
        description: error instanceof Error ? error.message : "Unable to export optimization report.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">AI Carbon Optimization</h1>
        <p className="mt-1 text-muted-foreground">
          Generate route, carrier, and supplier recommendations from live operational data.
        </p>
      </div>

      <OptimizationQueryPanel
        inputRef={inputRef}
        inputValue={inputValue}
        helperText={helperText}
        loading={loading}
        context={context}
        analysisMode={results?.analysisMode || context?.analysisMode}
        generatedAt={results?.generatedAt || context?.generatedAt}
        filters={filters}
        suggestedQueries={optimizationService.suggestedQueries}
        onInputChange={setInputValue}
        onFilterChange={(key, value) => {
          setFilters((current) => ({
            ...current,
            [key]: value,
          }));
        }}
        onAnalyze={() => {
          void runAnalysis(inputValue);
        }}
        onSuggestedQuery={(query) => {
          setInputValue(query);
          void runAnalysis(query);
        }}
      />

      <RecommendationsSection
        loading={loading}
        error={error}
        results={results}
        runs={runs}
        exporting={exporting}
        onRetry={() => {
          void retry();
        }}
        onStatusChange={(id, status) => {
          void updateStatus(id, status);
        }}
        onExport={(runId, format) => {
          void downloadOptimizationRun(runId, format);
        }}
        onOpenRun={(runId) => {
          void openRun(runId);
        }}
      />
    </div>
  );
}
