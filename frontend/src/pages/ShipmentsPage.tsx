import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Eye, FileSpreadsheet, Loader2, Pencil, RefreshCcw, RotateCcw, Search, Truck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/shared/Modal";
import { PermissionDenied } from "@/src/components/shared/PermissionDenied";
import { shipmentService, type ShipmentPayload } from "@/src/services/shipmentService";
import { supplierService } from "@/src/services/supplierService";
import { socketService } from "@/src/services/socketService";
import { useToast } from "@/src/components/providers/ToastProvider";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission } from "@/src/utils/permissions";
import { BATCH_OFFSET_SELECTION_STORAGE_KEY } from "@/src/constants/batchOffset";
import type { Shipment, Supplier, TransportMode } from "@/src/types/platform";
import { hasShipmentErrors, validateShipmentPayload, type ShipmentFieldErrors } from "@/src/utils/shipmentValidation";

const STATUSES: Shipment["status"][] = ["DRAFT", "SUBMITTED", "PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED", "CANCELLED", "ARCHIVED"];
const MODES: TransportMode[] = ["AIR", "ROAD", "OCEAN", "RAIL"];

const initialForm: ShipmentPayload = {
  linkedSupplierId: "",
  reference: "",
  shipmentReference: "",
  bolNumber: "",
  containerId: "",
  origin: "",
  originCountry: "",
  originRegion: "",
  destination: "",
  destinationCountry: "",
  destinationRegion: "",
  distanceKm: 0,
  distanceUnit: "km",
  transportMode: "ROAD",
  carrier: "",
  carrierId: "",
  vehicleType: "",
  fuelType: "",
  weightKg: 0,
  weightUnit: "kg",
  costUsd: 0,
  cost: 0,
  currency: "USD",
  status: "DRAFT",
  shipmentDate: new Date().toISOString().slice(0, 10),
  reportingPeriod: new Date().toISOString().slice(0, 7),
  notes: "",
};

function statusLabel(status?: string | null) {
  return String(status || "UNKNOWN").replace(/_/g, " ");
}

function badgeClasses(tone: "neutral" | "success" | "warning" | "danger" | "info") {
  if (tone === "success") return "bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "bg-amber-50 text-amber-800";
  if (tone === "danger") return "bg-red-50 text-red-700";
  if (tone === "info") return "bg-sky-50 text-sky-700";
  return "bg-muted text-muted-foreground";
}

function factorTone(type?: Shipment["emissionFactorType"]) {
  if (type === "official" || type === "custom") return "success";
  if (type === "sample") return "warning";
  if (type === "missing") return "danger";
  return "neutral";
}

export function ShipmentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canView = hasPermission(user, "shipment:view");
  const canCreate = hasPermission(user, "shipment:create");
  const canUpdate = hasPermission(user, "shipment:update");
  const canArchive = hasPermission(user, "shipment:archive");
  const canRecalculate = hasPermission(user, "shipment:recalculate") || canUpdate;
  const canImport = hasPermission(user, "shipment:import") || hasPermission(user, "import:create");

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingShipment, setViewingShipment] = useState<Shipment | null>(null);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [showOffsetSummaryModal, setShowOffsetSummaryModal] = useState(false);
  const [form, setForm] = useState<ShipmentPayload>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<ShipmentFieldErrors>({});

  const selectedShipments = useMemo(() => {
    const selected = new Set(selectedShipmentIds);
    return shipments.filter((shipment) => selected.has(shipment.id));
  }, [selectedShipmentIds, shipments]);

  const totalSelectedEmissionsTonnes = useMemo(
    () => selectedShipments.reduce((sum, shipment) => sum + Number(shipment.tCO2e ?? shipment.emissionsTonnes ?? 0), 0),
    [selectedShipments],
  );

  const isAllVisibleSelected = shipments.length > 0 && selectedShipments.length === shipments.length;

  const loadPage = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      setError("");
      const params = new URLSearchParams({ pageSize: "50" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (modeFilter) params.set("mode", modeFilter);
      if (supplierFilter) params.set("supplierId", supplierFilter);
      const [shipmentResponse, supplierResponse] = await Promise.all([
        shipmentService.getShipments(`?${params.toString()}`),
        supplierService.getSuppliers("?pageSize=100"),
      ]);
      setShipments(shipmentResponse.data || []);
      setSuppliers(supplierResponse.data || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load shipments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPage();
    const unsubscribers = [
      socketService.on("shipmentCreated", () => { void loadPage(); }),
      socketService.on("shipmentUpdated", () => { void loadPage(); }),
      socketService.on("shipmentDeleted", () => { void loadPage(); }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [canView, search, statusFilter, modeFilter, supplierFilter]);

  useEffect(() => {
    if (!canCreate || searchParams.get("compose") !== "1") {
      return;
    }

    resetForm();
    window.requestAnimationFrame(() => {
      const formCard = document.getElementById("shipment-compose-form");
      if (formCard && typeof formCard.scrollIntoView === "function") {
        formCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const firstInput = formCard?.querySelector("input, select, textarea") as HTMLElement | null;
      firstInput?.focus();
    });
  }, [canCreate, searchParams]);

  const updateForm = <K extends keyof ShipmentPayload>(key: K, value: ShipmentPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setFieldErrors({});
    setForm({
      ...initialForm,
      reference: "",
      shipmentReference: "",
      shipmentDate: new Date().toISOString().slice(0, 10),
      reportingPeriod: new Date().toISOString().slice(0, 7),
    });
  };

  const submitShipment = async () => {
    const payload: ShipmentPayload = {
      ...form,
      reference: (form.shipmentReference || form.reference || "").trim(),
      shipmentReference: (form.shipmentReference || form.reference || "").trim(),
      linkedSupplierId: form.linkedSupplierId || "",
      costUsd: Number(form.costUsd || form.cost || 0),
      cost: Number(form.cost || form.costUsd || 0),
      currency: String(form.currency || "USD").toUpperCase(),
    };
    const errors = validateShipmentPayload(payload);
    setFieldErrors(errors);
    if (hasShipmentErrors(errors)) {
      setError("Please fix the highlighted shipment fields before saving.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await shipmentService.updateShipment(editingId, payload);
        showToast({ tone: "success", title: "Shipment updated", description: `${payload.reference} was updated.` });
      } else {
        await shipmentService.createShipment(payload);
        showToast({ tone: "success", title: "Shipment saved", description: `${payload.reference} was added.` });
      }
      resetForm();
      await loadPage();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save shipment.");
    } finally {
      setSaving(false);
    }
  };

  const editShipment = (shipment: Shipment) => {
    setEditingId(shipment.id);
    setFieldErrors({});
    setForm({
      linkedSupplierId: shipment.linkedSupplierId || shipment.supplierId || "",
      reference: shipment.reference,
      shipmentReference: shipment.shipmentReference || shipment.reference,
      bolNumber: shipment.bolNumber || shipment.billOfLading || "",
      containerId: shipment.containerId || "",
      origin: shipment.origin,
      originCountry: shipment.originCountry || "",
      originRegion: shipment.originRegion || "",
      destination: shipment.destination,
      destinationCountry: shipment.destinationCountry || "",
      destinationRegion: shipment.destinationRegion || "",
      distanceKm: shipment.distanceKm,
      distanceUnit: shipment.distanceUnit || "km",
      transportMode: shipment.transportMode,
      carrier: shipment.carrier,
      carrierId: shipment.carrierId || "",
      vehicleType: shipment.vehicleType || "",
      fuelType: shipment.fuelType || "",
      weightKg: shipment.weightKg,
      weightUnit: shipment.weightUnit || "kg",
      costUsd: shipment.costUsd,
      cost: shipment.cost ?? shipment.costUsd,
      currency: shipment.currency || "USD",
      status: shipment.status,
      shipmentDate: shipment.shipmentDate?.slice(0, 10),
      reportingPeriod: shipment.reportingPeriod || shipment.shipmentDate?.slice(0, 7),
      notes: shipment.notes || "",
    });
  };

  const recalculateShipment = async (shipment: Shipment) => {
    try {
      await shipmentService.recalculateShipment(shipment.id);
      showToast({ tone: "success", title: "Shipment recalculated", description: `${shipment.reference} now uses the latest matching factor.` });
      await loadPage();
    } catch (recalculateError) {
      setError(recalculateError instanceof Error ? recalculateError.message : "Failed to recalculate shipment.");
    }
  };

  const archiveShipment = async (shipment: Shipment) => {
    try {
      await shipmentService.archiveShipment(shipment.id);
      showToast({ tone: "info", title: "Shipment archived", description: `${shipment.reference} was archived.` });
      if (editingId === shipment.id) resetForm();
      await loadPage();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Failed to archive shipment.");
    }
  };

  const continueToBatchOffset = () => {
    const payload = {
      shipmentIds: selectedShipments.map((shipment) => shipment.id),
      totalEmissionsTonnes: Number(totalSelectedEmissionsTonnes.toFixed(4)),
      createdAt: new Date().toISOString(),
    };
    sessionStorage.setItem(BATCH_OFFSET_SELECTION_STORAGE_KEY, JSON.stringify(payload));
    setShowOffsetSummaryModal(false);
    navigate("/app/marketplace?batchOffset=true");
  };

  const inputClass = (field: keyof ShipmentPayload) => (
    `w-full rounded-md border bg-background px-3 py-2 text-sm ${fieldErrors[field] ? "border-destructive focus:border-destructive focus:ring-destructive" : "border-input focus:border-primary focus:ring-primary"} focus:outline-none focus:ring-1`
  );

  if (!canView) {
    return <PermissionDenied message="You do not have permission to view shipments." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Scope 3 Shipment Workflow</h1>
          <p className="text-muted-foreground">Capture logistics activity, store the factor snapshot, and push shipment emissions into downstream CarbonFlow workflows.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport ? (
            <Button variant="outline" onClick={() => navigate("/app/imports?type=shipment")}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Import Shipments
            </Button>
          ) : null}
          {editingId ? <Button variant="outline" onClick={resetForm}>Cancel Edit</Button> : null}
          {canCreate ? (
            <Button onClick={submitShipment} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
              {editingId ? "Update Shipment" : "Add Shipment"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <Card id="shipment-compose-form">
        <CardHeader>
          <CardTitle>{editingId ? "Edit Shipment" : "Add Shipment"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Shipment Reference</span>
              <input className={inputClass("reference")} value={form.shipmentReference || ""} onChange={(event) => updateForm("shipmentReference", event.target.value)} placeholder="e.g. SHP-2026-001" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>BOL Number</span>
              <input className={inputClass("bolNumber")} value={form.bolNumber || ""} onChange={(event) => updateForm("bolNumber", event.target.value)} placeholder="Optional" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Container ID</span>
              <input className={inputClass("containerId")} value={form.containerId || ""} onChange={(event) => updateForm("containerId", event.target.value)} placeholder="Optional" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Status</span>
              <select className={inputClass("status")} value={form.status || "DRAFT"} onChange={(event) => updateForm("status", event.target.value as Shipment["status"])}>
                {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Origin</span>
              <input className={inputClass("origin")} value={form.origin} onChange={(event) => updateForm("origin", event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Origin Country</span>
              <input className={inputClass("originCountry")} value={form.originCountry || ""} onChange={(event) => updateForm("originCountry", event.target.value)} placeholder="e.g. PK" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Destination</span>
              <input className={inputClass("destination")} value={form.destination} onChange={(event) => updateForm("destination", event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Destination Country</span>
              <input className={inputClass("destinationCountry")} value={form.destinationCountry || ""} onChange={(event) => updateForm("destinationCountry", event.target.value)} placeholder="e.g. NL" />
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Mode</span>
              <select className={inputClass("transportMode")} value={form.transportMode} onChange={(event) => updateForm("transportMode", event.target.value as TransportMode)}>
                {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Carrier</span>
              <input className={inputClass("carrier")} value={form.carrier} onChange={(event) => updateForm("carrier", event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Distance Km</span>
              <input className={inputClass("distanceKm")} type="number" min={0} value={form.distanceKm || ""} onChange={(event) => updateForm("distanceKm", Number(event.target.value))} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Weight Kg</span>
              <input className={inputClass("weightKg")} type="number" min={0} value={form.weightKg || ""} onChange={(event) => updateForm("weightKg", Number(event.target.value))} />
            </label>

            <label className="space-y-1.5 text-sm font-medium">
              <span>Cost</span>
              <input className={inputClass("costUsd")} type="number" min={0} value={form.costUsd || ""} onChange={(event) => { const value = Number(event.target.value); updateForm("costUsd", value); updateForm("cost", value); }} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Currency</span>
              <input className={inputClass("currency")} value={form.currency || "USD"} onChange={(event) => updateForm("currency", event.target.value.toUpperCase())} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Shipment Date</span>
              <input className={inputClass("shipmentDate")} type="date" value={form.shipmentDate || ""} onChange={(event) => updateForm("shipmentDate", event.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Reporting Period</span>
              <input className={inputClass("reportingPeriod")} value={form.reportingPeriod || ""} onChange={(event) => updateForm("reportingPeriod", event.target.value)} placeholder="YYYY-MM" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Linked Supplier</span>
              <select className={inputClass("linkedSupplierId")} value={form.linkedSupplierId || ""} onChange={(event) => updateForm("linkedSupplierId", event.target.value)}>
                <option value="">No linked supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
              {suppliers.length === 0 ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  No suppliers available. You can save shipment without supplier or <Link to="/app/suppliers" className="text-primary underline">create a supplier first</Link>.
                </span>
              ) : null}
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Notes</span>
              <textarea className={`${inputClass("notes")} min-h-24`} value={form.notes || ""} onChange={(event) => updateForm("notes", event.target.value)} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b pb-4">
          <CardTitle>Recent Shipments</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className="h-9 rounded-md border border-input bg-background pl-8 pr-3 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, BOL, container..." />
            </div>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}>
              <option value="">All modes</option>
              {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={() => void loadPage()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3"><input type="checkbox" checked={isAllVisibleSelected} onChange={() => setSelectedShipmentIds(isAllVisibleSelected ? [] : shipments.map((shipment) => shipment.id))} /></th>
                  <th className="px-4 py-3">Shipment Reference</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Carrier</th>
                  <th className="px-4 py-3">Linked Supplier</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3">Emissions</th>
                  <th className="px-4 py-3">Factor Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={12} className="px-6 py-8 text-center text-muted-foreground">Loading shipments...</td></tr>
                ) : shipments.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-10 text-center">
                      <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                      <p className="font-medium text-foreground">No shipments found. Add a shipment or import shipments from CSV.</p>
                    </td>
                  </tr>
                ) : shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-muted/30">
                    <td className="px-4 py-4"><input type="checkbox" checked={selectedShipmentIds.includes(shipment.id)} onChange={() => setSelectedShipmentIds((current) => current.includes(shipment.id) ? current.filter((id) => id !== shipment.id) : [...current, shipment.id])} /></td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">{shipment.shipmentReference || shipment.reference}</div>
                      <div className="text-xs text-muted-foreground">{shipment.bolNumber || shipment.containerId || "-"}</div>
                    </td>
                    <td className="px-4 py-4">{shipment.origin} to {shipment.destination}</td>
                    <td className="px-4 py-4">{shipment.transportMode}</td>
                    <td className="px-4 py-4">{shipment.carrier}</td>
                    <td className="px-4 py-4">{shipment.linkedSupplierSnapshot?.name || shipment.supplier?.name || "Not linked"}</td>
                    <td className="px-4 py-4">{Number(shipment.costUsd || 0).toLocaleString()} {shipment.currency || "USD"}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">{Number(shipment.kgCO2e ?? shipment.emissionsKgCo2e ?? 0).toFixed(2)} kgCO2e</div>
                      <div className="text-xs text-muted-foreground">{Number(shipment.tCO2e ?? shipment.emissionsTonnes ?? 0).toFixed(4)} tCO2e</div>
                      <div className="text-xs text-muted-foreground">{shipment.calculationStatus || "unknown"}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClasses(factorTone(shipment.emissionFactorType))}`}>
                        {shipment.emissionFactorType || "missing"}
                      </span>
                    </td>
                    <td className="px-4 py-4">{statusLabel(shipment.status)}</td>
                    <td className="px-4 py-4">{shipment.shipmentDate ? new Date(shipment.shipmentDate).toLocaleDateString() : "-"}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setViewingShipment(shipment)}><Eye className="h-4 w-4" /></Button>
                        {canUpdate ? <Button variant="ghost" size="sm" onClick={() => editShipment(shipment)}><Pencil className="h-4 w-4" /></Button> : null}
                        {canRecalculate ? <Button variant="ghost" size="sm" onClick={() => void recalculateShipment(shipment)}><RotateCcw className="h-4 w-4" /></Button> : null}
                        {canArchive && shipment.status !== "ARCHIVED" ? <Button variant="ghost" size="sm" onClick={() => void archiveShipment(shipment)}>Archive</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedShipmentIds.length > 0 ? (
        <div className="fixed bottom-6 right-6 z-40 w-full max-w-sm rounded-xl border border-primary/20 bg-background/95 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedShipmentIds.length} shipment(s) selected</p>
              <p className="text-xs text-muted-foreground">Total emissions: {totalSelectedEmissionsTonnes.toFixed(2)} tCO2e</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedShipmentIds([])}>Clear</Button>
          </div>
          <Button className="mt-3 w-full" onClick={() => setShowOffsetSummaryModal(true)}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Offset Selected
          </Button>
        </div>
      ) : null}

      <Modal open={showOffsetSummaryModal} onClose={() => setShowOffsetSummaryModal(false)} title="Batch Offset Summary" description="Review selected shipments before opening marketplace checkout.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2"><div className="text-xs text-muted-foreground">Selected Shipments</div><div className="text-lg font-semibold text-foreground">{selectedShipments.length}</div></div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2"><div className="text-xs text-muted-foreground">Total tCO2e</div><div className="text-lg font-semibold text-foreground">{totalSelectedEmissionsTonnes.toFixed(2)}</div></div>
          </div>
          <Button className="w-full" onClick={continueToBatchOffset}>Continue to Marketplace</Button>
        </div>
      </Modal>

      <Modal open={Boolean(viewingShipment)} onClose={() => setViewingShipment(null)} title={viewingShipment ? `Shipment ${viewingShipment.shipmentReference || viewingShipment.reference}` : "Shipment details"} description="Stored factor snapshot, calculation details, and linked workflow paths.">
        {viewingShipment ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Route</div><div className="font-medium">{viewingShipment.origin} to {viewingShipment.destination}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Supplier</div><div className="font-medium">{viewingShipment.linkedSupplierSnapshot?.name || viewingShipment.supplier?.name || "Not linked"}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Distance x Weight</div><div className="font-medium">{viewingShipment.distanceKm} km x {viewingShipment.weightKg} kg</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Status</div><div className="font-medium">{statusLabel(viewingShipment.status)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Emission Factor Used</div><div className="font-medium">{Number(viewingShipment.emissionFactorValue ?? viewingShipment.emissionFactor ?? 0).toFixed(4)} {viewingShipment.emissionFactorUnit || "kgCO2e/ton-km"}</div><div className="text-xs text-muted-foreground">{viewingShipment.emissionFactorSourceName || viewingShipment.factorSource || "Missing source"} {viewingShipment.emissionFactorSourceYear ? `(${viewingShipment.emissionFactorSourceYear})` : ""}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Calculation</div><div className="font-medium">{Number(viewingShipment.kgCO2e ?? viewingShipment.emissionsKgCo2e ?? 0).toFixed(2)} kgCO2e / {Number(viewingShipment.tCO2e ?? viewingShipment.emissionsTonnes ?? 0).toFixed(4)} tCO2e</div><div className="text-xs text-muted-foreground">{viewingShipment.calculationStatus || "unknown"}</div></div>
            </div>
            {viewingShipment.calculationFormula ? <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{viewingShipment.calculationFormula}</div> : null}
            {viewingShipment.dataQualityWarnings?.length ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">{viewingShipment.dataQualityWarnings.join(" ")}</div> : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate(`/app/ledger?shipmentId=${encodeURIComponent(viewingShipment.id)}`)}>Open Ledger</Button>
              <Button variant="outline" onClick={() => navigate(`/app/reports?search=${encodeURIComponent(viewingShipment.shipmentReference || viewingShipment.reference)}`)}>Open Reports</Button>
              <Button variant="outline" onClick={() => navigate(`/app/optimization?search=${encodeURIComponent(viewingShipment.shipmentReference || viewingShipment.reference)}`)}>Open Optimization</Button>
              <Button variant="outline" onClick={() => navigate(`/app/marketplace?shipmentId=${encodeURIComponent(viewingShipment.id)}`)}>Open Marketplace</Button>
              <Button variant="outline" onClick={() => navigate(`/app/audit-logs?entityType=Shipment&entityId=${encodeURIComponent(viewingShipment.id)}`)}>Open Audit Logs</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
