import { SearchX } from "lucide-react";
import { Button } from "@/src/components/ui/button";

interface MarketplaceEmptyStateProps {
  onReset?: () => void;
}

export function MarketplaceEmptyState({ onReset }: MarketplaceEmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),transparent_38%),linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.9))] px-6 py-12 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-300/40">
        <SearchX className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">No listings match these filters</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        Try widening the search, switching lifecycle filters, or clearing the current category to bring more marketplace inventory back into view.
      </p>
      {onReset ? (
        <div className="mt-5">
          <Button variant="outline" onClick={onReset}>Reset Filters</Button>
        </div>
      ) : null}
    </div>
  );
}
