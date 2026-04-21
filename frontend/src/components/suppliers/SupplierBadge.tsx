import { cn } from "@/src/utils/cn";
import type { SupplierRiskLevel } from "@/src/types/platform";

const BADGE_STYLES: Record<SupplierRiskLevel, { label: string; className: string }> = {
  HIGH: {
    label: "High Risk",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  MEDIUM: {
    label: "Medium Risk",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  LOW: {
    label: "Low Risk",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

interface SupplierBadgeProps {
  score: number;
  riskLevel: SupplierRiskLevel;
  className?: string;
}

export function SupplierBadge({ score, riskLevel, className }: SupplierBadgeProps) {
  const style = BADGE_STYLES[riskLevel];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        style.className,
        className,
      )}
    >
      <span>{score.toFixed(2)}</span>
      <span>{style.label}</span>
    </div>
  );
}
