import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Cloud, ClipboardList, DollarSign, Factory, FileText, Globe, ShieldAlert } from "lucide-react";
import { dashboardService, EMPTY_DASHBOARD_DATA } from "@/src/services/dashboardService";
import { socketService } from "@/src/services/socketService";
import type { DashboardData, DashboardInclusionPolicy } from "@/src/types/platform";
import { ChartWrapper } from "@/src/components/shared/ChartWrapper";

const COLORS = ["#16a34a", "#0284c7", "#f59e0b", "#7c3aed"];
const FILTERS: Array<{ label: string; value: DashboardInclusionPolicy }> = [
  { label: "Approved records", value: "approved_only" },
  { label: "All records", value: "all_records" },
  { label: "Draft included", value: "draft_included" },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inclusionPolicy, setInclusionPolicy] = useState<DashboardInclusionPolicy>("approved_only");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        setData(await dashboardService.getMetrics(inclusionPolicy));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    load();

    const unsubscribers = [
      socketService.on("shipmentCreated", load),
      socketService.on("shipmentUpdated", load),
      socketService.on("supplierUpdated", load),
      socketService.on("ledgerUpdated", load),
      socketService.on("projectUpdated", load),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [inclusionPolicy]);

  const dashboardData = useMemo(() => data ?? EMPTY_DASHBOARD_DATA, [data]);
  const { summary, monthly, costVsEmissions, transportModes, scopeBreakdown, categories, facilities, dataQuality, reportStatus } = dashboardData;
  const totalLogisticsCost = summary.totalLogisticsCost ?? summary.totalCost;
  const isApprovedOnly = inclusionPolicy === "approved_only";
  const emissionsLabel = isApprovedOnly ? "Approved Emissions" : "Total Emissions";
  const scopePrefix = isApprovedOnly ? "Approved " : "";
  const draftRecords = dataQuality.draftRecords ?? summary.draftRecords ?? 0;
  const excludedRecords = dataQuality.excludedRecordsCount ?? summary.excludedRecordsCount ?? 0;
  const carbonIntensityAvailable = typeof summary.carbonIntensity === "number" && summary.carbonIntensityUnit !== "Not available";
  const monthlyHasPositiveEmissions = monthly.some((item) => item.emissions > 0 || item.scope1 > 0 || item.scope2 > 0 || item.scope3 > 0);
  const costHasData = costVsEmissions.some((item) => item.cost > 0 || item.emissions > 0);
  const scopeHasPositiveEmissions = scopeBreakdown.some((item) => item.value > 0);
  const transportHasPositiveEmissions = transportModes.some((item) => item.value > 0);
  const categoriesHavePositiveEmissions = categories.some((item) => item.value > 0);
  const zeroEmissionsReason = summary.totalRecords && summary.totalEmissions === 0
    ? dataQuality.issues?.find((issue) => ["excluded_records", "draft_records", "missing_factors", "zero_activity", "calculation_errors"].includes(issue.type))?.message
      || "Activities exist, but no calculated emissions are available under the current dashboard filter."
    : "";
  const metricCards = useMemo(() => [
    { label: emissionsLabel, value: `${summary.totalEmissions} tCO2e`, icon: Cloud, helper: isApprovedOnly ? "Approved records only" : "Current dashboard filter" },
    { label: `${scopePrefix}Scope 1`, value: `${summary.scope1} tCO2e`, icon: Factory },
    { label: `${scopePrefix}Scope 2`, value: `${summary.scope2} tCO2e`, icon: Activity },
    { label: `${scopePrefix}Scope 3`, value: `${summary.scope3} tCO2e`, icon: Globe },
    {
      label: "Carbon Intensity",
      value: carbonIntensityAvailable ? `${summary.carbonIntensity} ${summary.carbonIntensityUnit}` : "Not available",
      icon: BarChart3,
      helper: carbonIntensityAvailable ? undefined : "Add revenue, spend, or shipment volume to calculate carbon intensity.",
    },
    { label: "Data Quality Score", value: `${summary.dataQualityScore ?? dataQuality.score ?? 0}%`, icon: CheckCircle2 },
  ], [carbonIntensityAvailable, dataQuality.score, emissionsLabel, isApprovedOnly, scopePrefix, summary.carbonIntensity, summary.carbonIntensityUnit, summary.dataQualityScore, summary.scope1, summary.scope2, summary.scope3, summary.totalEmissions]);
  const supplierIntelligence = summary.supplierIntelligence;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Carbon Intelligence Dashboard</h1>
        <p className="text-muted-foreground">Live emissions, supplier risk, logistics spend, and offset activity.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Reporting filter</p>
          <p className="text-sm text-muted-foreground">
            {isApprovedOnly && draftRecords > 0
              ? `Showing approved records only. You have ${draftRecords} draft records not included.`
              : `Showing ${FILTERS.find((item) => item.value === inclusionPolicy)?.label.toLowerCase() ?? "approved records"}.`}
            {excludedRecords > 0 && !isApprovedOnly ? ` ${excludedRecords} records are excluded by this filter.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={inclusionPolicy === filter.value ? "default" : "outline"}
              onClick={() => setInclusionPolicy(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {zeroEmissionsReason && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{zeroEmissionsReason}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <div className="h-8 animate-pulse rounded-md bg-muted" /> : <div className="text-2xl font-bold">{item.value}</div>}
              {item.helper && !loading ? <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">High Risk Suppliers</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{summary.highRiskSuppliers}</span>
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Supplier Score</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.averageSupplierScore}/100</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Offsets Retired</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.offsetsRetired ?? summary.totalOffsets} credits</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activities Recorded</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{summary.activitiesRecorded ?? 0}</span>
            <ClipboardList className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved Records</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.approvedRecords ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Submitted Records</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.submittedRecords ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reports Generated</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{reportStatus.generatedCount}</span>
            <FileText className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Logistics Cost</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">${totalLogisticsCost.toLocaleString()}</span>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Intelligence</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DashboardIntelTile label="Best performing supplier" value={supplierIntelligence?.bestPerformingSupplier || "Not available"} />
          <DashboardIntelTile label="Worst performing supplier" value={supplierIntelligence?.worstPerformingSupplier || "Not available"} />
          <DashboardIntelTile
            label="Highest risk categories"
            value={supplierIntelligence?.categoriesWithHighestSupplierRisk?.length
              ? supplierIntelligence.categoriesWithHighestSupplierRisk.map((item) => item.category).join(", ")
              : "Not available"}
          />
          <DashboardIntelTile label="Suppliers above benchmark" value={String(supplierIntelligence?.suppliersAboveBenchmark ?? 0)} />
          <DashboardIntelTile label="Missing benchmark data" value={String(supplierIntelligence?.suppliersMissingBenchmarkData ?? 0)} />
        </CardContent>
      </Card>

      <div className="grid w-full min-w-0 gap-4 lg:grid-cols-7">
        <Card className="min-w-0 lg:col-span-4">
          <CardHeader>
            <CardTitle>Monthly Emissions Trend</CardTitle>
          </CardHeader>
          <CardContent className="w-full min-w-0 min-h-[320px]">
            <ChartWrapper
              loading={loading}
              hasData={monthlyHasPositiveEmissions}
              className="h-[320px] min-h-[300px] w-full"
              loadingMessage="Loading chart..."
              emptyMessage="No calculated emissions yet. Add activities with matching emission factors or approve records to populate this chart."
            >
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="scope1" stackId="a" fill="#84cc16" />
                <Bar dataKey="scope2" stackId="a" fill="#22c55e" />
                <Bar dataKey="scope3" stackId="a" fill="#16a34a" />
              </BarChart>
            </ChartWrapper>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>Cost vs Emissions</CardTitle>
          </CardHeader>
          <CardContent className="w-full min-w-0 min-h-[320px]">
            <ChartWrapper
              loading={loading}
              hasData={costHasData}
              className="h-[320px] min-h-[300px] w-full"
              loadingMessage="Loading chart..."
              emptyMessage="No cost data available yet. Add shipment or logistics cost data to compare cost vs emissions."
            >
              <LineChart data={costVsEmissions}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line yAxisId="left" dataKey="cost" stroke="#f59e0b" strokeWidth={2} />
                <Line yAxisId="right" dataKey="emissions" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ChartWrapper>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="w-full min-w-0">
          <CardHeader>
            <CardTitle>Scope Split</CardTitle>
          </CardHeader>
          <CardContent className="w-full min-w-0 min-h-[300px]">
            <ChartWrapper loading={loading} hasData={scopeHasPositiveEmissions} className="h-[300px] min-h-[300px] w-full" loadingMessage="Loading chart..." emptyMessage="No scope breakdown yet. Add calculated Scope 1, 2, or 3 records.">
              <PieChart>
                <Pie data={scopeBreakdown} dataKey="value" nameKey="name" outerRadius={85}>
                  {scopeBreakdown.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ChartWrapper>
          </CardContent>
        </Card>

        <Card className="w-full min-w-0">
          <CardHeader>
            <CardTitle>Transport Mode Emissions</CardTitle>
          </CardHeader>
          <CardContent className="w-full min-w-0 min-h-[300px]">
            <ChartWrapper loading={loading} hasData={transportHasPositiveEmissions} className="h-[300px] min-h-[300px] w-full" loadingMessage="Loading chart..." emptyMessage="No transport mode data yet. Add shipments to compare road, sea, air, and rail emissions.">
              <PieChart>
                <Pie data={transportModes} dataKey="value" nameKey="name" outerRadius={85}>
                  {transportModes.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ChartWrapper>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{categoriesHavePositiveEmissions ? "Top Emitting Categories" : "Recorded Categories"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!categoriesHavePositiveEmissions && categories.length > 0 ? (
              <p className="text-sm text-muted-foreground">Recorded categories have no calculated emissions under the current filter.</p>
            ) : null}
            {categories.length === 0 ? <p className="text-sm text-muted-foreground">No category data available yet.</p> : categories.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm text-foreground">{item.name}</span>
                  <span className="font-semibold text-primary">{item.value.toFixed(2)} tCO2e</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Facility / Business Unit</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {facilities.length === 0 ? <p className="text-sm text-muted-foreground">No facility data available yet.</p> : facilities.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm text-foreground">{item.name}</span>
                <span className="font-semibold text-primary">{item.value.toFixed(2)} tCO2e</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Data Quality</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><span className="font-semibold">{dataQuality.status}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Completeness</span><span className="font-semibold">{dataQuality.completenessPct}%</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Draft records</span><span className="font-semibold">{dataQuality.draftRecords ?? summary.draftRecords ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Submitted records</span><span className="font-semibold">{dataQuality.submittedRecords ?? summary.submittedRecords ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Approved records</span><span className="font-semibold">{dataQuality.approvedRecords ?? summary.approvedRecords ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Included records</span><span className="font-semibold">{dataQuality.includedRecordsCount ?? summary.includedRecordsCount ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Excluded records</span><span className="font-semibold">{dataQuality.excludedRecordsCount ?? summary.excludedRecordsCount ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Rejected records</span><span className="font-semibold">{dataQuality.rejectedRecords ?? summary.rejectedRecords ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Needs correction</span><span className="font-semibold">{dataQuality.needsCorrectionRecords ?? summary.needsCorrectionRecords ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Sample factor records</span><span className="font-semibold">{dataQuality.sampleFactorRecords}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Missing factor records</span><span className="font-semibold">{dataQuality.missingFactorRecords}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Zero activity amount</span><span className="font-semibold">{dataQuality.zeroAmountRecords ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Calculation errors</span><span className="font-semibold">{dataQuality.calculationErrorRecords ?? 0}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Action Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {dataQuality.issues && dataQuality.issues.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {dataQuality.issues.map((issue) => (
                <div key={issue.type} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{issue.message}</span>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">{issue.count}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {issue.severity === "critical" ? "Resolve before production reporting." : "Review to improve reporting confidence."}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No dashboard data quality issues detected for the current filter.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/app/ledger")}>Go to Carbon Ledger</Button>
            <Button type="button" variant="outline" onClick={() => navigate("/app/ledger?filter=missing-factors")}>Review missing factors</Button>
            <Button type="button" variant="outline" onClick={() => navigate("/app/ledger?status=submitted")}>Approve submitted records</Button>
            <Button type="button" variant="outline" onClick={() => navigate("/admin/carbon-data")}>Manage emission factors</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardIntelTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
