import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Download, Eye, Loader2, Pencil, RefreshCcw, RotateCcw, Search, Trash2, Truck, Upload } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { UploadDataModal } from "@/src/components/shared/UploadDataModal";
import { Modal } from "@/src/components/shared/Modal";
import { shipmentService, type ShipmentPayload } from "@/src/services/shipmentService";
import { supplierService } from "@/src/services/supplierService";
import { socketService } from "@/src/services/socketService";
import { useToast } from "@/src/components/providers/ToastProvider";
import { BATCH_OFFSET_SELECTION_STORAGE_KEY } from "@/src/constants/batchOffset";
import type { Shipment, Supplier } from "@/src/types/platform";
import { hasShipmentErrors, validateShipmentPayload, type ShipmentFieldErrors } from "@/src/utils/shipmentValidation";

const initialForm: ShipmentPayload = {
  supplierId: "",
  reference: "",
  origin: "",
  destination: "",
  distanceKm: 0,
  distanceUnit: "km",
  transportMode: "OCEAN",
  carrier: "",
  vehicleType: "",
  fuelType: "",
  weightKg: 0,
  weightUnit: "kg",
  costUsd: 0,
  currency: "USD",
  status: "IN_TRANSIT",
  shipmentDate: new Date().toISOString().slice(0, 10),
};

export function ShipmentsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOffsetSummaryModal, setShowOffsetSummaryModal] = useState(false);
  const [viewingShipment, setViewingShipment] = useState<Shipment | null>(null);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [form, setForm] = useState<ShipmentPayload>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<ShipmentFieldErrors>({});

  const selectedShipments = useMemo(() => {
    const selectedSet = new Set(selectedShipmentIds);
    return shipments.filter((shipment) => selectedSet.has(shipment.id));
  }, [shipments, selectedShipmentIds]);

  const totalSelectedEmissionsTonnes = useMemo(
    () => selectedShipments.reduce((sum, shipment) => sum + Number(shipment.emissionsTonnes || 0), 0),
    [selectedShipments],
  );

  const isAllVisibleSelected = shipments.length > 0 && selectedShipments.length === shipments.length;

  const loadPage = async (query = search) => {
    try {
      setError("");
      const [shipmentResponse, supplierResponse] = await Promise.all([
        shipmentService.getShipments(`?search=${encodeURIComponent(query)}&pageSize=20`),
        supplierService.getSuppliers("?pageSize=50"),
      ]);
      setShipments(shipmentResponse.data);
      setSuppliers(supplierResponse.data);
      if (!form.supplierId && supplierResponse.data[0]) {
        setForm((prev) => ({ ...prev, supplierId: supplierResponse.data[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shipments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialSearch = searchParams.get("search") || "";
    setSearch(initialSearch);
    void loadPage(initialSearch);
    const unsubscribers = [
      socketService.on("shipmentCreated", () => loadPage(search)),
      socketService.on("shipmentUpdated", () => loadPage(search)),
      socketService.on("shipmentDeleted", () => loadPage(search)),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [searchParams]);

  useEffect(() => {
    if (shipments.length === 0) {
      setSelectedShipmentIds([]);
      return;
    }

    const visibleIds = new Set(shipments.map((shipment) => shipment.id));
    setSelectedShipmentIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [shipments]);

  const resetForm = () => {
    setEditingId(null);
      setForm((prev) => ({
        ...initialForm,
        supplierId: suppliers[0]?.id || prev.supplierId || "",
      reference: `SHP-${Math.floor(Math.random() * 9000) + 1000}`,
      shipmentDate: new Date().toISOString().slice(0, 10),
    }));
  };

  const submitShipment = async () => {
    const errors = validateShipmentPayload(form);
    setFieldErrors(errors);

    if (hasShipmentErrors(errors)) {
      setError("Please fix the highlighted shipment fields before saving.");
      return;
    }

    setSaving(true);
    try {
      const payload: ShipmentPayload = {
        ...form,
        distanceUnit: "km",
        weightKg: form.weightUnit === "tonnes" ? Number(form.weightKg || 0) * 1000 : Number(form.weightKg || 0),
        weightUnit: "kg",
        currency: "USD",
      };

      if (editingId) {
        await shipmentService.updateShipment(editingId, payload);
        showToast({
          tone: "success",
          title: "Shipment updated",
          description: `${form.reference} has been updated.`,
        });
      } else {
        await shipmentService.createShipment(payload);
        showToast({
          tone: "success",
          title: "Shipment added",
          description: `${form.reference} has been saved successfully.`,
        });
      }
      setFieldErrors({});
      resetForm();
      await loadPage(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shipment");
    } finally {
      setSaving(false);
    }
  };

  const editShipment = (shipment: Shipment) => {
    setEditingId(shipment.id);
    setForm({
      supplierId: shipment.supplierId,
      reference: shipment.reference,
      origin: shipment.origin,
      destination: shipment.destination,
      distanceKm: shipment.distanceKm,
      transportMode: shipment.transportMode,
      carrier: shipment.carrier,
      vehicleType: shipment.vehicleType || "",
      fuelType: shipment.fuelType || "",
      weightKg: shipment.weightKg,
      costUsd: shipment.costUsd,
      status: shipment.status,
      shipmentDate: shipment.shipmentDate.slice(0, 10),
      notes: shipment.notes || "",
      distanceUnit: shipment.distanceUnit || "km",
      weightUnit: shipment.weightUnit || "kg",
      currency: shipment.currency || "USD",
    });
    setFieldErrors({});
  };

  const updateForm = <K extends keyof ShipmentPayload>(key: K, value: ShipmentPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const recalculateShipment = async (shipment: Shipment) => {
    try {
      await shipmentService.updateShipment(shipment.id, {
        supplierId: shipment.supplierId,
        reference: shipment.reference,
        origin: shipment.origin,
        destination: shipment.destination,
        distanceKm: shipment.distanceKm,
        distanceUnit: shipment.distanceUnit || "km",
        transportMode: shipment.transportMode,
        carrier: shipment.carrier,
        vehicleType: shipment.vehicleType || "",
        fuelType: shipment.fuelType || "",
        weightKg: shipment.weightKg,
        weightUnit: shipment.weightUnit || "kg",
        costUsd: shipment.costUsd,
        currency: shipment.currency || "USD",
        status: shipment.status,
        shipmentDate: shipment.shipmentDate?.slice(0, 10),
        notes: shipment.notes || "",
      });
      showToast({
        tone: "success",
        title: "Shipment recalculated",
        description: `${shipment.reference} emissions were recalculated.`,
      });
      await loadPage(search);
    } catch (recalculateError) {
      setError(recalculateError instanceof Error ? recalculateError.message : "Failed to recalculate shipment");
    }
  };

  const downloadCsvTemplate = () => {
    const headers = "shipmentReference,carrier,shipmentDate,origin,destination,distance,distanceUnit,weight,weightUnit,transportMode,fuelType,cost,currency";
    const sample = "SHP-1001,Maersk,2026-05-20,Karachi,Rotterdam,6200,km,14500,kg,OCEAN,Marine Fuel,12000,USD";
    const blob = new Blob([`${headers}\n${sample}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "carbonflow-shipment-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteShipment = async (shipment: Shipment) => {
    try {
      await shipmentService.deleteShipment(shipment.id);
      showToast({
        tone: "info",
        title: "Shipment removed",
        description: `${shipment.reference} has been deleted.`,
      });
      if (editingId === shipment.id) {
        resetForm();
      }
      await loadPage(search);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete shipment");
    }
  };

  const toggleShipmentSelection = (shipmentId: string) => {
    setSelectedShipmentIds((current) => (
      current.includes(shipmentId)
        ? current.filter((id) => id !== shipmentId)
        : [...current, shipmentId]
    ));
  };

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedShipmentIds([]);
      return;
    }

    setSelectedShipmentIds(shipments.map((shipment) => shipment.id));
  };

  const clearSelection = () => {
    setSelectedShipmentIds([]);
  };

  const continueToBatchOffset = () => {
    if (!selectedShipments.length) {
      setShowOffsetSummaryModal(false);
      return;
    }

    const payload = {
      shipmentIds: selectedShipments.map((shipment) => shipment.id),
      totalEmissionsTonnes: Number(totalSelectedEmissionsTonnes.toFixed(4)),
      createdAt: new Date().toISOString(),
    };

    sessionStorage.setItem(BATCH_OFFSET_SELECTION_STORAGE_KEY, JSON.stringify(payload));
    setShowOffsetSummaryModal(false);
    navigate("/app/marketplace?batchOffset=true");
    showToast({
      tone: "success",
      title: "Batch offset ready",
      description: `${selectedShipments.length} shipment(s) were queued for offset checkout.`,
    });
  };

  const inputClass = (field: keyof ShipmentPayload) => (
    `w-full rounded-md border bg-background px-3 py-2 text-sm ${fieldErrors[field] ? "border-destructive focus:border-destructive focus:ring-destructive" : "border-input focus:border-primary focus:ring-primary"} focus:outline-none focus:ring-1`
  );

  const FieldError = ({ field }: { field: keyof ShipmentPayload }) => (
    fieldErrors[field] ? <p className="text-xs text-destructive">{fieldErrors[field]}</p> : null
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Shipment Carbon Tracking</h1>
          <p className="text-muted-foreground">Create, update, and monitor shipments with live logistics emissions calculations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCsvTemplate}>
            <Download className="mr-2 h-4 w-4" />
            CSV Template
          </Button>
          <Button variant="outline" onClick={() => setShowImportModal(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Shipments
          </Button>
          {editingId ? <Button variant="outline" onClick={resetForm}>Cancel Edit</Button> : null}
          <Button onClick={submitShipment} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
            {saving ? "Saving..." : editingId ? "Update Shipment" : "Add Shipment"}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Shipment" : "New Shipment"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-1.5 text-sm font-medium">
              <span>Shipment Status</span>
              <select className={inputClass("status")} value={form.status || "IN_TRANSIT"} onChange={(e) => updateForm("status", e.target.value as Shipment["status"])}>
                {["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
              </select>
              <FieldError field="status" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Shipment Reference</span>
              <input className={inputClass("reference")} value={form.reference} onChange={(e) => updateForm("reference", e.target.value)} placeholder="e.g. SHP-1001" />
              <FieldError field="reference" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Carrier</span>
              <input className={inputClass("carrier")} value={form.carrier} onChange={(e) => updateForm("carrier", e.target.value)} placeholder="e.g. Maersk, DHL" />
              <FieldError field="carrier" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Shipment Date</span>
              <input className={inputClass("shipmentDate")} type="date" value={form.shipmentDate || ""} onChange={(e) => updateForm("shipmentDate", e.target.value)} />
              <FieldError field="shipmentDate" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Origin</span>
              <input className={inputClass("origin")} value={form.origin} onChange={(e) => updateForm("origin", e.target.value)} placeholder="e.g. Karachi" />
              <FieldError field="origin" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Destination</span>
              <input className={inputClass("destination")} value={form.destination} onChange={(e) => updateForm("destination", e.target.value)} placeholder="e.g. Rotterdam" />
              <FieldError field="destination" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Distance</span>
              <div className="flex">
                <input className={`${inputClass("distanceKm")} min-w-0 rounded-r-none`} type="number" min={0} value={form.distanceKm || ""} onChange={(e) => updateForm("distanceKm", Number(e.target.value))} placeholder="Enter distance" />
                <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">km</span>
              </div>
              <FieldError field="distanceKm" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Transport Mode</span>
              <select className={inputClass("transportMode")} value={form.transportMode} onChange={(e) => updateForm("transportMode", e.target.value as Shipment["transportMode"])}>
                {["OCEAN", "ROAD", "AIR", "RAIL"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
              <FieldError field="transportMode" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Weight</span>
              <div className="flex">
                <input className={`${inputClass("weightKg")} min-w-0 rounded-r-none`} type="number" min={0} value={form.weightKg || ""} onChange={(e) => updateForm("weightKg", Number(e.target.value))} placeholder="Enter weight" />
                <select className="rounded-r-md border border-l-0 border-input bg-muted px-2 text-sm text-muted-foreground" value={form.weightUnit || "kg"} onChange={(e) => updateForm("weightUnit", e.target.value as ShipmentPayload["weightUnit"])}>
                  <option value="kg">kg</option>
                  <option value="tonnes">tonnes</option>
                </select>
              </div>
              <FieldError field="weightKg" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Shipment Cost</span>
              <div className="flex">
                <input className={`${inputClass("costUsd")} min-w-0 rounded-r-none`} type="number" min={0} value={form.costUsd || ""} onChange={(e) => updateForm("costUsd", Number(e.target.value))} placeholder="Enter cost" />
                <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">USD</span>
              </div>
              <FieldError field="costUsd" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Vehicle Type</span>
              <input className={inputClass("vehicleType")} value={form.vehicleType || ""} onChange={(e) => updateForm("vehicleType", e.target.value)} placeholder="e.g. Truck, Van, Vessel" />
              <FieldError field="vehicleType" />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>Fuel Type</span>
              <input className={inputClass("fuelType")} value={form.fuelType || ""} onChange={(e) => updateForm("fuelType", e.target.value)} placeholder="e.g. Diesel, Petrol, Electric" />
              <FieldError field="fuelType" />
            </label>
          </div>

          <label className="block max-w-md space-y-1.5 text-sm font-medium">
            <span>Supplier</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.supplierId || ""} onChange={(e) => updateForm("supplierId", e.target.value)}>
              <option value="">Use default logistics supplier</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <span className="block text-xs font-normal text-muted-foreground">If no supplier is selected, CarbonFlow will attach this shipment to a default logistics supplier.</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <CardTitle>Recent Shipments</CardTitle>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => loadPage(search)}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search shipments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => loadPage(search)}
                className="h-9 rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={isAllVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible shipments"
                    />
                  </th>
                  <th className="px-6 py-3 font-medium">Shipment ID / Reference</th>
                  <th className="px-6 py-3 font-medium">Route</th>
                  <th className="px-6 py-3 font-medium">Mode</th>
                  <th className="px-6 py-3 font-medium">Carrier</th>
                  <th className="px-6 py-3 font-medium">Distance</th>
                  <th className="px-6 py-3 font-medium">Weight</th>
                  <th className="px-6 py-3 font-medium">Emissions</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={11} className="px-6 py-4 text-center text-muted-foreground">Loading shipments...</td></tr>
                ) : shipments.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-10 text-center">
                      <div className="mx-auto max-w-xl space-y-4">
                        <Truck className="mx-auto h-10 w-10 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-foreground">No shipments recorded yet.</p>
                          <p className="text-sm text-muted-foreground">Add your first shipment or import a CSV file to calculate logistics emissions.</p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button type="button" onClick={resetForm}>Add Shipment</Button>
                          <Button type="button" variant="outline" onClick={() => setShowImportModal(true)}>Import Shipments</Button>
                          <Button type="button" variant="outline" onClick={downloadCsvTemplate}>Download CSV Template</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={selectedShipmentIds.includes(shipment.id)}
                        onChange={() => toggleShipmentSelection(shipment.id)}
                        aria-label={`Select shipment ${shipment.reference}`}
                      />
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">{shipment.reference}</td>
                    <td className="px-6 py-4">{shipment.origin} to {shipment.destination}</td>
                    <td className="px-6 py-4">{shipment.transportMode}</td>
                    <td className="px-6 py-4">{shipment.carrier}</td>
                    <td className="px-6 py-4">{Number(shipment.distanceKm || 0).toLocaleString()} km</td>
                    <td className="px-6 py-4">{shipment.weightKg.toLocaleString()} kg</td>
                    <td className="px-6 py-4 font-medium text-primary">
                      <div>{Number(shipment.emissionsKgCo2e ?? shipment.emissionsTonnes * 1000).toFixed(2)} kgCO2e</div>
                      <div className="text-xs text-muted-foreground">{shipment.emissionsTonnes.toFixed(4)} tCO2e</div>
                      {shipment.calculationStatus === "missing_factor" ? <div className="text-xs text-amber-600">Missing factor</div> : null}
                    </td>
                    <td className="px-6 py-4">{shipment.status}</td>
                    <td className="px-6 py-4">{shipment.shipmentDate ? new Date(shipment.shipmentDate).toLocaleDateString() : "-"}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setViewingShipment(shipment)} title="View shipment">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => editShipment(shipment)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => recalculateShipment(shipment)} title="Recalculate emissions">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteShipment(shipment)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
        <div className="fixed bottom-6 right-6 z-40 w-full max-w-sm rounded-xl border border-primary/20 bg-background/95 p-4 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {selectedShipmentIds.length} shipment(s) selected
              </p>
              <p className="text-xs text-muted-foreground">
                Total emissions: {totalSelectedEmissionsTonnes.toFixed(2)} tCO2e
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
          <Button className="mt-3 w-full" onClick={() => setShowOffsetSummaryModal(true)}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Offset Selected
          </Button>
        </div>
      ) : null}

      <Modal
        open={showOffsetSummaryModal}
        onClose={() => setShowOffsetSummaryModal(false)}
        title="Batch Offset Summary"
        description="Review selected shipments before opening marketplace checkout."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="text-xs text-muted-foreground">Selected Shipments</div>
              <div className="text-lg font-semibold text-foreground">{selectedShipments.length}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="text-xs text-muted-foreground">Total tCO2e</div>
              <div className="text-lg font-semibold text-foreground">{totalSelectedEmissionsTonnes.toFixed(2)}</div>
            </div>
          </div>

          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Shipment</th>
                  <th className="px-3 py-2 font-medium">Route</th>
                  <th className="px-3 py-2 font-medium text-right">tCO2e</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selectedShipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td className="px-3 py-2">{shipment.reference}</td>
                    <td className="px-3 py-2">{shipment.origin} to {shipment.destination}</td>
                    <td className="px-3 py-2 text-right font-medium">{shipment.emissionsTonnes.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setShowOffsetSummaryModal(false)}>Close</Button>
            <Button onClick={continueToBatchOffset}>Continue to Marketplace</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(viewingShipment)}
        onClose={() => setViewingShipment(null)}
        title={viewingShipment ? `Shipment ${viewingShipment.reference}` : "Shipment details"}
        description="Route, cost, and emissions calculation details."
      >
        {viewingShipment ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Route</div>
                <div className="font-medium">{viewingShipment.origin} to {viewingShipment.destination}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Carrier</div>
                <div className="font-medium">{viewingShipment.carrier}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Distance</div>
                <div className="font-medium">{Number(viewingShipment.distanceKm || 0).toLocaleString()} km</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Weight</div>
                <div className="font-medium">{Number(viewingShipment.weightKg || 0).toLocaleString()} kg</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Emission factor</div>
                <div className="font-medium">{Number(viewingShipment.emissionFactor || 0).toFixed(3)} kgCO2e/ton-km</div>
                <div className="text-xs text-muted-foreground">{viewingShipment.factorSource || "CarbonFlow sample logistics factors"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Emissions</div>
                <div className="font-medium">{Number(viewingShipment.emissionsKgCo2e ?? viewingShipment.emissionsTonnes * 1000).toFixed(2)} kgCO2e</div>
                <div className="text-xs text-muted-foreground">{viewingShipment.emissionsTonnes.toFixed(4)} tCO2e</div>
              </div>
            </div>
            {viewingShipment.calculationStatus === "missing_factor" ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                Emissions could not be calculated because the shipment emission factor is missing.
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <UploadDataModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onUploaded={() => {
          void loadPage(search);
        }}
      />
    </div>
  );
}
