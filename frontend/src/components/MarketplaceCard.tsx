import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { MarketplaceActionsMenu } from "@/src/components/MarketplaceActionsMenu";
import { cn } from "@/src/utils/cn";
import type { CarbonProject } from "@/src/types/platform";
import {
  Activity,
  Award,
  BadgeCheck,
  Droplets,
  Leaf,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

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

const registryBadgeConfig = {
  VERRA: {
    label: "Verra",
    icon: ShieldCheck,
    activeClassName: "border-sky-200 bg-sky-50 text-sky-700",
  },
  GOLD_STANDARD: {
    label: "Gold Standard",
    icon: Award,
    activeClassName: "border-amber-200 bg-amber-50 text-amber-700",
  },
  PURO_EARTH: {
    label: "Puro.earth",
    icon: Leaf,
    activeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
} as const;

const sdgConfig: Record<NonNullable<CarbonProject["verificationDetails"]>["sdgGoals"][number], {
  shortLabel: string;
  fullLabel: string;
  icon: LucideIcon;
  className: string;
}> = {
  SDG_6_CLEAN_WATER: {
    shortLabel: "SDG 6",
    fullLabel: "Clean Water & Sanitation",
    icon: Droplets,
    className: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  SDG_7_AFFORDABLE_CLEAN_ENERGY: {
    shortLabel: "SDG 7",
    fullLabel: "Affordable & Clean Energy",
    icon: Award,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  SDG_13_CLIMATE_ACTION: {
    shortLabel: "SDG 13",
    fullLabel: "Climate Action",
    icon: Activity,
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  SDG_14_LIFE_BELOW_WATER: {
    shortLabel: "SDG 14",
    fullLabel: "Life Below Water",
    icon: Droplets,
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  SDG_15_LIFE_ON_LAND: {
    shortLabel: "SDG 15",
    fullLabel: "Life on Land",
    icon: Leaf,
    className: "border-green-200 bg-green-50 text-green-700",
  },
};

type RegistryBadgeKey = keyof typeof registryBadgeConfig;

function normalizeRegistryBadgeKey(registry: string | null | undefined): RegistryBadgeKey | null {
  if (!registry) {
    return null;
  }

  const normalized = registry
    .trim()
    .toUpperCase()
    .replace(/[.\s-]+/g, "_");

  if (normalized === "VERRA") {
    return "VERRA";
  }

  if (normalized === "GOLD_STANDARD" || normalized === "GOLDSTANDARD") {
    return "GOLD_STANDARD";
  }

  if (normalized === "PURO_EARTH" || normalized === "PUROEARTH") {
    return "PURO_EARTH";
  }

  return null;
}

function inferSdgGoals(projectType: string): NonNullable<CarbonProject["verificationDetails"]>["sdgGoals"] {
  const normalizedType = projectType.trim().toLowerCase();

  if (normalizedType.includes("water")) {
    return ["SDG_6_CLEAN_WATER", "SDG_13_CLIMATE_ACTION"];
  }

  if (normalizedType.includes("renewable") || normalizedType.includes("solar") || normalizedType.includes("wind")) {
    return ["SDG_7_AFFORDABLE_CLEAN_ENERGY", "SDG_13_CLIMATE_ACTION"];
  }

  if (normalizedType.includes("blue") || normalizedType.includes("ocean") || normalizedType.includes("marine")) {
    return ["SDG_14_LIFE_BELOW_WATER", "SDG_13_CLIMATE_ACTION"];
  }

  if (normalizedType.includes("forest") || normalizedType.includes("reforestation") || normalizedType.includes("land")) {
    return ["SDG_15_LIFE_ON_LAND", "SDG_13_CLIMATE_ACTION"];
  }

  return ["SDG_13_CLIMATE_ACTION"];
}

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
  const normalizedRegistry = normalizeRegistryBadgeKey(registry);
  const activeRegistries = new Set<RegistryBadgeKey>(
    (project.verificationDetails?.registries?.length
      ? project.verificationDetails.registries
      : normalizedRegistry
        ? [normalizedRegistry]
        : []
    ) as RegistryBadgeKey[],
  );
  const verificationStatus = project.verificationDetails?.verificationStatus
    || (activeRegistries.size > 0 ? "VERIFIED" : "PENDING");
  const isVerified = verificationStatus === "VERIFIED";
  const vintageYear = project.verificationDetails?.vintageYear || project.vintageYear || new Date().getUTCFullYear();
  const sdgGoals = (project.verificationDetails?.sdgGoals?.length
    ? project.verificationDetails.sdgGoals
    : inferSdgGoals(project.type)
  ) as NonNullable<CarbonProject["verificationDetails"]>["sdgGoals"];
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
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <span>{project.name}</span>
            {isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            ) : null}
          </h3>
          <p className="text-sm text-muted-foreground">{project.location}</p>
          <div className="mt-2 inline-flex items-center rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Vintage Year: {vintageYear}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Registry Badges</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(registryBadgeConfig) as RegistryBadgeKey[]).map((badgeKey) => {
              const badge = registryBadgeConfig[badgeKey];
              const Icon = badge.icon;
              const isActive = activeRegistries.has(badgeKey);

              return (
                <span
                  key={badgeKey}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? badge.activeClassName
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {badge.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">SDG Impact</div>
          <div className="flex flex-wrap gap-2">
            {sdgGoals.map((goal) => {
              const metadata = sdgConfig[goal];
              const Icon = metadata.icon;

              return (
                <span
                  key={goal}
                  title={metadata.fullLabel}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", metadata.className)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {metadata.shortLabel}
                </span>
              );
            })}
          </div>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div>Registry: {registry}</div>
          <div>Status: {isVerified ? "Verified" : verificationStatus === "PENDING" ? "Pending Verification" : "Action Required"}</div>
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
