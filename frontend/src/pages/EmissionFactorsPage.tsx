import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Database, Download, Loader2, Search, Upload, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission } from "@/src/utils/permissions";
import { PermissionDenied } from "@/src/components/shared/PermissionDenied";
import { factorLibraryService, type FactorLibrarySummary, type FactorPayload, type ManagedEmissionFactor, type FactorImportPreview } from "@/src/services/factorLibraryService";
import { useToast } from "@/src/components/providers/ToastProvider";

const emptyForm: FactorPayload & { effectiveFrom?: string; effectiveTo?: string; sourceUrl?: string; methodology?: string; notes?: string; country?: string; region?: string; version?: string } = {
  scope: 1,
  category: "",
  activityType: "",
  factorKey: "",
  activityUnit: "",
  factorValue: 0,
  factorUnit: "kgCO2e/unit",
  sourceName: "",
  sourceYear: new Date().getUTCFullYear(),
  sourceUrl: "",
  methodology: "",
  country: "GLOBAL",
  region: "GLOBAL",
  version: "v1",
  effectiveFrom: "",
  effectiveTo: "",
  notes: "",
};

export function EmissionFactorsPage() {
  const { user } = useAuth();
  const canView = hasPermission(user, "factor:view") || hasPermission(user, "factor:manage");
  const canManage = hasPermission(user, "factor:manage");
  const canImport = canManage || hasPermission(user, "factor:import");
  const canViewAudit = hasPermission(user, "factor:audit:view") || hasPermission(user, "audit:view");
  const { showToast } = useToast();
  const [factors, setFactors] = useState<ManagedEmissionFactor[]>([]);
  const [summary, setSummary] = useState<FactorLibrarySummary | null>(null);
  const [filters, setFilters] = useState({ search: "", scope: "", type: "", status: "", country: "", region: "", activityUnit: "", sourceYear: "" });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<FactorImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (filters.search) params.set("search", filters.search);
    if (filters.scope) params.set("scope", filters.scope);
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (filters.country) params.set("country", filters.country);
    if (filters.region) params.set("region", filters.region);
    if (filters.activityUnit) params.set("activityUnit", filters.activityUnit);
    if (filters.sourceYear) params.set("sourceYear", filters.sourceYear);
    return `?${params.toString()}`;
  }, [filters]);

  const loadFactors = async () => {
    setLoading(true);
    try {
      setError(null);
      const response = await factorLibraryService.list(query);
      setFactors(response.data);
      setSummary(response.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load emission factors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void loadFactors();
  }, [canView, query]);

  if (!canView) return <PermissionDenied message="You do not have permission to view emission factors." />;

  const validateForm = () => {
    const messages: string[] = [];
    if (!form.factorKey.trim()) messages.push("Factor key is required.");
    if (![1, 2, 3].includes(Number(form.scope))) messages.push("Scope is required.");
    if (!form.category.trim()) messages.push("Category is required.");
    if (!form.activityType.trim()) messages.push("Activity type is required.");
    if (!form.activityUnit.trim()) messages.push("Activity unit is required.");
    if (!Number.isFinite(Number(form.factorValue)) || Number(form.factorValue) <= 0) messages.push("Factor value must be greater than 0.");
    if (!form.factorUnit.trim()) messages.push("Factor unit is required.");
    if (!form.sourceName.trim()) messages.push("Source name is required.");
    if (!Number.isInteger(Number(form.sourceYear)) || Number(form.sourceYear) < 1900) messages.push("Source year is required.");
    if (form.effectiveFrom && form.effectiveTo && new Date(form.effectiveTo) < new Date(form.effectiveFrom)) messages.push("Effective To cannot be before Effective From.");
    return messages;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrors = validateForm();
    if (validationErrors.length) {
      setError(validationErrors.join(" "));
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, factorValue: Number(form.factorValue), sourceYear: Number(form.sourceYear), scope: Number(form.scope) as 1 | 2 | 3 };
      if (editingId) await factorLibraryService.update(editingId, payload);
      else await factorLibraryService.create(payload);
      setForm(emptyForm);
      setEditingId(null);
      await loadFactors();
      showToast({ tone: "success", title: editingId ? "Emission factor updated" : "Emission factor created", description: "Existing approved records keep their historical factor snapshot. Recalculate records if you want to apply this new factor." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save emission factor");
    } finally {
      setSaving(false);
    }
  };

  const edit = (factor: ManagedEmissionFactor) => {
    if (!factor.canEdit) return;
    setEditingId(factor.id);
    setForm({
      ...emptyForm,
      ...factor,
      factorValue: factor.factorValue ?? factor.value ?? 0,
      effectiveFrom: factor.effectiveFrom ? factor.effectiveFrom.slice(0, 10) : "",
      effectiveTo: factor.effectiveTo ? factor.effectiveTo.slice(0, 10) : "",
    });
  };

  const previewCsv = async () => {
    setSaving(true);
    try {
      const result = await factorLibraryService.previewImport(csv);
      setPreview(result);
      showToast({ tone: "success", title: "Import preview ready", description: `${result.validRows} valid rows, ${result.invalidRows} invalid rows.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview CSV");
    } finally {
      setSaving(false);
    }
  };

  const commitCsv = async () => {
    setSaving(true);
    try {
      const result = await factorLibraryService.commitImport(csv);
      setPreview(result);
      await loadFactors();
      showToast({ tone: "success", title: "Emission factors imported", description: `${result.createdCount ?? 0} company custom factors were created.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    const template = "scope,category,activityType,factorKey,activityUnit,factorValue,factorUnit,sourceName,sourceYear,sourceUrl,methodology,country,region,version,effectiveFrom,effectiveTo,notes\n1,Stationary combustion,stationary_fuel,DIESEL,liter,2.5,kgCO2e/liter,Your verified source,2026,https://example.com,Company methodology,GLOBAL,GLOBAL,v1,2026-01-01,,Company custom diesel factor";
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "company-emission-factor-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const changeStatus = async (factor: ManagedEmissionFactor) => {
    setSaving(true);
    try {
      if (factor.isActive) await factorLibraryService.deactivate(factor.id);
      else await factorLibraryService.reactivate(factor.id);
      await loadFactors();
      showToast({ tone: "success", title: factor.isActive ? "Emission factor deactivated" : "Emission factor reactivated" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update factor status");
    } finally {
      setSaving(false);
    }
  };

  const onlySamples = factors.length > 0 && factors.every((factor) => getFactorType(factor) === "Sample");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Emission Factors</h1>
        <p className="text-muted-foreground">Manage company custom factors and review official/global and sample fallback factors.</p>
      </div>
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <Card>
        <CardHeader><CardTitle>{editingId ? "Edit Company Custom Factor" : "Create Company Custom Factor"}</CardTitle></CardHeader>
        <CardContent>
          {!canManage ? (
            <ReadOnlyNotice message="You can view emission factors, but your role cannot create or edit company custom factors. Ask an admin or owner for factor:manage access." />
          ) : (
            <>
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Existing approved records keep their historical factor snapshot. Recalculate records if you want to apply this new factor.
            </div>
            <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
              <Field label="Scope"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: Number(event.target.value) as 1 | 2 | 3 }))}><option value={1}>Scope 1</option><option value={2}>Scope 2</option><option value={3}>Scope 3</option></select></Field>
              <Field label="Category"><Input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} required /></Field>
              <Field label="Activity Type"><Input value={form.activityType} onChange={(event) => setForm((current) => ({ ...current, activityType: event.target.value }))} required /></Field>
              <Field label="Factor Key"><Input value={form.factorKey} onChange={(event) => setForm((current) => ({ ...current, factorKey: event.target.value }))} required /></Field>
              <Field label="Activity Unit"><Input value={form.activityUnit} onChange={(event) => setForm((current) => ({ ...current, activityUnit: event.target.value }))} required /></Field>
              <Field label="Factor Value"><Input type="number" min="0.000001" step="0.000001" value={form.factorValue} onChange={(event) => setForm((current) => ({ ...current, factorValue: Number(event.target.value) }))} required /></Field>
              <Field label="Factor Unit"><Input value={form.factorUnit} onChange={(event) => setForm((current) => ({ ...current, factorUnit: event.target.value }))} required /></Field>
              <Field label="Source Name"><Input value={form.sourceName} onChange={(event) => setForm((current) => ({ ...current, sourceName: event.target.value }))} required /></Field>
              <Field label="Source Year"><Input type="number" value={form.sourceYear} onChange={(event) => setForm((current) => ({ ...current, sourceYear: Number(event.target.value) }))} required /></Field>
              <Field label="Source URL"><Input value={form.sourceUrl || ""} onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))} /></Field>
              <Field label="Methodology"><Input value={form.methodology || ""} onChange={(event) => setForm((current) => ({ ...current, methodology: event.target.value }))} /></Field>
              <Field label="Country"><Input value={form.country || ""} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} /></Field>
              <Field label="Region"><Input value={form.region || ""} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} /></Field>
              <Field label="Version"><Input value={form.version || ""} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /></Field>
              <Field label="Effective From"><Input type="date" value={form.effectiveFrom || ""} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></Field>
              <Field label="Effective To"><Input type="date" value={form.effectiveTo || ""} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value }))} /></Field>
              <Field label="Notes"><Input value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}{editingId ? "Save" : "Create"}</Button>
                {editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</Button> : null}
              </div>
            </form>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>CSV Import</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!canImport ? <ReadOnlyNotice message="CSV factor import requires factor management permission." /> : (
            <>
              <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} placeholder="scope,category,activityType,factorKey,activityUnit,factorValue,factorUnit,sourceName,sourceYear,sourceUrl,methodology,country,region,version,effectiveFrom,effectiveTo,notes" />
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Download template</Button><Button type="button" variant="outline" onClick={previewCsv} disabled={!csv.trim() || saving}><Search className="mr-2 h-4 w-4" />Preview</Button><Button type="button" onClick={commitCsv} disabled={!preview?.validRows || saving}><Upload className="mr-2 h-4 w-4" />Save Valid Rows</Button></div>
              {preview ? <div className="text-sm text-muted-foreground">Rows: {preview.totalRows}. Valid: {preview.validRows}. Invalid: {preview.invalidRows}. Duplicate warnings: {preview.duplicateWarnings || 0}. Created: {preview.createdCount || 0}.</div> : null}
              {preview?.rows?.length ? <ImportPreview rows={preview.rows} /> : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Factor Library</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryTile label="Custom factors" value={summary?.customFactors ?? factors.filter((factor) => getFactorType(factor) === "Custom").length} />
            <SummaryTile label="Official/global factors" value={summary?.officialFactors ?? factors.filter((factor) => getFactorType(factor) === "Official").length} />
            <SummaryTile label="Sample fallback factors" value={summary?.sampleFactors ?? factors.filter((factor) => getFactorType(factor) === "Sample").length} />
            <SummaryTile label="Missing factor records" value={summary?.missingFactorsReferenced ?? 0} />
          </div>
          {onlySamples ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />Sample factors are fallback placeholders and should not be used for official reporting.</div> : null}
          <div className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Search factors" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))}><option value="">All scopes</option><option value="1">Scope 1</option><option value="2">Scope 2</option><option value="3">Scope 3</option></select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}><option value="">All types</option><option value="custom">Custom</option><option value="official">Official</option><option value="sample">Sample</option></select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            <Input placeholder="Country/Region" value={filters.country} onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value }))} />
            <Input placeholder="Region" value={filters.region} onChange={(event) => setFilters((current) => ({ ...current, region: event.target.value }))} />
            <Input placeholder="Activity unit" value={filters.activityUnit} onChange={(event) => setFilters((current) => ({ ...current, activityUnit: event.target.value }))} />
            <Input placeholder="Source year" value={filters.sourceYear} onChange={(event) => setFilters((current) => ({ ...current, sourceYear: event.target.value.replace(/\D/g, "") }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground"><tr><th className="px-4 py-3">Factor Key</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Country/Region</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">
                {loading ? <tr><td colSpan={10} className="px-6 py-6 text-center text-muted-foreground">Loading factors...</td></tr> : null}
                {!loading && factors.length === 0 ? <tr><td colSpan={10} className="px-6 py-6 text-center text-muted-foreground">{filters.type ? `No ${filters.type} factors found.` : "No factors found for the current filters."}</td></tr> : null}
                {factors.map((factor) => <tr key={factor.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{factor.factorKey}</td>
                  <td className="px-4 py-3">Scope {factor.scope}</td>
                  <td className="px-4 py-3">{factor.category}</td>
                  <td className="px-4 py-3">{factor.activityType}<div className="text-xs text-muted-foreground">{factor.activityUnit}</div></td>
                  <td className="px-4 py-3">{factor.factorValue ?? factor.value} {factor.factorUnit}</td>
                  <td className="px-4 py-3">{factor.sourceName || "Unspecified"} {factor.sourceYear || ""}<div className="text-xs text-muted-foreground">{[factor.sourceUrl, factor.methodology, factor.version].filter(Boolean).join(" - ")}</div></td>
                  <td className="px-4 py-3">{[factor.country || "GLOBAL", factor.region || "GLOBAL"].filter(Boolean).join(" / ")}</td>
                  <td className="px-4 py-3"><FactorBadge factor={factor} /></td>
                  <td className="px-4 py-3"><span className={factor.isActive ? "text-primary" : "text-muted-foreground"}>{factor.isActive ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {canViewAudit && !String(factor.id).startsWith("sample:") ? <Button asChild size="sm" variant="ghost"><Link to={`/app/audit-logs?entityType=EmissionFactor&entityId=${factor.id}`}>Audit history</Link></Button> : null}
                      {canManage && factor.canEdit ? <><Button size="sm" variant="ghost" onClick={() => edit(factor)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => changeStatus(factor)}>{factor.isActive ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}{factor.isActive ? "Deactivate" : "Reactivate"}</Button></> : <span className="self-center text-xs text-muted-foreground">Read-only</span>}
                    </div>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function ReadOnlyNotice({ message }: { message: string }) {
  return <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{message}</div>;
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ImportPreview({ rows }: { rows: FactorImportPreview["rows"] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="border-b bg-muted text-muted-foreground"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Factor</th><th className="px-3 py-2">Messages</th></tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.rowNumber}>
              <td className="px-3 py-2">{row.rowNumber}</td>
              <td className="px-3 py-2">{row.valid ? <span className="text-primary">Valid</span> : <span className="text-destructive">Invalid</span>}</td>
              <td className="px-3 py-2">{[row.payload.scope ? `Scope ${row.payload.scope}` : "", row.payload.category, row.payload.factorKey].filter(Boolean).join(" / ")}</td>
              <td className="px-3 py-2">{[...(row.errors || []), ...(row.warnings || [])].join(" ") || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getFactorType(factor: ManagedEmissionFactor) {
  const hasOfficialMetadata = Boolean(factor.isOfficial && factor.sourceName && factor.sourceYear);
  if (factor.isSample) return "Sample";
  if (factor.isCustom || factor.companyId) return "Custom";
  if (hasOfficialMetadata) return "Official";
  return "Configured";
}

function FactorBadge({ factor }: { factor: ManagedEmissionFactor }) {
  const label = getFactorType(factor);
  const classes = label === "Sample" ? "bg-amber-100 text-amber-800" : label === "Custom" ? "bg-blue-100 text-blue-800" : label === "Official" ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{label}</span>;
}
