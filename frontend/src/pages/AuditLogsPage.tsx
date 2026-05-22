import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Copy, Download, Eye, FileClock, FilterX, Loader2, Search, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useToast } from "@/src/components/providers/ToastProvider";
import { auditLogsService, type AuditLogExportFormat } from "@/src/services/auditLogsService";
import { useAuth } from "@/src/hooks/useAuth";
import type { AuditLogItem, AuditSummary, PaginatedResponse } from "@/src/types/platform";
import { hasPermission, NO_PERMISSION_MESSAGE } from "@/src/utils/permissions";

const EMPTY_LOGS: PaginatedResponse<AuditLogItem> = {
  data: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
};

const EMPTY_SUMMARY: AuditSummary = {
  totalEvents: 0,
  highCriticalEvents: 0,
  failedActions: 0,
  exportsDownloads: 0,
  permissionSecurityEvents: 0,
  eventsInSelectedPeriod: 0,
};

const INITIAL_FILTERS = {
  action: "",
  module: "",
  entityType: "",
  entityId: "",
  userId: "",
  userEmail: "",
  severity: "",
  category: "",
  status: "",
  source: "",
  requestId: "",
  search: "",
  startDate: "",
  endDate: "",
};

const selectClassName = "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring";

const severityStyles: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

const QUICK_FILTERS = [
  { label: "Today", values: () => ({ startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10) }) },
  { label: "Last 7 days", values: () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  } },
  { label: "High severity", values: () => ({ severity: "high" }) },
  { label: "Failed actions", values: () => ({ status: "failed" }) },
  { label: "Report downloads", values: () => ({ module: "report", category: "download" }) },
  { label: "Permission changes", values: () => ({ category: "permission" }) },
  { label: "Marketplace checkouts", values: () => ({ module: "marketplace", search: "checkout" }) },
  { label: "Ledger approvals", values: () => ({ module: "ledger", category: "approve" }) },
  { label: "User role changes", values: () => ({ module: "user", search: "role" }) },
];

export function AuditLogsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [logs, setLogs] = useState<PaginatedResponse<AuditLogItem>>(EMPTY_LOGS);
  const [summary, setSummary] = useState<AuditSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<AuditLogExportFormat | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const canViewAuditLogs = hasPermission(user, "audit:view");
  const canExportAuditLogs = hasPermission(user, "audit:export");
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    params.set("pageSize", "50");
    return params;
  }, [filters]);

  const queryString = useMemo(() => `?${queryParams.toString()}`, [queryParams]);

  const loadLogs = async (params = queryString) => {
    try {
      setError("");
      const [nextLogs, nextSummary] = await Promise.all([
        auditLogsService.getAuditLogs(params),
        auditLogsService.getSummary(params),
      ]);
      setLogs(nextLogs);
      setSummary(nextSummary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load audit logs";
      setError(message);
      setLogs(EMPTY_LOGS);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canViewAuditLogs) void loadLogs();
  }, [canViewAuditLogs]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    void loadLogs(queryString);
  };

  if (!canViewAuditLogs) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit Logs</h1>
          <p className="text-muted-foreground">Review enterprise audit events for emissions, factors, reports, imports, and user role changes.</p>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            {NO_PERMISSION_MESSAGE}
          </CardContent>
        </Card>
      </div>
    );
  }

  const updateFilter = (key: keyof typeof INITIAL_FILTERS, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setLoading(true);
    void loadLogs("?pageSize=50");
  };

  const applyQuickFilter = (values: Partial<typeof INITIAL_FILTERS>) => {
    const nextFilters = { ...INITIAL_FILTERS, ...values };
    setFilters(nextFilters);
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    params.set("pageSize", "50");
    setLoading(true);
    void loadLogs(`?${params.toString()}`);
  };

  const exportLogs = async (format: AuditLogExportFormat) => {
    if (!canExportAuditLogs) {
      showToast({ tone: "error", title: "Permission denied", description: NO_PERMISSION_MESSAGE });
      return;
    }
    try {
      setExporting(format);
      const { blob, filename } = await auditLogsService.exportAuditLogs(queryParams, format);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
      showToast({ tone: "success", title: "Audit export ready", description: `${filename} downloaded with your current filters.` });
    } catch (err) {
      showToast({ tone: "error", title: "Export failed", description: err instanceof Error ? err.message : "Unable to export audit logs." });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground">Review enterprise audit events for emissions, factors, reports, imports, and user role changes.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total events" value={summary.totalEvents} />
        <SummaryCard label="High / critical" value={summary.highCriticalEvents} tone="critical" />
        <SummaryCard label="Failed actions" value={summary.failedActions} tone="failed" />
        <SummaryCard label="Exports / downloads" value={summary.exportsDownloads} />
        <SummaryCard label="Permission / security" value={summary.permissionSecurityEvents} tone="critical" />
        <SummaryCard label="Selected period" value={summary.eventsInSelectedPeriod} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileClock className="h-4 w-4" />
            Advanced filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {QUICK_FILTERS.map((filter) => (
              <Button key={filter.label} type="button" variant="outline" size="sm" onClick={() => applyQuickFilter(filter.values())}>
                {filter.label}
              </Button>
            ))}
          </div>
          <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-6" onSubmit={applyFilters}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="search">Search</Label>
              <Input id="search" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Action, entity, user, request ID" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <Input id="action" value={filters.action} onChange={(event) => updateFilter("action", event.target.value)} placeholder="emission_record_approved" />
            </div>
            <SelectFilter id="module" label="Module" value={filters.module} onChange={(value) => updateFilter("module", value)} options={["auth", "user", "supplier", "shipment", "emission", "ledger", "report", "marketplace", "optimization", "admin", "settings", "import", "system"]} />
            <SelectFilter id="severity" label="Severity" value={filters.severity} onChange={(value) => updateFilter("severity", value)} options={["info", "low", "medium", "high", "critical"]} />
            <SelectFilter id="category" label="Category" value={filters.category} onChange={(value) => updateFilter("category", value)} options={["create", "update", "delete", "archive", "approve", "reject", "login", "export", "download", "import", "permission", "security", "system"]} />
            <SelectFilter id="status" label="Status" value={filters.status} onChange={(value) => updateFilter("status", value)} options={["success", "failed"]} />
            <SelectFilter id="source" label="Source" value={filters.source} onChange={(value) => updateFilter("source", value)} options={["web", "admin_panel", "api", "system", "import", "automation"]} />
            <div className="space-y-2">
              <Label htmlFor="entityType">Entity type</Label>
              <Input id="entityType" value={filters.entityType} onChange={(event) => updateFilter("entityType", event.target.value)} placeholder="EmissionRecord" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityId">Entity ID</Label>
              <Input id="entityId" value={filters.entityId} onChange={(event) => updateFilter("entityId", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userId">User ID</Label>
              <Input id="userId" value={filters.userId} onChange={(event) => updateFilter("userId", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userEmail">User email</Label>
              <Input id="userEmail" value={filters.userEmail} onChange={(event) => updateFilter("userEmail", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requestId">Request ID</Label>
              <Input id="requestId" value={filters.requestId} onChange={(event) => updateFilter("requestId", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} />
            </div>
            <div className="flex items-end gap-2 xl:col-span-2">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Apply
              </Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                <FilterX className="mr-2 h-4 w-4" />
                Reset
              </Button>
              <Button type="button" variant="outline" disabled={!canExportAuditLogs || exporting === "csv"} onClick={() => void exportLogs("csv")}>
                {exporting === "csv" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                CSV
              </Button>
              <Button type="button" variant="outline" disabled={!canExportAuditLogs || exporting === "json"} onClick={() => void exportLogs("json")}>
                {exporting === "json" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                JSON
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enterprise Audit Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Timestamp</th>
                  <th className="px-6 py-3 font-medium">Severity</th>
                  <th className="px-6 py-3 font-medium">Module</th>
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                  <th className="px-6 py-3 font-medium">Entity</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Source</th>
                  <th className="px-6 py-3 font-medium">Summary</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={10} className="px-6 py-4 text-center text-muted-foreground">Loading audit logs. If the backend is waking up, this can take up to 60 seconds.</td></tr>
                ) : logs.data.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-4 text-center text-muted-foreground">{hasActiveFilters(filters) ? "No audit events match the selected filters." : "No audit events found yet."}</td></tr>
                ) : logs.data.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/50">
                    <td className="whitespace-nowrap px-6 py-4">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4"><Badge className={severityStyles[String(log.severity || "info")] || severityStyles.info}>{readable(log.severity || "info")}</Badge></td>
                    <td className="px-6 py-4"><Badge>{readable(log.module || "system")}</Badge></td>
                    <td className="px-6 py-4">{log.userEmail || log.userName || log.userId || "System"}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium">{log.actionLabel || readable(log.action)}</span>
                      <div className="text-xs text-muted-foreground">{log.action}</div>
                    </td>
                    <td className="px-6 py-4">{log.entityType || "-"}{log.entityId ? ` #${log.entityId}` : ""}</td>
                    <td className="px-6 py-4"><Badge className={log.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{readable(log.status || "success")}</Badge></td>
                    <td className="px-6 py-4"><Badge>{readable(log.source || "web")}</Badge></td>
                    <td className="max-w-sm px-6 py-4 text-xs text-muted-foreground">{summaryText(log)}</td>
                    <td className="px-6 py-4">
                      <Button type="button" variant="outline" size="sm" onClick={() => setSelectedLog(log)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t px-6 py-3 text-sm text-muted-foreground">
            Showing {logs.data.length} of {logs.pagination.total} events.
          </div>
        </CardContent>
      </Card>

      {selectedLog ? <AuditLogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} /> : null}
    </div>
  );
}

function SelectFilter({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={selectClassName} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{readable(option)}</option>)}
      </select>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "critical" | "failed" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <p className={tone ? "mt-2 text-2xl font-semibold text-red-700" : "mt-2 text-2xl font-semibold"}>{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

function Badge({ children, className = "border-slate-200 bg-slate-50 text-slate-700" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function AuditLogDetailDrawer({ log, onClose }: { log: AuditLogItem; onClose: () => void }) {
  const { showToast } = useToast();
  const copyValue = async (label: string, value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    showToast({ tone: "success", title: `${label} copied` });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30" role="dialog" aria-modal="true">
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-background shadow-xl">
        <div className="border-b p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Audit event details</h2>
              <p className="text-sm text-muted-foreground">{log.actionLabel || readable(log.action)}</p>
            </div>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Detail label="Event ID" value={log.id} />
            <Detail label="Timestamp" value={new Date(log.createdAt).toLocaleString()} />
            <Detail label="Module" value={readable(log.module || "system")} />
            <Detail label="Severity" value={readable(log.severity || "info")} />
            <Detail label="Status" value={readable(log.status || "success")} />
            <Detail label="Source" value={readable(log.source || "web")} />
            <Detail label="Raw action" value={log.action} />
            <Detail label="Action label" value={log.actionLabel || readable(log.action)} />
            <Detail label="User" value={log.userEmail || log.userName || log.userId || "System"} />
            <Detail label="User ID" value={log.userId || "-"} />
            <Detail label="Entity" value={`${log.entityType || "-"}${log.entityId ? ` #${log.entityId}` : ""}`} />
            <Detail label="Entity label" value={log.entityLabel || "-"} />
            <Detail label="Request ID" value={log.requestId || "-"} />
            <Detail label="IP address" value={log.ipAddress || "-"} />
            <Detail label="Retention until" value={formatNullableDate(log.retentionUntil)} />
            <Detail label="Retention policy" value={log.retentionPolicy || "standard_7_years"} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyValue("Event ID", log.id)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy event ID
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!log.requestId} onClick={() => void copyValue("Request ID", log.requestId)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy request ID
            </Button>
          </div>
          <JsonPanel title="Changes summary" value={log.changesSummary?.length ? log.changesSummary : summaryText(log)} />
          <JsonPanel title="Old value" value={log.oldValue} />
          <JsonPanel title="New value" value={log.newValue} />
          <JsonPanel title="Metadata" value={log.metadata || log.details} />
          <JsonPanel title="Reason / notes" value={log.reason || "-"} />
          <JsonPanel title="User agent" value={log.userAgent || "-"} />
          <JsonPanel title="Integrity metadata" value={{ integrityHash: log.integrityHash || null, previousHash: log.previousHash || null }} />
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm">{value}</p>
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">{previewValue(redactClientValue(value), 4000)}</pre>
    </section>
  );
}

function readable(value: unknown) {
  return String(value || "-").replace(/[_:.]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (char) => char.toUpperCase());
}

function hasActiveFilters(filters: typeof INITIAL_FILTERS) {
  return Object.values(filters).some((value) => value.trim());
}

function summaryText(log: AuditLogItem) {
  if (log.changesSummary?.length) return log.changesSummary.join(", ");
  if (log.reason) return log.reason;
  return previewValue(log.metadata || log.details || log.newValue || log.oldValue, 180);
}

function formatNullableDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function redactClientValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactClientValue);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key,
    /(password|token|secret|api[-_]?key|authorization|jwt|credential|private[-_]?key)/i.test(key) ? "[REDACTED]" : redactClientValue(nested),
  ]));
}

function previewValue(value: unknown, limit = 140) {
  if (!value) return "-";
  const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return serialized.length > limit ? `${serialized.slice(0, limit)}...` : serialized;
}
