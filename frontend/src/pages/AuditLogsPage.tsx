import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FileClock, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { auditLogsService } from "@/src/services/auditLogsService";
import { useAuth } from "@/src/hooks/useAuth";
import type { AuditLogItem, PaginatedResponse } from "@/src/types/platform";

const EMPTY_LOGS: PaginatedResponse<AuditLogItem> = {
  data: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
};

const AUDIT_ROLES = new Set(["OWNER", "ADMIN", "SUPERADMIN", "AUDITOR", "ANALYST"]);

export function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<PaginatedResponse<AuditLogItem>>(EMPTY_LOGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    action: "",
    entityType: "",
    userId: "",
    startDate: "",
    endDate: "",
  });

  const canViewAuditLogs = AUDIT_ROLES.has(String(user?.role || "").toUpperCase());
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    params.set("pageSize", "50");
    const query = params.toString();
    return query ? `?${query}` : "?pageSize=50";
  }, [filters]);

  const loadLogs = async (params = queryString) => {
    try {
      setError("");
      setLogs(await auditLogsService.getAuditLogs(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
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
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground">Review enterprise audit events for emissions, factors, reports, imports, and user role changes.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileClock className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-6" onSubmit={applyFilters}>
            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <Input id="action" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} placeholder="emission_record_approved" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entityType">Entity Type</Label>
              <Input id="entityType" value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value }))} placeholder="EmissionRecord" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userId">User ID</Label>
              <Input id="userId" value={filters.userId} onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Apply
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
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                  <th className="px-6 py-3 font-medium">Entity</th>
                  <th className="px-6 py-3 font-medium">Old Value</th>
                  <th className="px-6 py-3 font-medium">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">Loading audit logs...</td></tr>
                ) : logs.data.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">No audit logs match the selected filters.</td></tr>
                ) : logs.data.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/50">
                    <td className="whitespace-nowrap px-6 py-4">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4">{log.userEmail || log.userId || "System"}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{log.action}</span>
                    </td>
                    <td className="px-6 py-4">{log.entityType || "-"}{log.entityId ? ` #${log.entityId}` : ""}</td>
                    <td className="max-w-xs px-6 py-4 text-xs text-muted-foreground">{previewValue(log.oldValue)}</td>
                    <td className="max-w-xs px-6 py-4 text-xs text-muted-foreground">{previewValue(log.newValue || log.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function previewValue(value: unknown) {
  if (!value) return "-";
  const serialized = JSON.stringify(value);
  return serialized.length > 140 ? `${serialized.slice(0, 140)}...` : serialized;
}
