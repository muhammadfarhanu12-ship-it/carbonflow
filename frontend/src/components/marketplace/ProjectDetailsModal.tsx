import { ExternalLink, FileText, MapPinned } from "lucide-react";
import { Modal } from "@/src/components/shared/Modal";
import type { CarbonProject } from "@/src/types/platform";

interface ProjectDetailsModalProps {
  open: boolean;
  project: CarbonProject | null;
  onClose: () => void;
}

export function ProjectDetailsModal({ open, project, onClose }: ProjectDetailsModalProps) {
  const coordinates = project?.coordinates?.latitude != null && project?.coordinates?.longitude != null
    ? `${project.coordinates.latitude.toFixed(4)}, ${project.coordinates.longitude.toFixed(4)}`
    : "Coordinates not available";
  const documents = project?.pddDocuments || [];
  const registry = project?.registry || project?.verificationStandard || project?.certification || "Not available";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project?.name || "Project Details"}
      description="Transparency snapshot for buyer due diligence, shipment linking, and retirement trust."
      panelClassName="max-w-4xl"
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <DetailCard label="Status" value={project?.status || "-"} />
          <DetailCard label="Registry" value={registry} />
          <DetailCard label="Vintage" value={String(project?.vintageYear || "-")} />
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Project Description</h3>
          <div className="rounded-2xl border border-border bg-muted/20 px-4 py-4 text-sm leading-6 text-foreground">
            {project?.description?.trim() || "No project description has been added yet."}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <MapPinned className="h-4 w-4" />
            Geographic Location
          </h3>
          <div className="rounded-2xl border border-border bg-muted/20 px-4 py-4 text-sm text-foreground">
            <div>{project?.location || "Location not available"}</div>
            <div className="mt-2 text-muted-foreground">{coordinates}</div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <FileText className="h-4 w-4" />
            PDD Documents
          </h3>
          {documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              No PDD documents are attached to this listing yet.
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((document, index) => (
                <a
                  key={`${document.url}-${index}`}
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-4 text-sm transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div>
                    <div className="font-medium text-foreground">{document.name}</div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">{document.url}</div>
                  </div>
                  <span className="inline-flex items-center gap-2 font-medium text-primary">
                    Download
                    <ExternalLink className="h-4 w-4" />
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white px-4 py-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}
