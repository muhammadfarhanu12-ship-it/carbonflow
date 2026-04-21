import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { reportsService } from "@/src/services/reportsService";
import { API_BASE_URL } from "@/src/services/apiClient";
import { socketService } from "@/src/services/socketService";
import { useToast } from "@/src/components/providers/ToastProvider";
import type { ReportItem } from "@/src/types/platform";

export function ReportsPage() {
  const { showToast } = useToast();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<ReportItem["type"] | null>(null);
  const [error, setError] = useState("");

  const loadReports = async () => {
    try {
      setError("");
      const response = await reportsService.getReports("?pageSize=20");
      setReports(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    const unsubscribe = socketService.on("reportGenerated", loadReports);
    return unsubscribe;
  }, []);

  const generateReport = async (type: ReportItem["type"], format: ReportItem["format"]) => {
    setGenerating(type);
    try {
      await reportsService.generateReport({
        name: `${type} ${new Date().toLocaleDateString()}`,
        type,
        format,
        metadata: { generatedFrom: "frontend" },
      });
      showToast({
        tone: "success",
        title: "Report generated",
        description: `${type} ${format} report is ready for download.`,
      });
      await loadReports();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate report");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Compliance & Reporting</h1>
          <p className="text-muted-foreground">Generate CSV and PDF sustainability reports backed by live platform data.</p>
        </div>
        <Button onClick={() => generateReport("ANALYTICS", "PDF")} disabled={Boolean(generating)}>
          {generating === "ANALYTICS" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          {generating === "ANALYTICS" ? "Generating..." : "Generate New Report"}
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <ActionCard title="ESG Report" description="Generate a board-ready PDF report." icon={FileText} loading={generating === "ESG"} onClick={() => generateReport("ESG", "PDF")} />
        <ActionCard title="Scope 1-2-3 Export" description="Export compliance data as CSV." icon={FileSpreadsheet} loading={generating === "COMPLIANCE"} onClick={() => generateReport("COMPLIANCE", "CSV")} />
        <ActionCard title="Custom Data Extract" description="Generate analytics exports instantly." icon={Download} loading={generating === "CUSTOM"} onClick={() => generateReport("CUSTOM", "CSV")} />
      </div>

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
                  <th className="px-6 py-3 font-medium">Generated</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-4 text-center text-muted-foreground">Loading reports...</td></tr>
                ) : reports.map((report) => (
                  <tr key={report.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium text-foreground">{report.name}</td>
                    <td className="px-6 py-4">{report.type}</td>
                    <td className="px-6 py-4">{new Date(report.generatedAt).toLocaleString()}</td>
                    <td className="px-6 py-4">{report.status}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => window.open(`${API_BASE_URL.replace(/\/api$/, "")}${report.downloadUrl}`, "_blank")}>
                        <Download className="mr-2 h-4 w-4" />
                        {report.format}
                      </Button>
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

function ActionCard({ title, description, icon: Icon, loading, onClick }: { title: string; description: string; icon: typeof FileText; loading?: boolean; onClick: () => void }) {
  return (
    <Card className="cursor-pointer transition-colors hover:border-primary" onClick={() => !loading && onClick()}>
      <CardContent className="flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className="h-6 w-6" />}
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
