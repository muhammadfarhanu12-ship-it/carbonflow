import { Search } from "lucide-react";
import { cn } from "@/src/utils/cn";

export type MarketplaceCategoryFilter = "ALL" | "Forestry" | "Renewable Energy";
export type MarketplaceSortFilter = "latest" | "price_asc" | "rating_desc";

interface MarketplaceFiltersProps {
  search: string;
  category: MarketplaceCategoryFilter;
  sort: MarketplaceSortFilter;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: MarketplaceCategoryFilter) => void;
  onSortChange: (value: MarketplaceSortFilter) => void;
}

const CATEGORY_TABS: Array<{ label: string; value: MarketplaceCategoryFilter }> = [
  { label: "All", value: "ALL" },
  { label: "Forestry", value: "Forestry" },
  { label: "Renewable Energy", value: "Renewable Energy" },
];

const SORT_OPTIONS: Array<{ label: string; value: MarketplaceSortFilter }> = [
  { label: "Latest", value: "latest" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Rating: High to Low", value: "rating_desc" },
];

export function MarketplaceFilters({
  search,
  category,
  sort,
  onSearchChange,
  onCategoryChange,
  onSortChange,
}: MarketplaceFiltersProps) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none transition focus:border-primary"
            placeholder="Search by project name"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <select
          className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as MarketplaceSortFilter)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              category === tab.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onCategoryChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
