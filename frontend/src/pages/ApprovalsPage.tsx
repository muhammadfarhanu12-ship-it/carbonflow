import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, ExternalLink, Filter, Loader2, UserCheck, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission, type Permission } from "@/src/utils/permissions";
import { PermissionDenied } from "@/src/components/shared/PermissionDenied";
import { approvalsService, type ApprovalItem, type ApprovalListParams, type ApprovalSummary } from "@/src/services/approvalsService";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "emission_record", label: "Emission records" },
  { value: "supplier_evidence", label: "Supplier evidence" },
  { value: "marketplace_budget_request", label: "Budget requests" },
  { value: "marketplace_payment_review", label: "Payment reviews" },
  { value: "marketplace_registry_review", label: "Registry reviews" },
  { value: "emission_factor_change", label: "Factor reviews" },
  { value: "import_issue", label: "Import issues" },
];

const MODULE_OPTIONS = ["", "emissions", "suppliers", "marketplace", "factors", "imports"];
const STATUS_OPTIONS = ["", "submitted", "pending_review", "under_review", "needs_correction", "approved", "rejected", "failed", "blocked"];
const PRIORITY_OPTIONS = ["", "low", "medium", "high", "critical"];

const ACTION_PERMISSION: Record<string, Permission> = {
  emission_record: "emission:approve",
  supplier_evidence: "supplier:evidence:verify",
  marketplace_budget_request: "marketplace:budget:manage",
  marketplace_payment_review: "marketplace:payment:verify",
  marketplace_registry_review: "marketplace:registry:verify",
  emission_factor_change: "factor:approve",
  import_issue: "import:review",
};

export function ApprovalsPage() {
  const { user } = useAuth();
  const canView = hasPermission(user, "approvals:view");
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [filters, setFilters] = useState<ApprovalListParams>({});
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setError(null);
      const [nextSummary, nextItems] = await Promise.all([approvalsService.summary(), approvalsService.list(filters)]);
      setSummary(nextSummary);
      setItems(Array.isArray(nextItems.data) ? nextItems.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable. Approval queue could not be loaded.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void load();
  }, [canView, JSON.stringify(filters)]);

  const quickFilters = useMemo(() => [
    { label: "My queue", apply: () => setFilters((current) => ({ ...current, assignedTo: user?.id || user?.email || "" })) },
    { label: "High priority", apply: () => setFilters((current) => ({ ...current, priority: "high" })) },
    { label: "Needs correction", apply: () => setFilters((current) => ({ ...current, status: "needs_correction" })) },
    { label: "Emissions", apply: () => setFilters((current) => ({ ...current, type: "emission_record", module: "emissions" })) },
    { label: "Supplier evidence", apply: () => setFilters((current) => ({ ...current, type: "supplier_evidence", module: "suppliers" })) },
    { label: "Budget requests", apply: () => setFilters((current) => ({ ...current, type: "marketplace_budget_request", module: "marketplace" })) },
    { label: "Marketplace reviews", apply: () => setFilters((current) => ({ ...current, type: "marketplace_review", module: "marketplace" })) },
    { label: "Factor reviews", apply: () => setFilters((current) => ({ ...current, type: "emission_factor_change", module: "factors" })) },
    { label: "Import issues", apply: () => setFilters((current) => ({ ...current, type: "import_issue", module: "imports" })) },
  ], [user?.id, user?.email]);

  if (!canView) return <PermissionDenied message="You do not have permission to view approvals." />;

  const updateFilter = (key: keyof ApprovalListParams, value: string) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  };

  const openDetails = async (item: ApprovalItem) => {
    setSelected(item);
    setNotes("");
    setPaymentReference("");
    setActionError(null);
    setDetailLoading(true);
    try {
      const detail = await approvalsService.get(item.type, item.id);
      setSelected(detail);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Related entity unavailable.");
    } finally {
      setDetailLoading(false);
    }
  };

  const canActOn = (item: ApprovalItem) => {
    const permission = ACTION_PERMISSION[item.type];
    return permission ? hasPermission(user, permission) : false;
  };

  const actionMeta = (item: ApprovalItem, action: string) => item.availableActions?.find((candidate) => candidate.action === action);

  const runAction = async (action: "approve" | "reject" | "correction", item: ApprovalItem) => {
    setActionError(null);
    setSuccess(null);
    const requiresReason = action === "reject";
    const requiresNotes = action === "correction" || actionMeta(item, "approve")?.requiresNotes;
    if ((requiresReason || requiresNotes) && !notes.trim()) {
      setActionError(action === "reject" ? "Rejection reason is required." : "Review notes are required for this action.");
      return;
    }
    setActionLoading(action);
    try {
      if (action === "approve") await approvalsService.approve(item.type, item.id, notes.trim() || undefined, paymentReference.trim() || undefined);
      if (action === "reject") await approvalsService.reject(item.type, item.id, notes.trim());
      if (action === "correction") await approvalsService.requestCorrection(item.type, item.id, notes.trim());
      setSuccess(action === "approve" ? "Approval completed." : action === "reject" ? "Rejection saved." : "Correction requested.");
      setSelected(null);
      setNotes("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const assignToMe = async (item: ApprovalItem) => {
    setActionError(null);
    setActionLoading("assign");
    try {
      await approvalsService.assign(item.type, item.id);
      setSuccess("Assignment updated.");
      await openDetails(item);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Assignment update failed.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Approvals</h1>
        <p className="text-muted-foreground">Review pending company emissions, supplier evidence, budgets, marketplace items, factors, and imports.</p>
      </div>

      {error ? <Alert tone="error" text={error} /> : null}
      {success ? <Alert tone="success" text={success} /> : null}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Pending emission approvals" value={summary?.pendingEmissionApprovals || 0} high={0} loading={loading} onClick={() => updateFilter("type", "emission_record")} />
        <SummaryCard label="Supplier evidence reviews" value={summary?.supplierEvidenceReviews || 0} high={0} loading={loading} onClick={() => updateFilter("type", "supplier_evidence")} />
        <SummaryCard label="Budget requests" value={summary?.budgetRequests || 0} high={summary?.budgetRequests || 0} loading={loading} onClick={() => updateFilter("type", "marketplace_budget_request")} />
        <SummaryCard label="Marketplace reviews" value={summary?.marketplaceReviews || 0} high={summary?.marketplaceReviews || 0} loading={loading} onClick={() => updateFilter("type", "marketplace_review")} />
        <SummaryCard label="Factor reviews" value={summary?.factorReviews || 0} high={summary?.factorReviews || 0} loading={loading} onClick={() => updateFilter("type", "emission_factor_change")} />
        <SummaryCard label="Import issues" value={summary?.importIssues || 0} high={summary?.importIssues || 0} loading={loading} onClick={() => updateFilter("type", "import_issue")} />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Review Queue</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setFilters({})}><Filter className="mr-2 h-4 w-4" />Clear filters</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickFilters.map((filter) => <Button key={filter.label} type="button" variant="outline" size="sm" onClick={filter.apply}>{filter.label}</Button>)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Select value={filters.type || ""} onChange={(value) => updateFilter("type", value)} options={TYPE_OPTIONS} ariaLabel="Approval type" />
            <Select value={filters.status || ""} onChange={(value) => updateFilter("status", value)} options={STATUS_OPTIONS.map((value) => ({ value, label: value ? labelize(value) : "All statuses" }))} ariaLabel="Status" />
            <Select value={filters.priority || ""} onChange={(value) => updateFilter("priority", value)} options={PRIORITY_OPTIONS.map((value) => ({ value, label: value ? labelize(value) : "All priorities" }))} ariaLabel="Priority" />
            <Select value={filters.module || ""} onChange={(value) => updateFilter("module", value)} options={MODULE_OPTIONS.map((value) => ({ value, label: value ? labelize(value) : "All modules" }))} ariaLabel="Module" />
            <Input placeholder="Submitted by" value={filters.submittedBy || ""} onChange={(event) => updateFilter("submittedBy", event.target.value)} />
            <Input placeholder="Assigned to" value={filters.assignedTo || ""} onChange={(event) => updateFilter("assignedTo", event.target.value)} />
            <Input type="date" value={filters.dateFrom || ""} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
            <Input placeholder="Search queue" value={filters.search || ""} onChange={(event) => updateFilter("search", event.target.value)} />
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Submitted By</th>
                  <th className="px-4 py-3">Submitted At</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Related Entity</th>
                  <th className="px-4 py-3">Warnings</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading approvals...</td></tr> : null}
                {!loading && items.length === 0 && hasActiveFilters(filters) ? <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">No results match filters.</td></tr> : null}
                {!loading && items.length === 0 && !hasActiveFilters(filters) ? <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">No pending approvals. Submitted records, evidence, budget requests, and factor changes will appear here.</td></tr> : null}
                {items.map((item) => (
                  <tr key={`${item.type}:${item.id}`}>
                    <td className="px-4 py-3">{labelize(item.type)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{item.title}</td>
                    <td className="px-4 py-3"><Badge value={item.status} /></td>
                    <td className="px-4 py-3"><Badge value={item.priority} tone={priorityTone(item.priority)} /></td>
                    <td className="px-4 py-3">{item.submittedByEmail || item.submittedBy || "-"}</td>
                    <td className="px-4 py-3">{formatDate(item.submittedAt)}</td>
                    <td className="px-4 py-3">{item.assignedTo || "-"}</td>
                    <td className="px-4 py-3">{item.relatedEntityLabel || item.relatedEntityId || item.relatedEntity || "-"}</td>
                    <td className="px-4 py-3">{(item.dataQualityWarnings || []).length ? <span className="text-amber-700">{item.dataQualityWarnings?.length} warning(s)</span> : "-"}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openDetails(item)}>View Details</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l bg-background shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b p-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{selected.title}</h2>
              <p className="text-sm text-muted-foreground">{labelize(selected.type)} · {selected.relatedEntityLabel || selected.relatedEntityId || "Related entity unavailable"}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} aria-label="Close details"><XCircle className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {detailLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading approval details...</div> : null}
            {actionError ? <Alert tone="error" text={actionError} /> : null}
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Status" value={selected.status} />
              <Info label="Priority" value={selected.priority} />
              <Info label="Submitted By" value={selected.submittedByEmail || selected.submittedBy || "-"} />
              <Info label="Submitted At" value={formatDate(selected.submittedAt)} />
              <Info label="Assigned To" value={selected.assignedTo || "-"} />
              <Info label="Module" value={selected.module || "-"} />
            </div>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Data Summary</h3>
              <KeyValue data={selected.dataSummary || { description: selected.description || "No additional details." }} />
            </section>
            <MessageList title="Data Quality Warnings" values={selected.dataQualityWarnings || []} empty="No warnings reported." />
            <MessageList title="Risk Flags" values={selected.riskFlags || []} empty="No risk flags reported." />
            <MessageList title="Required Review Checklist" values={selected.reviewChecklist || []} empty="No checklist available." />
            <MessageList title="Previous Comments" values={selected.previousComments || []} empty="No previous comments." />
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Audit Timeline</h3>
              {(selected.auditTimeline || []).length ? (
                <div className="space-y-2">
                  {selected.auditTimeline?.map((entry) => <div key={entry.id} className="rounded-md border border-border px-3 py-2 text-xs"><div className="font-medium">{labelize(entry.action)}</div><div className="text-muted-foreground">{formatDate(entry.timestamp)} · {entry.userEmail || entry.userId || "system"}</div>{entry.notes ? <div className="mt-1">{entry.notes}</div> : null}</div>)}
                </div>
              ) : <p className="text-sm text-muted-foreground">No audit events found for this item.</p>}
            </section>
            {selected.type === "marketplace_payment_review" ? <Input placeholder="Payment reference, if required" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /> : null}
            <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Approval notes, rejection reason, or correction notes" />
          </div>
          <div className="border-t p-6">
            {canActOn(selected) ? (
              <div className="flex flex-wrap gap-2">
                <ActionButton label="Approve" icon={<ClipboardCheck className="mr-2 h-4 w-4" />} loading={actionLoading === "approve"} meta={actionMeta(selected, "approve")} onClick={() => runAction("approve", selected)} />
                <ActionButton label="Request correction" loading={actionLoading === "correction"} meta={actionMeta(selected, "request_correction")} onClick={() => runAction("correction", selected)} />
                <ActionButton label="Reject" variant="destructive" loading={actionLoading === "reject"} meta={actionMeta(selected, "reject")} onClick={() => runAction("reject", selected)} />
                {hasPermission(user, "approvals:assign") ? <Button variant="outline" onClick={() => assignToMe(selected)} disabled={actionLoading === "assign"}><UserCheck className="mr-2 h-4 w-4" />Assign to me</Button> : null}
                {selected.dataSummary?.errorReportUrl ? <Button variant="outline" asChild><a href={String(selected.dataSummary.errorReportUrl)}><Download className="mr-2 h-4 w-4" />Error report</a></Button> : null}
                {selected.relatedEntityId ? <Button variant="outline" asChild><a href={relatedHref(selected)}><ExternalLink className="mr-2 h-4 w-4" />Open related record</a></Button> : null}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">This item requires {selected.actionRequiredByRole || "module approval"} permission. You can review the details, but your role cannot perform approval actions.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, high, loading, onClick }: { label: string; value: number; high: number; loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div className="text-2xl font-bold text-foreground">{loading ? "..." : value}</div>
            {high > 0 ? <div className="text-xs font-medium text-amber-700">{high} high</div> : null}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function Select({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; ariaLabel: string }) {
  return <select aria-label={ariaLabel} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select>;
}

function Alert({ text, tone }: { text: string; tone: "error" | "success" }) {
  const styles = tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-300 bg-emerald-50 text-emerald-800";
  const Icon = tone === "error" ? AlertTriangle : CheckCircle2;
  return <div className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${styles}`}><Icon className="h-4 w-4" />{text}</div>;
}

function Badge({ value, tone = "neutral" }: { value?: string; tone?: "neutral" | "warning" | "danger" | "success" }) {
  const styles = {
    neutral: "bg-muted text-muted-foreground",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    success: "bg-emerald-100 text-emerald-800",
  }[tone];
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles}`}>{labelize(value || "-")}</span>;
}

function ActionButton({ label, meta, loading, onClick, icon, variant = "default" }: { label: string; meta?: { enabled?: boolean; disabledReason?: string | null }; loading: boolean; onClick: () => void; icon?: ReactNode; variant?: "default" | "destructive" }) {
  const disabled = loading || meta?.enabled === false;
  return <Button variant={variant} onClick={onClick} disabled={disabled} title={meta?.disabledReason || undefined}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : icon}{label}</Button>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-border px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium text-foreground">{value}</div></div>;
}

function KeyValue({ data }: { data: Record<string, unknown> }) {
  return <div className="grid gap-2 md:grid-cols-2">{Object.entries(data).map(([key, value]) => <Info key={key} label={labelize(key)} value={formatValue(value)} />)}</div>;
}

function MessageList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return <section className="space-y-2"><h3 className="text-sm font-semibold text-foreground">{title}</h3>{values.length ? <ul className="space-y-1 text-sm">{values.map((value) => <li key={value} className="rounded-md border border-border px-3 py-2">{value}</li>)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</section>;
}

function labelize(value: string) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString() : "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function priorityTone(priority?: string): "neutral" | "warning" | "danger" | "success" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "success";
  return "neutral";
}

function hasActiveFilters(filters: ApprovalListParams) {
  return Object.values(filters).some(Boolean);
}

function relatedHref(item: ApprovalItem) {
  if (item.type === "emission_record") return `/app/ledger?record=${encodeURIComponent(item.relatedEntityId || item.id)}`;
  if (item.type === "supplier_evidence") return `/app/suppliers?evidence=${encodeURIComponent(item.id)}`;
  if (item.type.startsWith("marketplace")) return `/app/marketplace?transaction=${encodeURIComponent(item.relatedEntityId || item.id)}`;
  if (item.type === "emission_factor_change") return `/app/emission-factors?factor=${encodeURIComponent(item.relatedEntityId || item.id)}`;
  if (item.type === "import_issue") return `/app/imports?import=${encodeURIComponent(item.relatedEntityId || item.id)}`;
  return "#";
}
