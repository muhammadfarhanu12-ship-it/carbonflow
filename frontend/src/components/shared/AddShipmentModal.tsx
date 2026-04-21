import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Modal } from "@/src/components/shared/Modal";
import { shipmentService, type ShipmentPayload } from "@/src/services/shipmentService";
import { supplierService } from "@/src/services/supplierService";
import { useToast } from "@/src/components/providers/ToastProvider";
import type { Supplier, TransportMode } from "@/src/types/platform";

const initialForm: ShipmentPayload = {
  supplierId: "",
  reference: "",
  origin: "",
  destination: "",
  distanceKm: 0,
  transportMode: "ROAD",
  carrier: "",
  vehicleType: "",
  fuelType: "",
  weightKg: 0,
  costUsd: 0,
  status: "PLANNED",
};

export function AddShipmentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ShipmentPayload>(initialForm);

  useEffect(() => {
    if (!open) return;

    const loadSuppliers = async () => {
      setLoadingSuppliers(true);
      try {
        const response = await supplierService.getSuppliers("?pageSize=100");
        setSuppliers(response.data);
        setForm((current) => ({
          ...current,
          supplierId: current.supplierId || response.data[0]?.id || "",
          reference: current.reference || `SHP-${Math.floor(Math.random() * 900000)}`,
        }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load suppliers");
      } finally {
        setLoadingSuppliers(false);
      }
    };

    loadSuppliers();
  }, [open]);

  const canSubmit = useMemo(() => (
    Boolean(form.supplierId)
    && Boolean(form.reference.trim())
    && Boolean(form.origin.trim())
    && Boolean(form.destination.trim())
    && Boolean(form.carrier.trim())
    && form.distanceKm > 0
    && form.weightKg > 0
    && form.costUsd >= 0
  ), [form]);

  const update = <K extends keyof ShipmentPayload>(key: K, value: ShipmentPayload[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setError("Complete all required shipment fields before submitting.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await shipmentService.createShipment(form);
      showToast({
        tone: "success",
        title: "Shipment created",
        description: `${form.reference} is now tracked in CarbonFlow.`,
      });
      onCreated?.();
      onClose();
      setForm(initialForm);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create shipment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add shipment"
      description="Create a shipment with validated logistics and emissions inputs."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Reference">
            <Input value={form.reference} onChange={(event) => update("reference", event.target.value)} placeholder="SHP-102938" />
          </Field>
          <Field label="Supplier">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={form.supplierId}
              onChange={(event) => update("supplierId", event.target.value)}
              disabled={loadingSuppliers}
            >
              <option value="">{loadingSuppliers ? "Loading suppliers..." : "Select supplier"}</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </Field>
          <Field label="Origin">
            <Input value={form.origin} onChange={(event) => update("origin", event.target.value)} placeholder="Shanghai, CN" />
          </Field>
          <Field label="Destination">
            <Input value={form.destination} onChange={(event) => update("destination", event.target.value)} placeholder="Rotterdam, NL" />
          </Field>
          <Field label="Carrier">
            <Input value={form.carrier} onChange={(event) => update("carrier", event.target.value)} placeholder="Maersk" />
          </Field>
          <Field label="Transport mode">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={form.transportMode}
              onChange={(event) => update("transportMode", event.target.value as TransportMode)}
            >
              {["ROAD", "RAIL", "AIR", "OCEAN"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </Field>
          <Field label="Distance (km)">
            <Input type="number" min={1} value={form.distanceKm || ""} onChange={(event) => update("distanceKm", Number(event.target.value))} />
          </Field>
          <Field label="Weight (kg)">
            <Input type="number" min={1} value={form.weightKg || ""} onChange={(event) => update("weightKg", Number(event.target.value))} />
          </Field>
          <Field label="Cost (USD)">
            <Input type="number" min={0} value={form.costUsd || ""} onChange={(event) => update("costUsd", Number(event.target.value))} />
          </Field>
          <Field label="Status">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={form.status}
              onChange={(event) => update("status", event.target.value as ShipmentPayload["status"])}
            >
              {["PLANNED", "IN_TRANSIT", "DELAYED", "DELIVERED"].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Vehicle type">
            <Input value={form.vehicleType || ""} onChange={(event) => update("vehicleType", event.target.value)} placeholder="Container vessel" />
          </Field>
          <Field label="Fuel type">
            <Input value={form.fuelType || ""} onChange={(event) => update("fuelType", event.target.value)} placeholder="Marine fuel" />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" disabled={loading || loadingSuppliers}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
            {loading ? "Creating..." : "Create shipment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
