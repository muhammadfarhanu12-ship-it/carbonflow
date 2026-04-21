import { FormEvent, useEffect, useId, useState } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/src/components/shared/Modal";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

const CATEGORY_OPTIONS = ["Forestry", "Renewable Energy", "Blue Carbon", "Methane"] as const;
const REGISTRY_OPTIONS = ["Gold Standard", "Verra"] as const;
const STATUS_OPTIONS = ["DRAFT", "PUBLISHED"] as const;

export type ProjectManagementCategory = typeof CATEGORY_OPTIONS[number];
export type ProjectManagementRegistry = typeof REGISTRY_OPTIONS[number];
export type ProjectManagementStatus = typeof STATUS_OPTIONS[number];

export interface ProjectManagementDocument {
  name: string;
  url: string;
}

export interface ProjectManagementFormValues {
  projectName: string;
  category: ProjectManagementCategory;
  registry: ProjectManagementRegistry;
  description: string;
  location: string;
  latitude: number | "";
  longitude: number | "";
  status: ProjectManagementStatus;
  pddDocuments: ProjectManagementDocument[];
  vintageYear: number;
  totalSupply: number;
  price: number;
}

interface ProjectManagementModalProps {
  open: boolean;
  mode?: "create" | "edit";
  initialValues?: ProjectManagementFormValues;
  submitting?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: ProjectManagementFormValues) => void | Promise<void>;
}

const defaultFormValues: ProjectManagementFormValues = {
  projectName: "",
  category: "Forestry",
  registry: "Gold Standard",
  description: "",
  location: "",
  latitude: "",
  longitude: "",
  status: "DRAFT",
  pddDocuments: [{ name: "", url: "" }],
  vintageYear: new Date().getFullYear(),
  totalSupply: 1000,
  price: 10,
};

export function ProjectManagementModal({
  open,
  mode = "create",
  initialValues = defaultFormValues,
  submitting = false,
  error = "",
  onClose,
  onSubmit,
}: ProjectManagementModalProps) {
  const [formValues, setFormValues] = useState<ProjectManagementFormValues>(initialValues);

  const projectNameId = useId();
  const categoryId = useId();
  const registryId = useId();
  const locationId = useId();
  const vintageYearId = useId();
  const totalSupplyId = useId();
  const priceId = useId();
  const latitudeId = useId();
  const longitudeId = useId();
  const statusId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormValues({
      ...initialValues,
      pddDocuments: initialValues.pddDocuments.length > 0 ? initialValues.pddDocuments : [{ name: "", url: "" }],
    });
  }, [initialValues, open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit({
      ...formValues,
      projectName: formValues.projectName.trim(),
      location: formValues.location.trim(),
      description: formValues.description.trim(),
      pddDocuments: formValues.pddDocuments
        .map((document) => ({
          name: document.name.trim(),
          url: document.url.trim(),
        }))
        .filter((document) => document.url),
    });
  };

  const title = mode === "edit" ? "Edit Listing" : "Create Listing";
  const description = mode === "edit"
    ? "Update inventory, trust documents, and publishing state without disturbing historical retirements."
    : "Create a draft listing with transparent project metadata before pushing it live to buyers.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      panelClassName="max-w-5xl"
      contentClassName="max-h-[80vh] overflow-y-auto"
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={projectNameId}>Project Name</Label>
            <Input
              id={projectNameId}
              placeholder="Amazon Forest Reserve"
              value={formValues.projectName}
              onChange={(event) => setFormValues((current) => ({ ...current, projectName: event.target.value }))}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={locationId}>Location</Label>
            <Input
              id={locationId}
              placeholder="Para, Brazil"
              value={formValues.location}
              onChange={(event) => setFormValues((current) => ({ ...current, location: event.target.value }))}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={categoryId}>Category</Label>
            <select
              id={categoryId}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={formValues.category}
              onChange={(event) => setFormValues((current) => ({
                ...current,
                category: event.target.value as ProjectManagementCategory,
              }))}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={registryId}>Registry</Label>
            <select
              id={registryId}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={formValues.registry}
              onChange={(event) => setFormValues((current) => ({
                ...current,
                registry: event.target.value as ProjectManagementRegistry,
              }))}
            >
              {REGISTRY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={statusId}>Listing Status</Label>
            <select
              id={statusId}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={formValues.status}
              onChange={(event) => setFormValues((current) => ({
                ...current,
                status: event.target.value as ProjectManagementStatus,
              }))}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={vintageYearId}>Vintage Year</Label>
            <Input
              id={vintageYearId}
              type="number"
              min={2000}
              max={new Date().getFullYear() + 1}
              value={formValues.vintageYear}
              onChange={(event) => setFormValues((current) => ({
                ...current,
                vintageYear: Number(event.target.value),
              }))}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={totalSupplyId}>Total Supply</Label>
            <Input
              id={totalSupplyId}
              type="number"
              min={0}
              step={1}
              value={formValues.totalSupply}
              onChange={(event) => setFormValues((current) => ({
                ...current,
                totalSupply: Number(event.target.value),
              }))}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={priceId}>Price Per Credit</Label>
            <Input
              id={priceId}
              type="number"
              min={0}
              step="0.01"
              value={formValues.price}
              onChange={(event) => setFormValues((current) => ({
                ...current,
                price: Number(event.target.value),
              }))}
              required
            />
          </div>

          <div className="grid gap-2 md:grid-cols-2 md:col-span-2">
            <div className="grid gap-2">
              <Label htmlFor={latitudeId}>Latitude</Label>
              <Input
                id={latitudeId}
                type="number"
                min={-90}
                max={90}
                step="0.0001"
                value={formValues.latitude}
                onChange={(event) => setFormValues((current) => ({
                  ...current,
                  latitude: event.target.value === "" ? "" : Number(event.target.value),
                }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={longitudeId}>Longitude</Label>
              <Input
                id={longitudeId}
                type="number"
                min={-180}
                max={180}
                step="0.0001"
                value={formValues.longitude}
                onChange={(event) => setFormValues((current) => ({
                  ...current,
                  longitude: event.target.value === "" ? "" : Number(event.target.value),
                }))}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={descriptionId}>Project Description</Label>
          <textarea
            id={descriptionId}
            className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Describe the climate impact, methodology, and why this listing builds buyer confidence."
            value={formValues.description}
            onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))}
          />
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">Project Design Documents</h3>
              <p className="text-sm text-muted-foreground">Add public PDD links buyers can review before checkout.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFormValues((current) => ({
                ...current,
                pddDocuments: [...current.pddDocuments, { name: "", url: "" }],
              }))}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add PDD
            </Button>
          </div>

          <div className="space-y-3">
            {formValues.pddDocuments.map((document, index) => (
              <div key={`${index}-${document.url}`} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
                <div className="grid gap-2">
                  <Label>Document Name</Label>
                  <Input
                    placeholder="PDD v1"
                    value={document.name}
                    onChange={(event) => setFormValues((current) => ({
                      ...current,
                      pddDocuments: current.pddDocuments.map((entry, entryIndex) => (
                        entryIndex === index ? { ...entry, name: event.target.value } : entry
                      )),
                    }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Document URL</Label>
                  <Input
                    type="url"
                    placeholder="https://example.com/project-design-document.pdf"
                    value={document.url}
                    onChange={(event) => setFormValues((current) => ({
                      ...current,
                      pddDocuments: current.pddDocuments.map((entry, entryIndex) => (
                        entryIndex === index ? { ...entry, url: event.target.value } : entry
                      )),
                    }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setFormValues((current) => ({
                    ...current,
                    pddDocuments: current.pddDocuments.length > 1
                      ? current.pddDocuments.filter((_, entryIndex) => entryIndex !== index)
                      : [{ name: "", url: "" }],
                  }))}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              submitting
              || !formValues.projectName.trim()
              || !formValues.location.trim()
              || formValues.totalSupply < 0
              || formValues.price < 0
              || ((formValues.latitude === "") !== (formValues.longitude === ""))
            }
          >
            {submitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "edit" ? "Save Listing" : "Create Listing"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
