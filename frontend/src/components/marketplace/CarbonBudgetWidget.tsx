import { WalletCards } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";

interface CarbonBudgetWidgetProps {
  budgetUsd: number;
  spentUsd: number;
  liveInventoryValueUsd: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CarbonBudgetWidget({ budgetUsd, spentUsd, liveInventoryValueUsd }: CarbonBudgetWidgetProps) {
  const safeBudget = Math.max(Number(budgetUsd) || 0, 1);
  const progress = Math.min((Math.max(spentUsd, 0) / safeBudget) * 100, 100);
  const remainingUsd = Math.max(safeBudget - spentUsd, 0);

  return (
    <Card className="overflow-hidden border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,253,244,0.98))]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-600/10 p-3 text-emerald-700">
            <WalletCards className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Carbon Budget</CardTitle>
            <p className="text-sm text-muted-foreground">Budget utilization derived from completed retirements and live published inventory.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <BudgetStat label="Budget" value={formatCurrency(safeBudget)} />
          <BudgetStat label="Used" value={formatCurrency(spentUsd)} />
          <BudgetStat label="Remaining" value={formatCurrency(remainingUsd)} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Budget progress</span>
            <span className="font-medium text-foreground">{progress.toFixed(0)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#059669,#10b981,#34d399)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-white/70 px-4 py-3 text-sm text-muted-foreground">
          Live published inventory currently represents {formatCurrency(liveInventoryValueUsd)} of additional retirement capacity.
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm backdrop-blur">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
