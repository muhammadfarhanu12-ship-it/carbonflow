import type { RefObject } from "react";
import { ArrowRightLeft, Building2, Loader2, Route, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";

type OptimizationQueryPanelProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  helperText: string;
  loading: boolean;
  suggestedQueries: string[];
  onInputChange: (value: string) => void;
  onAnalyze: () => void;
  onSuggestedQuery: (query: string) => void;
};

const coverageItems = [
  {
    title: "Routes & lanes",
    description: "Surface the highest-emission shipping lanes and consolidation opportunities.",
    icon: Route,
  },
  {
    title: "Carrier benchmarks",
    description: "Compare fleet and carrier performance using your historical shipment data.",
    icon: ArrowRightLeft,
  },
  {
    title: "Supplier mix",
    description: "Highlight supplier-side Scope 3 opportunities with procurement context built in.",
    icon: Building2,
  },
];

export function OptimizationQueryPanel({
  inputRef,
  inputValue,
  helperText,
  loading,
  suggestedQueries,
  onInputChange,
  onAnalyze,
  onSuggestedQuery,
}: OptimizationQueryPanelProps) {
  return (
    <Card className="overflow-hidden border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.02),rgba(16,185,129,0.04))]">
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-6 md:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              AI Carbon Optimization
            </div>

            <div className="mt-5 max-w-3xl space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Ask CarbonFlow AI</h2>
              <p className="text-sm leading-6 text-muted-foreground md:text-base">
                Analyze your shipment network with live route, carrier, and supplier data to identify the highest-impact carbon reduction moves.
              </p>
            </div>

            <form
              className="mt-6"
              onSubmit={(event) => {
                event.preventDefault();
                onAnalyze();
              }}
            >
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(event) => onInputChange(event.target.value)}
                  placeholder="e.g., How can we reduce emissions by 20% on our Asia-Pacific lanes?"
                  className="h-12 flex-1 border-border/70 bg-background/85 px-4 text-sm shadow-sm"
                />
                <Button type="submit" className="h-12 min-w-36" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {loading ? "Analyzing..." : "Analyze"}
                </Button>
              </div>
            </form>

            <p className="mt-3 text-xs text-muted-foreground">{helperText}</p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Suggested</span>
              {suggestedQueries.map((query) => (
                <button
                  key={query}
                  type="button"
                  onClick={() => onSuggestedQuery(query)}
                  disabled={loading}
                  className="rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 bg-background/70 p-6 lg:border-t-0 lg:border-l">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Analysis coverage</p>

            <div className="mt-5 space-y-4">
              {coverageItems.map((item) => (
                <div key={item.title} className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
