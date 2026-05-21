import {
  AlertTriangle,
  Info,
  Leaf,
  ListChecks,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
          Select a supplier or create one to view the ESG scorecard.
        </CardContent>
      </Card>
    );
  }

  const breakdownData = [
    { name: "Emissions", value: scoreResult.breakdown.emissionScore },
    { name: "Transparency", value: scoreResult.breakdown.transparencyScore },
    { name: "Compliance", value: scoreResult.breakdown.complianceScore ?? scoreResult.complianceScore ?? 0 },
    { name: "Certs", value: scoreResult.breakdown.certificationScore },
    { name: "Freshness", value: scoreResult.breakdown.reportingFreshnessScore ?? scoreResult.reportingFreshnessScore ?? 0 },
    { name: "Data quality", value: scoreResult.breakdown.dataQualityScore ?? scoreResult.dataQualityScore ?? 0 },
  ];

  const comparisonLabel = BENCHMARK_LABELS[scoreResult.benchmark.industryComparison];
  const sourceLabel = formatBenchmarkSource(scoreResult.benchmark);
  const peerBenchmarkAvailable = scoreResult.benchmark.isBenchmarkAvailable !== false
    && scoreResult.benchmark.categoryAverageIntensity !== undefined
    && scoreResult.benchmark.categoryAverageIntensity !== null;

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
            hint={sourceLabel}
          />
          <MetricTile
            icon={Leaf}
            label="Transparency"
            value={`${Math.round(scoreResult.transparencyScore ?? scoreResult.breakdown.transparencyScore ?? 0)} / 100`}
            hint="Disclosure confidence"
          />
          <MetricTile
            icon={ShieldCheck}
            label="Compliance"
            value={`${Math.round(scoreResult.complianceScore ?? scoreResult.breakdown.complianceScore ?? 0)} / 100`}
            hint="Verification and compliance"
          />
          <MetricTile
            icon={ShieldCheck}
            label="Certification"
            value={`${Math.round(scoreResult.certificationScore ?? scoreResult.breakdown.certificationScore ?? 0)} / 100`}
            hint="ISO 14001 and SBTi"
          />
          <MetricTile
            icon={Leaf}
            label="Data Quality"
            value={`${Math.round(scoreResult.dataQualityScore ?? scoreResult.breakdown.dataQualityScore ?? 0)} / 100`}
            hint="Profile completeness"
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
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" width={104} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: number | string) => `${Number(value).toFixed(2)} / 100`} />
                <Bar dataKey="value" radius={[8, 8, 8, 8]}>
                  {breakdownData.map((entry, index) => (
                    <Cell key={entry.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
          </ChartWrapper>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-sm font-semibold text-foreground">Supplier Benchmarking</div>
            <div className="text-xs text-muted-foreground">{sourceLabel}</div>
          </div>
          {peerBenchmarkAvailable ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <BenchmarkLine label="Category comparison" value={formatIntensity(scoreResult.benchmark.categoryAverageIntensity)} helper={formatComparison(scoreResult.benchmark.categoryComparison)} />
                <BenchmarkLine label="Region comparison" value={formatIntensity(scoreResult.benchmark.regionAverageIntensity)} helper={formatComparison(scoreResult.benchmark.regionComparison)} />
                <BenchmarkLine label="Company average" value={formatIntensity(scoreResult.benchmark.companyAverageIntensity)} helper={formatComparison(scoreResult.benchmark.companyComparison)} />
                <BenchmarkLine label="Percentile" value={scoreResult.benchmark.percentile === null || scoreResult.benchmark.percentile === undefined ? "Unavailable" : `${scoreResult.benchmark.percentile}%`} helper="Higher percentile means lower supplier intensity than peers." />
              </div>
              {scoreResult.benchmark.benchmarkWarning ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {scoreResult.benchmark.benchmarkWarning}
                </div>
              ) : null}
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {scoreResult.benchmark.comparisonMessage || "Benchmark unavailable until more supplier data is collected."}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
              {scoreResult.benchmark.comparisonMessage || "Benchmark unavailable until more supplier data is collected."}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 text-sm font-semibold text-foreground">Explanation</div>
          <p className="text-sm text-muted-foreground">{scoreResult.explanation || scoreResult.latestScoreExplanation || "No score explanation is available yet."}</p>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" />
            Recommended Actions
          </div>
          {scoreResult.recommendedActions && scoreResult.recommendedActions.length > 0 ? (
            <ul className="space-y-2">
              {scoreResult.recommendedActions.map((action) => (
                <li key={action} className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">{action}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No recommended actions were generated.</p>
          )}
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

function BenchmarkLine({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function formatIntensity(value?: number | null) {
  return value === null || value === undefined ? "Unavailable" : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatComparison(value?: SupplierBenchmarkComparison) {
  if (!value || value === "UNKNOWN") return "Comparison unavailable";
  if (value === "ABOVE_AVERAGE") return "Above average intensity";
  if (value === "BELOW_AVERAGE") return "Below average intensity";
  return "At average intensity";
}

function formatBenchmarkSource(benchmark: SupplierScoreResult["benchmark"]) {
  if (benchmark.benchmarkSource === "uploaded_benchmark_dataset") {
    const year = benchmark.benchmarkSourceYear ? ` ${benchmark.benchmarkSourceYear}` : "";
    const official = benchmark.benchmarkIsOfficial ? "official" : benchmark.benchmarkIsSample ? "sample" : "configured";
    return `${benchmark.benchmarkSourceName || "Uploaded benchmark"}${year} (${official})`;
  }
  if (benchmark.benchmarkSource === "external_provider") {
    return benchmark.benchmarkSourceName || "External benchmark provider";
  }
  if (benchmark.benchmarkSource === "internal_company_data") {
    return "Internal company data";
  }
  return "Benchmark unavailable";
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
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
