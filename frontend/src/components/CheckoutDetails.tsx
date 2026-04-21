import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, ReceiptText, Search, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { shipmentService } from "@/src/services/shipmentService";
import { cn } from "@/src/utils/cn";
import type { Shipment } from "@/src/types/platform";

interface CheckoutDetailsProps {
  companyName: string;
  quantity: number;
  shipmentIds: string[];
  availableInventory: number;
  blockedReason?: string;
  validationError?: string;
  submitting?: boolean;
  disabled?: boolean;
  onCompanyNameChange: (value: string) => void;
  onQuantityChange: (value: number) => void;
  onShipmentIdsChange: (value: string[]) => void;
  onSubmit: () => void | Promise<void>;
}

export function CheckoutDetails({
  companyName,
  quantity,
  shipmentIds,
  availableInventory,
  blockedReason = "",
  validationError = "",
  submitting = false,
  disabled = false,
  onCompanyNameChange,
  onQuantityChange,
  onShipmentIdsChange,
  onSubmit,
}: CheckoutDetailsProps) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [shipmentError, setShipmentError] = useState("");
  const [shipmentSearch, setShipmentSearch] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadShipments() {
      setLoadingShipments(true);
      setShipmentError("");

      try {
        const response = await shipmentService.getActiveShipments();
        if (!mounted) {
          return;
        }

        setShipments(response.data);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setShipmentError(error instanceof Error ? error.message : "Failed to load active shipments");
      } finally {
        if (mounted) {
          setLoadingShipments(false);
        }
      }
    }

    void loadShipments();

    return () => {
      mounted = false;
    };
  }, []);

  const primaryShipmentId = shipmentIds[0] || null;
  const selectedShipment = useMemo(
    () => shipments.find((shipment) => shipment.id === primaryShipmentId) || null,
    [shipments, primaryShipmentId],
  );

  const filteredShipments = useMemo(() => {
    const query = shipmentSearch.trim().toLowerCase();
    if (!query) {
      return shipments;
    }

    return shipments.filter((shipment) => {
      const candidates = [
        shipment.reference,
        shipment.billOfLading,
        shipment.containerId,
        shipment.metadata?.billOfLading,
        shipment.metadata?.bolNumber,
        shipment.metadata?.bol,
        shipment.metadata?.containerId,
        shipment.metadata?.containerID,
      ];

      return candidates.some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [shipmentSearch, shipments]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Checkout Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="grid gap-2 text-sm">
          <span className="text-muted-foreground">Company Name</span>
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Acme Holdings"
            value={companyName}
            onChange={(event) => onCompanyNameChange(event.target.value)}
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-muted-foreground">Quantity (tCO2e)</span>
          <input
            className={cn(
              "rounded-md border bg-background px-3 py-2 text-sm",
              validationError ? "border-destructive" : "border-input",
            )}
            type="number"
            min={1}
            max={availableInventory || 100000}
            value={quantity}
            onChange={(event) => onQuantityChange(Number(event.target.value))}
          />
          <span className="text-xs text-muted-foreground">
            Available now: {availableInventory.toLocaleString()} credits
          </span>
          {validationError ? (
            <span className="text-xs font-medium text-destructive">{validationError}</span>
          ) : null}
        </label>

        <label className="grid gap-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Truck className="h-4 w-4" />
            Link to Shipment
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
              placeholder="Search BOL or Container ID..."
              value={shipmentSearch}
              onChange={(event) => setShipmentSearch(event.target.value)}
            />
          </div>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={primaryShipmentId || ""}
            onChange={(event) => onShipmentIdsChange(event.target.value ? [event.target.value] : [])}
            disabled={loadingShipments}
          >
            <option value="">No linked shipment</option>
            {filteredShipments.map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.reference} | {shipment.status} | {shipment.metadata?.containerId || shipment.containerId || shipment.id.slice(0, 8)}
              </option>
            ))}
          </select>
          {shipmentIds.length > 1 ? (
            <span className="text-xs text-muted-foreground">
              Batch linked shipments: {shipmentIds.length} selected from Shipments view.
            </span>
          ) : null}
          {loadingShipments ? <span className="text-xs text-muted-foreground">Loading active shipments...</span> : null}
          {!loadingShipments && selectedShipment ? (
            <span className="text-xs text-muted-foreground">
              Linked route: {selectedShipment.origin} to {selectedShipment.destination}
            </span>
          ) : null}
          {shipmentError ? <span className="text-xs text-destructive">{shipmentError}</span> : null}
        </label>

        <Button
          className="w-full"
          disabled={disabled || submitting}
          onClick={() => void onSubmit()}
        >
          {submitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}
          Start Checkout
        </Button>

        {blockedReason ? (
          <div className="rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {blockedReason}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
