import { useEffect, useMemo, useState } from "react";
import { Download, FileWarning, Upload } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission } from "@/src/utils/permissions";
import { PermissionDenied } from "@/src/components/shared/PermissionDenied";
import { importWorkflowService, type ImportHistoryItem, type ImportPreview, type ImportType } from "@/src/services/importWorkflowService";

const importTypes: Array<{ value: ImportType; label: string; supported: boolean }> = [
  { value: "shipment", label: "Shipment imports", supported: true },
  { value: "emission_activity", label: "Carbon Ledger activity imports", supported: true },
  { value: "supplier", label: "Supplier imports", supported: false },
  { value: "emission_factor", label: "Emission factor imports", supported: true },
  { value: "financial_ledger", label: "Financial ledger imports", supported: false },
];

export function DataImportsPage() {
  const { user } = useAuth();
  const canView = hasPermission(user, "import:view") || hasPermission(user, "import:create");
  const canCreate = hasPermission(user, "import:create");
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [type, setType] = useState<ImportType>("emission_activity");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = useMemo(() => importTypes.find((item) => item.value === type), [type]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      setError(null);
      const response = await importWorkflowService.list("?pageSize=50");
      setHistory(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load import history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void loadHistory();
  }, [canView]);

  if (!canView) return <PermissionDenied />;

  const previewImport = async () => {
    setSaving(true);
    try {
      setPreview(await importWorkflowService.preview(type, csv, fileName || "CSV upload"));
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview import");
    } finally {
      setSaving(false);
    }
  };

  const commitImport = async () => {
    setSaving(true);
    try {
      const result = await importWorkflowService.commit(type, csv, fileName || "CSV upload");
      setPreview(result);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to commit import");
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
          {!canCreate ? <PermissionDenied /> : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={(event) => { setType(event.target.value as ImportType); setPreview(null); }}>
                  {importTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <Input placeholder="File name" value={fileName} onChange={(event) => setFileName(event.target.value)} />
                <a className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium" href={importWorkflowService.templateUrl(type)}><Download className="mr-2 h-4 w-4" />Template</a>
              </div>
              {!selectedType?.supported ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">This import type is listed for workflow visibility, but commit support is not enabled yet.</div> : null}
              <textarea className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="Paste CSV data here" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={!csv.trim() || saving || !selectedType?.supported} onClick={previewImport}><FileWarning className="mr-2 h-4 w-4" />Preview Import</Button>
                <Button type="button" disabled={!preview?.validRows || saving || !selectedType?.supported} onClick={commitImport}><Upload className="mr-2 h-4 w-4" />Save Valid Rows</Button>
              </div>
              {preview ? <PreviewTable preview={preview} /> : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Import History</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground"><tr><th className="px-4 py-3">Import Type</th><th className="px-4 py-3">File Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Uploaded By</th><th className="px-4 py-3">Uploaded At</th></tr></thead>
              <tbody className="divide-y divide-border">
                {loading ? <tr><td colSpan={7} className="px-6 py-6 text-center text-muted-foreground">Loading import history...</td></tr> : null}
                {!loading && history.length === 0 ? <tr><td colSpan={7} className="px-6 py-6 text-center text-muted-foreground">No imports recorded yet. Upload shipment, supplier, factor, or emission activity CSV files to begin.</td></tr> : null}
                {history.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.importType}</td><td className="px-4 py-3">{item.fileName}</td><td className="px-4 py-3">{item.status}</td><td className="px-4 py-3">{item.totalRows} total · {item.validRows} valid · {item.invalidRows} invalid</td><td className="px-4 py-3">{item.createdRecords}</td><td className="px-4 py-3">{item.uploadedBy || "-"}</td><td className="px-4 py-3">{item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : "-"}</td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-5">
        <Stat label="Rows" value={preview.totalRows} />
        <Stat label="Valid" value={preview.validRows} />
        <Stat label="Invalid" value={preview.invalidRows} />
        <Stat label="Missing factors" value={preview.missingFactorRows || 0} />
        <Stat label="Duplicate warnings" value={preview.duplicateWarnings || 0} />
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full text-left text-xs"><thead className="bg-muted text-muted-foreground"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Errors</th></tr></thead><tbody className="divide-y divide-border">{preview.rows.map((row) => <tr key={row.rowNumber}><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2">{row.valid ? "Valid" : "Invalid"}</td><td className="px-3 py-2">{[...(row.errors || []), ...(row.warnings || [])].join(" ") || "-"}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border bg-muted/20 px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm font-semibold">{value}</div></div>;
}
