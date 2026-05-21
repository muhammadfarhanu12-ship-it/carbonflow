import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  PublicQuestionnaireContext,
  PublicQuestionnaireSubmission,
  publicQuestionnaireService,
} from "../services/publicQuestionnaireService";

const CERTIFICATIONS = ["ISO 14001", "SBTi", "GHG inventory", "ESG report", "Audit report"];

const initialForm: PublicQuestionnaireSubmission = {
  contactName: "",
  contactEmail: "",
  country: "",
  region: "",
  category: "",
  totalEmissions: 0,
  revenueOrActivityBase: 0,
  emissionIntensity: "",
  reportingPeriod: "",
  verificationStatus: "self_reported",
  certifications: [],
  evidenceNotes: "",
  notes: "",
  additionalComments: "",
  questionnaireAnswers: {},
};

function formatDate(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function PortalState({ title, message, tone }: { title: string; message: string; tone: "error" | "success" }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-emerald-700">CarbonFlow</div>
          <h1 className="mt-2 text-3xl font-semibold">Supplier ESG questionnaire</h1>
        </div>
        <Card className="rounded-lg">
          <CardContent className="flex gap-4 p-6">
            <Icon className={tone === "success" ? "h-6 w-6 text-emerald-600" : "h-6 w-6 text-red-600"} />
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export function SupplierQuestionnairePage() {
  const { token = "" } = useParams();
  const [context, setContext] = useState<PublicQuestionnaireContext | null>(null);
  const [form, setForm] = useState<PublicQuestionnaireSubmission>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState("ghg_inventory");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadNotice, setUploadNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadQuestionnaire() {
      setLoading(true);
      setError("");
      try {
        const data = await publicQuestionnaireService.getQuestionnaire(token);
        if (!mounted) return;
        setContext(data);
        setForm((current) => ({
          ...current,
          country: current.country || "",
          region: current.region || "",
          category: current.category || "",
        }));
      } catch (requestError) {
        if (!mounted) return;
        setError(requestError instanceof Error ? requestError.message : "Questionnaire link could not be opened.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadQuestionnaire();
    return () => {
      mounted = false;
    };
  }, [token]);

  const dueDateLabel = useMemo(() => formatDate(context?.dueDate ?? null), [context?.dueDate]);

  function updateField<K extends keyof PublicQuestionnaireSubmission>(key: K, value: PublicQuestionnaireSubmission[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleCertification(certification: string) {
    setForm((current) => {
      const selected = current.certifications.includes(certification);
      return {
        ...current,
        certifications: selected
          ? current.certifications.filter((item) => item !== certification)
          : [...current.certifications, certification],
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await publicQuestionnaireService.submitQuestionnaire(token, {
        ...form,
        totalEmissions: Number(form.totalEmissions),
        revenueOrActivityBase: Number(form.revenueOrActivityBase),
        emissionIntensity: form.emissionIntensity === "" ? "" : Number(form.emissionIntensity),
      });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Questionnaire could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEvidenceUpload() {
    if (!evidenceFile) return;
    setUploadingEvidence(true);
    setUploadProgress(0);
    setUploadNotice("");
    setError("");

    try {
      await publicQuestionnaireService.uploadEvidence(token, evidenceFile, {
        evidenceType,
        title: evidenceFile.name,
        notes: form.evidenceNotes || null,
      }, setUploadProgress);
      setEvidenceFile(null);
      setUploadProgress(100);
      setUploadNotice("Evidence file uploaded.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Evidence file could not be uploaded.");
    } finally {
      setUploadingEvidence(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
      </main>
    );
  }

  if (submitted) {
    return (
      <PortalState
        tone="success"
        title="Questionnaire submitted"
        message="Thank you. Your ESG and emissions disclosure has been received and shared with the requesting company in CarbonFlow."
      />
    );
  }

  if (error && !context) {
    return <PortalState tone="error" title="Questionnaire unavailable" message={error} />;
  }

  if (!context) {
    return <PortalState tone="error" title="Questionnaire unavailable" message="This questionnaire link could not be opened." />;
  }

  if (context.expired) {
    return (
      <PortalState
        tone="error"
        title="Questionnaire expired"
        message="This questionnaire link has expired. Contact the requesting company for a new questionnaire invitation."
      />
    );
  }

  if (context.alreadySubmitted) {
    return (
      <PortalState
        tone="success"
        title="Questionnaire already submitted"
        message="This supplier questionnaire has already been submitted. Contact the requesting company if you need to revise the disclosure."
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-emerald-700">CarbonFlow</div>
            <h1 className="mt-2 text-3xl font-semibold">Supplier ESG questionnaire</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {context.requestingCompanyName} is requesting ESG and emissions data from {context.supplierName}.
            </p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="font-semibold">Due {dueDateLabel}</div>
            <div className="mt-1 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Secure supplier-specific link
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Supplier Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input value={context.supplierName} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact name</Label>
              <Input id="contactName" value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact email</Label>
              <Input id="contactEmail" type="email" value={form.contactEmail} onChange={(event) => updateField("contactEmail", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category confirmation</Label>
              <Input id="category" value={form.category} onChange={(event) => updateField("category", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={form.country} onChange={(event) => updateField("country", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input id="region" value={form.region} onChange={(event) => updateField("region", event.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Emissions Data</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="totalEmissions">Total emissions tCO2e</Label>
              <Input id="totalEmissions" type="number" min="0" step="0.001" required value={form.totalEmissions} onChange={(event) => updateField("totalEmissions", Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revenueOrActivityBase">Revenue or activity base</Label>
              <Input id="revenueOrActivityBase" type="number" min="0" step="0.001" required value={form.revenueOrActivityBase} onChange={(event) => updateField("revenueOrActivityBase", Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emissionIntensity">Emissions intensity</Label>
              <Input id="emissionIntensity" type="number" min="0" step="0.000001" value={form.emissionIntensity} onChange={(event) => updateField("emissionIntensity", event.target.value === "" ? "" : Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reportingPeriod">Reporting period</Label>
              <Input id="reportingPeriod" required placeholder="FY2025" value={form.reportingPeriod} onChange={(event) => updateField("reportingPeriod", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verificationStatus">Verification status</Label>
              <select
                id="verificationStatus"
                className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                value={form.verificationStatus}
                onChange={(event) => updateField("verificationStatus", event.target.value)}
              >
                <option value="self_reported">Self reported</option>
                <option value="third_party_verified">Third-party verified</option>
                <option value="pending">Pending verification</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Certifications And Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {CERTIFICATIONS.map((certification) => (
                <label key={certification} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.certifications.includes(certification)}
                    onChange={() => toggleCertification(certification)}
                  />
                  {certification}
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidenceNotes">Evidence notes</Label>
              <textarea
                id="evidenceNotes"
                className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                value={form.evidenceNotes}
                onChange={(event) => updateField("evidenceNotes", event.target.value)}
              />
            </div>
            <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]">
              <select
                className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                value={evidenceType}
                onChange={(event) => setEvidenceType(event.target.value)}
              >
                <option value="ghg_inventory">GHG inventory</option>
                <option value="iso_14001_certificate">ISO 14001 certificate</option>
                <option value="sbti_commitment">SBTi commitment</option>
                <option value="esg_report">ESG report</option>
                <option value="audit_report">Audit report</option>
                <option value="carbon_reduction_plan">Carbon reduction plan</option>
                <option value="other">Other</option>
              </select>
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.csv"
                onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" disabled={!evidenceFile || uploadingEvidence} onClick={() => void handleEvidenceUpload()}>
                {uploadingEvidence ? "Uploading..." : "Upload Evidence"}
              </Button>
              {uploadingEvidence ? (
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 md:col-span-3">
                  <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.max(uploadProgress, 8)}%` }} />
                </div>
              ) : null}
              {uploadNotice ? <div className="text-sm text-emerald-700 md:col-span-3">{uploadNotice}</div> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="additionalComments">Additional comments</Label>
              <textarea
                id="additionalComments"
                className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                value={form.additionalComments}
                onChange={(event) => updateField("additionalComments", event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pb-10">
          <Button type="submit" disabled={submitting} className="min-w-44">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit Questionnaire
          </Button>
        </div>
      </form>
    </main>
  );
}
