import { type FormEvent, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, DollarSign, Download, Eye, Factory, FileText, Loader2, PlusCircle, Send, Upload, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { ledgerService } from "@/src/services/ledgerService";
import { emissionsService, type EmissionActivityPayload } from "@/src/services/emissionsService";
import { shipmentService } from "@/src/services/shipmentService";
import { reportsService } from "@/src/services/reportsService";
import { supplierService } from "@/src/services/supplierService";
import { socketService } from "@/src/services/socketService";
import { useAuth } from "@/src/hooks/useAuth";
import { buildLedgerFactorMessage } from "./ledgerFactorMessage";
import { NO_PERMISSION_MESSAGE, hasPermission } from "@/src/utils/permissions";
import type { EmissionRecord, LedgerEntry, LedgerOverview, ReportItem, Shipment, Supplier } from "@/src/types/platform";

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

const SAMPLE_IMPORT_CSV = "scope,category,activityType,activityAmount,activityUnit,factorKey,reportingPeriodStart,reportingPeriodEnd,activityDate,facility,businessUnit,country,region,supplier,notes\n1,Stationary combustion,stationary_fuel,100,liter,DIESEL,2026-05-01,2026-05-31,2026-05-15,Plant A,Operations,US,GLOBAL,Acme Fuels,Boiler diesel use\n2,Purchased electricity,electricity,1000,kWh,GLOBAL,2026-05-01,2026-05-31,2026-05-15,HQ,Operations,US,GLOBAL,Utility Provider,Grid electricity\n3,Business travel,business_travel_air,1500,km,BUSINESS_TRAVEL_AIR_KM,2026-05-01,2026-05-31,2026-05-20,HQ,Sales,US,GLOBAL,Travel Vendor,Flight travel";

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierError, setSupplierError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingActivity, setSavingActivity] = useState(false);
  const [matchedFactor, setMatchedFactor] = useState<Awaited<ReturnType<typeof emissionsService.matchFactor>> | undefined>(undefined);
  const [importCsv, setImportCsv] = useState("");
  const [importPreview, setImportPreview] = useState<Awaited<ReturnType<typeof emissionsService.previewImport>> | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [ledgerQuery, setLedgerQuery] = useState({ view: "approved", search: "", scope: "", status: "", factorStatus: "", reportingPeriod: "", supplierId: "", supplierRiskLevel: "" });
  const [selectedRecord, setSelectedRecord] = useState<EmissionRecord | null>(null);
  const [recordSuccess, setRecordSuccess] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState<ReportItem | null>(null);
  const [reportError, setReportError] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportForm, setReportForm] = useState({
    periodStart: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    recordSelection: "approved_only",
    includeDrafts: false,
    format: "PDF" as "PDF" | "CSV",
  });
  const [showFinancialForm, setShowFinancialForm] = useState(false);
  const [financialForm, setFinancialForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    category: "FREIGHT" as LedgerEntry["category"],
    description: "",
    logisticsCostUsd: 0,
    carbonTaxUsd: 0,
    offsetCostUsd: 0,
    internalCarbonPriceUsd: 55,
    currency: "USD",
    supplierVendor: "",
    emissionRecordId: "",
    shipmentId: "",
  });
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
    country: "",
    region: "GLOBAL",
    reportingPeriod: new Date().toISOString().slice(0, 7),
    occurredAt: new Date().toISOString().slice(0, 10),
  });

  const loadPage = async (query = ledgerQuery) => {
    try {
      setError("");
      const params = new URLSearchParams({ pageSize: "20" });
      Object.entries(query).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const [ledgerResponse, shipmentResponse] = await Promise.all([
        ledgerService.getEntries(`?${params.toString()}`),
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

  const loadSuppliers = async () => {
    try {
      setSupplierError("");
      const response = await supplierService.getSuppliers("?pageSize=100");
      setSuppliers(response.data);
    } catch (err) {
      setSupplierError(err instanceof Error ? err.message : "Failed to load suppliers");
      setSuppliers([]);
    }
  };

  useEffect(() => {
    loadPage();
    loadSuppliers();
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(ledgerQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [ledgerQuery.view, ledgerQuery.search, ledgerQuery.scope, ledgerQuery.status, ledgerQuery.factorStatus, ledgerQuery.reportingPeriod, ledgerQuery.supplierId, ledgerQuery.supplierRiskLevel]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      scope: String(activityForm.scope),
      category: activityForm.category,
      activityType: activityForm.activityType,
      activityUnit: activityForm.activityUnit,
    });

    if (activityForm.factorKey || activityForm.fuelType) params.set("factorKey", String(activityForm.factorKey || activityForm.fuelType));
    if (activityForm.country) params.set("country", activityForm.country);
    if (activityForm.region) params.set("region", activityForm.region);
    if (activityForm.occurredAt) params.set("occurredAt", activityForm.occurredAt);

    setMatchedFactor(undefined);

    const timer = window.setTimeout(() => {
      emissionsService.matchFactor(`?${params.toString()}`)
        .then((factor) => {
          if (!cancelled) setMatchedFactor(factor);
        })
        .catch(() => {
          if (!cancelled) setMatchedFactor(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activityForm.activityType, activityForm.activityUnit, activityForm.category, activityForm.country, activityForm.factorKey, activityForm.fuelType, activityForm.occurredAt, activityForm.region, activityForm.scope]);

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

  const createFinancialEntry = async () => {
    try {
      setError("");
      await ledgerService.createEntry({
        ...financialForm,
        logisticsCostUsd: Number(financialForm.logisticsCostUsd),
        carbonTaxUsd: Number(financialForm.carbonTaxUsd),
        offsetCostUsd: Number(financialForm.offsetCostUsd),
        internalCarbonPriceUsd: Number(financialForm.internalCarbonPriceUsd),
        emissionsTonnes: selectedRecord?.amountTonnes || 0,
        emissionRecordId: financialForm.emissionRecordId || selectedRecord?.id || null,
        shipmentId: financialForm.shipmentId || undefined,
      });
      setShowFinancialForm(false);
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create financial ledger entry");
    }
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

  const validateActivityForm = (status: "draft" | "submitted") => {
    const nextErrors: Record<string, string> = {};
    if (![1, 2, 3].includes(Number(activityForm.scope))) nextErrors.scope = "Scope is required.";
    if (!activityForm.category.trim()) nextErrors.category = "Category is required.";
    if (!activityForm.activityType.trim()) nextErrors.activityType = "Activity type is required.";
    if (!activityForm.activityUnit.trim()) nextErrors.activityUnit = "Activity unit is required.";
    if (!activityForm.fuelType && !activityForm.factorKey && !activityForm.factorValue) nextErrors.factorKey = "Factor key is required unless using a custom factor.";
    if (!activityForm.reportingPeriod?.trim()) nextErrors.reportingPeriod = "Reporting period is required.";
    if (!activityForm.occurredAt) nextErrors.occurredAt = "Activity date is required.";
    if (!Number.isFinite(Number(activityForm.activityAmount)) || Number(activityForm.activityAmount) < 0) nextErrors.activityAmount = "Activity amount must be zero or greater.";
    if (Number(activityForm.activityAmount) === 0 && status !== "draft") nextErrors.activityAmount = "Activity amount must be greater than 0 before submitting.";
    if (activityForm.country && !/^[A-Za-z]{2,3}$/.test(activityForm.country.trim())) nextErrors.country = "Use a 2 or 3 letter country code.";
    setFormErrors(nextErrors);
    return nextErrors;
  };

  const submitActivity = async (event: FormEvent<HTMLFormElement>, status: "draft" | "submitted" = "draft") => {
    event.preventDefault();
    if (Object.keys(validateActivityForm(status)).length > 0) return;
    setSavingActivity(true);
    try {
      setError("");
      await emissionsService.createActivity({
        ...activityForm,
        activityAmount: Number(activityForm.activityAmount),
        dataStatus: status,
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

  const generateReport = async () => {
    setGeneratingReport(true);
    setReportError("");
    setReportSuccess(null);
    try {
      const report = await reportsService.generateReport({
        name: `Carbon Ledger Report ${reportForm.periodStart} to ${reportForm.periodEnd}`,
        type: "ESG",
        format: reportForm.format,
        metadata: {
          periodStart: reportForm.periodStart,
          periodEnd: reportForm.periodEnd,
          reportingPeriod: `${reportForm.periodStart} to ${reportForm.periodEnd}`,
          recordSelection: reportForm.recordSelection,
          includeUnapproved: reportForm.recordSelection === "all_records",
          includeDrafts: reportForm.includeDrafts,
          approvedOnly: reportForm.recordSelection === "approved_only",
          generatedFrom: "carbon_ledger",
        },
      });
      setReportSuccess(report);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  const downloadReport = async (report: ReportItem) => {
    try {
      setReportError("");
      const blob = await reportsService.downloadReport(report.downloadUrl);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = report.downloadUrl.split("/").pop() || `carbon-ledger-report.${report.format.toLowerCase()}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to download report");
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

  const recalculateRecord = async (id: string, reason?: string) => {
    try {
      setError("");
      await emissionsService.recalculate(id, reason);
      setSelectedRecord(null);
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate record");
    }
  };

  const saveRecordEdit = async (id: string, payload: Parameters<typeof emissionsService.updateActivity>[1]) => {
    try {
      setError("");
      setRecordSuccess("");
      const updated = await emissionsService.updateActivity(id, payload);
      setSelectedRecord(updated);
      setRecordSuccess("Emission record updated successfully.");
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update emission record");
      throw err;
    }
  };

  const summary = overview.summary;
  const normalizedRole = String(user?.role || "").toUpperCase();
  const isDataEntry = normalizedRole === "USER" || normalizedRole === "DATA_ENTRY";
  const canReviewRecords = hasPermission(user, "emission:approve") || ["MANAGER", "ADMIN", "SUPERADMIN", "OWNER"].includes(normalizedRole);
  const canCreateRecords = hasPermission(user, "emission:create") || ["OWNER", "ADMIN", "MANAGER", "DATA_ENTRY", "USER"].includes(normalizedRole);
  const canCreateFinancialEntries = hasPermission(user, "ledger:financial:create") || ["OWNER", "ADMIN", "MANAGER"].includes(normalizedRole);
  const calculationPreview = buildCalculationPreview(activityForm, matchedFactor);
  const categoryRows = overview.categoryBreakdown?.length ? overview.categoryBreakdown : overview.breakdowns.byCategory;
  const supplierRows = overview.supplierBreakdown?.length ? overview.supplierBreakdown : overview.breakdowns.bySupplier;
  const monthRows = overview.monthlyBreakdown?.length ? overview.monthlyBreakdown : overview.breakdowns.byMonth;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Carbon Ledger</h1>
          <p className="text-muted-foreground">Audit-ready Scope 1, 2, and 3 activity records, approvals, factors, supplier exposure, and financial ledger entries.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => document.getElementById("activity-form")?.scrollIntoView({ behavior: "smooth" })}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Emission Activity
          </Button>
          <Button type="button" variant="outline" onClick={() => document.getElementById("activity-import")?.scrollIntoView({ behavior: "smooth" })}>
            <Upload className="mr-2 h-4 w-4" />
            Import Activity Data
          </Button>
          <Button type="button" variant="outline" disabled={!canCreateFinancialEntries} title={canCreateFinancialEntries ? "Add Financial Entry" : NO_PERMISSION_MESSAGE} onClick={() => setShowFinancialForm((current) => !current)}>
            <DollarSign className="mr-2 h-4 w-4" />
            Add Financial Entry
          </Button>
          <Button type="button" onClick={() => setReportModalOpen(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {recordSuccess && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{recordSuccess}</div>}
      {supplierError && <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Supplier picker could not load: {supplierError}</div>}
      {reportSuccess && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>Report generated successfully.</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => downloadReport(reportSuccess)}>Download</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { window.location.href = "/reports"; }}>Reports page</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Approved Total Emissions" value={`${summary.totalEmissions.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Approved Scope 1" value={`${summary.scope1.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Approved Scope 2" value={`${summary.scope2.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Approved Scope 3" value={`${summary.scope3.toFixed(2)} tCO2e`} icon={Factory} />
        <SummaryCard title="Total Spend" value={`$${summary.totalSpend.toLocaleString()}`} icon={DollarSign} />
        <SummaryCard title="Approved Records" value={summary.approvedRecords ?? 0} icon={CheckCircle2} />
        <SummaryCard title="Draft Records" value={summary.draftRecords ?? 0} icon={FileText} />
        <SummaryCard title="Missing Factor Records" value={summary.missingFactorRecords ?? 0} icon={AlertTriangle} />
        <SummaryCard title="Sample Factor Records" value={summary.sampleFactorRecords ?? 0} icon={AlertTriangle} />
      </div>
      {(summary.draftRecords ?? 0) > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Draft records are excluded from approved totals.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card id="activity-form" className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Record Emission Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => submitActivity(event, "draft")}>
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
                <FieldError message={formErrors.scope} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" value={activityForm.category} onChange={(event) => setActivityForm((current) => ({ ...current, category: event.target.value }))} required />
                <FieldError message={formErrors.category} />
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
                <FieldError message={formErrors.activityType} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Activity Amount</Label>
                <Input id="amount" type="number" min="0" step="0.0001" value={activityForm.activityAmount} onChange={(event) => setActivityForm((current) => ({ ...current, activityAmount: Number(event.target.value) }))} required />
                <FieldError message={formErrors.activityAmount} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" value={activityForm.activityUnit} onChange={(event) => setActivityForm((current) => ({ ...current, activityUnit: event.target.value }))} required />
                <FieldError message={formErrors.activityUnit} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuelType">Factor Key / Fuel</Label>
                <Input id="fuelType" value={activityForm.fuelType ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, fuelType: event.target.value }))} placeholder="DIESEL, US, GLOBAL" />
                <FieldError message={formErrors.factorKey} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" value={activityForm.country ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, country: event.target.value }))} placeholder="US, GB, PK" />
                <FieldError message={formErrors.country} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" value={activityForm.region ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, region: event.target.value }))} placeholder="GLOBAL, US, EUROPE" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplierId">Linked Supplier</Label>
                <select
                  id="supplierId"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={activityForm.supplierId ?? ""}
                  onChange={(event) => {
                    const supplier = suppliers.find((item) => item.id === event.target.value);
                    setActivityForm((current) => ({
                      ...current,
                      supplierId: event.target.value || null,
                      supplierName: supplier?.name || current.supplierName,
                      supplier: supplier?.name || current.supplier,
                    }));
                  }}
                >
                  <option value="">No linked supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} - {supplier.category} - {supplier.country} - {supplier.riskLevel}
                    </option>
                  ))}
                </select>
                {suppliers.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>No suppliers available. Create a supplier first or save record without supplier.</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => { window.location.href = "/suppliers"; }}>Suppliers</Button>
                  </div>
                ) : null}
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
                <FieldError message={formErrors.reportingPeriod} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurredAt">Activity Date</Label>
                <Input id="occurredAt" type="date" value={activityForm.occurredAt ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, occurredAt: event.target.value }))} />
                <FieldError message={formErrors.occurredAt} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" value={activityForm.description ?? ""} onChange={(event) => setActivityForm((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={savingActivity || !canCreateRecords} title={canCreateRecords ? "Save Draft" : NO_PERMISSION_MESSAGE} className="w-full">
                  {savingActivity ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Save Draft
                </Button>
              </div>
              <div className="flex items-end">
                <Button type="button" disabled={savingActivity || !canCreateRecords} title={canCreateRecords ? "Submit for Review" : NO_PERMISSION_MESSAGE} className="w-full" onClick={(event) => submitActivity(event as unknown as FormEvent<HTMLFormElement>, "submitted")}>
                  <Send className="mr-2 h-4 w-4" />
                  Submit for Review
                </Button>
              </div>
              <CalculationPreviewPanel matchedFactor={matchedFactor} preview={calculationPreview} />
            </form>
          </CardContent>
        </Card>

        <Card id="activity-import" className="lg:col-span-3">
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
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV Template
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
            {importPreview ? (
              <div className="grid gap-2 md:grid-cols-5">
                <ImportStat label="Total rows" value={importPreview.totalRows} />
                <ImportStat label="Valid" value={importPreview.validRows} />
                <ImportStat label="Invalid" value={importPreview.invalidRows} />
                <ImportStat label="Missing factors" value={importPreview.missingFactorRows ?? 0} />
                <ImportStat label="Estimated kgCO2e" value={(importPreview.estimatedKgCo2e ?? 0).toFixed(2)} />
                <ImportStat label="Estimated tCO2e" value={(importPreview.estimatedTCo2e ?? 0).toFixed(4)} />
              </div>
            ) : null}
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
            {categoryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{loading ? "Loading category breakdown..." : "No calculated emissions yet. Add activity amount greater than 0, match a factor, and approve records to populate totals."}</p>
            ) : categoryRows.map((item) => (
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
            {supplierRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{loading ? "Loading supplier breakdown..." : "Link emission records to suppliers to identify supplier carbon exposure."}</p>
            ) : supplierRows.map((item) => (
              <div key={`${item.supplierId || item.name}-${item.linkStatus || "linked"}`} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  <span className="font-semibold text-primary">{item.value.toFixed(2)} tCO2e</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {item.recordCount ?? 0} records | {item.sharePct ?? 0}% share | Risk {item.riskLevel || "n/a"} | {item.linkStatus === "unverified" ? "Unverified supplier link" : "Linked supplier"}
                </div>
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

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Data Quality Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <QualityTile label="Draft records" value={summary.draftRecords ?? 0} action="Submit Drafts" />
            <QualityTile label="Submitted records" value={summary.submittedRecords ?? 0} action="Approve Submitted Records" />
            <QualityTile label="Approved records" value={summary.approvedRecords ?? 0} action="Generate Report" />
            <QualityTile label="Rejected records" value={summary.rejectedRecords ?? 0} action="Review Rejections" />
            <QualityTile label="Needs correction" value={summary.needsCorrectionRecords ?? 0} action="Resolve Corrections" />
            <QualityTile label="Missing factors" value={summary.missingFactorRecords ?? 0} action="Review Missing Factors" />
            <QualityTile label="Sample factors" value={summary.sampleFactorRecords ?? 0} action="Manage Emission Factors" />
            <QualityTile label="Zero activity" value={summary.zeroAmountRecords ?? 0} action="Import Activities" />
            <QualityTile label="Calculation errors" value={summary.calculationErrorRecords ?? 0} action="Review Records" />
            <QualityTile label="Unlinked suppliers" value={summary.unlinkedSupplierRecords ?? 0} action="Link Suppliers" />
            <QualityTile label="Missing facility/BU" value={summary.missingFacilityRecords ?? 0} action="Add Metadata" />
            <QualityTile label="Missing period" value={summary.missingReportingPeriodRecords ?? 0} action="Add Reporting Period" />
          </CardContent>
        </Card>

        {showFinancialForm ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Add Financial Entry</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Input type="date" value={financialForm.entryDate} onChange={(event) => setFinancialForm((current) => ({ ...current, entryDate: event.target.value }))} />
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={financialForm.category} onChange={(event) => setFinancialForm((current) => ({ ...current, category: event.target.value as LedgerEntry["category"] }))}>
                <option value="FREIGHT">Freight</option>
                <option value="TAX">Carbon tax</option>
                <option value="OFFSET">Offset</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
              <Input placeholder="Supplier/vendor" value={financialForm.supplierVendor} onChange={(event) => setFinancialForm((current) => ({ ...current, supplierVendor: event.target.value }))} />
              <Input placeholder="Description" value={financialForm.description} onChange={(event) => setFinancialForm((current) => ({ ...current, description: event.target.value }))} />
              <Input type="number" placeholder="Logistics cost" value={financialForm.logisticsCostUsd} onChange={(event) => setFinancialForm((current) => ({ ...current, logisticsCostUsd: Number(event.target.value) }))} />
              <Input type="number" placeholder="Carbon tax" value={financialForm.carbonTaxUsd} onChange={(event) => setFinancialForm((current) => ({ ...current, carbonTaxUsd: Number(event.target.value) }))} />
              <Input type="number" placeholder="Offset cost" value={financialForm.offsetCostUsd} onChange={(event) => setFinancialForm((current) => ({ ...current, offsetCostUsd: Number(event.target.value) }))} />
              <Input placeholder="Currency" value={financialForm.currency} onChange={(event) => setFinancialForm((current) => ({ ...current, currency: event.target.value }))} />
              <Button type="button" disabled={!canCreateFinancialEntries} title={canCreateFinancialEntries ? "Save Financial Entry" : NO_PERMISSION_MESSAGE} onClick={createFinancialEntry}>Save Financial Entry</Button>
            </CardContent>
          </Card>
        ) : null}
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
                  <th className="px-6 py-3 font-medium">Missing Factors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthRows.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center text-muted-foreground">No calculated emissions yet. Add activity amount greater than 0, match a factor, and approve records to populate totals.</td></tr>
                ) : monthRows.map((item) => (
                  <tr key={item.name} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium text-foreground">{item.name}</td>
                    <td className="px-6 py-4">{item.scope1.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{item.scope2.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{item.scope3.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{item.missingFactorCount ?? 0}</td>
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
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Input placeholder="Search category, factor, facility" value={ledgerQuery.search} onChange={(event) => setLedgerQuery((current) => ({ ...current, search: event.target.value }))} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ledgerQuery.view} onChange={(event) => setLedgerQuery((current) => ({ ...current, view: event.target.value }))}>
              <option value="all">All Records</option>
              <option value="approved">Approved Only</option>
              <option value="drafts">Drafts</option>
              <option value="missing_factors">Missing Factors</option>
              <option value="sample_factors">Sample Factors</option>
              <option value="needs_correction">Needs Correction</option>
              <option value="archived">Archived</option>
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ledgerQuery.scope} onChange={(event) => setLedgerQuery((current) => ({ ...current, scope: event.target.value }))}>
              <option value="">All scopes</option>
              <option value="1">Scope 1</option>
              <option value="2">Scope 2</option>
              <option value="3">Scope 3</option>
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ledgerQuery.status} onChange={(event) => setLedgerQuery((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="needs_correction">Needs correction</option>
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ledgerQuery.factorStatus} onChange={(event) => setLedgerQuery((current) => ({ ...current, factorStatus: event.target.value }))}>
              <option value="">All factor statuses</option>
              <option value="missing">Missing factor</option>
              <option value="sample">Sample factor</option>
              <option value="custom">Official/custom</option>
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ledgerQuery.supplierId} onChange={(event) => setLedgerQuery((current) => ({ ...current, supplierId: event.target.value }))}>
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ledgerQuery.supplierRiskLevel} onChange={(event) => setLedgerQuery((current) => ({ ...current, supplierRiskLevel: event.target.value }))}>
              <option value="">All supplier risks</option>
              <option value="LOW">Low risk</option>
              <option value="MEDIUM">Medium risk</option>
              <option value="HIGH">High risk</option>
              <option value="CRITICAL">Critical risk</option>
            </select>
            <Input placeholder="Reporting period" value={ledgerQuery.reportingPeriod} onChange={(event) => setLedgerQuery((current) => ({ ...current, reportingPeriod: event.target.value }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Reporting Period</th>
                  <th className="px-6 py-3 font-medium">Scope</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Facility / BU</th>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Activity</th>
                  <th className="px-6 py-3 font-medium">Factor</th>
                  <th className="px-6 py-3 font-medium">Source</th>
                  <th className="px-6 py-3 font-medium">Formula</th>
                  <th className="px-6 py-3 font-medium">kgCO2e</th>
                  <th className="px-6 py-3 font-medium">tCO2e</th>
                  <th className="px-6 py-3 font-medium">Data Quality</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={15} className="px-6 py-4 text-center text-muted-foreground">Loading emission records...</td></tr>
                ) : overview.records.length === 0 ? (
                  <tr><td colSpan={15} className="px-6 py-4 text-center text-muted-foreground">No emission records found.</td></tr>
                ) : overview.records.map((record) => (
                  <tr key={record.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">{new Date(record.occurredAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">{record.reportingPeriod || formatPeriodRange(record) || "-"}</td>
                    <td className="px-6 py-4">Scope {record.scope}</td>
                    <td className="px-6 py-4">{record.category}</td>
                    <td className="px-6 py-4">{[record.facilityName, record.businessUnit].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="px-6 py-4">{record.supplierName || String(record.activityData?.supplierName || "-")}</td>
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
                    <td className="px-6 py-4">{formatActivity(record)}</td>
                    <td className="px-6 py-4"><FactorDisplay record={record} /></td>
                    <td className="px-6 py-4">{record.factorSource || "Missing factor"} {record.factorSourceYear ? record.factorSourceYear : ""}</td>
                    <td className="px-6 py-4">{formatFormula(record)}</td>
                    <td className="px-6 py-4">{(record.emissionsKgCo2e ?? record.amountTonnes * 1000).toFixed(2)}</td>
                    <td className="px-6 py-4 font-medium text-primary">{(record.emissionsTCo2e ?? record.amountTonnes).toFixed(4)}</td>
                    <td className="px-6 py-4"><DataQualityBadges record={record} /></td>
                    <td className="px-6 py-4">
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRecord(record)}>
                        <Eye className="mr-1 h-3 w-3" />
                        Details
                      </Button>
                    </td>
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
                  <th className="px-6 py-3 font-medium">Supplier/Vendor</th>
                  <th className="px-6 py-3 font-medium">Description</th>
                  <th className="px-6 py-3 text-right font-medium">Logistics Cost</th>
                  <th className="px-6 py-3 text-right font-medium">Carbon Tax</th>
                  <th className="px-6 py-3 text-right font-medium">Offset Cost</th>
                  <th className="px-6 py-3 text-right font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-4 text-center text-muted-foreground">Loading ledger entries...</td></tr>
                ) : overview.data.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-4 text-center text-muted-foreground">No financial ledger entries yet. Add freight, carbon tax, offset, or internal carbon price entries to track exposure.</td></tr>
                ) : overview.data.map((entry: LedgerEntry) => (
                  <tr key={entry.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">{entry.entryDate}</td>
                    <td className="px-6 py-4 text-primary">{entry.shipment?.reference || "-"}</td>
                    <td className="px-6 py-4">{entry.supplierVendor || "-"}</td>
                    <td className="px-6 py-4">{entry.description}</td>
                    <td className="px-6 py-4 text-right">${entry.logisticsCostUsd.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-destructive">${entry.carbonTaxUsd.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">${Number(entry.offsetCostUsd || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold">${entry.totalCostUsd.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {selectedRecord ? (
        <RecordDetailsModal
          record={selectedRecord}
          suppliers={suppliers}
          canEdit={hasPermission(user, "emission:update") || ["OWNER", "ADMIN", "MANAGER", "DATA_ENTRY", "USER"].includes(normalizedRole)}
          canRecalculate={hasPermission(user, "emission:recalculate") || ["OWNER", "ADMIN", "MANAGER"].includes(normalizedRole)}
          canArchive={hasPermission(user, "emission:archive") || ["OWNER", "ADMIN", "MANAGER"].includes(normalizedRole)}
          onClose={() => setSelectedRecord(null)}
          onArchive={() => updateRecordStatus(selectedRecord.id, "archived")}
          onRecalculate={(reason) => recalculateRecord(selectedRecord.id, reason)}
          onSaveEdit={(payload) => saveRecordEdit(selectedRecord.id, payload)}
        />
      ) : null}
      {reportModalOpen ? (
        <ReportGenerationModal
          form={reportForm}
          summary={summary}
          error={reportError}
          generating={generatingReport}
          report={reportSuccess}
          onChange={setReportForm}
          onClose={() => setReportModalOpen(false)}
          onGenerate={generateReport}
          onDownload={downloadReport}
        />
      ) : null}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function ImportStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function buildCalculationPreview(activityForm: EmissionActivityPayload, factor: Awaited<ReturnType<typeof emissionsService.matchFactor>> | undefined) {
  if (!factor) return null;
  const amount = Number(activityForm.activityAmount || 0);
  const factorValue = Number(factor.factorValue ?? factor.value ?? 0);
  const kg = amount * factorValue;
  return {
    amount,
    unit: activityForm.activityUnit,
    factorValue,
    factorUnit: factor.factorUnit || `kgCO2e/${activityForm.activityUnit}`,
    kg,
    tonnes: kg / 1000,
    sourceName: factor.sourceName,
    sourceYear: factor.sourceYear,
    isSample: factor.isSample !== false,
    isOfficial: factor.isSample === false && factor.isOfficial === true && Boolean(factor.sourceName && factor.sourceYear),
    isCustom: factor.isCustom === true,
  };
}

function CalculationPreviewPanel({
  matchedFactor,
  preview,
}: {
  matchedFactor: Awaited<ReturnType<typeof emissionsService.matchFactor>> | undefined;
  preview: ReturnType<typeof buildCalculationPreview>;
}) {
  if (matchedFactor === undefined) {
    return <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground md:col-span-2 xl:col-span-4">Matching emission factor...</div>;
  }
  if (matchedFactor === null || !preview) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive md:col-span-2 xl:col-span-4">Missing factor warning: no matching factor was found for this activity.</div>;
  }
  return (
    <div className={`${preview.isSample ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-800"} rounded-md border px-3 py-2 text-xs md:col-span-2 xl:col-span-4`}>
      <div className="font-medium">Calculation preview</div>
      <div className="flex flex-wrap items-center gap-2">
        <span>{preview.isSample ? "Sample" : preview.isCustom ? "Custom" : preview.isOfficial ? "Official" : "Configured"}</span>
        <span>{preview.sourceName || "Configured emission factor"} {preview.sourceYear || ""}</span>
      </div>
      <div>Matched factor: {preview.factorValue} {preview.factorUnit}</div>
      <div>Formula: {preview.amount} {preview.unit} x {preview.factorValue} {preview.factorUnit} = {preview.kg.toFixed(2)} kgCO2e = {preview.tonnes.toFixed(4)} tCO2e</div>
      <div>{buildLedgerFactorMessage(matchedFactor)}</div>
      {preview.amount <= 0 ? <div>Activity amount must be greater than 0 before this can be a calculated record.</div> : null}
      {preview.isSample ? <div>This activity uses a sample emission factor. Replace with an official/custom factor before official reporting.</div> : null}
    </div>
  );
}

function QualityTile({ label, value, action }: { label: string; value: number; action: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{value}</div>
      <div className="mt-2 text-xs font-medium text-primary">{action}</div>
    </div>
  );
}

function factorBadge(record: EmissionRecord) {
  if (record.calculationStatus === "missing_factor" || record.calculationStatus === "draft_incomplete" || !record.factorValue || !record.factorUnit) return "Missing";
  if (record.factorIsSample) return "Sample";
  if (record.factorIsOfficial) return "Official";
  return "Custom";
}

function FactorDisplay({ record }: { record: EmissionRecord }) {
  const badge = factorBadge(record);
  const classes = badge === "Missing"
    ? "bg-red-50 text-red-700"
    : badge === "Sample"
      ? "bg-amber-50 text-amber-800"
      : "bg-emerald-50 text-emerald-700";
  return (
    <div className="space-y-1">
      <div>{!record.factorValue || !record.factorUnit ? "Missing factor" : `${record.factorValue} ${record.factorUnit}`}</div>
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{badge}</span>
    </div>
  );
}

function formatActivity(record: EmissionRecord) {
  const factorKey = typeof record.metadata?.factorKey === "string" ? record.metadata.factorKey : typeof record.activityData?.fuelType === "string" ? record.activityData.fuelType : "";
  const activityType = typeof record.activityData?.activityType === "string" ? record.activityData.activityType.replaceAll("_", " ") : record.sourceType;
  return `${record.activityAmount ?? "-"} ${record.activityUnit || ""} ${factorKey}`.trim() + `\n${activityType}`;
}

function formatFormula(record: EmissionRecord) {
  if (factorBadge(record) === "Missing") return "Missing factor";
  return record.formula || `${record.activityAmount ?? 0} ${record.activityUnit || ""} x ${record.factorValueUsed ?? record.factorValue} ${record.factorUnitUsed || record.factorUnit || ""}`;
}

function formatPeriodRange(record: EmissionRecord) {
  if (!record.reportingPeriodStart && !record.reportingPeriodEnd) return "";
  const start = record.reportingPeriodStart ? new Date(record.reportingPeriodStart).toLocaleDateString() : "";
  const end = record.reportingPeriodEnd ? new Date(record.reportingPeriodEnd).toLocaleDateString() : "";
  return [start, end].filter(Boolean).join(" - ");
}

function DataQualityBadges({ record }: { record: EmissionRecord }) {
  const badges = [
    factorBadge(record),
    record.calculationStatus === "calculated" ? "Calculated" : record.calculationStatus === "calculation_error" ? "Calculation error" : null,
    !record.supplierId && record.activityData?.supplierName ? "Unverified supplier" : null,
    !record.facilityName && !record.businessUnit ? "Missing facility/BU" : null,
    !record.reportingPeriod && !record.reportingPeriodStart ? "Missing period" : null,
  ].filter(Boolean);
  return (
    <div className="flex min-w-[180px] flex-wrap gap-1">
      {badges.map((badge) => (
        <span key={String(badge)} className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge === "Missing" || badge === "Calculation error" ? "bg-red-50 text-red-700" : badge === "Sample" || badge === "Unverified supplier" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          {badge}
        </span>
      ))}
    </div>
  );
}

function RecordDetailsModal({
  record,
  suppliers,
  canEdit,
  canRecalculate,
  canArchive,
  onClose,
  onArchive,
  onRecalculate,
  onSaveEdit,
}: {
  record: EmissionRecord;
  suppliers: Supplier[];
  canEdit: boolean;
  canRecalculate: boolean;
  canArchive: boolean;
  onClose: () => void;
  onArchive: () => void;
  onRecalculate: (reason?: string) => void;
  onSaveEdit: (payload: Parameters<typeof emissionsService.updateActivity>[1]) => Promise<void>;
}) {
  const lockedForReason = ["submitted", "reviewed", "approved"].includes(record.dataStatus || "");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeline, setTimeline] = useState<Awaited<ReturnType<typeof emissionsService.getAuditTimeline>>>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState("");
  const [recalculateReason, setRecalculateReason] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editFactor, setEditFactor] = useState<Awaited<ReturnType<typeof emissionsService.matchFactor>> | undefined>(undefined);
  const [editForm, setEditForm] = useState({
    scope: record.scope,
    category: record.category,
    activityType: String(record.activityData?.activityType || ""),
    activityAmount: Number(record.activityAmount || 0),
    activityUnit: record.activityUnit || "",
    factorKey: String(record.metadata?.factorKey || record.activityData?.fuelType || ""),
    country: record.factorCountry || "",
    region: record.factorRegion || "GLOBAL",
    facilityName: record.facilityName || "",
    businessUnit: record.businessUnit || "",
    supplierId: record.supplierId || "",
    reportingPeriodStart: record.reportingPeriodStart ? new Date(record.reportingPeriodStart).toISOString().slice(0, 10) : "",
    reportingPeriodEnd: record.reportingPeriodEnd ? new Date(record.reportingPeriodEnd).toISOString().slice(0, 10) : "",
    occurredAt: record.occurredAt ? new Date(record.occurredAt).toISOString().slice(0, 10) : "",
    description: record.description || "",
    notes: record.notes || String(record.activityData?.notes || ""),
    editReason: "",
  });

  useEffect(() => {
    let cancelled = false;
    setTimelineLoading(true);
    emissionsService.getAuditTimeline(record.id)
      .then((items) => {
        if (!cancelled) setTimeline(Array.isArray(items) ? items : []);
      })
      .catch((err) => {
        if (!cancelled) setTimelineError(err instanceof Error ? err.message : "Failed to load audit timeline");
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [record.id]);

  useEffect(() => {
    if (!editMode) return;
    let cancelled = false;
    setEditFactor(undefined);
    const params = new URLSearchParams({
      scope: String(editForm.scope),
      category: editForm.category,
      activityType: editForm.activityType,
      activityUnit: editForm.activityUnit,
      factorKey: editForm.factorKey,
      region: editForm.region || "GLOBAL",
    });
    if (editForm.country) params.set("country", editForm.country);
    if (editForm.occurredAt) params.set("occurredAt", editForm.occurredAt);
    const timer = window.setTimeout(() => {
      emissionsService.matchFactor(`?${params.toString()}`)
        .then((factor) => {
          if (!cancelled) setEditFactor(factor);
        })
        .catch(() => {
          if (!cancelled) setEditFactor(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editMode, editForm.scope, editForm.category, editForm.activityType, editForm.activityUnit, editForm.factorKey, editForm.region, editForm.country, editForm.occurredAt]);

  const editPreview = buildCalculationPreview({
    scope: editForm.scope,
    category: editForm.category,
    activityType: editForm.activityType,
    activityAmount: editForm.activityAmount,
    activityUnit: editForm.activityUnit,
  }, editFactor);

  const validateEdit = () => {
    const errors: Record<string, string> = {};
    if (![1, 2, 3].includes(Number(editForm.scope))) errors.scope = "Scope is required.";
    if (!editForm.category.trim()) errors.category = "Category is required.";
    if (!editForm.activityType.trim()) errors.activityType = "Activity type is required.";
    if (!Number.isFinite(Number(editForm.activityAmount)) || Number(editForm.activityAmount) <= 0) errors.activityAmount = "Activity amount must be greater than 0.";
    if (!editForm.activityUnit.trim()) errors.activityUnit = "Activity unit is required.";
    if (!editForm.factorKey.trim()) errors.factorKey = "Factor key is required.";
    if (!editForm.occurredAt) errors.occurredAt = "Activity date is required.";
    if (lockedForReason && !editForm.editReason.trim()) errors.editReason = "Reason is required for submitted, reviewed, or approved records.";
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveEdit = async () => {
    if (!validateEdit()) return;
    setSaving(true);
    try {
      await onSaveEdit(editForm);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    ["Scope", `Scope ${record.scope}`],
    ["Category", record.category],
    ["Activity type", String(record.activityData?.activityType || record.sourceType || "-")],
    ["Activity", `${record.activityAmount ?? 0} ${record.activityUnit || ""}`],
    ["Factor key", String(record.metadata?.factorKey || record.activityData?.fuelType || "-")],
    ["Factor", record.factorValue ? `${record.factorValue} ${record.factorUnit || ""}` : "Missing factor"],
    ["Factor used", record.factorValueUsed ? `${record.factorValueUsed} ${record.factorUnitUsed || record.factorUnit || ""}` : "-"],
    ["Factor source", `${record.factorSource || "-"} ${record.factorSourceYear || ""}`],
    ["Factor version", record.factorVersion || "-"],
    ["Emission factor id", record.emissionFactorId || String(record.metadata?.emissionFactorId || record.metadata?.factorId || "-")],
    ["Factor status", factorBadge(record)],
    ["Formula", formatFormula(record)],
    ["Calculation status", record.calculationStatus || (factorBadge(record) === "Missing" ? "missing_factor" : "calculated")],
    ["kgCO2e", String((record.emissionsKgCo2e ?? record.amountTonnes * 1000).toFixed(2))],
    ["tCO2e", String((record.emissionsTCo2e ?? record.amountTonnes).toFixed(4))],
    ["Reporting period", record.reportingPeriod || "-"],
    ["Reporting period range", formatPeriodRange(record) || "-"],
    ["Activity date", new Date(record.occurredAt).toLocaleDateString()],
    ["Facility", record.facilityName || "-"],
    ["Business unit", record.businessUnit || "-"],
    ["Supplier", String(record.activityData?.supplierName || record.supplierName || "-")],
    ["Supplier link", record.supplierId ? `Linked supplier ${record.supplierId}${record.supplierRiskLevel ? ` (${record.supplierRiskLevel} risk)` : ""}` : "Unverified or not linked"],
    ["Shipment", record.shipmentId || "-"],
    ["Status", record.dataStatus || "draft"],
    ["Submitted", record.submittedAt ? `${record.submittedBy || "-"} at ${new Date(record.submittedAt).toLocaleString()}` : "-"],
    ["Reviewed", record.reviewedAt ? `${record.reviewedBy || "-"} at ${new Date(record.reviewedAt).toLocaleString()}` : "-"],
    ["Approved", record.approvedAt ? `${record.approvedBy || "-"} at ${new Date(record.approvedAt).toLocaleString()}` : "-"],
    ["Rejected", record.rejectedAt ? `${record.rejectedBy || "-"} at ${new Date(record.rejectedAt).toLocaleString()}` : "-"],
    ["Archived", record.archivedAt ? `${record.archivedBy || "-"} at ${new Date(record.archivedAt).toLocaleString()}` : "-"],
    ["Created by", record.createdBy || "-"],
    ["Created at", record.createdAt ? new Date(record.createdAt).toLocaleString() : "-"],
    ["Updated at", record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "-"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Emission Record Details</h2>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-md border border-border p-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
              <div className="mt-1 whitespace-pre-line text-sm text-foreground">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Factor Governance</h3>
          <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
            <div>Factor active: {record.factorStillActive === false ? "No" : "Yes or not linked to a database factor"}</div>
            <div>Latest factor: {record.latestAvailableFactorValue ? `${record.latestAvailableFactorValue} ${record.latestAvailableFactorUnit || record.factorUnit || ""}` : "-"}</div>
            <div>Latest source: {record.latestAvailableFactorSourceName || "-"}</div>
            <div>Latest version/year: {[record.latestAvailableFactorVersion, record.latestAvailableFactorSourceYear].filter(Boolean).join(" / ") || "-"}</div>
          </div>
          {record.isStaleFactor ? <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{record.staleFactorReason || "This record may use a stale factor."}</div> : null}
          {record.canRecalculateWithLatestFactor && canRecalculate ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Input className="max-w-md" value={recalculateReason} onChange={(event) => setRecalculateReason(event.target.value)} placeholder={lockedForReason ? "Reason required for approved/submitted records" : "Reason for recalculation"} />
              <Button type="button" variant="outline" onClick={() => onRecalculate(recalculateReason)}>Recalculate with latest factor</Button>
            </div>
          ) : null}
        </div>
        <div className="mt-4 rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Audit Timeline</h3>
            <Button type="button" size="sm" variant="outline" onClick={() => { window.location.href = `/audit-logs?entityType=EmissionRecord&entityId=${record.id}`; }}>Open full Audit Logs</Button>
          </div>
          {timelineLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading audit timeline...</p> : null}
          {timelineError ? <p className="mt-2 text-sm text-destructive">{timelineError}</p> : null}
          {!timelineLoading && !timelineError && timeline.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No audit events found for this record yet.</p> : null}
          <div className="mt-3 space-y-2">
            {timeline.map((item) => (
              <div key={item.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{item.action.replaceAll("_", " ")}</span>
                  <span className="text-xs text-muted-foreground">{item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{item.userEmail || item.userId || "System"} | {item.source}</div>
                {item.notes ? <div className="mt-1 text-xs text-foreground">Notes: {item.notes}</div> : null}
                {item.newValueSummary ? <pre className="mt-2 max-h-24 overflow-auto rounded bg-muted/30 p-2 text-xs">{JSON.stringify(item.newValueSummary, null, 2)}</pre> : null}
              </div>
            ))}
          </div>
        </div>
        {editMode ? (
          <div className="mt-4 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">Edit Emission Record</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={editForm.scope} onChange={(event) => setEditForm((current) => ({ ...current, scope: Number(event.target.value) as 1 | 2 | 3 }))}>
                <option value={1}>Scope 1</option><option value={2}>Scope 2</option><option value={3}>Scope 3</option>
              </select>
              <Input value={editForm.category} onChange={(event) => setEditForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" />
              <FieldError message={editErrors.category || editErrors.scope} />
              <Input value={editForm.activityType} onChange={(event) => setEditForm((current) => ({ ...current, activityType: event.target.value }))} placeholder="Activity type" />
              <Input type="number" value={editForm.activityAmount} onChange={(event) => setEditForm((current) => ({ ...current, activityAmount: Number(event.target.value) }))} placeholder="Activity amount" />
              <FieldError message={editErrors.activityAmount} />
              <Input value={editForm.activityUnit} onChange={(event) => setEditForm((current) => ({ ...current, activityUnit: event.target.value }))} placeholder="Activity unit" />
              <Input value={editForm.factorKey} onChange={(event) => setEditForm((current) => ({ ...current, factorKey: event.target.value }))} placeholder="Factor key" />
              <FieldError message={editErrors.factorKey} />
              <Input value={editForm.country} onChange={(event) => setEditForm((current) => ({ ...current, country: event.target.value }))} placeholder="Country" />
              <Input value={editForm.region} onChange={(event) => setEditForm((current) => ({ ...current, region: event.target.value }))} placeholder="Region" />
              <Input value={editForm.facilityName} onChange={(event) => setEditForm((current) => ({ ...current, facilityName: event.target.value }))} placeholder="Facility" />
              <Input value={editForm.businessUnit} onChange={(event) => setEditForm((current) => ({ ...current, businessUnit: event.target.value }))} placeholder="Business unit" />
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={editForm.supplierId} onChange={(event) => setEditForm((current) => ({ ...current, supplierId: event.target.value }))}>
                <option value="">No linked supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} - {supplier.category} - {supplier.country} - {supplier.riskLevel}</option>)}
              </select>
              <Input type="date" value={editForm.occurredAt} onChange={(event) => setEditForm((current) => ({ ...current, occurredAt: event.target.value }))} />
              <FieldError message={editErrors.occurredAt} />
              <Input type="date" value={editForm.reportingPeriodStart} onChange={(event) => setEditForm((current) => ({ ...current, reportingPeriodStart: event.target.value }))} />
              <Input type="date" value={editForm.reportingPeriodEnd} onChange={(event) => setEditForm((current) => ({ ...current, reportingPeriodEnd: event.target.value }))} />
              <Input value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" />
              <Input value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" />
              <Input className="md:col-span-2" value={editForm.editReason} onChange={(event) => setEditForm((current) => ({ ...current, editReason: event.target.value }))} placeholder={lockedForReason ? "Edit reason required" : "Edit reason"} />
              <FieldError message={editErrors.editReason} />
              <CalculationPreviewPanel matchedFactor={editFactor} preview={editPreview} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
              <Button type="button" disabled={saving} onClick={saveEdit}>{saving ? "Saving..." : "Save Changes"}</Button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          {canEdit ? <Button type="button" variant="outline" onClick={() => setEditMode(true)}>Edit</Button> : null}
          {canRecalculate ? <Button type="button" variant="outline" onClick={() => onRecalculate(recalculateReason)}>Recalculate</Button> : null}
          {canArchive ? <Button type="button" variant="outline" onClick={onArchive}>Archive</Button> : null}
          <Button type="button" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function ReportGenerationModal({
  form,
  summary,
  error,
  generating,
  report,
  onChange,
  onClose,
  onGenerate,
  onDownload,
}: {
  form: { periodStart: string; periodEnd: string; recordSelection: string; includeDrafts: boolean; format: "PDF" | "CSV" };
  summary: LedgerOverview["summary"];
  error: string;
  generating: boolean;
  report: ReportItem | null;
  onChange: (form: { periodStart: string; periodEnd: string; recordSelection: string; includeDrafts: boolean; format: "PDF" | "CSV" }) => void;
  onClose: () => void;
  onGenerate: () => void;
  onDownload: (report: ReportItem) => void;
}) {
  const includesUnapproved = form.recordSelection === "all_records";
  const hasSampleFactors = Number(summary.sampleFactorRecords || 0) > 0;
  const hasMissingFactors = Number(summary.missingFactorRecords || 0) > 0;
  const hasUnapproved = Number(summary.totalRecords || 0) - Number(summary.approvedRecords || 0) > 0;
  const hasZeroAmount = Number(summary.zeroAmountRecords || 0) > 0;
  const hasCalculationErrors = Number(summary.calculationErrorRecords || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Generate Carbon Ledger Report</h2>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reportStart">Period start</Label>
            <Input id="reportStart" type="date" value={form.periodStart} onChange={(event) => onChange({ ...form, periodStart: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reportEnd">Period end</Label>
            <Input id="reportEnd" type="date" value={form.periodEnd} onChange={(event) => onChange({ ...form, periodEnd: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recordSelection">Record selection</Label>
            <select id="recordSelection" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.recordSelection} onChange={(event) => onChange({ ...form, recordSelection: event.target.value, includeDrafts: event.target.value === "all_records" ? form.includeDrafts : false })}>
              <option value="approved_only">Approved records only</option>
              <option value="all_records">All records with warnings</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reportFormat">Output</Label>
            <select id="reportFormat" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.format} onChange={(event) => onChange({ ...form, format: event.target.value as "PDF" | "CSV" })}>
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <input type="checkbox" checked={form.includeDrafts} disabled={!includesUnapproved} onChange={(event) => onChange({ ...form, includeDrafts: event.target.checked })} />
            Include draft records when all records are selected
          </label>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {includesUnapproved && hasUnapproved ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">Warning: unapproved records will be included and clearly flagged.</div> : null}
          {hasSampleFactors ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">Warning: sample factors are present. They are not official factors.</div> : null}
          {hasMissingFactors ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">Warning: missing factor records are present.</div> : null}
          {hasZeroAmount ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">Warning: zero-amount records are present.</div> : null}
          {hasCalculationErrors ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">Warning: calculation error records are present.</div> : null}
          {!includesUnapproved ? <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800">Enterprise-safe default: approved records only.</div> : null}
        </div>
        {error ? <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
        {report ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span>{report.name} is ready.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => onDownload(report)}>Download {report.format}</Button>
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Done</Button>
          <Button type="button" onClick={onGenerate} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Generate Report
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: typeof DollarSign }) {
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
