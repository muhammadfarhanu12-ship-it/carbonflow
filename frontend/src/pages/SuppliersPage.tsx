import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Eye,
  Pencil,
  RefreshCcw,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Archive,
  Users,
  Trophy,
  Mail,
  Clock,
  FileCheck2,
  Download,
  FileUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { SupplierBadge } from "@/src/components/suppliers/SupplierBadge";
import { SupplierScoreCard } from "@/src/components/suppliers/SupplierScoreCard";
import {
  supplierService,
  type SupplierSummary,
  type SupplierPayload,
  type SupplierScorePayload,
  type SupplierEvidencePayload,
} from "@/src/services/supplierService";
import { socketService } from "@/src/services/socketService";
import { useToast } from "@/src/components/providers/ToastProvider";
import { hasSupplierErrors, validateSupplierPayload, type SupplierFieldErrors } from "@/src/utils/supplierValidation";
import { NO_PERMISSION_MESSAGE, hasPermission } from "@/src/utils/permissions";
import { useAuth } from "@/src/hooks/useAuth";
import type {
  Supplier,
  SupplierBenchmark,
  SupplierBenchmarkComparison,
  SupplierEvidence,
  SupplierEvidenceStatus,
  SupplierEvidenceType,
  SupplierQuestionnaireStatus,
  SupplierScoreResult,
} from "@/src/types/platform";

const initialForm: SupplierPayload = {
  name: "",
  contactEmail: "",
  country: "",
  region: "",
  category: "",
  status: "draft",
  emissionFactor: 0,
  emissionIntensity: null,
  intensityUnit: "tCO2e/USD",
  complianceScore: 0,
  verificationStatus: "pending",
  onTimeDeliveryRate: 0,
  renewableRatio: 0,
  complianceFlags: 0,
  totalEmissions: 0,
  totalEmissionsTco2e: 0,
  revenue: null,
  revenueOrActivityBase: null,
  hasISO14001: false,
  hasSBTi: false,
  dataTransparencyScore: 0,
  lastReportedAt: null,
  invitationStatus: "not_sent",
  questionnaireStatus: "not_sent",
  questionnaireDueDate: null,
  certifications: [],
  notes: "",
};

const initialEvidenceForm: SupplierEvidencePayload = {
  evidenceType: "ghg_inventory",
  title: "",
  status: "requested",
  fileUrl: "",
  expiresAt: null,
  notes: "",
};

const EVIDENCE_TYPE_OPTIONS: Array<{ label: string; value: SupplierEvidenceType }> = [
  { label: "ISO 14001 certificate", value: "iso_14001_certificate" },
  { label: "SBTi commitment", value: "sbti_commitment" },
  { label: "GHG inventory", value: "ghg_inventory" },
  { label: "ESG report", value: "esg_report" },
  { label: "Audit report", value: "audit_report" },
  { label: "Utility/fuel data", value: "utility_fuel_data" },
  { label: "Carbon reduction plan", value: "carbon_reduction_plan" },
  { label: "Supplier questionnaire answers", value: "supplier_questionnaire_answers" },
  { label: "Other", value: "other" },
];

const demoSupplier: SupplierPayload = {
  ...initialForm,
  name: "Demo Supplier Components",
  contactEmail: "demo.sustainability@example.com",
  country: "US",
  region: "North America",
  category: "Manufacturing",
  totalEmissions: 1000,
  totalEmissionsTco2e: 1000,
  revenue: 1000000,
  revenueOrActivityBase: 1000000,
  emissionFactor: 1,
  emissionIntensity: 0.001,
  complianceScore: 80,
  verificationStatus: "self_reported",
  invitationStatus: "sent",
  dataTransparencyScore: 70,
  hasISO14001: true,
  certifications: ["ISO 14001"],
  notes: "Demo supplier data for preview only.",
};

export function SuppliersPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [benchmarkFilter, setBenchmarkFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierPayload>(initialForm);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scorePreview, setScorePreview] = useState<SupplierScoreResult | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SupplierFieldErrors>({});
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [questionnaireNotice, setQuestionnaireNotice] = useState("");
  const [evidence, setEvidence] = useState<SupplierEvidence[]>([]);
  const [evidenceForm, setEvidenceForm] = useState<SupplierEvidencePayload>(initialEvidenceForm);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceUploadProgress, setEvidenceUploadProgress] = useState(0);
  const [evidenceNotice, setEvidenceNotice] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const loadSuppliers = async (query = search) => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        search: query,
        pageSize: "20",
      });
      if (categoryFilter) params.set("category", categoryFilter);
      if (regionFilter) params.set("region", regionFilter);
      if (riskFilter) params.set("riskLevel", riskFilter);
      if (benchmarkFilter) params.set("benchmark", benchmarkFilter);
      const [supplierResult, summaryResult] = await Promise.allSettled([
        supplierService.getSuppliers(`?${params.toString()}`),
        supplierService.getSummary(),
      ]);
      const response = supplierResult.status === "fulfilled" ? supplierResult.value : { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } };
      const summaryResponse = summaryResult.status === "fulfilled" ? summaryResult.value : null;
      const supplierRows = Array.isArray(response.data) ? response.data : [];
      setSuppliers(supplierRows);
      setSummary(summaryResponse);
      setSelectedSupplierId((current) => (
        current && supplierRows.some((item) => item.id === current)
          ? current
          : supplierRows[0]?.id ?? null
      ));
      if (supplierResult.status === "rejected") {
        setError(toFriendlyApiError(supplierResult.reason, "Failed to load suppliers. Please check your session and try again."));
      } else if (summaryResult.status === "rejected") {
        setError("Supplier summary is temporarily unavailable. Directory data is still shown.");
      }
    } catch (err) {
      setError(toFriendlyApiError(err, "Failed to load suppliers"));
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
  const categoryOptions = useMemo(() => uniqueOptions(suppliers.map((supplier) => supplier.category)), [suppliers]);
  const regionOptions = useMemo(() => uniqueOptions(suppliers.map((supplier) => supplier.region).filter(Boolean)), [suppliers]);
  const canUpdateSupplier = hasPermission(user, "supplier:update");
  const canArchiveSupplier = hasPermission(user, "supplier:archive");
  const canSendQuestionnaire = hasPermission(user, "supplier:questionnaire:send");
  const canVerifyEvidence = hasPermission(user, "supplier:evidence:verify");

  const stats = useMemo(() => {
    const averageScore = suppliers.length
      ? suppliers.reduce((sum, item) => sum + getSupplierScore(item).totalScore, 0) / suppliers.length
      : 0;

    return {
      total: suppliers.length,
      averageScore: averageScore.toFixed(2),
      highRisk: suppliers.filter((item) => ["HIGH", "CRITICAL"].includes(getSupplierScore(item).riskLevel)).length,
      avgTransparency: suppliers.length
        ? Math.round(suppliers.reduce((sum, item) => sum + (item.dataTransparencyScore ?? 0), 0) / suppliers.length)
        : 0,
      verified: suppliers.filter((item) => ["third_party_verified", "VERIFIED"].includes(item.verificationStatus)).length,
      missingData: suppliers.filter((item) => Number(item.dataQualityScore || 0) < 70 || !item.lastReportedAt).length,
    };
  }, [suppliers]);
  const supplierIntelligence = summary?.supplierIntelligence;
  const summaryStats = summary ?? {
    total: stats.total,
    averageEsgScore: Number(stats.averageScore),
    averageTransparency: stats.avgTransparency,
    verified: stats.verified,
    invited: 0,
    highRisk: stats.highRisk,
    missingData: stats.missingData,
    totalEmissions: 0,
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setScorePreview(null);
    setFieldErrors({});
    setDemoLoaded(false);
  };

  const updateForm = <K extends keyof SupplierPayload>(key: K, value: SupplierPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submitSupplier = async (status: SupplierPayload["status"] = form.status || "draft") => {
    const payload: SupplierPayload = {
      ...form,
      status,
      totalEmissionsTco2e: form.totalEmissions,
      revenueOrActivityBase: form.revenue ?? null,
      certifications: [
        form.hasISO14001 ? "ISO 14001" : null,
        form.hasSBTi ? "SBTi" : null,
        ...(form.certifications || []).filter((item) => item !== "ISO 14001" && item !== "SBTi"),
      ].filter(Boolean) as string[],
    };
    const errors = validateSupplierPayload(payload);
    setFieldErrors(errors);

    if (hasSupplierErrors(errors)) {
      setError("Please fix the highlighted supplier fields before saving.");
      return;
    }

    try {
      setError("");
      let savedSupplier: Supplier;
      if (editingId) {
        savedSupplier = await supplierService.updateSupplier(editingId, payload);
      } else {
        savedSupplier = await supplierService.createSupplier(payload);
      }
      resetForm();
      await loadSuppliers(search);
      setSelectedSupplierId(savedSupplier.id);
      showToast({
        tone: "success",
        title: status === "draft" ? "Supplier draft saved" : "Supplier saved",
        description: `${savedSupplier.name} is now in the supplier directory.`,
      });
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
      status: supplier.status || "draft",
      emissionFactor: supplier.emissionFactor,
      emissionIntensity: supplier.emissionIntensity,
      intensityUnit: supplier.intensityUnit || "tCO2e/USD",
      complianceScore: supplier.complianceScore,
      verificationStatus: supplier.verificationStatus,
      onTimeDeliveryRate: supplier.onTimeDeliveryRate,
      renewableRatio: supplier.renewableRatio,
      complianceFlags: supplier.complianceFlags,
      totalEmissions: supplier.totalEmissions,
      totalEmissionsTco2e: supplier.totalEmissionsTco2e ?? supplier.totalEmissions,
      revenue: supplier.revenue ?? supplier.revenueOrActivityBase ?? null,
      revenueOrActivityBase: supplier.revenueOrActivityBase ?? supplier.revenue ?? null,
      hasISO14001: supplier.hasISO14001,
      hasSBTi: supplier.hasSBTi,
      dataTransparencyScore: supplier.dataTransparencyScore ?? 0,
      lastReportedAt: supplier.lastReportedAt ? supplier.lastReportedAt.slice(0, 10) : null,
      invitationStatus: supplier.invitationStatus,
      questionnaireStatus: normalizeQuestionnaireStatus(supplier.questionnaireStatus || supplier.invitationStatus),
      questionnaireDueDate: supplier.questionnaireDueDate ? supplier.questionnaireDueDate.slice(0, 10) : null,
      certifications: supplier.certifications || [],
      notes: supplier.notes || "",
    });
    setDemoLoaded(false);
    setFieldErrors({});
  };

  const archiveSupplier = async (supplier: Supplier) => {
    try {
      setError("");
      await supplierService.archiveSupplier(supplier.id);
      if (editingId === supplier.id) {
        resetForm();
      }
      await loadSuppliers(search);
      showToast({
        tone: "info",
        title: "Supplier archived",
        description: `${supplier.name} was archived and retained for audit history.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive supplier");
    }
  };

  const inviteSupplier = async (supplier: Supplier) => {
    try {
      setError("");
      await supplierService.updateSupplier(supplier.id, { invitationStatus: "sent", status: "invited" });
      await loadSuppliers(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send supplier invitation");
    }
  };

  const recalculateSupplierScore = async (supplier: Supplier) => {
    try {
      setError("");
      const updatedSupplier = await supplierService.recalculateScore(supplier.id);
      setSelectedSupplierId(updatedSupplier.id);
      await loadSuppliers(search);
      showToast({
        tone: "success",
        title: "Supplier score recalculated",
        description: `${updatedSupplier.name} scorecard has been refreshed.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate supplier score");
    }
  };

  const sendQuestionnaire = async (supplier: Supplier, resend = false) => {
    try {
      setError("");
      setQuestionnaireNotice("");
      const response = resend
        ? await supplierService.resendQuestionnaire(supplier.id, supplier.questionnaireDueDate)
        : await supplierService.sendQuestionnaire(supplier.id, supplier.questionnaireDueDate);
      await loadSuppliers(search);
      setSelectedSupplierId(supplier.id);
      const message = response.emailStatus?.message || (resend ? "Questionnaire reminder sent." : "Questionnaire created.");
      setQuestionnaireNotice(message);
      showToast({
        tone: response.emailStatus?.configured === false ? "info" : "success",
        title: resend ? "Questionnaire resent" : "Questionnaire ready",
        description: message,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send questionnaire");
    }
  };

  const updateQuestionnaireStatus = async (supplier: Supplier, status: "submitted" | "overdue") => {
    try {
      setError("");
      setQuestionnaireNotice("");
      const response = await supplierService.updateQuestionnaireStatus(supplier.id, status, supplier.questionnaireDueDate);
      await loadSuppliers(search);
      setSelectedSupplierId(supplier.id);
      setQuestionnaireNotice(`Questionnaire status updated to ${formatStatus(response.questionnaireStatus)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update questionnaire status");
    }
  };

  const viewQuestionnaireStatus = async (supplier: Supplier) => {
    try {
      setError("");
      const response = await supplierService.getQuestionnaire(supplier.id);
      setQuestionnaireNotice(`${response.supplierName}: ${formatStatus(response.questionnaireStatus)}. Due ${formatLastReportedAt(response.questionnaireDueDate)}. Reminders ${response.questionnaireReminderCount}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questionnaire status");
    }
  };

  useEffect(() => {
    if (!selectedSupplierId) {
      setEvidence([]);
      return;
    }

    let cancelled = false;
    supplierService.getEvidence(selectedSupplierId)
      .then((items) => {
        if (!cancelled) setEvidence(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (!cancelled) setEvidence([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSupplierId]);

  const createEvidence = async (status: SupplierEvidenceStatus = evidenceForm.status || "requested") => {
    if (!selectedSupplier) return;
    try {
      setActionLoading("evidence:create");
      setError("");
      setEvidenceNotice("");
      const payload = {
        ...evidenceForm,
        status,
        title: evidenceForm.title.trim() || evidenceTypeLabel(evidenceForm.evidenceType),
        fileUrl: evidenceForm.fileUrl || null,
      };
      await supplierService.createEvidence(selectedSupplier.id, payload);
      setEvidence(await supplierService.getEvidence(selectedSupplier.id));
      await loadSuppliers(search);
      setEvidenceForm(initialEvidenceForm);
      setEvidenceNotice(status === "requested" ? "Evidence request added." : "Evidence metadata added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save evidence");
    } finally {
      setActionLoading("");
    }
  };

  const uploadEvidenceFile = async () => {
    if (!selectedSupplier || !evidenceFile) return;
    try {
      setActionLoading("evidence:upload");
      setError("");
      setEvidenceNotice("");
      setEvidenceUploadProgress(0);
      await supplierService.uploadEvidence(
        selectedSupplier.id,
        {
          ...evidenceForm,
          title: evidenceForm.title.trim() || evidenceFile.name,
          status: "submitted",
        },
        evidenceFile,
        setEvidenceUploadProgress,
      );
      setEvidence(await supplierService.getEvidence(selectedSupplier.id));
      await loadSuppliers(search);
      setEvidenceForm(initialEvidenceForm);
      setEvidenceFile(null);
      setEvidenceUploadProgress(100);
      setEvidenceNotice("Evidence file uploaded.");
    } catch (err) {
      setError(toFriendlyApiError(err, "Failed to upload evidence file"));
    } finally {
      setActionLoading("");
    }
  };

  const verifyEvidence = async (item: SupplierEvidence) => {
    if (!selectedSupplier) return;
    try {
      setActionLoading(`evidence:verify:${item.id}`);
      await supplierService.verifyEvidence(selectedSupplier.id, item.id);
      setEvidence(await supplierService.getEvidence(selectedSupplier.id));
      await loadSuppliers(search);
    } catch (err) {
      setError(toFriendlyApiError(err, "Failed to verify evidence"));
    } finally {
      setActionLoading("");
    }
  };

  const rejectEvidence = async (item: SupplierEvidence) => {
    if (!selectedSupplier) return;
    try {
      setActionLoading(`evidence:reject:${item.id}`);
      await supplierService.rejectEvidence(selectedSupplier.id, item.id, "Rejected during supplier evidence review.");
      setEvidence(await supplierService.getEvidence(selectedSupplier.id));
      await loadSuppliers(search);
    } catch (err) {
      setError(toFriendlyApiError(err, "Failed to reject evidence"));
    } finally {
      setActionLoading("");
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
              onClick={resetForm}
            >
              Cancel Edit
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => {
            setForm(demoSupplier);
            setScorePreview(null);
            setFieldErrors({});
            setDemoLoaded(true);
          }}>
            <Sparkles className="mr-2 h-4 w-4" />
            Load Demo Supplier
          </Button>
          <Button variant="outline" onClick={resetForm}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reset Form
          </Button>
          <Button variant="outline" onClick={() => void submitSupplier("draft")}>
            Save as Draft
          </Button>
          <Button onClick={() => void submitSupplier(form.status === "draft" ? "submitted" : form.status)}>
            <Users className="mr-2 h-4 w-4" />
            {editingId ? "Save Supplier" : "Save Supplier"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {demoLoaded ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Demo supplier data — not real supplier information.
        </div>
      ) : null}

      {questionnaireNotice ? (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {questionnaireNotice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Suppliers" value={summaryStats.total} icon={Users} />
        <StatCard title="Average ESG Score" value={`${Number(summaryStats.averageEsgScore || 0).toFixed(2)} / 100`} icon={ShieldCheck} />
        <StatCard title="High Risk Suppliers" value={summaryStats.highRisk} icon={AlertTriangle} />
        <StatCard title="Avg Transparency" value={`${Math.round(summaryStats.averageTransparency || 0)} / 100`} icon={BarChart3} />
        <StatCard title="Verified Suppliers" value={summaryStats.verified} icon={Shield} />
        <StatCard title="Missing Data" value={summaryStats.missingData} icon={AlertTriangle} />
        <StatCard title="Suppliers Above Benchmark" value={supplierIntelligence?.suppliersAboveBenchmark ?? 0} icon={BarChart3} />
        <StatCard title="Missing Benchmarks" value={supplierIntelligence?.suppliersMissingBenchmarkData ?? 0} icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Intelligence Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <IntelligenceTile label="Best performing supplier" value={supplierIntelligence?.bestPerformingSupplier || "Not available"} />
          <IntelligenceTile label="Worst performing supplier" value={supplierIntelligence?.worstPerformingSupplier || "Not available"} />
          <IntelligenceTile
            label="Highest risk categories"
            value={supplierIntelligence?.categoriesWithHighestSupplierRisk?.length
              ? supplierIntelligence.categoriesWithHighestSupplierRisk.map((item) => item.category).join(", ")
              : "Not available"}
          />
          <IntelligenceTile label="Benchmark coverage" value={`${Math.max(0, suppliers.length - (supplierIntelligence?.suppliersMissingBenchmarkData ?? 0))}/${suppliers.length} suppliers`} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{editingId ? "Edit Supplier Profile" : "Create Supplier Profile"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              ESG preview updates automatically. When emissions and revenue are both present, intensity is recalculated from the auditable base data.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SectionTitle title="Supplier Identity" description="Core directory fields used for search, ownership, and engagement." />
            <Field label="Supplier Name" error={fieldErrors.name} helper="Legal or operating name of the supplier.">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Enter supplier name"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
              />
            </Field>
            <Field label="Contact Email" error={fieldErrors.contactEmail} helper="Optional sustainability or account owner email.">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="supplier@example.com"
                value={form.contactEmail}
                onChange={(event) => updateForm("contactEmail", event.target.value)}
              />
            </Field>
            <Field label="Country" error={fieldErrors.country}>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Enter country"
                value={form.country}
                onChange={(event) => updateForm("country", event.target.value)}
              />
            </Field>
            <Field label="Region" helper="Optional operating region.">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Enter region"
                value={form.region}
                onChange={(event) => updateForm("region", event.target.value)}
              />
            </Field>
            <Field label="Category" error={fieldErrors.category}>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. Manufacturing, Logistics"
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
              />
            </Field>
            <Field label="Supplier Status">
              <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status || "draft"} onChange={(event) => updateForm("status", event.target.value as SupplierPayload["status"])}>
                {["draft", "invited", "submitted", "under_review", "verified", "rejected", "needs_update", "approved", "high_risk"].map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
              </select>
            </Field>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SectionTitle title="Emissions & Intensity" description="Auditable emissions inputs used by the score preview." />
            <Field label="Total Emissions" error={fieldErrors.totalEmissions} helper="Annual supplier emissions in tCO2e.">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                placeholder="Enter tCO2e"
                value={form.totalEmissions || ""}
                onChange={(event) => updateForm("totalEmissions", Number(event.target.value))}
              />
            </Field>
            <Field label="Revenue / Activity Base" error={fieldErrors.revenue} helper="Used only when calculating intensity from base data.">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                placeholder="Enter base amount"
                value={form.revenue ?? ""}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  updateForm("revenue", value);
                  updateForm("revenueOrActivityBase", value);
                }}
              />
            </Field>
            <Field label="Emission Intensity" helper="Optional provided supplier intensity.">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                step="0.0001"
                placeholder="Enter intensity"
                value={form.emissionIntensity ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value === "" ? null : Number(event.target.value);
                  updateForm("emissionIntensity", nextValue);
                  updateForm("emissionFactor", Number(nextValue || 0));
                }}
              />
            </Field>
            <Field label="Intensity Unit">
              <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.intensityUnit || ""} onChange={(event) => updateForm("intensityUnit", event.target.value)} placeholder="e.g. tCO2e/USD" />
            </Field>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SectionTitle title="Transparency & Compliance" description="Confidence signals used by scoring and review workflows." />
            <Field label="Transparency Score" error={fieldErrors.dataTransparencyScore}>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                max={100}
                placeholder="0-100"
                value={form.dataTransparencyScore || ""}
                onChange={(event) => updateForm("dataTransparencyScore", Number(event.target.value))}
              />
            </Field>
            <Field label="Compliance Proxy" error={fieldErrors.complianceScore}>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="number"
                min={0}
                max={100}
                placeholder="0-100"
                value={form.complianceScore || ""}
                onChange={(event) => updateForm("complianceScore", Number(event.target.value))}
              />
            </Field>
            <Field label="Last Reported At" error={fieldErrors.lastReportedAt}>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="date"
                value={form.lastReportedAt ?? ""}
                onChange={(event) => updateForm("lastReportedAt", event.target.value || null)}
              />
            </Field>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SectionTitle title="Engagement Status" description="Verification, invitation, and workflow status." />
            <Field label="Verification Status" error={fieldErrors.verificationStatus}>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.verificationStatus}
                onChange={(event) => updateForm("verificationStatus", event.target.value as Supplier["verificationStatus"])}
              >
                <option value="pending">Pending</option>
                <option value="self_reported">Self reported</option>
                <option value="third_party_verified">Third-party verified</option>
                <option value="expired">Expired</option>
                <option value="rejected">Rejected</option>
              </select>
            </Field>
            <Field label="Invitation Status" error={fieldErrors.invitationStatus}>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.invitationStatus}
                onChange={(event) => updateForm("invitationStatus", event.target.value as Supplier["invitationStatus"])}
              >
                <option value="not_sent">Not sent</option>
                <option value="sent">Sent</option>
                <option value="opened">Opened</option>
                <option value="submitted">Submitted</option>
                <option value="overdue">Overdue</option>
              </select>
            </Field>
            <Field label="Questionnaire Due Date">
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                type="date"
                value={form.questionnaireDueDate ?? ""}
                onChange={(event) => updateForm("questionnaireDueDate", event.target.value || null)}
              />
            </Field>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <SectionTitle title="Certifications" description="Optional certifications for supplier scoring confidence." />
            <Field label="ESG Certifications" className="md:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.hasISO14001}
                    onChange={(event) => updateForm("hasISO14001", event.target.checked)}
                  />
                  ISO 14001 certified
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.hasSBTi}
                    onChange={(event) => updateForm("hasSBTi", event.target.checked)}
                  />
                  SBTi commitment
                </label>
              </div>
            </Field>
            </section>

            <section className="grid gap-4">
              <SectionTitle title="Notes" description="Internal context for reviews, follow-up, and audit history." />
            <Field label="Notes">
              <textarea
                className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Optional supplier notes, audit context, or engagement actions."
                value={form.notes || ""}
                onChange={(event) => updateForm("notes", event.target.value)}
              />
            </Field>
            </section>
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
          <SupplierEvidencePanel
            evidence={evidence}
            evidenceStatus={selectedSupplier?.evidenceStatus}
            form={evidenceForm}
            notice={evidenceNotice}
            onFormChange={setEvidenceForm}
            onCreate={() => void createEvidence("submitted")}
            onRequest={() => void createEvidence("requested")}
            onUpload={() => void uploadEvidenceFile()}
            onVerify={(item) => void verifyEvidence(item)}
            onReject={(item) => void rejectEvidence(item)}
            canVerifyEvidence={canVerifyEvidence}
            selectedFile={evidenceFile}
            uploadProgress={evidenceUploadProgress}
            onFileChange={setEvidenceFile}
            actionLoading={actionLoading}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Supplier Directory</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Backend-connected supplier directory scoped to your company.
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
          <div className="flex flex-wrap gap-2">
            <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} />
            <FilterSelect label="Region" value={regionFilter} onChange={setRegionFilter} options={regionOptions} />
            <FilterSelect label="Risk" value={riskFilter} onChange={setRiskFilter} options={["LOW", "MEDIUM", "HIGH", "CRITICAL"]} />
            <FilterSelect
              label="Benchmark"
              value={benchmarkFilter}
              onChange={setBenchmarkFilter}
              options={[
                { label: "Above benchmark", value: "above" },
                { label: "Below benchmark", value: "below" },
                { label: "Benchmark unavailable", value: "unavailable" },
              ]}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => loadSuppliers(search)}>Apply Filters</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Category</th>
                  <th className="px-6 py-3 font-medium">Country/Region</th>
                  <th className="px-6 py-3 font-medium">ESG Score</th>
                  <th className="px-6 py-3 font-medium">Risk Level</th>
                  <th className="px-6 py-3 font-medium">Emissions</th>
                  <th className="px-6 py-3 font-medium">Intensity</th>
                  <th className="px-6 py-3 font-medium">Benchmark</th>
                  <th className="px-6 py-3 font-medium">Percentile</th>
                  <th className="px-6 py-3 font-medium">Category Avg</th>
                  <th className="px-6 py-3 font-medium">Best-in-class</th>
                  <th className="px-6 py-3 font-medium">Verification</th>
                  <th className="px-6 py-3 font-medium">Invitation</th>
                  <th className="px-6 py-3 font-medium">Evidence</th>
                  <th className="px-6 py-3 font-medium">Due / Reminders</th>
                  <th className="px-6 py-3 font-medium">Last Reported</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={17} className="px-6 py-4 text-center text-muted-foreground">
                      Loading suppliers...
                    </td>
                  </tr>
                ) : suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="px-6 py-10 text-center">
                      <div className="mx-auto max-w-xl space-y-4">
                        <Users className="mx-auto h-10 w-10 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-foreground">No suppliers recorded yet.</p>
                          <p className="text-sm text-muted-foreground">Add your first supplier or load demo data to preview ESG scoring.</p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button type="button" onClick={resetForm}>Add Supplier</Button>
                          <Button type="button" variant="outline" onClick={() => {
                            setForm(demoSupplier);
                            setDemoLoaded(true);
                          }}>Load Demo Supplier</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : suppliers.map((supplier) => {
                  const score = getSupplierScore(supplier);
                  const benchmark = score.benchmark;
                  const isSelected = supplier.id === selectedSupplier?.id;

                  return (
                    <tr
                      key={supplier.id}
                      className={isSelected ? "bg-primary/5" : "hover:bg-muted/50"}
                      onClick={() => setSelectedSupplierId(supplier.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{supplier.name || "Unnamed supplier"}</div>
                        <div className="text-xs text-muted-foreground">{supplier.contactEmail || "No contact email"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div>{supplier.category || "Uncategorized"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div>{supplier.country || "Unknown country"}</div>
                        <div className="text-xs text-muted-foreground">{supplier.region || "Region not set"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <SupplierBadge score={score.totalScore} riskLevel={score.riskLevel} />
                      </td>
                      <td className="px-6 py-4">
                        {score.riskLevel || "Not scored"}
                      </td>
                      <td className="px-6 py-4">{Number(supplier.totalEmissionsTco2e ?? supplier.totalEmissions ?? 0).toLocaleString()} tCO2e</td>
                      <td className="px-6 py-4">{Number(supplier.emissionIntensity || 0).toLocaleString()} {supplier.intensityUnit || "tCO2e/USD"}</td>
                      <td className="px-6 py-4">
                        <BenchmarkBadge benchmark={benchmark} />
                      </td>
                      <td className="px-6 py-4">{benchmark.percentile === null || benchmark.percentile === undefined ? "Unavailable" : `${benchmark.percentile}%`}</td>
                      <td className="px-6 py-4">{formatBenchmarkComparison(benchmark.categoryComparison || benchmark.industryComparison)}</td>
                      <td className="px-6 py-4">
                        {benchmark.isBestInClass ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                            <Trophy className="h-3 w-3" />
                            Best
                          </span>
                        ) : "No"}
                      </td>
                      <td className="px-6 py-4">{formatStatus(supplier.verificationStatus)}</td>
                      <td className="px-6 py-4">
                        <QuestionnaireStatusBadge status={supplier.questionnaireStatus || supplier.invitationStatus} />
                        {isQuestionnaireOverdue(supplier) ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-red-700">
                            <Clock className="h-3 w-3" />
                            Overdue
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <EvidenceStatusBadge status={supplier.evidenceStatus || supplier.evidenceSummary?.indicator} />
                      </td>
                      <td className="px-6 py-4">
                        <div>{formatLastReportedAt(supplier.questionnaireDueDate)}</div>
                        <div className="text-xs text-muted-foreground">
                          Sent {formatLastReportedAt(supplier.questionnaireSentAt)} · {supplier.questionnaireReminderCount ?? 0} reminders
                        </div>
                        {isQuestionnaireOverdue(supplier) ? <div className="mt-1 text-xs font-medium text-red-700">Overdue</div> : null}
                        {supplier.lastReminderSentAt ? <div className="mt-1 text-xs font-medium text-sky-700">Reminder sent</div> : null}
                      </td>
                      <td className="px-6 py-4">{formatLastReportedAt(supplier.lastReportedAt)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedSupplierId(supplier.id);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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
                            disabled={!canSendQuestionnaire}
                            title={canSendQuestionnaire ? "Send Questionnaire" : NO_PERMISSION_MESSAGE}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!canSendQuestionnaire) return;
                              void sendQuestionnaire(supplier);
                            }}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canSendQuestionnaire}
                            title={canSendQuestionnaire ? "Resend Questionnaire" : NO_PERMISSION_MESSAGE}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!canSendQuestionnaire) return;
                              void sendQuestionnaire(supplier, true);
                            }}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canSendQuestionnaire}
                            title={canSendQuestionnaire ? "Mark submitted" : NO_PERMISSION_MESSAGE}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!canSendQuestionnaire) return;
                              void updateQuestionnaireStatus(supplier, "submitted");
                            }}
                          >
                            Submitted
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canSendQuestionnaire}
                            title={canSendQuestionnaire ? "Mark overdue" : NO_PERMISSION_MESSAGE}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!canSendQuestionnaire) return;
                              void updateQuestionnaireStatus(supplier, "overdue");
                            }}
                          >
                            Overdue
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void viewQuestionnaireStatus(supplier);
                            }}
                          >
                            Status
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void recalculateSupplierScore(supplier);
                            }}
                          >
                            Score
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canUpdateSupplier}
                            title={canUpdateSupplier ? "Edit supplier" : NO_PERMISSION_MESSAGE}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!canUpdateSupplier) return;
                              editSupplier(supplier);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={!canArchiveSupplier}
                            title={canArchiveSupplier ? "Archive supplier" : NO_PERMISSION_MESSAGE}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!canArchiveSupplier) return;
                              void archiveSupplier(supplier);
                            }}
                          >
                            <Archive className="h-4 w-4" />
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

function IntelligenceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { label: string; value: string }>;
}) {
  return (
    <select
      aria-label={label}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{label}</option>
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value;
        const optionLabel = typeof option === "string" ? option : option.label;
        return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
      })}
    </select>
  );
}

function BenchmarkBadge({ benchmark }: { benchmark: SupplierBenchmark }) {
  if (benchmark.isBenchmarkAvailable === false || benchmark.benchmarkLabel === "UNAVAILABLE") {
    return <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Unavailable</span>;
  }

  const label = benchmark.benchmarkLabel || benchmark.categoryComparison || benchmark.industryComparison;
  const classes = label === "ABOVE_AVERAGE"
    ? "bg-red-50 text-red-700"
    : label === "BELOW_AVERAGE"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{formatBenchmarkComparison(label)}</span>;
}

export function QuestionnaireStatusBadge({ status }: { status?: string | null }) {
  const normalized = String(status || "not_sent").toLowerCase();
  const classes = normalized === "submitted"
    ? "bg-emerald-50 text-emerald-700"
    : normalized === "overdue" || normalized === "expired"
      ? "bg-red-50 text-red-700"
      : normalized === "sent" || normalized === "opened"
        ? "bg-sky-50 text-sky-700"
        : "bg-muted text-muted-foreground";

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{formatStatus(normalized)}</span>;
}

export function EvidenceStatusBadge({ status }: { status?: string | null }) {
  const normalized = String(status || "missing").toLowerCase();
  const classes = normalized === "complete"
    ? "bg-emerald-50 text-emerald-700"
    : normalized === "expired"
      ? "bg-red-50 text-red-700"
      : normalized === "under_review"
        ? "bg-amber-50 text-amber-700"
        : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{formatStatus(normalized)}</span>;
}

function SupplierEvidencePanel({
  evidence,
  evidenceStatus,
  form,
  notice,
  onFormChange,
  onCreate,
  onRequest,
  onUpload,
  onVerify,
  onReject,
  canVerifyEvidence,
  selectedFile,
  uploadProgress,
  onFileChange,
  actionLoading,
}: {
  evidence: SupplierEvidence[];
  evidenceStatus?: string | null;
  form: SupplierEvidencePayload;
  notice: string;
  onFormChange: (form: SupplierEvidencePayload) => void;
  onCreate: () => void;
  onRequest: () => void;
  onUpload: () => void;
  onVerify: (item: SupplierEvidence) => void;
  onReject: (item: SupplierEvidence) => void;
  canVerifyEvidence: boolean;
  selectedFile: File | null;
  uploadProgress: number;
  onFileChange: (file: File | null) => void;
  actionLoading: string;
}) {
  const missingRequired = !evidence.some((item) => item.evidenceType === "ghg_inventory" && item.status === "verified")
    || !evidence.some((item) => item.evidenceType === "iso_14001_certificate" && item.status === "verified");
  const expired = evidence.filter((item) => item.isExpired || item.status === "expired");
  const expiringSoon = evidence.filter((item) => item.isExpiringSoon && !(item.isExpired || item.status === "expired"));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Supplier Evidence</CardTitle>
          <EvidenceStatusBadge status={evidenceStatus || evidenceIndicator(evidence)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice ? <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">{notice}</div> : null}
        {missingRequired ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Missing evidence warning: verified GHG inventory and ISO 14001 evidence are not both complete.
          </div>
        ) : null}
        {expired.length > 0 ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            Expiry warning: {expired.length} evidence item{expired.length === 1 ? "" : "s"} expired.
          </div>
        ) : null}
        {expiringSoon.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Expiring soon: {expiringSoon.length} evidence item{expiringSoon.length === 1 ? "" : "s"} expire within 30 days.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={form.evidenceType}
            onChange={(event) => onFormChange({ ...form, evidenceType: event.target.value as SupplierEvidenceType })}
          >
            {EVIDENCE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Evidence title"
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
          />
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            placeholder="File URL"
            value={form.fileUrl || ""}
            onChange={(event) => onFormChange({ ...form, fileUrl: event.target.value })}
          />
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            type="date"
            value={form.expiresAt || ""}
            onChange={(event) => onFormChange({ ...form, expiresAt: event.target.value || null })}
          />
          <input
            className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm sm:col-span-2"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.csv"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </div>
        {selectedFile ? (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              {selectedFile.name} · {formatFileSize(selectedFile.size)}
            </div>
            {actionLoading === "evidence:upload" ? (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(uploadProgress, 8)}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={actionLoading === "evidence:create"} onClick={onRequest}>Request Evidence</Button>
          <Button type="button" size="sm" disabled={actionLoading === "evidence:create"} onClick={onCreate}>
            {actionLoading === "evidence:create" ? "Saving..." : "Add Evidence Metadata"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!selectedFile || actionLoading === "evidence:upload"} onClick={onUpload}>
            {actionLoading === "evidence:upload" ? "Uploading..." : "Upload File"}
          </Button>
        </div>

        {evidence.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            No supplier evidence is tracked yet.
          </div>
        ) : (
          <div className="space-y-2">
            {evidence.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                      {item.title}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {evidenceTypeLabel(item.evidenceType)} · expires {formatLastReportedAt(item.expiresAt)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {item.isExpiringSoon ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Expiring soon</span> : null}
                      {item.isExpired || item.status === "expired" ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Expired</span> : null}
                      {item.reminderSent ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">Reminder sent</span> : null}
                    </div>
                    {item.fileName ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.fileName} {item.fileSize ? `· ${formatFileSize(item.fileSize)}` : ""}
                      </div>
                    ) : null}
                    {item.storageKey ? (
                      <a className="mt-1 inline-flex items-center gap-1 text-xs text-primary" href={supplierService.downloadEvidenceUrl(item.supplierId, item.id)} target="_blank" rel="noreferrer">
                        <Download className="h-3 w-3" />
                        Download file
                      </a>
                    ) : item.fileUrl ? <a className="mt-1 block text-xs text-primary" href={item.fileUrl} target="_blank" rel="noreferrer">Open file</a> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <QuestionnaireStatusBadge status={item.status} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(actionLoading) || !canVerifyEvidence}
                      title={canVerifyEvidence ? "Verify evidence" : NO_PERMISSION_MESSAGE}
                      onClick={() => {
                        if (!canVerifyEvidence) return;
                        onVerify(item);
                      }}
                    >
                      {actionLoading === `evidence:verify:${item.id}` ? "Verifying..." : "Verify"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={Boolean(actionLoading) || !canVerifyEvidence}
                      title={canVerifyEvidence ? "Reject evidence" : NO_PERMISSION_MESSAGE}
                      onClick={() => {
                        if (!canVerifyEvidence) return;
                        onReject(item);
                      }}
                    >
                      {actionLoading === `evidence:reject:${item.id}` ? "Rejecting..." : "Reject"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  helper,
  error,
  className = "",
  children,
}: {
  label: string;
  helper?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
      {helper ? <span className="text-xs font-normal text-muted-foreground">{helper}</span> : null}
      {error ? <span className="text-xs font-normal text-destructive">{error}</span> : null}
    </label>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="md:col-span-2 xl:col-span-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
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
      complianceScore: supplier.complianceScore ?? 0,
      reportingFreshnessScore: 0,
      dataQualityScore: supplier.dataQualityScore ?? 0,
    },
    benchmark: supplier.supplierBenchmark ?? {
      industryKey: "default",
      industryLabel: supplier.category || "Cross-industry",
      industryAverageIntensity: 0,
      percentileRank: null,
      industryComparison: "UNKNOWN",
      isAboveIndustryAverage: null,
      variancePct: null,
      categoryAverageIntensity: null,
      regionAverageIntensity: null,
      companyAverageIntensity: null,
      bestPerformerIntensity: null,
      percentile: null,
      benchmarkLabel: "UNAVAILABLE",
      comparisonMessage: "Benchmark unavailable until more supplier data is collected.",
      isBenchmarkAvailable: false,
      categoryComparison: "UNKNOWN",
      regionComparison: "UNKNOWN",
      companyComparison: "UNKNOWN",
      isBestInClass: false,
      isAboveCategoryAverage: null,
    },
    complianceScore: supplier.complianceScore ?? 0,
    certificationScore: supplier.supplierScoreBreakdown?.certificationScore ?? 0,
    transparencyScore: supplier.supplierScoreBreakdown?.transparencyScore ?? supplier.dataTransparencyScore ?? 0,
    reportingFreshnessScore: supplier.supplierScoreBreakdown?.reportingFreshnessScore ?? 0,
    dataQualityScore: supplier.dataQualityScore ?? supplier.supplierScoreBreakdown?.dataQualityScore ?? 0,
    benchmarkScore: supplier.benchmarkScore ?? null,
    latestScoreExplanation: supplier.latestScoreExplanation ?? undefined,
    explanation: supplier.latestScoreExplanation ?? undefined,
    recommendedActions: supplier.recommendedActions ?? [],
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

function formatFileSize(value?: number | null) {
  const size = Number(value || 0);
  if (size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStatus(value?: string | null) {
  if (!value) return "Not set";
  return String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatBenchmarkComparison(value?: SupplierBenchmarkComparison | "UNAVAILABLE") {
  if (!value || value === "UNKNOWN" || value === "UNAVAILABLE") return "Unavailable";
  if (value === "ABOVE_AVERAGE") return "Above average";
  if (value === "BELOW_AVERAGE") return "Below average";
  return "At average";
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort();
}

function normalizeQuestionnaireStatus(value?: string | null): SupplierQuestionnaireStatus {
  const normalized = String(value || "not_sent").toLowerCase();
  return ["not_sent", "sent", "opened", "submitted", "overdue", "expired"].includes(normalized)
    ? normalized as SupplierQuestionnaireStatus
    : "not_sent";
}

function isQuestionnaireOverdue(supplier: Supplier) {
  const status = String(supplier.questionnaireStatus || supplier.invitationStatus || "").toLowerCase();
  if (status === "overdue" || status === "expired") return true;
  if (status === "submitted" || !supplier.questionnaireDueDate) return false;
  const dueDate = new Date(supplier.questionnaireDueDate);
  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
}

function toFriendlyApiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (/token|unauthorized|401|expired/i.test(message)) {
    return "Your session may have expired. Please sign in again.";
  }
  if (/timeout|network/i.test(message)) {
    return "The supplier service is taking too long to respond. Please try again.";
  }
  return message || fallback;
}

function evidenceTypeLabel(value?: string | null) {
  return EVIDENCE_TYPE_OPTIONS.find((option) => option.value === value)?.label || formatStatus(value);
}

function evidenceIndicator(evidence: SupplierEvidence[]) {
  if (evidence.some((item) => item.isExpired || item.status === "expired")) return "expired";
  if (evidence.some((item) => item.status === "submitted" || item.status === "under_review")) return "under_review";
  const hasIso = evidence.some((item) => item.evidenceType === "iso_14001_certificate" && item.status === "verified");
  const hasGhg = evidence.some((item) => item.evidenceType === "ghg_inventory" && item.status === "verified");
  return hasIso && hasGhg ? "complete" : "missing";
}
