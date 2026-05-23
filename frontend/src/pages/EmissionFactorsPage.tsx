import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Database, Loader2, Search, Upload, XCircle } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useAuth } from "@/src/hooks/useAuth";
import { hasPermission } from "@/src/utils/permissions";
import { PermissionDenied } from "@/src/components/shared/PermissionDenied";
import { factorLibraryService, type FactorPayload, type ManagedEmissionFactor, type FactorImportPreview } from "@/src/services/factorLibraryService";

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
  const [factors, setFactors] = useState<ManagedEmissionFactor[]>([]);
  const [filters, setFilters] = useState({ search: "", scope: "", status: "" });
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
    if (filters.status === "custom") params.set("isCustom", "true");
    if (filters.status === "official") params.set("isOfficial", "true");
    if (filters.status === "sample") params.set("isSample", "true");
    return `?${params.toString()}`;
  }, [filters]);

  const loadFactors = async () => {
    setLoading(true);
    try {
      setError(null);
      const response = await factorLibraryService.list(query);
      setFactors(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load emission factors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void loadFactors();
  }, [canView, query]);

  if (!canView) return <PermissionDenied />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, factorValue: Number(form.factorValue), sourceYear: Number(form.sourceYear), scope: Number(form.scope) as 1 | 2 | 3 };
      if (editingId) await factorLibraryService.update(editingId, payload);
      else await factorLibraryService.create(payload);
      setForm(emptyForm);
      setEditingId(null);
      await loadFactors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save emission factor");
    } finally {
      setSaving(false);
    }
  };

  const edit = (factor: ManagedEmissionFactor) => {
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
      setPreview(await factorLibraryService.previewImport(csv));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setSaving(false);
    }
  };

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
          {!canManage ? <PermissionDenied /> : (
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>CSV Import</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!canManage ? <PermissionDenied /> : (
            <>
              <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="scope,category,activityType,factorKey,activityUnit,factorValue,factorUnit,sourceName,sourceYear,sourceUrl,country,region,version,effectiveFrom,effectiveTo,isOfficial,isCustom" />
              <div className="flex gap-2"><Button type="button" variant="outline" onClick={previewCsv} disabled={!csv.trim() || saving}><Search className="mr-2 h-4 w-4" />Preview</Button><Button type="button" onClick={commitCsv} disabled={!preview?.validRows || saving}><Upload className="mr-2 h-4 w-4" />Save Valid Rows</Button></div>
              {preview ? <div className="text-sm text-muted-foreground">Rows: {preview.totalRows}. Valid: {preview.validRows}. Invalid: {preview.invalidRows}. Duplicate warnings: {preview.duplicateWarnings || 0}. Created: {preview.createdCount || 0}.</div> : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Factor Library</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Search factors" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))}><option value="">All scopes</option><option value="1">Scope 1</option><option value="2">Scope 2</option><option value="3">Scope 3</option></select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option><option value="custom">Custom</option><option value="official">Official</option><option value="sample">Sample</option></select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground"><tr><th className="px-4 py-3">Factor</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-border">
                {loading ? <tr><td colSpan={6} className="px-6 py-6 text-center text-muted-foreground">Loading factors...</td></tr> : null}
                {!loading && factors.length === 0 ? <tr><td colSpan={6} className="px-6 py-6 text-center text-muted-foreground">No custom emission factors yet. Add a company custom factor or use official/global factors where available.</td></tr> : null}
                {factors.map((factor) => <tr key={factor.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{factor.factorKey}<div className="text-xs text-muted-foreground">Scope {factor.scope} - {factor.category}</div></td>
                  <td className="px-4 py-3">{factor.activityType}<div className="text-xs text-muted-foreground">{factor.activityUnit}</div></td>
                  <td className="px-4 py-3">{factor.factorValue ?? factor.value} {factor.factorUnit}</td>
                  <td className="px-4 py-3">{factor.sourceName} {factor.sourceYear}<div className="text-xs text-muted-foreground">{[factor.sourceUrl, factor.methodology, factor.country || factor.region, factor.version].filter(Boolean).join(" - ")}</div></td>
                  <td className="px-4 py-3"><FactorBadge factor={factor} /> <span className={factor.isActive ? "ml-2 text-primary" : "ml-2 text-muted-foreground"}>{factor.isActive ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost"><Link to={`/app/audit-logs?entityType=EmissionFactor&entityId=${factor.id}`}>Audit history</Link></Button>
                      {canManage && factor.canEdit ? <><Button size="sm" variant="ghost" onClick={() => edit(factor)}>Edit</Button>{factor.isActive ? <Button size="sm" variant="ghost" onClick={() => factorLibraryService.deactivate(factor.id).then(loadFactors)}><XCircle className="mr-1 h-3 w-3" />Deactivate</Button> : <Button size="sm" variant="ghost" onClick={() => factorLibraryService.reactivate(factor.id).then(loadFactors)}><CheckCircle2 className="mr-1 h-3 w-3" />Reactivate</Button>}</> : <span className="self-center text-xs text-muted-foreground">Read-only</span>}
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

function FactorBadge({ factor }: { factor: ManagedEmissionFactor }) {
  const label = factor.isSample ? "Sample" : factor.isCustom ? "Custom" : "Official";
  const classes = factor.isSample ? "bg-amber-100 text-amber-800" : factor.isCustom ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>{label}</span>;
}
