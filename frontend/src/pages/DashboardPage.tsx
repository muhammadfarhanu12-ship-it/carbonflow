import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
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
import { Activity, BarChart3, Cloud, DollarSign, Factory, Globe, ShieldAlert } from "lucide-react";
import { dashboardService } from "@/src/services/dashboardService";
import { socketService } from "@/src/services/socketService";
import type { DashboardData } from "@/src/types/platform";
import { ChartWrapper } from "@/src/components/shared/ChartWrapper";

const COLORS = ["#16a34a", "#0284c7", "#f59e0b", "#7c3aed"];
const EMPTY_DASHBOARD_DATA: DashboardData = {
  summary: {
    totalEmissions: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
    carbonIntensity: 0,
    carbonIntensityUnit: "kgCO2e/USD",
    totalCost: 0,
    totalLogisticsCost: 0,
    totalOffsets: 0,
    offsetsRetired: 0,
    highRiskSuppliers: 0,
    activeProjects: 0,
    averageSupplierScore: 0,
    totalSpend: 0,
    totalCarbonTax: 0,
  },
  monthly: [],
  costVsEmissions: [],
  transportModes: [],
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        setData(await dashboardService.getMetrics());
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
  }, []);

  const dashboardData = useMemo(() => data ?? EMPTY_DASHBOARD_DATA, [data]);
  const { summary, monthly, costVsEmissions, transportModes } = dashboardData;
  const totalLogisticsCost = summary.totalLogisticsCost ?? summary.totalCost;
  const metricCards = useMemo(() => [
    { label: "Total Emissions", value: `${summary.totalEmissions} tCO2e`, icon: Cloud },
    { label: "Scope 1", value: `${summary.scope1} tCO2e`, icon: Factory },
    { label: "Scope 2", value: `${summary.scope2} tCO2e`, icon: Activity },
    { label: "Scope 3", value: `${summary.scope3} tCO2e`, icon: Globe },
    { label: "Carbon Intensity", value: `${summary.carbonIntensity} ${summary.carbonIntensityUnit ?? "kgCO2e/USD"}`, icon: BarChart3 },
    { label: "Total Logistics Cost", value: `$${totalLogisticsCost.toLocaleString()}`, icon: DollarSign },
  ], [summary.carbonIntensity, summary.carbonIntensityUnit, summary.scope1, summary.scope2, summary.scope3, summary.totalEmissions, totalLogisticsCost]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Carbon Intelligence Dashboard</h1>
        <p className="text-muted-foreground">Live emissions, supplier risk, logistics spend, and offset activity.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? <div className="h-8 animate-pulse rounded-md bg-muted" /> : <div className="text-2xl font-bold">{item.value}</div>}
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
      </div>

      <div className="grid w-full min-w-0 gap-4 lg:grid-cols-7">
        <Card className="min-w-0 lg:col-span-4">
          <CardHeader>
            <CardTitle>Monthly Emissions Trend</CardTitle>
          </CardHeader>
          <CardContent className="w-full min-w-0 min-h-[320px]">
            <ChartWrapper
              loading={loading}
              hasData={monthly.length > 0}
              className="h-[320px] min-h-[300px] w-full"
              loadingMessage="Loading chart..."
              emptyMessage="No monthly emissions data available yet."
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
              hasData={costVsEmissions.length > 0}
              className="h-[320px] min-h-[300px] w-full"
              loadingMessage="Loading chart..."
              emptyMessage="No cost and emissions trend data available yet."
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

      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle>Transport Mode Emissions</CardTitle>
        </CardHeader>
        <CardContent className="w-full min-w-0 min-h-[300px]">
          <ChartWrapper
            loading={loading}
            hasData={transportModes.length > 0}
            className="h-[300px] min-h-[300px] w-full"
            loadingMessage="Loading chart..."
            emptyMessage="No transport mode distribution data available yet."
          >
            <PieChart>
              <Pie data={transportModes} dataKey="value" nameKey="name" outerRadius={85}>
                {transportModes.map((item, index) => (
                  <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ChartWrapper>
        </CardContent>
      </Card>
    </div>
  );
}
