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
  const debouncedInputValue = useDebouncedValue(inputValue, 500);
  const {
    loading,
    error,
    results,
    lastSubmittedQuery,
    analyze,
    retry,
    clearError,
  } = useOptimizationStore();

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

      await analyze(nextQuery);
    } catch {
      if (!optimizationService.normalizeQuery(nextQuery)) {
        inputRef.current?.focus();
      }
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
        suggestedQueries={optimizationService.suggestedQueries}
        onInputChange={setInputValue}
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
        onRetry={() => {
          void retry();
        }}
      />
    </div>
  );
}
