import { Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/shared/Modal";

export function AddShipmentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();

  const openShipmentWorkflow = () => {
    onClose();
    onCreated?.();
    navigate("/app/shipments?compose=1");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Shipment"
      description="Create shipments in the upgraded Scope 3 logistics workflow."
    >
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          The shipment form now lives on the Shipments page so every global add flow uses the same validated fields,
          supplier linking rules, server-side emissions calculation, and audit trail.
        </p>
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="font-medium text-foreground">Supported fields</p>
          <p className="mt-2">
            Shipment reference, BOL/container, route, mode, carrier, optional supplier, distance, weight, cost, currency,
            shipment date, reporting period, status, and notes.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={openShipmentWorkflow}>
            <Truck className="mr-2 h-4 w-4" />
            Open Shipments
          </Button>
        </div>
      </div>
    </Modal>
  );
}
