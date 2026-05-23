import { useEffect, useState } from "react";
import { ClipboardCheck, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission } from "@/src/utils/permissions";
import { PermissionDenied } from "@/src/components/shared/PermissionDenied";
import { approvalsService, type ApprovalItem, type ApprovalSummary } from "@/src/services/approvalsService";

export function ApprovalsPage() {
  const { user } = useAuth();
  const canView = hasPermission(user, "approvals:view") || hasPermission(user, "emission:approve") || hasPermission(user, "supplier:evidence:verify") || hasPermission(user, "marketplace:budget:manage");
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setError(null);
      const params = type ? `?type=${encodeURIComponent(type)}` : "";
      const [nextSummary, nextItems] = await Promise.all([approvalsService.summary(), approvalsService.list(params)]);
      setSummary(nextSummary);
      setItems(nextItems.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approval queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void load();
  }, [canView, type]);

  if (!canView) return <PermissionDenied />;

  const canApproveItem = (item: ApprovalItem) => {
    if (item.type === "emission_record") return hasPermission(user, "emission:approve");
    if (item.type === "supplier_evidence") return hasPermission(user, "supplier:evidence:verify");
    if (item.type === "budget_request") return hasPermission(user, "marketplace:budget:manage");
    return false;
  };

  const runAction = async (action: "approve" | "reject" | "correction", item: ApprovalItem) => {
    try {
      if (action === "approve") await approvalsService.approve(item.type, item.id, notes);
      if (action === "reject") await approvalsService.reject(item.type, item.id, notes || "Rejected from review queue");
      if (action === "correction") await approvalsService.requestCorrection(item.type, item.id, notes || "Correction requested from review queue");
      setSelected(null);
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval action failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Approvals</h1>
        <p className="text-muted-foreground">Review pending company emissions, supplier evidence, budgets, marketplace items, factors, and imports.</p>
      </div>
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Pending emission approvals" value={summary?.pendingEmissionApprovals || 0} />
        <SummaryCard label="Supplier evidence reviews" value={summary?.supplierEvidenceReviews || 0} />
        <SummaryCard label="Budget requests" value={summary?.budgetRequests || 0} />
        <SummaryCard label="Marketplace reviews" value={summary?.marketplaceReviews || 0} />
        <SummaryCard label="Factor reviews" value={summary?.factorReviews || 0} />
        <SummaryCard label="Import issues" value={summary?.importIssues || 0} />
      </div>
      <Card>
        <CardHeader><CardTitle>Review Queue</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">All types</option>
              <option value="emission_record">Emission records</option>
              <option value="supplier_evidence">Supplier evidence</option>
              <option value="budget_request">Budget requests</option>
              <option value="marketplace_review">Marketplace reviews</option>
            </select>
            <Input placeholder="Priority filter" disabled />
            <Input placeholder="Created by" disabled />
            <Input type="date" disabled />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Submitted By</th><th className="px-4 py-3">Submitted At</th><th className="px-4 py-3">Related Entity</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">
                {loading ? <tr><td colSpan={8} className="px-6 py-6 text-center text-muted-foreground">Loading approval queue...</td></tr> : null}
                {!loading && items.length === 0 ? <tr><td colSpan={8} className="px-6 py-6 text-center text-muted-foreground">No pending approvals. Submitted records, evidence, budget requests, and factor changes will appear here.</td></tr> : null}
                {items.map((item) => <tr key={`${item.type}:${item.id}`}><td className="px-4 py-3">{item.type.replaceAll("_", " ")}</td><td className="px-4 py-3 font-medium">{item.title}</td><td className="px-4 py-3">{item.status}</td><td className="px-4 py-3">{item.priority}</td><td className="px-4 py-3">{item.submittedBy || "-"}</td><td className="px-4 py-3">{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "-"}</td><td className="px-4 py-3">{item.relatedEntity || "-"}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setSelected(item)}>View details</Button></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {selected ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l bg-background p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{selected.title}</h2><Button variant="ghost" size="sm" onClick={() => setSelected(null)}><XCircle className="h-4 w-4" /></Button></div>
          <div className="space-y-2 text-sm text-muted-foreground"><div>Type: {selected.type}</div><div>Status: {selected.status}</div><div>Priority: {selected.priority}</div><div>Related entity: {selected.relatedEntity || "-"}</div><div>{selected.description || "No additional details."}</div></div>
          <textarea className="mt-4 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes or reason" />
          {canApproveItem(selected) ? <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => runAction("approve", selected)}><ClipboardCheck className="mr-2 h-4 w-4" />Approve</Button><Button variant="outline" onClick={() => runAction("correction", selected)}>Request correction</Button><Button variant="destructive" onClick={() => runAction("reject", selected)}>Reject</Button></div> : <PermissionDenied />}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold text-foreground">{value}</div></CardContent></Card>;
}
