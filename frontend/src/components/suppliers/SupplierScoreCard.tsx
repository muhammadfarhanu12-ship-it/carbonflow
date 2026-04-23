import {
  AlertTriangle,
  Info,
  Leaf,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { SupplierBadge } from "@/src/components/suppliers/SupplierBadge";
import { ChartWrapper } from "@/src/components/shared/ChartWrapper";
import type {
  SupplierBenchmarkComparison,
  SupplierScoreResult,
} from "@/src/types/platform";

interface SupplierScoreCardProps {
  title?: string;
  subtitle?: string;
  supplierName?: string;
  scoreResult?: SupplierScoreResult | null;
}

const BREAKDOWN_COLORS = ["#0f766e", "#1d4ed8", "#ca8a04"];

const BENCHMARK_LABELS: Record<SupplierBenchmarkComparison, string> = {
  ABOVE_AVERAGE: "Above industry average",
  AT_AVERAGE: "At industry average",
  BELOW_AVERAGE: "Below industry average",
  UNKNOWN: "Industry comparison unavailable",
};

export function SupplierScoreCard({
  title = "Supplier ESG Score",
  subtitle = "Explainable score composition, benchmark context, and actionable insights.",
  supplierName,
  scoreResult,
}: SupplierScoreCardProps) {
  if (!scoreResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select a supplier or start editing the form to preview the ESG scoring breakdown.
        </CardContent>
      </Card>
    );
  }

  const breakdownData = [
    { name: "Intensity", value: scoreResult.breakdown.emissionScore },
    { name: "Certs", value: scoreResult.breakdown.certificationScore },
    { name: "Transparency", value: scoreResult.breakdown.transparencyScore },
  ];

  const comparisonLabel = BENCHMARK_LABELS[scoreResult.benchmark.industryComparison];

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{subtitle}</CardDescription>
          </div>
          <SupplierBadge score={scoreResult.totalScore} riskLevel={scoreResult.riskLevel} />
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Supplier</div>
          <div className="mt-2 text-xl font-semibold text-foreground">{supplierName || scoreResult.supplierName}</div>
          <div className="mt-3 flex items-end gap-3">
            <div className="text-4xl font-bold text-foreground">{scoreResult.totalScore.toFixed(2)}</div>
            <div className="pb-1 text-sm text-muted-foreground">out of 100</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            icon={Leaf}
            label="Emission intensity"
            value={scoreResult.emissionIntensity === null ? "Unavailable" : scoreResult.emissionIntensity.toFixed(4)}
            hint={scoreResult.intensitySource === "computed" ? "Calculated" : scoreResult.intensitySource === "provided" ? "Provided" : "Missing"}
          />
          <MetricTile
            icon={scoreResult.benchmark.isAboveIndustryAverage ? TrendingUp : TrendingDown}
            label="Benchmark"
            value={comparisonLabel}
            hint={scoreResult.benchmark.industryLabel}
          />
          <MetricTile
            icon={Leaf}
            label="Percentile"
            value={scoreResult.benchmark.percentileRank === null ? "N/A" : `${Math.round(scoreResult.benchmark.percentileRank)}th`}
            hint={`Baseline ${scoreResult.benchmark.industryAverageIntensity.toFixed(2)}`}
          />
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Score Breakdown</div>
          <ChartWrapper
            loading={false}
            hasData={breakdownData.length > 0}
            className="h-48 min-h-[192px]"
            emptyMessage="No score breakdown data is available yet."
          >
              <BarChart data={breakdownData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 50]} hide />
                <YAxis type="category" dataKey="name" width={88} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: number | string) => `${Number(value).toFixed(2)} pts`} />
                <Bar dataKey="value" radius={[8, 8, 8, 8]}>
                  {breakdownData.map((entry, index) => (
                    <Cell key={entry.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
          </ChartWrapper>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Insights</div>
          <div className="space-y-2">
            {scoreResult.insights.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                No additional warnings or information were generated for this supplier.
              </div>
            ) : (
              scoreResult.insights.map((insight) => (
                <div
                  key={`${insight.type}-${insight.message}`}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                    insight.type === "warning"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  {insight.type === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{insight.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Leaf;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-lg font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
