import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { SupplierBadge } from "@/src/components/suppliers/SupplierBadge";
import { SupplierScoreCard } from "@/src/components/suppliers/SupplierScoreCard";
import {
  supplierService,
  type SupplierPayload,
  type SupplierScorePayload,
} from "@/src/services/supplierService";
import { socketService } from "@/src/services/socketService";
import type {
  Supplier,
  SupplierScoreResult,
} from "@/src/types/platform";

const initialForm: SupplierPayload = {
  name: "",
  contactEmail: "",
  country: "US",
  region: "",
  category: "Manufacturing",
  emissionFactor: 1.2,
  emissionIntensity: 1.2,
  complianceScore: 80,
  verificationStatus: "PENDING",
  onTimeDeliveryRate: 95,
  renewableRatio: 0.2,
  complianceFlags: 0,
  totalEmissions: 1000,
  revenue: 1000,
  hasISO14001: false,
  hasSBTi: false,
  dataTransparencyScore: 70,
  lastReportedAt: null,
  invitationStatus: "SENT",
  notes: "",
};

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierPayload>(initialForm);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scorePreview, setScorePreview] = useState<SupplierScoreResult | null>(null);
  const [error, setError] = useState("");

  const loadSuppliers = async (query = search) => {
    try {
      setLoading(true);
      setError("");
      const response = await supplierService.getSuppliers(`?search=${encodeURIComponent(query)}&pageSize=20`);
      setSuppliers(response.data);
      setSelectedSupplierId((current) => (
        current && response.data.some((item) => item.id === current)
          ? current
          : response.data[0]?.id ?? null
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers("");
    const unsubscribers = [
      socketService.on("supplierCreated", () => loadSuppliers(search)),
      socketService.on("supplierUpdated", () => loadSuppliers(search)),
      socketService.on("supplierDeleted", () => loadSuppliers(search)),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const shouldPreview = form.name.trim().length >= 2;

    if (!shouldPreview) {
      setScorePreview(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setPreviewLoading(true);
        const preview = await supplierService.scoreSupplier(buildScorePreviewPayload(form, editingId));

        if (!cancelled) {
          setScorePreview(preview);
        }
      } catch {
        if (!cancelled) {
          setScorePreview(null);
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    editingId,
    form.category,
    form.dataTransparencyScore,
    form.emissionFactor,
    form.emissionIntensity,
    form.hasISO14001,
    form.hasSBTi,
    form.lastReportedAt,
    form.name,
    form.revenue,
    form.totalEmissions,
  ]);

  const selectedSupplier = useMemo(
    () => suppliers.find((item) => item.id === selectedSupplierId) ?? suppliers[0] ?? null,
    [selectedSupplierId, suppliers],
  );

  const activeScoreResult = scorePreview ?? (selectedSupplier ? getSupplierScore(selectedSupplier) : null);

  const stats = useMemo(() => {
    const averageScore = suppliers.length
      ? suppliers.reduce((sum, item) => sum + getSupplierScore(item).totalScore, 0) / suppliers.length
      : 0;

    return {
      total: suppliers.length,
      averageScore: averageScore.toFixed(2),
      highRisk: suppliers.filter((item) => getSupplierScore(item).riskLevel === "HIGH").length,
      avgTransparency: suppliers.length
        ? Math.round(suppliers.reduce((sum, item) => sum + (item.dataTransparencyScore ?? 0), 0) / suppliers.length)
        : 0,
    };
  }, [suppliers]);

  const submitSupplier = async () => {
    try {
      setError("");
      if (editingId) {
        await supplierService.updateSupplier(editingId, form);
      } else {
        await supplierService.createSupplier(form);
      }
      setEditingId(null);
      setForm(initialForm);
      setScorePreview(null);
      await loadSuppliers(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save supplier");
    }
  };

  const editSupplier = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setSelectedSupplierId(supplier.id);
    setForm({
      name: supplier.name,
      contactEmail: supplier.contactEmail,
      country: supplier.country,
      region: supplier.region,
      category: supplier.category,
      emissionFactor: supplier.emissionFactor,
      emissionIntensity: supplier.emissionIntensity,
      complianceScore: supplier.complianceScore,
      verificationStatus: supplier.verificationStatus,
      onTimeDeliveryRate: supplier.onTimeDeliveryRate,
      renewableRatio: supplier.renewableRatio,
      complianceFlags: supplier.complianceFlags,
      totalEmissions: supplier.totalEmissions,
      revenue: supplier.revenue ?? 0,
      hasISO14001: supplier.hasISO14001,
      hasSBTi: supplier.hasSBTi,
      dataTransparencyScore: supplier.dataTransparencyScore ?? 0,
      lastReportedAt: supplier.lastReportedAt ? supplier.lastReportedAt.slice(0, 10) : null,
      invitationStatus: supplier.invitationStatus,
      notes: supplier.notes || "",
    });
  };

  const deleteSupplier = async (supplier: Supplier) => {
    try {
      setError("");
      await supplierService.deleteSupplier(supplier.id);
      if (editingId === supplier.id) {
        setEditingId(null);
        setForm(initialForm);
        setScorePreview(null);
      }
      await loadSuppliers(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete supplier");
    }
  };

  const inviteSupplier = async (supplier: Supplier) => {
    try {
      setError("");
      await supplierService.updateSupplier(supplier.id, { invitationStatus: "SENT" });
      await loadSuppliers(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send supplier invitation");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Supplier Risk & ESG Engine</h1>
          <p className="text-muted-foreground">
            Score supplier emissions, certifications, transparency, and benchmark performance with explainable risk outputs.
          </p>
        </div>
        <div className="flex gap-2">
          {editingId ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setForm(initialForm);
                setScorePreview(null);
              }}
            >
              Cancel Edit
            </Button>
          ) : null}
          <Button onClick={submitSupplier}>
            <Users className="mr-2 h-4 w-4" />
            {editingId ? "Update Supplier" : "Add Supplier"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Suppliers" value={stats.total} icon={Users} />
        <StatCard title="Average ESG Score" value={`${stats.averageScore} / 100`} icon={ShieldCheck} />
        <StatCard title="High Risk Suppliers" value={stats.highRisk} icon={AlertTriangle} />
        <StatCard title="Avg Transparency" value={`${stats.avgTransparency} / 100`} icon={BarChart3} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{editingId ? "Edit Supplier Profile" : "Create Supplier Profile"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              ESG preview updates automatically. When emissions and revenue are both present, intensity is recalculated from the auditable base data.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Name">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Acme Components"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </Field>
            <Field label="Contact Email">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="sustainability@supplier.com"
                value={form.contactEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
              />
            </Field>
            <Field label="Country">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="US"
                value={form.country}
                onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
              />
            </Field>
            <Field label="Region">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="North America"
                value={form.region}
                onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
              />
            </Field>
            <Field label="Category">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Manufacturing"
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              />
            </Field>
            <Field label="Total Emissions (tCO2e)">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                value={form.totalEmissions}
                onChange={(event) => setForm((prev) => ({ ...prev, totalEmissions: Number(event.target.value) }))}
              />
            </Field>
            <Field label="Revenue / Activity Base">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                value={form.revenue ?? 0}
                onChange={(event) => setForm((prev) => ({ ...prev, revenue: Number(event.target.value) }))}
              />
            </Field>
            <Field label="Emission Intensity">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                step="0.0001"
                value={form.emissionIntensity ?? form.emissionFactor}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setForm((prev) => ({
                    ...prev,
                    emissionIntensity: nextValue,
                    emissionFactor: nextValue,
                  }));
                }}
              />
            </Field>
            <Field label="Transparency Score">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                max={100}
                value={form.dataTransparencyScore}
                onChange={(event) => setForm((prev) => ({ ...prev, dataTransparencyScore: Number(event.target.value) }))}
              />
            </Field>
            <Field label="Compliance Proxy">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                max={100}
                value={form.complianceScore ?? 80}
                onChange={(event) => setForm((prev) => ({ ...prev, complianceScore: Number(event.target.value) }))}
              />
            </Field>
            <Field label="Last Reported At">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="date"
                value={form.lastReportedAt ?? ""}
                onChange={(event) => setForm((prev) => ({ ...prev, lastReportedAt: event.target.value || null }))}
              />
            </Field>
            <Field label="Verification Status">
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.verificationStatus}
                onChange={(event) => setForm((prev) => ({ ...prev, verificationStatus: event.target.value as Supplier["verificationStatus"] }))}
              >
                <option value="PENDING">Pending</option>
                <option value="VERIFIED">Verified</option>
                <option value="ACTION_REQUIRED">Action Required</option>
              </select>
            </Field>
            <Field label="Invitation Status">
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.invitationStatus}
                onChange={(event) => setForm((prev) => ({ ...prev, invitationStatus: event.target.value as Supplier["invitationStatus"] }))}
              >
                <option value="SENT">Sent</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="NOT_SENT">Not Sent</option>
              </select>
            </Field>

            <Field label="ESG Certifications" className="md:col-span-2 xl:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.hasISO14001}
                    onChange={(event) => setForm((prev) => ({ ...prev, hasISO14001: event.target.checked }))}
                  />
                  ISO 14001 certified
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.hasSBTi}
                    onChange={(event) => setForm((prev) => ({ ...prev, hasSBTi: event.target.checked }))}
                  />
                  SBTi commitment
                </label>
              </div>
            </Field>

            <Field label="Notes" className="md:col-span-2 xl:col-span-4">
              <textarea
                className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Optional supplier notes, audit context, or engagement actions."
                value={form.notes || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {scorePreview ? "Live preview is active" : "Showing selected supplier"}
            </div>
            <div className="mt-1">
              {previewLoading
                ? "Refreshing the normalized ESG score and benchmark breakdown..."
                : "The card reflects the latest weighted score, risk level, and explainability output."}
            </div>
          </div>
          <SupplierScoreCard
            title={scorePreview ? "Live ESG Preview" : "Supplier Scorecard"}
            subtitle={scorePreview
              ? "Previewing the current form state before you save it."
              : "Selected supplier performance across emissions, certifications, and transparency."}
            supplierName={scorePreview ? form.name || "Supplier preview" : selectedSupplier?.name}
            scoreResult={activeScoreResult}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Supplier Directory</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a supplier to inspect the explainable scorecard and benchmark performance.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search suppliers..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onBlur={() => loadSuppliers(search)}
              className="h-9 rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">ESG Score</th>
                  <th className="px-6 py-3 font-medium">Benchmark</th>
                  <th className="px-6 py-3 font-medium">Emissions</th>
                  <th className="px-6 py-3 font-medium">Last Reported</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-muted-foreground">
                      Loading suppliers...
                    </td>
                  </tr>
                ) : suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-muted-foreground">
                      No suppliers found.
                    </td>
                  </tr>
                ) : suppliers.map((supplier) => {
                  const score = getSupplierScore(supplier);
                  const isSelected = supplier.id === selectedSupplier?.id;

                  return (
                    <tr
                      key={supplier.id}
                      className={isSelected ? "bg-primary/5" : "hover:bg-muted/50"}
                      onClick={() => setSelectedSupplierId(supplier.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{supplier.name}</div>
                        <div className="text-xs text-muted-foreground">{supplier.contactEmail}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div>{supplier.category}</div>
                        <div className="text-xs text-muted-foreground">{supplier.country}</div>
                      </td>
                      <td className="px-6 py-4">
                        <SupplierBadge score={score.totalScore} riskLevel={score.riskLevel} />
                      </td>
                      <td className="px-6 py-4">
                        <div>{score.benchmark.industryComparison.replaceAll("_", " ")}</div>
                        <div className="text-xs text-muted-foreground">
                          Percentile {score.benchmark.percentileRank === null ? "N/A" : Math.round(score.benchmark.percentileRank)}
                        </div>
                      </td>
                      <td className="px-6 py-4">{supplier.totalEmissions.toLocaleString()} tCO2e</td>
                      <td className="px-6 py-4">{formatLastReportedAt(supplier.lastReportedAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void inviteSupplier(supplier);
                            }}
                          >
                            Invite
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              editSupplier(supplier);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteSupplier(supplier);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: typeof Users }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function buildScorePreviewPayload(form: SupplierPayload, editingId: string | null): SupplierScorePayload {
  const now = new Date().toISOString();

  return {
    id: editingId ?? undefined,
    name: form.name,
    totalEmissions: form.totalEmissions,
    revenue: form.revenue ?? null,
    emissionIntensity: form.emissionIntensity ?? form.emissionFactor,
    emissionFactor: form.emissionFactor,
    hasISO14001: form.hasISO14001,
    hasSBTi: form.hasSBTi,
    dataTransparencyScore: form.dataTransparencyScore,
    lastReportedAt: form.lastReportedAt || null,
    createdAt: now,
    updatedAt: now,
    category: form.category,
  };
}

function getSupplierScore(supplier: Supplier): SupplierScoreResult {
  return supplier.scoreResult ?? {
    supplierId: supplier.id,
    supplierName: supplier.name,
    totalScore: supplier.esgScore ?? supplier.carbonScore,
    riskLevel: supplier.riskLevel,
    riskTrend: supplier.riskTrend ?? null,
    emissionIntensity: supplier.emissionIntensity,
    intensitySource: "provided",
    breakdown: supplier.supplierScoreBreakdown ?? {
      emissionScore: 0,
      certificationScore: 0,
      transparencyScore: 0,
    },
    benchmark: supplier.supplierBenchmark ?? {
      industryKey: "default",
      industryLabel: supplier.category || "Cross-industry",
      industryAverageIntensity: 0,
      percentileRank: null,
      industryComparison: "UNKNOWN",
      isAboveIndustryAverage: null,
      variancePct: null,
    },
    insights: supplier.supplierScoreInsights ?? [],
    calculatedAt: supplier.scoreCalculatedAt ?? supplier.updatedAt ?? supplier.createdAt,
  };
}

function formatLastReportedAt(value?: string | null) {
  if (!value) {
    return "Not reported";
  }

  return new Date(value).toLocaleDateString();
}
