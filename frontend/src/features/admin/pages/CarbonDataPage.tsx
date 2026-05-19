import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Edit, Loader2, Plus, Search, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { adminService } from "../services/adminService";
import type { EmissionFactor } from "../types";

const emptyForm: Partial<EmissionFactor> = {
  name: "",
  scope: 1,
  category: "",
  activityType: "",
  factorKey: "",
  activityUnit: "",
  factorValue: 0,
  factorUnit: "kgCO2e/unit",
  sourceName: "",
  sourceYear: new Date().getUTCFullYear(),
  country: "",
  region: "GLOBAL",
  version: "v1",
  effectiveFrom: "",
  effectiveTo: "",
  isSample: false,
  isActive: true,
};

export function CarbonDataPage() {
  const [factors, setFactors] = useState<EmissionFactor[]>([]);
  const [filters, setFilters] = useState({ search: "", scope: "", category: "", factorKey: "", source: "", sourceYear: "", country: "", isSample: "", isActive: "" });
  const [form, setForm] = useState<Partial<EmissionFactor>>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "100" });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `?${params.toString()}`;
  }, [filters]);

  const loadFactors = async () => {
    try {
      setError(null);
      const response = await adminService.getEmissionFactors(query);
      setFactors(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load emission factors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFactors();
  }, [query]);

  const editFactor = (factor: EmissionFactor) => {
    setEditingId(factor.id);
    setForm({
      ...factor,
      activityUnit: factor.activityUnit || factor.unit,
      factorValue: factor.factorValue ?? factor.value,
      sourceName: factor.sourceName || factor.source || "",
      effectiveFrom: factor.effectiveFrom ? factor.effectiveFrom.slice(0, 10) : "",
      effectiveTo: factor.effectiveTo ? factor.effectiveTo.slice(0, 10) : "",
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const submitFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      setError(null);
      const payload = {
        ...form,
        scope: Number(form.scope) as 1 | 2 | 3,
        factorValue: Number(form.factorValue),
        sourceYear: Number(form.sourceYear),
        isSample: Boolean(form.isSample),
      };

      if (editingId) {
        await adminService.updateEmissionFactor(editingId, payload);
      } else {
        await adminService.createEmissionFactor(payload);
      }

      resetForm();
      await loadFactors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save emission factor");
    } finally {
      setSaving(false);
    }
  };

  const deactivateFactor = async (id: string) => {
    setSaving(true);
    try {
      await adminService.deactivateEmissionFactor(id);
      await loadFactors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate emission factor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Emission Factor Library</h2>
        <p className="text-muted-foreground">Manage sample, official, and custom factors for enterprise carbon calculations.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Sample factors are placeholders. Do not present them as official DEFRA/EPA/IPCC/GHG Protocol data.</div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Factor" : "Create Factor"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitFactor}>
            <Field label="Name"><Input value={form.name || ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
            <Field label="Scope">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: Number(event.target.value) as 1 | 2 | 3 }))}>
                <option value={1}>Scope 1</option>
                <option value={2}>Scope 2</option>
                <option value={3}>Scope 3</option>
              </select>
            </Field>
            <Field label="Category"><Input value={form.category || ""} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} required /></Field>
            <Field label="Activity Type"><Input value={form.activityType || ""} onChange={(event) => setForm((current) => ({ ...current, activityType: event.target.value }))} required /></Field>
            <Field label="Factor Key"><Input value={form.factorKey || ""} onChange={(event) => setForm((current) => ({ ...current, factorKey: event.target.value }))} placeholder="DIESEL, US, WASTE_LANDFILL_KG" /></Field>
            <Field label="Activity Unit"><Input value={form.activityUnit || ""} onChange={(event) => setForm((current) => ({ ...current, activityUnit: event.target.value }))} required /></Field>
            <Field label="Factor Value"><Input type="number" min="0" step="0.000001" value={form.factorValue ?? 0} onChange={(event) => setForm((current) => ({ ...current, factorValue: Number(event.target.value) }))} required /></Field>
            <Field label="Factor Unit"><Input value={form.factorUnit || ""} onChange={(event) => setForm((current) => ({ ...current, factorUnit: event.target.value }))} required /></Field>
            <Field label="Source Name"><Input value={form.sourceName || ""} onChange={(event) => setForm((current) => ({ ...current, sourceName: event.target.value }))} required /></Field>
            <Field label="Source Year"><Input type="number" value={form.sourceYear ?? ""} onChange={(event) => setForm((current) => ({ ...current, sourceYear: Number(event.target.value) }))} required /></Field>
            <Field label="Country"><Input value={form.country || ""} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} /></Field>
            <Field label="Region"><Input value={form.region || ""} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} /></Field>
            <Field label="Version"><Input value={form.version || ""} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /></Field>
            <Field label="Effective From"><Input type="date" value={form.effectiveFrom || ""} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></Field>
            <Field label="Effective To"><Input type="date" value={form.effectiveTo || ""} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value }))} /></Field>
            <label className="flex items-center gap-2 pt-7 text-sm">
              <input type="checkbox" checked={Boolean(form.isSample)} onChange={(event) => setForm((current) => ({ ...current, isSample: event.target.checked }))} />
              Sample factor
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{editingId ? "Save" : "Create"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Factors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Input placeholder="Search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))}>
              <option value="">All scopes</option>
              <option value="1">Scope 1</option>
              <option value="2">Scope 2</option>
              <option value="3">Scope 3</option>
            </select>
            <Input placeholder="Category" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} />
            <Input placeholder="Factor key" value={filters.factorKey} onChange={(event) => setFilters((current) => ({ ...current, factorKey: event.target.value }))} />
            <Input placeholder="Source" value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} />
            <Input placeholder="Year" value={filters.sourceYear} onChange={(event) => setFilters((current) => ({ ...current, sourceYear: event.target.value }))} />
            <Input placeholder="Country" value={filters.country} onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value }))} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.isSample} onChange={(event) => setFilters((current) => ({ ...current, isSample: event.target.value }))}>
              <option value="">Sample/official</option>
              <option value="true">Sample</option>
              <option value="false">Official/custom</option>
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.isActive} onChange={(event) => setFilters((current) => ({ ...current, isActive: event.target.value }))}>
              <option value="">Any status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
            <Button variant="outline" type="button" onClick={loadFactors}><Search className="mr-2 h-4 w-4" />Filter</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Factor</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Region</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={10} className="px-6 py-6 text-center text-muted-foreground">Loading factors...</td></tr>
                ) : factors.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-6 text-center text-muted-foreground">No emission factors found.</td></tr>
                ) : factors.map((factor) => (
                  <tr key={factor.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium text-foreground">{factor.name}</td>
                    <td className="px-4 py-3">Scope {factor.scope}</td>
                    <td className="px-4 py-3">{factor.category}</td>
                    <td className="px-4 py-3">{factor.activityType} / {factor.activityUnit || factor.unit}</td>
                    <td className="px-4 py-3">{factor.factorKey || "-"}</td>
                    <td className="px-4 py-3">{factor.factorValue ?? factor.value} {factor.factorUnit}</td>
                    <td className="px-4 py-3">{factor.sourceName || factor.source} {factor.sourceYear}</td>
                    <td className="px-4 py-3">{factor.country || factor.region || "GLOBAL"}</td>
                    <td className="px-4 py-3">
                      <span className={factor.isSample ? "rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800" : "rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800"}>
                        {factor.isSample ? "Sample" : factor.companyId ? "Custom" : "Official"}
                      </span>
                      <span className={factor.isActive ? "ml-2 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary" : "ml-2 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"}>
                        {factor.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => editFactor(factor)}><Edit className="mr-2 h-4 w-4" />Edit</Button>
                      {factor.isActive && <Button size="sm" variant="ghost" onClick={() => deactivateFactor(factor.id)}><XCircle className="mr-2 h-4 w-4" />Deactivate</Button>}
                    </td>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
