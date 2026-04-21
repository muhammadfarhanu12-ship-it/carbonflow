import { useMemo, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import type {
  ColumnMapping,
  ImportDefaults,
  ImportField,
  MappingTemplate,
} from "@/src/features/shipment-import/types";
import {
  DEFAULT_IMPORT_DEFAULTS,
  IMPORT_FIELD_DEFINITIONS,
  getDuplicateMappedFields,
  getMissingRequiredMappedFields,
} from "@/src/features/shipment-import/utils";

type ColumnMapperProps = {
  headers: string[];
  headerSamples: Record<string, string>;
  mapping: ColumnMapping;
  defaults: ImportDefaults;
  templates: MappingTemplate[];
  activeTemplateId: string;
  onMappingChange: (header: string, field: ImportField | "") => void;
  onDefaultsChange: <K extends keyof ImportDefaults>(field: K, value: ImportDefaults[K]) => void;
  onTemplateApply: (templateId: string) => void;
  onTemplateSave: (templateName: string) => void;
};

export function ColumnMapper({
  headers,
  headerSamples,
  mapping,
  defaults,
  templates,
  activeTemplateId,
  onMappingChange,
  onDefaultsChange,
  onTemplateApply,
  onTemplateSave,
}: ColumnMapperProps) {
  const [templateName, setTemplateName] = useState("");

  const missingRequiredFields = useMemo(() => getMissingRequiredMappedFields(mapping), [mapping]);
  const duplicateMappedFields = useMemo(() => getDuplicateMappedFields(mapping), [mapping]);
  const mappedCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>2. Map Uploaded Columns</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-2xl border bg-muted/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">Mapped columns:</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {mappedCount} / {headers.length}
              </span>
              {missingRequiredFields.length === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Required fields mapped
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                  Missing required mappings: {missingRequiredFields.join(", ")}
                </span>
              )}
              {duplicateMappedFields.length > 0 ? (
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                  Duplicate mappings: {duplicateMappedFields.join(", ")}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Core fields are shown first. Advanced fields help populate platform-required shipment data like references and carrier defaults.
            </p>
          </div>

          <div className="rounded-2xl border bg-muted/10 p-4">
            <p className="text-sm font-medium text-foreground">Mapping templates</p>
            <div className="mt-3 flex gap-2">
              <select
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={activeTemplateId}
                onChange={(event) => onTemplateApply(event.target.value)}
              >
                <option value="">Choose saved template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Save current mapping as..."
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const normalizedName = templateName.trim();
                  if (!normalizedName) {
                    return;
                  }

                  onTemplateSave(normalizedName);
                  setTemplateName("");
                }}
              >
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Uploaded column</th>
                <th className="px-4 py-3 font-medium">Sample value</th>
                <th className="px-4 py-3 font-medium">Mapped system field</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {headers.map((header) => (
                <tr key={header}>
                  <td className="px-4 py-3 font-medium text-foreground">{header}</td>
                  <td className="max-w-[18rem] truncate px-4 py-3 text-muted-foreground" title={headerSamples[header] || "No sample value"}>
                    {headerSamples[header] || "No sample value"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={mapping[header] || ""}
                      onChange={(event) => onMappingChange(header, event.target.value as ImportField | "")}
                    >
                      <option value="">Ignore column</option>
                      <optgroup label="Core fields">
                        {IMPORT_FIELD_DEFINITIONS.filter((field) => field.group === "core").map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}{field.required ? " *" : ""}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Advanced fields">
                        {IMPORT_FIELD_DEFINITIONS.filter((field) => field.group === "advanced").map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Import defaults</p>
              <p className="text-sm text-muted-foreground">
                These values fill platform-required fields when the upload file does not provide them.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                Object.entries(DEFAULT_IMPORT_DEFAULTS).forEach(([field, value]) => {
                  onDefaultsChange(field as keyof ImportDefaults, value as ImportDefaults[keyof ImportDefaults]);
                });
              }}
            >
              Reset defaults
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.supplierName}
              onChange={(event) => onDefaultsChange("supplierName", event.target.value)}
              placeholder="Default supplier name"
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.carrier}
              onChange={(event) => onDefaultsChange("carrier", event.target.value)}
              placeholder="Default carrier"
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="number"
              min="0"
              value={defaults.costUsd}
              onChange={(event) => onDefaultsChange("costUsd", Number(event.target.value || 0))}
              placeholder="Default cost"
            />
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.status}
              onChange={(event) => onDefaultsChange("status", event.target.value as ImportDefaults["status"])}
            >
              <option value="PLANNED">PLANNED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
              <option value="DELAYED">DELAYED</option>
              <option value="DELIVERED">DELIVERED</option>
            </select>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.transportMode}
              onChange={(event) => onDefaultsChange("transportMode", event.target.value as ImportDefaults["transportMode"])}
            >
              <option value="ROAD">ROAD</option>
              <option value="RAIL">RAIL</option>
              <option value="AIR">AIR</option>
              <option value="OCEAN">OCEAN</option>
            </select>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.originFallback}
              onChange={(event) => onDefaultsChange("originFallback", event.target.value)}
              placeholder="Origin fallback"
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.referencePrefix}
              onChange={(event) => onDefaultsChange("referencePrefix", event.target.value)}
              placeholder="Reference prefix"
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.fuelType}
              onChange={(event) => onDefaultsChange("fuelType", event.target.value)}
              placeholder="Default fuel type"
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={defaults.vehicleType}
              onChange={(event) => onDefaultsChange("vehicleType", event.target.value)}
              placeholder="Default vehicle type"
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2 xl:col-span-2"
              value={defaults.notes}
              onChange={(event) => onDefaultsChange("notes", event.target.value)}
              placeholder="Default notes"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
