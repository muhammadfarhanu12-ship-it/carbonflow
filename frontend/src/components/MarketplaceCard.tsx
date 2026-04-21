import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { MarketplaceActionsMenu } from "@/src/components/MarketplaceActionsMenu";
import { cn } from "@/src/utils/cn";
import type { CarbonProject } from "@/src/types/platform";

interface MarketplaceCardProps {
  project: CarbonProject;
  isSelected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onMoveToDraft: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onMarkSoldOut: () => void;
}

const statusBadgeStyles: Record<CarbonProject["status"], string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-700",
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ARCHIVED: "border-stone-200 bg-stone-100 text-stone-700",
  SOLD_OUT: "border-amber-200 bg-amber-50 text-amber-700",
};

const statusCopy: Record<CarbonProject["status"], string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  SOLD_OUT: "Sold Out",
};

export function MarketplaceCard({
  project,
  isSelected,
  canManage,
  onSelect,
  onViewDetails,
  onEdit,
  onPublish,
  onMoveToDraft,
  onArchive,
  onDelete,
  onRestore,
  onMarkSoldOut,
}: MarketplaceCardProps) {
  const registry = project.registry || project.verificationStandard || project.certification;
  const availableToPurchase = Math.max(project.availableToPurchase ?? project.availableCredits, 0);
  const isPurchasable = project.status === "PUBLISHED" && availableToPurchase > 0;
  const actionLabel = isPurchasable
    ? (isSelected ? "Selected for Checkout" : "Select Listing")
    : project.status === "PUBLISHED"
      ? "Unavailable"
      : statusCopy[project.status];
  const lifecycleNote = project.lifecycle?.isImmutable
    ? "This listing is immutable because checkout history already exists."
    : project.status === "ARCHIVED"
      ? "Archived listings stay available for audit review but cannot be purchased."
      : project.status === "DRAFT"
        ? "Draft listings stay hidden until you publish them."
        : project.status === "SOLD_OUT"
          ? "Published listing with no purchasable inventory remaining."
          : availableToPurchase === 0
            ? "Inventory is temporarily reserved by another checkout."
            : "Buyers can retire credits from this listing now.";

  return (
    <Card className={cn("overflow-hidden border transition-shadow", isSelected ? "border-primary shadow-md" : "border-border")}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{project.type}</span>
            <span className={cn("rounded-full border px-2 py-1 text-xs font-medium", statusBadgeStyles[project.status])}>
              {statusCopy[project.status]}
            </span>
          </div>
          {canManage ? (
            <MarketplaceActionsMenu
              status={project.status}
              disableEdit={Boolean(project.lifecycle?.isImmutable) || project.status === "ARCHIVED"}
              disableRestore={Boolean(project.lifecycle?.isImmutable)}
              onEdit={onEdit}
              onPublish={onPublish}
              onMoveToDraft={onMoveToDraft}
              onArchive={onArchive}
              onDelete={onDelete}
              onRestore={onRestore}
              onMarkSoldOut={onMarkSoldOut}
            />
          ) : null}
        </div>

        <div>
          <h3 className="font-semibold text-foreground">{project.name}</h3>
          <p className="text-sm text-muted-foreground">{project.location}</p>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div>Registry: {registry}</div>
          <div>Vintage: {project.vintageYear || "N/A"}</div>
          <div>Rating: {project.rating}</div>
          <div>Available: {availableToPurchase.toLocaleString()} credits</div>
          {project.reservedCredits > 0 ? <div>Reserved: {project.reservedCredits.toLocaleString()} credits</div> : null}
          <div>Retired: {project.retiredCredits.toLocaleString()} credits</div>
          <div>Price: ${(project.pricePerTonUsd ?? project.pricePerCreditUsd).toFixed(2)} / ton</div>
        </div>

        <div className="rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {lifecycleNote}
          {project.lifecycle?.hasTransactionHistory ? ` ${project.lifecycle.transactionCount} linked transaction(s).` : ""}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onViewDetails}>
            Project Details
          </Button>
          <Button size="sm" variant={isSelected && isPurchasable ? "default" : "outline"} disabled={!isPurchasable} onClick={onSelect}>
            {actionLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
