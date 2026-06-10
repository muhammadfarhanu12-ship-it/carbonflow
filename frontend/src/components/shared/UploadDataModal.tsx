import { Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/shared/Modal";

type UploadDataModalProps = {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => void;
};

export function UploadDataModal({ open, onClose, onUploaded }: UploadDataModalProps) {
  const navigate = useNavigate();

  const openGovernedImportFlow = () => {
    onClose();
    onUploaded?.();
    navigate("/app/imports?type=shipment");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Governed Shipment Import"
      description="Shipment imports now run through the governed preview and commit workflow in Data Imports."
    >
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          Use the shipment import workspace to preview rows, review validation warnings, and commit only valid records with
          full audit lineage.
        </p>
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="font-medium text-foreground">What changed</p>
          <p className="mt-2">
            The legacy direct-write shipment import path has been retired from the UI. Continue in Data Imports to use the
            secured workflow with server-side preview, commit controls, and import history.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={openGovernedImportFlow}>
            <Upload className="mr-2 h-4 w-4" />
            Open Data Imports
          </Button>
        </div>
      </div>
    </Modal>
  );
}
