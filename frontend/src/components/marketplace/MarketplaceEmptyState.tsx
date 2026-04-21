import { Lightbulb, SearchX, Sparkles, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export interface MarketplaceActiveFilter {
  key: string;
  label: string;
  value: string;
}

export interface MarketplaceRecommendation {
  id: string;
  name: string;
  type: string;
  location: string;
  pricePerTonUsd: number;
  rating?: number | null;
  registry?: string | null;
}

interface MarketplaceEmptyStateProps {
  activeFilters?: MarketplaceActiveFilter[];
  recommendations?: MarketplaceRecommendation[];
  onRemoveFilter?: (filterKey: string) => void;
  onRequestCustomSourcing?: () => void;
  onReset?: () => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.max(Number(value) || 0, 0));
}

export function MarketplaceEmptyState({
  activeFilters = [],
  recommendations = [],
  onRemoveFilter,
  onRequestCustomSourcing,
  onReset,
}: MarketplaceEmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.14),transparent_36%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.94))] px-6 py-8 shadow-sm">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-300/40">
            <SearchX className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No listings match these filters</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            Try widening the search, remove a few constraints, or explore route-aligned recommendations below.
          </p>
        </div>

        {activeFilters.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-emerald-700" />
              Active Filters
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter) => (
                <div
                  key={filter.key}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium text-slate-700">{filter.label}:</span>
                  <span className="text-slate-900">{filter.value}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${filter.label} filter`}
                    className="rounded-full p-0.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                    onClick={() => onRemoveFilter?.(filter.key)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(236,253,245,0.92),rgba(255,255,255,0.95))] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb className="h-4 w-4 text-emerald-700" />
            Recommended for Your Typical Routes
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {recommendations.slice(0, 2).map((project) => (
              <article key={project.id} className="rounded-xl border border-emerald-200/70 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{project.name}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">{project.type} • {project.location}</p>
                  </div>
                  <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    {formatCurrency(project.pricePerTonUsd)}/tCO2e
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{project.registry || "Verified Registry"}</span>
                  <span>Rating {Number(project.rating || 4.7).toFixed(1)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={onRequestCustomSourcing}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            Can&apos;t find what you need? Request a custom credit sourcing.
          </Button>
          {onReset ? (
            <Button variant="outline" onClick={onReset}>Reset All Filters</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
