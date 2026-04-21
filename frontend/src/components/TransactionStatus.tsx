import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import type { CarbonCreditTransaction } from "@/src/types/platform";

export type CheckoutFlowState = "IDLE" | "PROCESSING" | "SUCCESS" | "FAILED";

interface TransactionStatusProps {
  state: CheckoutFlowState;
  transaction: CarbonCreditTransaction | null;
  error?: string;
  onDownloadCertificate?: () => void;
  downloading?: boolean;
}

const STATE_META: Record<CheckoutFlowState, {
  title: string;
  description: string;
  icon: typeof Clock3;
  className: string;
}> = {
  IDLE: {
    title: "Ready to process",
    description: "Select a project, confirm the summary, and start the carbon credit checkout.",
    icon: Clock3,
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  PROCESSING: {
    title: "Reserving inventory",
    description: "CarbonFlow is locking inventory, finalizing the transaction, and preparing the retirement certificate.",
    icon: LoaderCircle,
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  SUCCESS: {
    title: "Checkout completed",
    description: "The retirement is complete and the certificate is available for secure download.",
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  FAILED: {
    title: "Checkout failed",
    description: "The transaction did not complete. Review the details and retry with a new payment attempt if needed.",
    icon: CircleAlert,
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

export function TransactionStatus({
  state,
  transaction,
  error,
  onDownloadCertificate,
  downloading = false,
}: TransactionStatusProps) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  const registryOrHash = transaction?.registryRecordId || transaction?.blockchainHash || "Pending assignment";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Transaction Flow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-xl border px-4 py-3 ${meta.className}`}>
          <div className="flex items-start gap-3">
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${state === "PROCESSING" ? "animate-spin" : ""}`} />
            <div>
              <div className="font-semibold">{meta.title}</div>
              <div className="mt-1 text-sm">{error || meta.description}</div>
            </div>
          </div>
        </div>

        {transaction ? (
          <div className="grid gap-3 text-sm">
            <StatusRow label="Transaction ID" value={transaction.id} />
            <StatusRow label="Status" value={transaction.status} />
            <StatusRow label="Registry / Hash" value={registryOrHash} />
            <StatusRow label="Serial Number" value={transaction.serialNumber || "Pending assignment"} />
            <StatusRow label="Payment Reference" value={transaction.paymentReference || "Pending"} />
            <StatusRow label="Linked Shipment" value={transaction.shipmentReference || "No linked shipment"} />
            <StatusRow label="Lock Expires" value={transaction.lockExpiresAt ? new Date(transaction.lockExpiresAt).toLocaleString() : "Not reserved"} />
            <StatusRow label="Certificate" value={transaction.certificateMetadata?.certificateUrl ? "Ready" : "Not available"} />
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p>Completed checkouts receive a mock registry reference or blockchain hash for audit-friendly traceability.</p>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          disabled={!transaction || transaction.status !== "COMPLETED" || !onDownloadCertificate || downloading}
          onClick={onDownloadCertificate}
        >
          {downloading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download Certificate
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[65%] truncate font-medium text-foreground" title={value}>{value}</span>
    </div>
  );
}
