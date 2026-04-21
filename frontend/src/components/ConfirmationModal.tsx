import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Modal } from "@/src/components/shared/Modal";
import { Button } from "@/src/components/ui/button";

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  confirming?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  confirming = false,
  onClose,
  onConfirm,
}: ConfirmationModalProps) {
  return (
    <Modal
      open={open}
      onClose={confirming ? () => undefined : onClose}
      title={title}
      description={description}
      panelClassName="max-w-xl"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Destructive actions affect marketplace visibility and may permanently remove listings without transaction history.</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={confirming}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "destructive" ? "destructive" : "default"} onClick={() => void onConfirm()} disabled={confirming}>
            {confirming ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
