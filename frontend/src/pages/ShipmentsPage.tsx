import { useEffect, useState } from "react";
import { Filter, Loader2, Pencil, Search, Trash2, Truck, Upload } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { UploadDataModal } from "@/src/components/shared/UploadDataModal";
import { shipmentService, type ShipmentPayload } from "@/src/services/shipmentService";
import { supplierService } from "@/src/services/supplierService";
import { socketService } from "@/src/services/socketService";
import { useToast } from "@/src/components/providers/ToastProvider";
import type { Shipment, Supplier } from "@/src/types/platform";

const initialForm: ShipmentPayload = {
  supplierId: "",
  reference: "",
  origin: "",
  destination: "",
  distanceKm: 0,
  transportMode: "OCEAN",
  carrier: "",
  vehicleType: "",
  fuelType: "",
  weightKg: 0,
  costUsd: 0,
  status: "IN_TRANSIT",
  shipmentDate: new Date().toISOString().slice(0, 10),
};

export function ShipmentsPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState<ShipmentPayload>(initialForm);

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
    if (!form.supplierId || !form.reference || !form.origin || !form.destination || !form.carrier || form.distanceKm <= 0 || form.weightKg <= 0) {
      setError("Complete all required shipment fields before submitting.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await shipmentService.updateShipment(editingId, form);
        showToast({
          tone: "success",
          title: "Shipment updated",
          description: `${form.reference} has been updated.`,
        });
      } else {
        await shipmentService.createShipment(form);
        showToast({
          tone: "success",
          title: "Shipment added",
          description: `${form.reference} has been saved successfully.`,
        });
      }
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
    });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Shipment Carbon Tracking</h1>
          <p className="text-muted-foreground">Create, update, and monitor shipments with live logistics emissions calculations.</p>
        </div>
        <div className="flex gap-2">
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
        <CardContent className="grid gap-3 md:grid-cols-4">
          <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.supplierId} onChange={(e) => setForm((prev) => ({ ...prev, supplierId: e.target.value }))}>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.reference} onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))} placeholder="Reference" />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.carrier} onChange={(e) => setForm((prev) => ({ ...prev, carrier: e.target.value }))} placeholder="Carrier" />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" type="date" value={form.shipmentDate || ""} onChange={(e) => setForm((prev) => ({ ...prev, shipmentDate: e.target.value }))} />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.origin} onChange={(e) => setForm((prev) => ({ ...prev, origin: e.target.value }))} placeholder="Origin" />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.destination} onChange={(e) => setForm((prev) => ({ ...prev, destination: e.target.value }))} placeholder="Destination" />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" type="number" value={form.distanceKm} onChange={(e) => setForm((prev) => ({ ...prev, distanceKm: Number(e.target.value) }))} placeholder="Distance km" />
          <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.transportMode} onChange={(e) => setForm((prev) => ({ ...prev, transportMode: e.target.value as Shipment["transportMode"] }))}>
            {["ROAD", "RAIL", "AIR", "OCEAN"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" type="number" value={form.weightKg} onChange={(e) => setForm((prev) => ({ ...prev, weightKg: Number(e.target.value) }))} placeholder="Weight kg" />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" type="number" value={form.costUsd} onChange={(e) => setForm((prev) => ({ ...prev, costUsd: Number(e.target.value) }))} placeholder="Cost USD" />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.vehicleType || ""} onChange={(e) => setForm((prev) => ({ ...prev, vehicleType: e.target.value }))} placeholder="Vehicle type" />
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.fuelType || ""} onChange={(e) => setForm((prev) => ({ ...prev, fuelType: e.target.value }))} placeholder="Fuel type" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <CardTitle>Recent Shipments</CardTitle>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => loadPage(search)}>
              <Filter className="mr-2 h-4 w-4" />
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
                  <th className="px-6 py-3 font-medium">Shipment ID</th>
                  <th className="px-6 py-3 font-medium">Route</th>
                  <th className="px-6 py-3 font-medium">Mode</th>
                  <th className="px-6 py-3 font-medium">Carrier</th>
                  <th className="px-6 py-3 font-medium">Weight</th>
                  <th className="px-6 py-3 font-medium">Emissions</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-4 text-center text-muted-foreground">Loading shipments...</td></tr>
                ) : shipments.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-4 text-center text-muted-foreground">No shipments found.</td></tr>
                ) : shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium text-foreground">{shipment.reference}</td>
                    <td className="px-6 py-4">{shipment.origin} to {shipment.destination}</td>
                    <td className="px-6 py-4">{shipment.transportMode}</td>
                    <td className="px-6 py-4">{shipment.carrier}</td>
                    <td className="px-6 py-4">{shipment.weightKg.toLocaleString()} kg</td>
                    <td className="px-6 py-4 font-medium text-primary">{shipment.emissionsTonnes.toFixed(2)} tCO2e</td>
                    <td className="px-6 py-4">{shipment.status}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => editShipment(shipment)}>
                          <Pencil className="h-4 w-4" />
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
