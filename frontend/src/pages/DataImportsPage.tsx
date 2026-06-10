// frontend/src/pages/DataImportsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Eye, FileWarning, Search, Upload, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission, type Permission } from "@/src/utils/permissions";
import { PermissionDenied } from "@/src/components/shared/PermissionDenied";
import { importWorkflowService, type ImportHistoryItem, type ImportPreview, type ImportType } from "@/src/services/importWorkflowService";

const importTypes: Array<{
  value: ImportType;
  label: string;
  supported: boolean;
  requiredPermission: Permission;
  requiredColumns: string[];
  optionalColumns: string[];
  notes: string[];
}> = [
  { value: "shipment", label: "Shipments", supported: true, requiredPermission: "shipment:import", requiredColumns: ["shipmentReference", "origin", "destination", "mode", "distanceKm", "weightKg", "shipmentDate"], optionalColumns: ["bolNumber", "containerId", "originCountry", "destinationCountry", "carrier", "linkedSupplierName", "cost", "currency", "status", "notes"], notes: ["Mode must be ROAD, RAIL, AIR, or OCEAN.", "Rows are previewed before commit and emission factors are checked server-side."] },
  { value: "emission_activity", label: "Carbon Ledger Activities", supported: true, requiredPermission: "emission:create", requiredColumns: ["scope", "category", "activityType", "activityAmount", "activityUnit", "factorKey", "reportingPeriodStart", "reportingPeriodEnd", "activityDate"], optionalColumns: ["facility", "businessUnit", "country", "region", "supplier", "notes"], notes: ["Preview performs factor matching.", "Missing factors block rows. Sample factors are warned."] },
  { value: "supplier", label: "Suppliers", supported: true, requiredPermission: "supplier:create", requiredColumns: ["name"], optionalColumns: ["contactEmail", "country", "region", "category", "totalEmissions", "revenueOrActivityBase", "transparencyScore", "complianceProxy", "verificationStatus", "notes"], notes: ["Scores must be between 0 and 100.", "Emails are validated when supplied."] },
  { value: "emission_factor", label: "Emission Factors", supported: true, requiredPermission: "factor:manage", requiredColumns: ["scope", "category", "activityType", "factorKey", "activityUnit", "factorValue", "factorUnit", "sourceName", "sourceYear"], optionalColumns: ["sourceUrl", "methodology", "country", "region", "version", "effectiveFrom", "effectiveTo", "notes"], notes: ["User-side imports create company custom factors.", "Sample factors cannot be imported as official factors."] },
  { value: "financial_ledger", label: "Financial Ledger Entries", supported: false, requiredPermission: "ledger:financial:create", requiredColumns: ["date", "description"], optionalColumns: ["shipmentReference", "emissionRecordId", "supplier", "logisticsCost", "carbonTax", "offsetCost", "internalCarbonPrice", "currency"], notes: ["Preview validation is available only if backend support is enabled.", "Commit is disabled in this workspace."] },
];

export function DataImportsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const canView = hasPermission(user, "import:view") || hasPermission(user, "import:create");
  const canCreate = hasPermission(user, "import:create");
  const canCommit = canCreate || hasPermission(user, "import:commit");
  const canDownloadErrors = canView && (hasPermission(user, "import:error_report:download") || hasPermission(user, "import:view"));
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [type, setType] = useState<ImportType>("emission_activity");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedImport, setSelectedImport] = useState<ImportHistoryItem | null>(null);
  const [filters, setFilters] = useState({ type: "", status: "", uploadedBy: "", dateFrom: "", dateTo: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestedType = searchParams.get("type");
    if (requestedType && importTypes.some((item) => item.value === requestedType)) {
      setType(requestedType as ImportType);
    }
  }, [searchParams]);

  const selectedType = useMemo(() => importTypes.find((item) => item.value === type), [type]);
  const canImportSelectedType = Boolean(canCreate || (selectedType?.requiredPermission && hasPermission(user, selectedType.requiredPermission)));
  const validRowCount = Number(preview?.validRows || 0);

  const loadHistory = async () => {
    setLoading(true);
    try {
      setError(null);
      const params = new URLSearchParams({ pageSize: "50" });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const response = await importWorkflowService.list(`?${params.toString()}`);
      setHistory(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load import history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void loadHistory();
  }, [canView, filters.type, filters.status, filters.uploadedBy, filters.dateFrom, filters.dateTo, filters.search]);

  if (!canView) return <PermissionDenied message="You do not have permission to view imports." />;

  const previewImport = async () => {
    setSaving(true);
    try {
      setError(null);
      setPreview(await importWorkflowService.preview(type, csv, fileName || "CSV upload"));
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setSaving(false);
    }
  };

  const commitImport = async () => {
    setSaving(true);
    try {
      setError(null);
      const result = preview?.previewId
        ? await importWorkflowService.commitById(preview.previewId)
        : await importWorkflowService.commit(type, csv, fileName || "CSV upload");
      setPreview(result);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Data Imports</h1>
        <p className="text-muted-foreground">Preview, validate, commit, and audit CSV imports across the company workspace.</p>
      </div>
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <Card>
        <CardHeader><CardTitle>Upload CSV</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!canCreate ? (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              You can view import history, but your role cannot upload or commit imports. Ask an admin or owner for import:create access.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={(event) => { setType(event.target.value as ImportType); setPreview(null); }}>
                  {importTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <Input placeholder="File name" value={fileName} onChange={(event) => setFileName(event.target.value)} />
                <a className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium" href={importWorkflowService.templateUrl(type)}><Download className="mr-2 h-4 w-4" />Download Template</a>
              </div>
              {selectedType ? <ImportTypeGuidance type={selectedType} /> : null}
              {!canImportSelectedType ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">This import requires {selectedType?.requiredPermission} access.</div> : null}
              {!selectedType?.supported ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">This import type is listed for workflow visibility, but commit support is not enabled yet.</div> : null}
              <textarea className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} placeholder="Paste CSV data here" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={!csv.trim() || saving || !canImportSelectedType} onClick={previewImport}><FileWarning className="mr-2 h-4 w-4" />Preview Import</Button>
                <Button type="button" disabled={validRowCount === 0 || saving || !selectedType?.supported || !canCommit} onClick={commitImport}><Upload className="mr-2 h-4 w-4" />{validRowCount > 0 ? `Save ${validRowCount} valid rows` : "Save valid rows"}</Button>
                {preview ? <Button type="button" variant="outline" onClick={() => setPreview(null)}><X className="mr-2 h-4 w-4" />Cancel Preview</Button> : null}
              </div>
              {preview ? <PreviewTable preview={preview} /> : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Import History</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}><option value="">All types</option>{importTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option><option value="previewed">Previewed</option><option value="committed">Committed</option><option value="partially_committed">Partially Committed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>
            <Input placeholder="Uploaded by" value={filters.uploadedBy} onChange={(event) => setFilters((current) => ({ ...current, uploadedBy: event.target.value }))} />
            <Input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            <Input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search file" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground"><tr><th className="px-4 py-3">Import Type</th><th className="px-4 py-3">File Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Total Rows</th><th className="px-4 py-3">Valid Rows</th><th className="px-4 py-3">Invalid Rows</th><th className="px-4 py-3">Created Records</th><th className="px-4 py-3">Uploaded By</th><th className="px-4 py-3">Uploaded At</th><th className="px-4 py-3">Committed At</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">
                {loading ? <tr><td colSpan={11} className="px-6 py-6 text-center text-muted-foreground">Loading import history...</td></tr> : null}
                {!loading && history.length === 0 ? <tr><td colSpan={11} className="px-6 py-6 text-center text-muted-foreground">{Object.values(filters).some(Boolean) ? "No results match filters." : "No imports recorded yet. Upload shipment, supplier, factor, or emission activity CSV files to begin."}</td></tr> : null}
                {history.map((item) => <tr key={item.id}><td className="px-4 py-3">{labelForType(item.importType)}</td><td className="px-4 py-3">{item.fileName}</td><td className="px-4 py-3"><StatusBadge status={item.status} /></td><td className="px-4 py-3">{item.totalRows}</td><td className="px-4 py-3">{item.validRows}</td><td className="px-4 py-3">{item.invalidRows}</td><td className="px-4 py-3">{item.createdRecords}</td><td className="px-4 py-3">{item.uploadedBy || "-"}</td><td className="px-4 py-3">{item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : "-"}</td><td className="px-4 py-3">{item.committedAt ? new Date(item.committedAt).toLocaleString() : "-"}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => setSelectedImport(item)}><Eye className="mr-1 h-3 w-3" />View Details</Button>{canDownloadErrors ? <a className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium hover:bg-secondary" href={importWorkflowService.errorReportUrl(item.id)}><Download className="mr-1 h-3 w-3" />Error Report</a> : null}</div></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {selectedImport ? <ImportDetailDrawer item={selectedImport} onClose={() => setSelectedImport(null)} /> : null}
    </div>
  );
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Rows" value={preview.totalRows} />
        <Stat label="Valid" value={preview.validRows} />
        <Stat label="Invalid" value={preview.invalidRows} />
        <Stat label="Missing factors" value={preview.missingFactorRows || 0} />
        <Stat label="Sample factors" value={preview.sampleFactorRows || 0} />
        <Stat label="Warnings" value={preview.warningRows || preview.duplicateRows || preview.duplicateWarnings || 0} />
        <Stat label="Estimated records" value={preview.estimatedCreatedRecords || preview.validRows} />
        <Stat label="Estimated tCO2e" value={preview.estimatedTco2e || 0} />
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full text-left text-xs"><thead className="bg-muted text-muted-foreground"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Errors</th><th className="px-3 py-2">Warnings</th></tr></thead><tbody className="divide-y divide-border">{preview.rows.map((row) => <tr key={row.rowNumber}><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2">{row.valid ? "Valid" : "Invalid"}</td><td className="px-3 py-2 text-destructive">{(row.errors || []).join(" ") || "-"}</td><td className="px-3 py-2 text-amber-700">{(row.warnings || []).join(" ") || "-"}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border bg-muted/20 px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm font-semibold">{value}</div></div>;
}

function ImportTypeGuidance({ type }: { type: (typeof importTypes)[number] }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
      <div className="font-medium text-foreground">{type.label}</div>
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        <div><span className="text-xs font-medium uppercase text-muted-foreground">Required</span><div className="mt-1 text-muted-foreground">{type.requiredColumns.join(", ")}</div></div>
        <div><span className="text-xs font-medium uppercase text-muted-foreground">Optional</span><div className="mt-1 text-muted-foreground">{type.optionalColumns.join(", ") || "-"}</div></div>
        <div><span className="text-xs font-medium uppercase text-muted-foreground">Permission</span><div className="mt-1 text-muted-foreground">import:create or {type.requiredPermission}</div></div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{type.notes.join(" ")}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.replace("_", " ");
  const classes = status === "failed" ? "bg-red-50 text-red-700" : status === "partially_committed" ? "bg-amber-50 text-amber-800" : status === "committed" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{normalized}</span>;
}

function labelForType(value: string) {
  return importTypes.find((item) => item.value === value)?.label || value;
}

function ImportDetailDrawer({ item, onClose }: { item: ImportHistoryItem; onClose: () => void }) {
  const rows = [
    ["Import ID", item.previewId || item.id],
    ["Import Type", labelForType(item.importType)],
    ["File Name", item.fileName],
    ["Status", item.status],
    ["Uploaded By", item.uploadedBy || "-"],
    ["Uploaded At", item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : "-"],
    ["Committed By", item.committedBy || "-"],
    ["Committed At", item.committedAt ? new Date(item.committedAt).toLocaleString() : "-"],
    ["Total Rows", item.totalRows],
    ["Valid Rows", item.validRows],
    ["Invalid Rows", item.invalidRows],
    ["Created Records", item.createdRecords],
    ["Failed Rows", item.failedRows ?? item.invalidRows],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-background p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Import Details</h2>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {rows.map(([label, value]) => <div key={label} className="rounded-md border border-border p-3"><div className="text-xs font-medium uppercase text-muted-foreground">{label}</div><div className="mt-1 text-sm text-foreground">{value}</div></div>)}
        </div>
        <div className="mt-4 rounded-md border border-border p-3">
          <div className="text-sm font-semibold">Audit</div>
          <a className="mt-2 inline-flex text-sm font-medium text-primary" href={`/app/audit-logs?entityType=Import&entityId=${item.previewId || item.id}`}>Open audit log</a>
        </div>
        <DetailMessages title="Row Errors" rows={item.rowErrors || []} tone="error" />
        <DetailMessages title="Row Warnings" rows={item.rowWarnings || []} tone="warning" />
        {item.createdRecordLinks?.length ? <div className="mt-4 rounded-md border border-border p-3"><div className="text-sm font-semibold">Created Records</div><div className="mt-2 space-y-1 text-sm text-muted-foreground">{item.createdRecordLinks.map((record) => <div key={`${record.type}-${record.id}`}>{record.type || item.importType}: {record.id}</div>)}</div></div> : null}
      </div>
    </div>
  );
}

function DetailMessages({ title, rows, tone }: { title: string; rows: NonNullable<ImportHistoryItem["rowErrors"]>; tone: "error" | "warning" }) {
  const color = tone === "error" ? "text-destructive" : "text-amber-700";
  return (
    <div className="mt-4 rounded-md border border-border p-3">
      <div className="text-sm font-semibold">{title}</div>
      {!rows.length ? <div className="mt-2 text-sm text-muted-foreground">None</div> : null}
      <div className="mt-2 max-h-56 overflow-auto text-sm">
        {rows.map((row, index) => <div key={`${row.rowNumber}-${index}`} className={color}>Row {row.rowNumber || "-"}: {row.message || JSON.stringify(row)}</div>)}
      </div>
    </div>
  );
}
