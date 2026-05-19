import { type FormEvent, useEffect, useState } from "react";
import { BarChart3, CheckCircle2, DollarSign, Factory, Loader2, PlusCircle, Send, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { ledgerService } from "@/src/services/ledgerService";
import { emissionsService, type EmissionActivityPayload } from "@/src/services/emissionsService";
import { shipmentService } from "@/src/services/shipmentService";
import { socketService } from "@/src/services/socketService";
import { useAuth } from "@/src/hooks/useAuth";
import type { EmissionRecord, LedgerEntry, LedgerOverview, Shipment } from "@/src/types/platform";

const ACTIVITY_PRESETS: Record<string, Pick<EmissionActivityPayload, "scope" | "category" | "activityType" | "activityUnit" | "fuelType">> = {
  stationary_fuel: { scope: 1, category: "Stationary combustion", activityType: "stationary_fuel", activityUnit: "liter", fuelType: "DIESEL" },
  mobile_fuel: { scope: 1, category: "Mobile combustion", activityType: "mobile_fuel", activityUnit: "liter", fuelType: "DIESEL" },
  fleet_distance: { scope: 1, category: "Mobile combustion", activityType: "fleet_distance", activityUnit: "km", fuelType: "DIESEL" },
  refrigerant_leakage: { scope: 1, category: "Fugitive emissions", activityType: "refrigerant_leakage", activityUnit: "kg", fuelType: "REFRIGERANT_R410A" },
  electricity: { scope: 2, category: "Purchased electricity", activityType: "electricity", activityUnit: "kWh", fuelType: "GLOBAL" },
  purchased_heat: { scope: 2, category: "Purchased heating/cooling/steam", activityType: "purchased_heat", activityUnit: "kWh", fuelType: "GLOBAL" },
  business_travel_air: { scope: 3, category: "Business travel", activityType: "business_travel_air", activityUnit: "km", fuelType: "BUSINESS_TRAVEL_AIR_KM" },
  employee_commuting_car: { scope: 3, category: "Employee commuting", activityType: "employee_commuting_car", activityUnit: "km", fuelType: "EMPLOYEE_COMMUTING_CAR_KM" },
  purchased_goods_services: { scope: 3, category: "Purchased goods and services", activityType: "purchased_goods_services", activityUnit: "USD", fuelType: "PURCHASED_GOODS_USD" },
  waste_landfill: { scope: 3, category: "Waste generated in operations", activityType: "waste_landfill", activityUnit: "kg", fuelType: "WASTE_LANDFILL_KG" },
  upstream_transportation: { scope: 3, category: "Upstream transportation and distribution", activityType: "upstream_transportation", activityUnit: "ton-km", fuelType: "UPSTREAM_TRANSPORTATION_TON_KM" },
  downstream_transportation: { scope: 3, category: "Downstream transportation and distribution", activityType: "downstream_transportation", activityUnit: "ton-km", fuelType: "DOWNSTREAM_TRANSPORTATION_TON_KM" },
  fuel_energy_related: { scope: 3, category: "Fuel and energy-related activities", activityType: "fuel_energy_related", activityUnit: "kWh", fuelType: "FUEL_ENERGY_RELATED_KWH" },
};

const DEFAULT_ACTIVITY_BY_SCOPE: Record<1 | 2 | 3, keyof typeof ACTIVITY_PRESETS> = {
  1: "stationary_fuel",
  2: "electricity",
  3: "business_travel_air",
};

const SAMPLE_IMPORT_CSV = "scope,category,activityType,activityAmount,activityUnit,reportingPeriodStart,reportingPeriodEnd,facility,businessUnit,country,notes,fuelType\n1,Stationary combustion,stationary_fuel,100,liter,2026-05-01,2026-05-31,Plant A,Operations,US,Boiler diesel use,DIESEL\n2,Purchased electricity,electricity,1000,kWh,2026-05-01,2026-05-31,HQ,Operations,US,Grid electricity,GLOBAL\n3,Business travel,business_travel_air,1500,km,2026-05-01,2026-05-31,HQ,Sales,US,Flight travel,BUSINESS_TRAVEL_AIR_KM";

const emptyOverview: LedgerOverview = {
  data: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  records: [],
  summary: {
    totalSpend: 0,
    totalCarbonTax: 0,
    totalCarbonCost: 0,
    totalEmissions: 0,
    carbonCostRatio: 0,
    scope1: 0,
    scope2: 0,
    scope3: 0,
  },
  breakdowns: {
    byCategory: [],
    bySupplier: [],
    byMonth: [],
  },
};

export function LedgerPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<LedgerOverview>(emptyOverview);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingActivity, setSavingActivity] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importPreview, setImportPreview] = useState<Awaited<ReturnType<typeof emissionsService.previewImport>> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [activityForm, setActivityForm] = useState<EmissionActivityPayload>({
    scope: 1,
    category: "Stationary combustion",
    activityType: "stationary_fuel",
    activityAmount: 0,
    activityUnit: "liter",
    fuelType: "DIESEL",
    description: "",
    facilityName: "",
    businessUnit: "",
    reportingPeriod: new Date().toISOString().slice(0, 7),
    occurredAt: new Date().toISOString().slice(0, 10),
  });

  const loadPage = async () => {
    try {
      setError("");
      const [ledgerResponse, shipmentResponse] = await Promise.all([
        ledgerService.getEntries("?pageSize=20"),
        shipmentService.getShipments("?pageSize=50"),
      ]);
      setOverview(ledgerResponse);
      setShipments(shipmentResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    const unsubscribers = [
      socketService.on("ledgerUpdated", loadPage),
      socketService.on("shipmentUpdated", loadPage),
      socketService.on("shipmentCreated", loadPage),
      socketService.on("supplierUpdated", loadPage),
      socketService.on("emissionActivityCreated", loadPage),
      socketService.on("emissionRecordStatusChanged", loadPage),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const createFromShipment = async () => {
    const shipment = shipments[0];
    if (!shipment) return;
    await ledgerService.createEntry({
      shipmentId: shipment.id,
      entryDate: new Date().toISOString().slice(0, 10),
      category: "FREIGHT",
      description: `Ledger entry for ${shipment.reference}`,
      logisticsCostUsd: shipment.costUsd,
      emissionsTonnes: shipment.emissionsTonnes,
    });
    await loadPage();
  };

  const applyPreset = (activityType: string) => {
    const preset = ACTIVITY_PRESETS[activityType];
    if (!preset) return;
    setActivityForm((current) => ({ ...current, ...preset }));
  };

  const changeScope = (scope: 1 | 2 | 3) => {
    const activityType = DEFAULT_ACTIVITY_BY_SCOPE[scope];
    setActivityForm((current) => ({ ...current, ...ACTIVITY_PRESETS[activityType] }));
  };

  const submitActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingActivity(true);
    try {
      setError("");
      await emissionsService.createActivity({
        ...activityForm,
        activityAmount: Number(activityForm.activityAmount),
        occurredAt: activityForm.occurredAt ? new Date(activityForm.occurredAt).toISOString() : undefined,
      });
      setActivityForm((current) => ({ ...current, activityAmount: 0, description: "" }));
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record emission activity");
    } finally {
      setSavingActivity(false);
    }
  };

  const previewImport = async () => {
    setImporting(true);
    try {
      setError("");
      setImportSuccess("");
      setImportPreview(await emissionsService.previewImport(importCsv));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview import");
    } finally {
      setImporting(false);
    }
  };

  const commitImport = async () => {
    setImporting(true);
    try {
      setError("");
      const result = await emissionsService.commitImport(importCsv);
      setImportPreview(result);
      setImportSuccess(`${result.createdCount ?? 0} valid emission activity records imported successfully.`);
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save import");
    } finally {
      setImporting(false);
    }
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setImportCsv(text);
    setImportPreview(null);
    setImportSuccess("");
  };

  const downloadSampleTemplate = () => {
    const blob = new Blob([SAMPLE_IMPORT_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "emission-activity-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setImportCsv(SAMPLE_IMPORT_CSV);
  };

  const updateRecordStatus = async (id: string, dataStatus: string) => {
    try {
      setError("");
      const notes = statusNotes[id]?.trim();
      if ((dataStatus === "rejected" || dataStatus === "needs_correction") && !notes) {
        setError("Notes are required when rejecting a record or requesting correction.");
        return;
      }
      await emissionsService.updateStatus(id, dataStatus, notes);
      setStatusNotes((current) => ({ ...current, [id]: "" }));
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update record status");
    }
  };

  const summary = overview.summary;
  const normalizedRole = String(user?.role || "").toUpperCase();
  const isDataEntry = normalizedRole === "USER" || normalizedRole === "DATA_ENTRY";
  const canReviewRecords = ["MANAGER", "ADMIN", "SUPERADMIN", "OWNER"].includes(normalizedRole);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Carbon Ledger</h1>
          <p className="text-muted-foreground">Centralize Scope 1, 2, and 3 records with spend, supplier, and monthly breakdowns.</p>
        </div>
        <Button onClick={createFromShipment}>
          <BarChart3 className="mr-2 h-4 w-4" />
          Add Freight Entry
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Total Emissions" value={`${summary.totalEmissions.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Scope 1" value={`${summary.scope1.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Scope 2" value={`${summary.scope2.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Scope 3" value={`${summary.scope3.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Total Spend" value={`$${summary.totalSpend.toLocaleString()}`} icon={DollarSign} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Record Emission Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitActivity}>
              <div className="space-y-2">
                <Label htmlFor="scope">Scope</Label>
                <select
                  id="scope"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={activityForm.scope}
                  onChange={(event) => changeScope(Number(event.target.value) as 1 | 2 | 3)}
                >
                  <option value={1}>Scope 1</option>
                  <option value={2}>Scope 2</option>
                  <option value={3}>Scope 3</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" value={activityForm.category} onChange={(event) => setActivityForm((current) => ({ ...current, category: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activityType">Activity Type</Label>
                <select
                  id="activityType"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={activityForm.activityType}
                  onChange={(event) => applyPreset(event.target.value)}
                >
                  <option value="stationary_fuel">Stationary fuel</option>
                  <option value="mobile_fuel">Mobile fuel</option>
                  <option value="fleet_distance">Fleet distance</option>
                  <option value="refrigerant_leakage">Refrigerant leakage</option>
                  <option value="electricity">Purchased electricity</option>
                  <option value="purchased_heat">Purchased heat/cooling/steam</option>
                  <option value="business_travel_air">Business travel air</option>
                  <option value="employee_commuting_car">Employee commuting car</option>
                  <option value="purchased_goods_services">Purchased goods/services</option>
                  <option value="waste_landfill">Waste landfill</option>
                  <option value="upstream_transportation">Upstream transportation</option>
                  <option value="downstream_transportation">Downstream transportation</option>
                  <option value="fuel_energy_related">Fuel and energy-related</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Activity Amount</Label>
                <Input id="amount" type="number" min="0" step="0.0001" value={activityForm.activityAmount} onChange={(event) => setActivityForm((current) => ({ ...current, activityAmount: Number(event.target.value) }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" value={activityForm.activityUnit} onChange={(event) => setActivityForm((current) => ({ ...current, activityUnit: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuelType">Factor Key / Fuel</Label>
                <Input id="fuelType" value={activityForm.fuelType ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, fuelType: event.target.value }))} placeholder="DIESEL, US, GLOBAL" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facility">Facility</Label>
                <Input id="facility" value={activityForm.facilityName ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, facilityName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessUnit">Business Unit</Label>
                <Input id="businessUnit" value={activityForm.businessUnit ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, businessUnit: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Reporting Period</Label>
                <Input id="period" value={activityForm.reportingPeriod ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, reportingPeriod: event.target.value }))} placeholder="2026-05" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurredAt">Activity Date</Label>
                <Input id="occurredAt" type="date" value={activityForm.occurredAt ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, occurredAt: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" value={activityForm.description ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={savingActivity} className="w-full">
                  {savingActivity ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Record Activity
                </Button>
              </div>
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 md:col-span-2 xl:col-span-4">This MVP uses sample emission factors. Replace with official factors before production use. CarbonFlow sample factors are placeholders and should not be presented as official DEFRA/EPA/IPCC/GHG Protocol data.</p>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>CSV Activity Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="csvFile">Upload CSV</Label>
                <Input id="csvFile" type="file" accept=".csv,text/csv" onChange={(event) => handleCsvFile(event.target.files?.[0] ?? null)} />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={downloadSampleTemplate}>
                  Download sample CSV template
                </Button>
              </div>
            </div>
            <textarea
              className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={importCsv}
              onChange={(event) => setImportCsv(event.target.value)}
              placeholder="scope,category,activityType,activityAmount,activityUnit,reportingPeriodStart,reportingPeriodEnd,facility,businessUnit,country,notes"
            />
            {importSuccess && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{importSuccess}</div>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={importing || !importCsv.trim()} onClick={previewImport}>
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Preview CSV
              </Button>
              <Button type="button" disabled={importing || !importPreview?.validRows} onClick={commitImport}>Save Valid Rows</Button>
            </div>
            {importPreview && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Row</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Category</th>
                      <th className="px-4 py-2">Factor</th>
                      <th className="px-4 py-2">kgCO2e</th>
                      <th className="px-4 py-2">tCO2e</th>
                      <th className="px-4 py-2">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {importPreview.rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-4 py-2">{row.rowNumber}</td>
                        <td className="px-4 py-2">{row.valid ? "Valid" : "Invalid"}</td>
                        <td className="px-4 py-2">{row.payload.category}</td>
                        <td className="px-4 py-2">{row.factor ? `${row.factor.name} ${row.factor.isSample ? "(sample)" : ""}` : "-"}</td>
                        <td className="px-4 py-2">{row.calculation ? row.calculation.emissionsKgCo2e.toFixed(2) : "-"}</td>
                        <td className="px-4 py-2">{row.calculation ? row.calculation.emissionsTCo2e.toFixed(4) : "-"}</td>
                        <td className="px-4 py-2 text-destructive">{row.errors.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.breakdowns.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{loading ? "Loading category breakdown..." : "No emission records yet."}</p>
            ) : overview.breakdowns.byCategory.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-foreground">{item.name}</span>
                <span className="font-semibold text-primary">{item.value.toFixed(2)} tCO2e</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Suppliers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.breakdowns.bySupplier.length === 0 ? (
              <p className="text-sm text-muted-foreground">{loading ? "Loading supplier breakdown..." : "No supplier-linked emissions yet."}</p>
            ) : overview.breakdowns.bySupplier.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-foreground">{item.name}</span>
                <span className="font-semibold text-primary">{item.value.toFixed(2)} tCO2e</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Exposure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border p-3">
              <div className="text-foreground font-medium">Carbon Tax</div>
              <div className="mt-1 text-xl font-semibold text-destructive">${summary.totalCarbonTax.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-foreground font-medium">Carbon Cost Ratio</div>
              <div className="mt-1 text-xl font-semibold text-primary">{summary.carbonCostRatio.toFixed(2)}%</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-foreground font-medium">Ledger Carbon Cost</div>
              <div className="mt-1 text-xl font-semibold">${summary.totalCarbonCost.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Scope Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Month</th>
                  <th className="px-6 py-3 font-medium">Scope 1</th>
                  <th className="px-6 py-3 font-medium">Scope 2</th>
                  <th className="px-6 py-3 font-medium">Scope 3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.breakdowns.byMonth.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-4 text-center text-muted-foreground">No monthly data available.</td></tr>
                ) : overview.breakdowns.byMonth.map((item) => (
                  <tr key={item.name} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium text-foreground">{item.name}</td>
                    <td className="px-6 py-4">{item.scope1.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{item.scope2.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{item.scope3.toFixed(2)} tCO2e</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emission Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Scope</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Activity</th>
                  <th className="px-6 py-3 font-medium">Factor</th>
                  <th className="px-6 py-3 font-medium">Source</th>
                  <th className="px-6 py-3 font-medium">Formula</th>
                  <th className="px-6 py-3 font-medium">kgCO2e</th>
                  <th className="px-6 py-3 font-medium">tCO2e</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={11} className="px-6 py-4 text-center text-muted-foreground">Loading emission records...</td></tr>
                ) : overview.records.length === 0 ? (
                  <tr><td colSpan={11} className="px-6 py-4 text-center text-muted-foreground">No emission records found.</td></tr>
                ) : overview.records.map((record) => (
                  <tr key={record.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">{new Date(record.occurredAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">Scope {record.scope}</td>
                    <td className="px-6 py-4">{record.category}</td>
                    <td className="min-w-[260px] px-6 py-4">
                      <StatusWorkflow
                        record={record}
                        note={statusNotes[record.id] || ""}
                        canSubmit={isDataEntry}
                        canReview={canReviewRecords}
                        onNoteChange={(value) => setStatusNotes((current) => ({ ...current, [record.id]: value }))}
                        onStatusChange={(status) => updateRecordStatus(record.id, status)}
                      />
                    </td>
                    <td className="px-6 py-4">{record.activityAmount ?? "-"} {record.activityUnit || ""}</td>
                    <td className="px-6 py-4">{record.factorValue} {record.factorUnit || ""}</td>
                    <td className="px-6 py-4">{record.factorSource || "CarbonFlow sample factors"}{record.factorIsSample !== false ? " (sample)" : ""}</td>
                    <td className="px-6 py-4">activity x factor</td>
                    <td className="px-6 py-4">{(record.emissionsKgCo2e ?? record.amountTonnes * 1000).toFixed(2)}</td>
                    <td className="px-6 py-4 font-medium text-primary">{(record.emissionsTCo2e ?? record.amountTonnes).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financial Ledger Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Shipment Ref</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 text-right font-medium">Logistics Cost</th>
                  <th className="px-6 py-3 text-right font-medium">Carbon Tax</th>
                  <th className="px-6 py-3 text-right font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">Loading ledger entries...</td></tr>
                ) : overview.data.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">No ledger entries found.</td></tr>
                ) : overview.data.map((entry: LedgerEntry) => (
                  <tr key={entry.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">{entry.entryDate}</td>
                    <td className="px-6 py-4 text-primary">{entry.shipment?.reference || "-"}</td>
                    <td className="px-6 py-4">{entry.description}</td>
                    <td className="px-6 py-4 text-right">${entry.logisticsCostUsd.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-destructive">${entry.carbonTaxUsd.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold">${entry.totalCostUsd.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: string; icon: typeof DollarSign }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusWorkflow({
  record,
  note,
  canSubmit,
  canReview,
  onNoteChange,
  onStatusChange,
}: {
  record: EmissionRecord;
  note: string;
  canSubmit: boolean;
  canReview: boolean;
  onNoteChange: (value: string) => void;
  onStatusChange: (status: NonNullable<EmissionRecord["dataStatus"]>) => void;
}) {
  const status = record.dataStatus || "draft";
  const canSubmitRecord = canSubmit && ["draft", "rejected", "needs_correction"].includes(status);
  const canReviewRecord = canReview && status === "submitted";
  const canApproveRecord = canReview && ["submitted", "reviewed"].includes(status);
  const canRejectRecord = canReview && ["submitted", "reviewed", "needs_correction"].includes(status);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClassName(status)}`}>{statusLabel(status)}</span>
        {canSubmitRecord && (
          <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange("submitted")}>
            <Send className="mr-1 h-3 w-3" />
            Submit
          </Button>
        )}
        {canReviewRecord && (
          <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange("reviewed")}>
            Review
          </Button>
        )}
        {canApproveRecord && (
          <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange("approved")}>
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approve
          </Button>
        )}
        {canRejectRecord && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange("needs_correction")}>
              Needs correction
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onStatusChange("rejected")}>
              <XCircle className="mr-1 h-3 w-3" />
              Reject
            </Button>
          </>
        )}
      </div>
      {(canRejectRecord || record.correctionNotes) && (
        <Input
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder={record.correctionNotes || "Notes for rejection or correction"}
          className="h-8 text-xs"
        />
      )}
      {record.approvalNotes && <p className="text-xs text-muted-foreground">Approval: {record.approvalNotes}</p>}
      {record.correctionNotes && <p className="text-xs text-destructive">Correction: {record.correctionNotes}</p>}
    </div>
  );
}

function statusLabel(status: string) {
  return status.replace("_", " ");
}

function statusClassName(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "submitted" || status === "reviewed") return "bg-sky-100 text-sky-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  if (status === "needs_correction") return "bg-amber-100 text-amber-900";
  return "bg-muted text-muted-foreground";
}
