import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Download, Eye, FileSpreadsheet, FileText, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { reportsService, type ReportPayload, type ReportReadiness } from "@/src/services/reportsService";
import { socketService } from "@/src/services/socketService";
import { authService } from "@/src/services/authService";
import { useToast } from "@/src/components/providers/ToastProvider";
import { hasPermission, NO_PERMISSION_MESSAGE } from "@/src/utils/permissions";
import type { ReportItem } from "@/src/types/platform";

type ReportType = NonNullable<ReportItem["reportType"]>;
type ReportFormat = ReportItem["format"];
type InclusionPolicy = "approved_only" | "all_records_with_warning";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  esg_pdf: "ESG Report PDF",
  scope_export_csv: "Scope 1-2-3 CSV Export",
  custom_extract: "Custom Data Extract",
  carbon_ledger: "Carbon Ledger Report",
  supplier_esg: "Supplier ESG Report",
  shipment_emissions: "Shipment Emissions Report",
  marketplace_retirement: "Marketplace Retirements Report",
};

const DATA_SECTIONS = [
  "scope_totals",
  "category_breakdown",
  "monthly_breakdown",
  "supplier_breakdown",
  "shipment_breakdown",
  "methodology",
  "data_quality_notes",
  "audit_summary",
  "marketplace_retirements",
];

function currentYearStart() {
  return `${new Date().getUTCFullYear()}-01-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFormat(reportType: ReportType): ReportFormat {
  return reportType === "scope_export_csv" || reportType === "custom_extract" ? "CSV" : "PDF";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

function warningCount(report: ReportItem) {
  return Number(report.sampleFactorCount || 0)
    + Number(report.missingFactorCount || 0)
    + Number(report.staleFactorCount || 0)
    + Number(report.unapprovedRecordCount || 0)
    + Number(report.warnings?.length || 0);
}

export function ReportsPage() {
  const { showToast } = useToast();
  const user = authService.getSession().user;
  const canGenerate = hasPermission(user, "report:generate");
  const canDownload = hasPermission(user, "report:download");
  const canArchive = hasPermission(user, "report:archive");
  const canRegenerate = hasPermission(user, "report:regenerate");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [readiness, setReadiness] = useState<ReportReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState("");
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [detailsReport, setDetailsReport] = useState<ReportItem | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Required<Pick<ReportPayload, "reportName" | "reportingPeriodStart" | "reportingPeriodEnd">> & {
    reportType: ReportType;
    outputFormat: ReportFormat;
    inclusionPolicy: InclusionPolicy;
    dataSections: string[];
  }>({
    reportName: `Approved ESG Report ${new Date().getUTCFullYear()}`,
    reportType: "esg_pdf",
    outputFormat: "PDF",
    reportingPeriodStart: currentYearStart(),
    reportingPeriodEnd: today(),
    inclusionPolicy: "approved_only",
    dataSections: DATA_SECTIONS,
  });

  const loadReports = async () => {
    try {
      setError("");
      const response = await reportsService.getReports("?pageSize=20");
      setReports(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports. Backend may be waking up.");
    } finally {
      setLoading(false);
    }
  };

  const checkReadiness = async (nextForm = form) => {
    try {
      setCheckingReadiness(true);
      const response = await reportsService.checkReadiness({
        reportingPeriodStart: nextForm.reportingPeriodStart,
        reportingPeriodEnd: nextForm.reportingPeriodEnd,
      });
      setReadiness(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate report readiness.");
    } finally {
      setCheckingReadiness(false);
    }
  };

  useEffect(() => {
    void loadReports();
    void checkReadiness();
    const unsubscribe = socketService.on("reportGenerated", loadReports);
    return unsubscribe;
  }, []);

  const lastReport = reports[0] || null;
  const readinessStatus = useMemo(() => {
    if (!readiness) return "Checking readiness";
    if (readiness.canGenerateApprovedReport) return "Ready for approved report";
    if (readiness.canGenerateInternalReport) return "Needs attention";
    return "Not enough approved records";
  }, [readiness]);

  function openGenerate(reportType: ReportType, overrides: Partial<typeof form> = {}) {
    const nextForm = {
      ...form,
      reportType,
      outputFormat: defaultFormat(reportType),
      reportName: `${REPORT_TYPE_LABELS[reportType]} ${new Date().getUTCFullYear()}`,
      ...overrides,
    };
    setForm(nextForm);
    setShowGenerateModal(true);
    void checkReadiness(nextForm);
  }

  function updateForm<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    const next = { ...form, [key]: value };
    if (key === "reportType") {
      next.outputFormat = defaultFormat(value as ReportType);
    }
    setForm(next);
    if (key === "reportingPeriodStart" || key === "reportingPeriodEnd" || key === "inclusionPolicy") {
      void checkReadiness(next);
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canGenerate) {
      setError(NO_PERMISSION_MESSAGE);
      return;
    }
    if (!form.reportName.trim()) {
      setError("Report name is required.");
      return;
    }
    if (!form.reportingPeriodStart || !form.reportingPeriodEnd || new Date(form.reportingPeriodStart) > new Date(form.reportingPeriodEnd)) {
      setError("A valid reporting period is required.");
      return;
    }
    if (form.inclusionPolicy === "approved_only" && readiness && readiness.approvedRecordsCount === 0) {
      setError("Not enough approved records. Generate an internal all-records report with warning or approve records first.");
      return;
    }

    try {
      setGenerating(true);
      setError("");
      await reportsService.generateReport(form);
      showToast({ tone: "success", title: "Report generated", description: "The report history has been updated and authenticated download is available." });
      setShowGenerateModal(false);
      await loadReports();
      await checkReadiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function downloadReport(report: ReportItem) {
    if (!canDownload) {
      setError(NO_PERMISSION_MESSAGE);
      return;
    }
    try {
      setDownloadingId(report.id);
      const { blob, fileName } = await reportsService.downloadReportFile(report);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadingId("");
    }
  }

  async function archiveReport(report: ReportItem) {
    if (!canArchive) {
      setError(NO_PERMISSION_MESSAGE);
      return;
    }
    try {
      await reportsService.archiveReport(report.id);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report archive failed.");
    }
  }

  async function regenerateReport(report: ReportItem) {
    if (!canRegenerate) {
      setError(NO_PERMISSION_MESSAGE);
      return;
    }
    try {
      await reportsService.regenerateReport(report.id);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report regeneration failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Compliance & Reporting</h1>
          <p className="text-muted-foreground">Generate authenticated PDF and CSV sustainability reports backed by approved platform data, methodology, and audit history.</p>
        </div>
        <Button onClick={() => openGenerate("esg_pdf")} disabled={!canGenerate}>
          <FileText className="mr-2 h-4 w-4" />
          Generate New Report
        </Button>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {!canGenerate ? <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{NO_PERMISSION_MESSAGE}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <ActionCard title="ESG Report" description="Board-ready internal/unaudited PDF with methodology and data quality notes." icon={FileText} onClick={() => openGenerate("esg_pdf")} />
        <ActionCard title="Scope 1-2-3 Export" description="Authenticated CSV export with safe cells and factor source fields." icon={FileSpreadsheet} onClick={() => openGenerate("scope_export_csv")} />
        <ActionCard title="Custom Data Extract" description="Select emissions, suppliers, shipments, ledger, marketplace, audit, and report sections." icon={Download} onClick={() => openGenerate("custom_extract")} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Data Quality / Compliance Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              {readiness?.canGenerateApprovedReport ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
              <div>
                <div className="font-semibold text-foreground">{readinessStatus}</div>
                <div className="text-sm text-muted-foreground">Default reports include approved records only. All-record reports carry an internal-use warning.</div>
              </div>
            </div>
            <Button variant="outline" onClick={() => checkReadiness()} disabled={checkingReadiness}>
              {checkingReadiness ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Readiness
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Approved" value={readiness?.approvedRecordsCount} />
            <Metric label="Draft" value={readiness?.draftRecordsCount} />
            <Metric label="Submitted" value={readiness?.submittedRecordsCount} />
            <Metric label="Needs Correction" value={readiness?.needsCorrectionRecordsCount} />
            <Metric label="Missing Factors" value={readiness?.missingFactorCount} />
            <Metric label="Sample Factors" value={readiness?.sampleFactorCount} />
            <Metric label="Stale Factors" value={readiness?.staleFactorCount} />
            <Metric label="Calculation Errors" value={readiness?.calculationErrorCount} />
          </div>
          {readiness?.warnings?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {readiness.warnings.join(" ")}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { window.location.href = "/ledger"; }}>Go to Carbon Ledger</Button>
            <Button variant="outline" onClick={() => openGenerate("esg_pdf")}>Generate Approved Report</Button>
            <Button variant="outline" onClick={() => openGenerate("carbon_ledger", { inclusionPolicy: "all_records_with_warning" })}>Generate Internal Report with Warnings</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Report Name</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Format</th>
                  <th className="px-6 py-3 font-medium">Period</th>
                  <th className="px-6 py-3 font-medium">Generated By</th>
                  <th className="px-6 py-3 font-medium">Generated</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Warnings</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={9} className="px-6 py-4 text-center text-muted-foreground">Loading reports. Backend may be waking up...</td></tr>
                ) : reports.length === 0 ? (
                  <tr><td colSpan={9} className="px-6 py-6 text-center text-muted-foreground">No reports generated yet. Generate your first approved-record report or CSV export.</td></tr>
                ) : reports.map((report) => (
                  <tr key={report.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium text-foreground">{report.name}</td>
                    <td className="px-6 py-4">{REPORT_TYPE_LABELS[report.reportType || "custom_extract"] || report.type}</td>
                    <td className="px-6 py-4">{report.format}</td>
                    <td className="px-6 py-4">{formatDate(report.reportingPeriodStart)} - {formatDate(report.reportingPeriodEnd)}</td>
                    <td className="px-6 py-4">{report.generatedBy || "-"}</td>
                    <td className="px-6 py-4">{formatDate(report.generatedAt)}</td>
                    <td className="px-6 py-4"><StatusBadge status={report.status} /></td>
                    <td className="px-6 py-4">{warningCount(report)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button aria-label={`View details for ${report.name}`} variant="ghost" size="sm" onClick={() => setDetailsReport(report)}><Eye className="h-4 w-4" /></Button>
                        <Button aria-label={`Download ${report.name}`} variant="ghost" size="sm" disabled={!canDownload || downloadingId === report.id || report.status === "failed" || report.status === "archived"} onClick={() => downloadReport(report)}>
                          {downloadingId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
                        <Button aria-label={`Regenerate ${report.name}`} variant="ghost" size="sm" disabled={!canRegenerate} onClick={() => regenerateReport(report)}><RefreshCw className="h-4 w-4" /></Button>
                        <Button aria-label={`Archive ${report.name}`} variant="ghost" size="sm" disabled={!canArchive || report.status === "archived"} onClick={() => archiveReport(report)}><Archive className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showGenerateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitReport} className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Generate New Report</h2>
                <p className="text-sm text-muted-foreground">Reports are generated from company-scoped backend data and downloaded through authenticated API requests.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Report Name" value={form.reportName} onChange={(value) => updateForm("reportName", value)} />
              <Select label="Report Type" value={form.reportType} options={Object.keys(REPORT_TYPE_LABELS)} labels={REPORT_TYPE_LABELS} onChange={(value) => updateForm("reportType", value as ReportType)} />
              <Select label="Output Format" value={form.outputFormat} options={["PDF", "CSV"]} onChange={(value) => updateForm("outputFormat", value as ReportFormat)} />
              <Select label="Inclusion Policy" value={form.inclusionPolicy} options={["approved_only", "all_records_with_warning"]} labels={{ approved_only: "Approved records only", all_records_with_warning: "Include all records with warning" }} onChange={(value) => updateForm("inclusionPolicy", value as InclusionPolicy)} />
              <Field label="Reporting Period Start" type="date" value={form.reportingPeriodStart} onChange={(value) => updateForm("reportingPeriodStart", value)} />
              <Field label="Reporting Period End" type="date" value={form.reportingPeriodEnd} onChange={(value) => updateForm("reportingPeriodEnd", value)} />
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-foreground">Data Sections</div>
              <div className="grid gap-2 md:grid-cols-3">
                {DATA_SECTIONS.map((section) => (
                  <label key={section} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.dataSections.includes(section)}
                      onChange={(event) => updateForm("dataSections", event.target.checked ? [...form.dataSections, section] : form.dataSections.filter((item) => item !== section))}
                    />
                    {section.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
            </div>
            {readiness ? (
              <div className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
                <div className="font-semibold text-foreground">{readinessStatus}</div>
                <div className="mt-1 text-muted-foreground">
                  Approved: {readiness.approvedRecordsCount}. Missing factors: {readiness.missingFactorCount}. Sample factors: {readiness.sampleFactorCount}. Unapproved records will {form.inclusionPolicy === "all_records_with_warning" ? "" : "not "}be included.
                </div>
                {readiness.blockers.length ? <div className="mt-2 text-destructive">{readiness.blockers.join(" ")}</div> : null}
                {readiness.warnings.length ? <div className="mt-2 text-amber-700">{readiness.warnings.join(" ")}</div> : null}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
              <Button type="submit" disabled={generating || !canGenerate}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Generate
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {detailsReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{detailsReport.name}</h2>
                <p className="text-sm text-muted-foreground">Report metadata, inclusion policy, record counts, warnings, and audit entry point.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setDetailsReport(null)}>Close</Button>
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <Detail label="Type" value={REPORT_TYPE_LABELS[detailsReport.reportType || "custom_extract"] || detailsReport.type} />
              <Detail label="Format" value={detailsReport.format} />
              <Detail label="Status" value={detailsReport.status} />
              <Detail label="Inclusion Policy" value={detailsReport.inclusionPolicy || "-"} />
              <Detail label="Approved Records" value={String(detailsReport.recordCounts?.approved ?? "-")} />
              <Detail label="Unapproved Records" value={String(detailsReport.unapprovedRecordCount ?? detailsReport.recordCounts?.unapproved ?? "-")} />
              <Detail label="Missing Factors" value={String(detailsReport.missingFactorCount ?? 0)} />
              <Detail label="Sample Factors" value={String(detailsReport.sampleFactorCount ?? 0)} />
              <Detail label="Failure Reason" value={detailsReport.failureReason || "-"} />
              <Detail label="Download" value={detailsReport.downloadUrl || "-"} />
            </div>
            <div className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              View audit logs by filtering entity type <span className="font-mono">report</span> and entity ID <span className="font-mono">{detailsReport.id}</span>.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionCard({ title, description, icon: Icon, onClick }: { title: string; description: string; icon: typeof FileText; onClick: () => void }) {
  return (
    <Card className="cursor-pointer transition-colors hover:border-primary" onClick={onClick}>
      <CardContent className="flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReportItem["status"] }) {
  const normalized = String(status || "").toLowerCase();
  const className = normalized === "completed" || normalized === "ready"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : normalized === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : normalized === "archived"
        ? "border-slate-200 bg-slate-100 text-slate-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return <span className={`rounded-full border px-2 py-1 text-xs font-medium ${className}`}>{normalized}</span>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input className="rounded-md border border-input bg-background px-3 py-2" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, options, labels = {}, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select className="rounded-md border border-input bg-background px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{labels[option] || option}</option>)}
      </select>
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all font-medium text-foreground">{value}</div>
    </div>
  );
}
