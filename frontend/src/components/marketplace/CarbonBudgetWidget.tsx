import { useId, useMemo } from "react";
import { BellRing, LoaderCircle, TrendingDown, WalletCards } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

interface AutoOffsetRule {
  enabled: boolean;
  intensityThreshold: number;
}

interface CarbonBudgetWidgetProps {
  budgetUsd: number;
  spentUsd: number;
  pendingTransactionsUsd: number;
  liveInventoryValueUsd: number;
  projectedMonthlySpendUsd: number;
  autoOffsetRule: AutoOffsetRule;
  requestingBudgetIncrease?: boolean;
  onAutoOffsetRuleChange: (rule: AutoOffsetRule) => void;
  onRequestBudgetIncrease: () => void | Promise<void>;
}

interface ProjectionPoint {
  index: number;
  label: string;
  remainingUsd: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildProjectionPoints(startingBudgetUsd: number, monthlyBurnUsd: number, horizonMonths: number): ProjectionPoint[] {
  const startDate = new Date();
  const totalMonths = Math.max(horizonMonths, 1);
  const points: ProjectionPoint[] = [];

  for (let monthIndex = 0; monthIndex <= totalMonths; monthIndex += 1) {
    const pointDate = new Date(startDate);
    pointDate.setMonth(startDate.getMonth() + monthIndex);

    points.push({
      index: monthIndex,
      label: pointDate.toLocaleDateString("en-US", { month: "short" }),
      remainingUsd: Math.max(startingBudgetUsd - (monthlyBurnUsd * monthIndex), 0),
    });
  }

  return points;
}

export function CarbonBudgetWidget({
  budgetUsd,
  spentUsd,
  pendingTransactionsUsd,
  liveInventoryValueUsd,
  projectedMonthlySpendUsd,
  autoOffsetRule,
  requestingBudgetIncrease = false,
  onAutoOffsetRuleChange,
  onRequestBudgetIncrease,
}: CarbonBudgetWidgetProps) {
  const safeBudget = Math.max(Number(budgetUsd) || 0, 0);
  const settledSpendUsd = Math.max(Number(spentUsd) || 0, 0);
  const pendingSpendUsd = Math.max(Number(pendingTransactionsUsd) || 0, 0);
  const remainingBudgetUsd = Math.max(safeBudget - settledSpendUsd, 0);
  const availableBudgetUsd = Math.max(remainingBudgetUsd - pendingSpendUsd, 0);
  const committedSpendUsd = settledSpendUsd + pendingSpendUsd;
  const budgetCommittedPct = safeBudget > 0 ? Math.min((committedSpendUsd / safeBudget) * 100, 100) : 0;
  const projectedMonthlyBurnUsd = Math.max(Number(projectedMonthlySpendUsd) || 0, 0);
  const projectedDepletionMonths = projectedMonthlyBurnUsd > 0
    ? availableBudgetUsd / projectedMonthlyBurnUsd
    : Number.POSITIVE_INFINITY;
  const projectionHorizonMonths = Number.isFinite(projectedDepletionMonths)
    ? Math.min(Math.max(Math.ceil(projectedDepletionMonths) + 2, 6), 12)
    : 6;

  const projectionPoints = useMemo(
    () => buildProjectionPoints(availableBudgetUsd, projectedMonthlyBurnUsd, projectionHorizonMonths),
    [availableBudgetUsd, projectedMonthlyBurnUsd, projectionHorizonMonths],
  );

  const projectedRunoutDateLabel = useMemo(() => {
    if (availableBudgetUsd <= 0) {
      return "Budget fully committed";
    }

    if (!Number.isFinite(projectedDepletionMonths)) {
      return "Insufficient shipment volume";
    }

    const runoutDate = new Date();
    runoutDate.setDate(runoutDate.getDate() + Math.round(projectedDepletionMonths * 30.4));

    return runoutDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [availableBudgetUsd, projectedDepletionMonths]);

  return (
    <Card className="overflow-hidden border-emerald-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_44%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.96))]">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-600/10 p-3 text-emerald-700">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Carbon Budget</CardTitle>
              <p className="text-sm text-muted-foreground">
                Track available budget, pending commitments, and projected depletion from current shipment volume.
              </p>
            </div>
          </div>
          <Button onClick={onRequestBudgetIncrease} disabled={requestingBudgetIncrease} className="bg-emerald-600 hover:bg-emerald-700">
            {requestingBudgetIncrease ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
            Request Budget Increase
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <BudgetStat label="Total Budget" value={formatCurrency(safeBudget)} />
          <BudgetStat label="Settled Spend" value={formatCurrency(settledSpendUsd)} />
          <BudgetStat label="Pending Transactions" value={formatCurrency(pendingSpendUsd)} />
          <BudgetStat label="Remaining Budget" value={formatCurrency(availableBudgetUsd)} />
        </div>

        <div className="space-y-2 rounded-xl border border-emerald-100/80 bg-white/80 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Committed budget (settled + pending)</span>
            <span className="font-semibold text-foreground">{budgetCommittedPct.toFixed(0)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#059669,#10b981,#34d399)] transition-all"
              style={{ width: `${budgetCommittedPct}%` }}
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-xl border border-emerald-100/80 bg-white/85 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Projected Depletion</p>
                <p className="text-xs text-muted-foreground">Run-out estimate based on current shipment-volume burn.</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800">
                {projectedRunoutDateLabel}
              </div>
            </div>
            <ProjectedDepletionChart points={projectionPoints} />
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-emerald-700" />
                Monthly burn: {formatCurrency(projectedMonthlyBurnUsd)}
              </span>
              <span>Pending: {formatCurrency(pendingSpendUsd)}</span>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-emerald-100/80 bg-white/85 p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">Auto-Offset Rule</p>
            <p className="text-xs text-muted-foreground">
              Automatically purchase credits for shipments with carbon intensity over your threshold.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={autoOffsetRule.enabled}
              onClick={() => onAutoOffsetRuleChange({ ...autoOffsetRule, enabled: !autoOffsetRule.enabled })}
              className="inline-flex items-center gap-3 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm text-foreground transition hover:border-emerald-300"
            >
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${autoOffsetRule.enabled ? "bg-emerald-600" : "bg-muted"}`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoOffsetRule.enabled ? "translate-x-5" : ""}`}
                />
              </span>
              <span>{autoOffsetRule.enabled ? "Enabled" : "Disabled"}</span>
            </button>

            <div className="space-y-1">
              <label htmlFor="auto-offset-threshold" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Carbon Intensity Threshold
              </label>
              <Input
                id="auto-offset-threshold"
                type="number"
                min={0}
                step={0.1}
                value={autoOffsetRule.intensityThreshold}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  onAutoOffsetRuleChange({
                    ...autoOffsetRule,
                    intensityThreshold: Number.isFinite(nextValue) ? Math.max(nextValue, 0) : 0,
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">Any shipment above this value triggers an automatic offset purchase.</p>
            </div>
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
    <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ProjectedDepletionChart({ points }: { points: ProjectionPoint[] }) {
  const gradientId = useId().replace(/:/g, "");
  const width = 460;
  const height = 180;
  const paddingX = 16;
  const paddingTop = 10;
  const paddingBottom = 30;
  const innerWidth = width - (paddingX * 2);
  const innerHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(...points.map((point) => point.remainingUsd), 1);
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const gridLines = 4;
  const labelStep = Math.max(1, Math.floor((points.length - 1) / 4));

  const coordinates = points.map((point, index) => ({
    ...point,
    x: paddingX + (stepX * index),
    y: paddingTop + ((1 - (point.remainingUsd / maxValue)) * innerHeight),
  }));

  const linePath = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = [
    `M ${coordinates[0]?.x ?? paddingX} ${paddingTop + innerHeight}`,
    ...coordinates.map((point) => `L ${point.x} ${point.y}`),
    `L ${coordinates[coordinates.length - 1]?.x ?? (paddingX + innerWidth)} ${paddingTop + innerHeight}`,
    "Z",
  ].join(" ");
  const depletionPoint = coordinates.find((point) => point.remainingUsd <= 0);

  return (
    <div className="h-[190px] w-full rounded-lg bg-emerald-50/45 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
        <defs>
          <linearGradient id={`line-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id={`area-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(16,185,129,0.36)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.05)" />
          </linearGradient>
        </defs>

        {Array.from({ length: gridLines + 1 }, (_, index) => {
          const y = paddingTop + ((innerHeight / gridLines) * index);
          return (
            <line
              key={index}
              x1={paddingX}
              x2={paddingX + innerWidth}
              y1={y}
              y2={y}
              stroke="rgba(16,185,129,0.16)"
              strokeWidth="1"
            />
          );
        })}

        <path d={areaPath} fill={`url(#area-${gradientId})`} />
        <polyline
          points={linePath}
          fill="none"
          stroke={`url(#line-${gradientId})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {depletionPoint ? (
          <line
            x1={depletionPoint.x}
            x2={depletionPoint.x}
            y1={paddingTop}
            y2={paddingTop + innerHeight}
            stroke="rgba(15,23,42,0.32)"
            strokeDasharray="5 5"
            strokeWidth="1.5"
          />
        ) : null}

        {coordinates.map((point, index) => (
          <circle
            key={point.index}
            cx={point.x}
            cy={point.y}
            r={index === coordinates.length - 1 ? 4.5 : 3.2}
            fill="#059669"
            opacity={index % labelStep === 0 || index === coordinates.length - 1 ? 1 : 0.6}
          />
        ))}

        {coordinates.map((point, index) => (
          (index % labelStep === 0 || index === coordinates.length - 1) ? (
            <text
              key={`label-${point.index}`}
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(15,23,42,0.7)"
            >
              {point.label}
            </text>
          ) : null
        ))}
      </svg>
    </div>
  );
}
