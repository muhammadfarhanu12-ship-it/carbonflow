import { startTransition, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCcw, Upload } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/shared/Modal";
import { UploadDropzone } from "@/src/components/UploadDropzone";
import { ColumnMapper } from "@/src/components/ColumnMapper";
import { DataPreviewTable } from "@/src/components/DataPreviewTable";
import { useToast } from "@/src/components/providers/ToastProvider";
import { shipmentService } from "@/src/services/shipmentService";
import { parseImportFile } from "@/src/features/shipment-import/parsers";
import type {
  ColumnMapping,
  EditableDraftField,
  ImportDefaults,
  ImportShipmentDraft,
  MappingTemplate,
  ParsedImportFile,
} from "@/src/features/shipment-import/types";
import {
  DEFAULT_IMPORT_DEFAULTS,
  IMPORT_PREVIEW_LIMIT,
  IMPORT_UPLOAD_CHUNK_SIZE,
  buildErrorReportCsv,
  buildImportDraftsForRows,
  buildImportPayloadRows,
  buildSuggestedMapping,
  buildTemplateSignature,
  downloadTextFile,
  getDuplicateMappedFields,
  getHeaderSampleValues,
  getMissingRequiredMappedFields,
  readMappingTemplates,
  updateDraftValue,
  writeMappingTemplates,
} from "@/src/features/shipment-import/utils";
import type { ShipmentImportError, ShipmentImportResult } from "@/src/types/platform";

type UploadDataModalProps = {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => void;
};

function aggregateImportResults(
  parsedFile: ParsedImportFile,
  uploadId: string,
  batchResults: ShipmentImportResult[],
) {
  const errors = batchResults.flatMap((result) => result.errors);
  const successful = batchResults.reduce((sum, result) => sum + result.summary.successful, 0);
  const failed = batchResults.reduce((sum, result) => sum + result.summary.failed, 0);
  const inserted = batchResults.reduce((sum, result) => sum + result.summary.inserted, 0);
  const updated = batchResults.reduce((sum, result) => sum + result.summary.updated, 0);

  return {
    summary: {
      total: parsedFile.rows.length,
      successful,
      ["\u0938\u092B\u0932"]: successful,
      failed,
      inserted,
      updated,
    },
    errors,
    metadata: {
      source: parsedFile.source,
      totalRows: parsedFile.rows.length,
      fileName: parsedFile.fileName,
      uploadId,
      processedRows: parsedFile.rows.length,
    },
  } satisfies ShipmentImportResult;
}

export function UploadDataModal({ open, onClose, onUploaded }: UploadDataModalProps) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [defaults, setDefaults] = useState<ImportDefaults>(DEFAULT_IMPORT_DEFAULTS);
  const [drafts, setDrafts] = useState<ImportShipmentDraft[]>([]);
  const [parseProgress, setParseProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [buildingDrafts, setBuildingDrafts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [onlyInvalidRows, setOnlyInvalidRows] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [backendErrors, setBackendErrors] = useState<ShipmentImportError[]>([]);
  const [importResult, setImportResult] = useState<ShipmentImportResult | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setTemplates(readMappingTemplates());
  }, [open]);

  useEffect(() => {
    if (!parsedFile) {
      setDrafts([]);
      return;
    }

    let cancelled = false;

    const buildDrafts = async () => {
      setBuildingDrafts(true);
      const nextDrafts: ImportShipmentDraft[] = [];

      for (let index = 0; index < parsedFile.rows.length; index += 1000) {
        if (cancelled) {
          return;
        }

        nextDrafts.push(
          ...buildImportDraftsForRows(
            parsedFile.rows.slice(index, index + 1000),
            parsedFile.headers,
            mapping,
            defaults,
          ),
        );

        if (index + 1000 < parsedFile.rows.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setDrafts(nextDrafts);
        setBackendErrors([]);
        setImportResult(null);
      });
      setBuildingDrafts(false);
    };

    void buildDrafts();

    return () => {
      cancelled = true;
    };
  }, [defaults, mapping, parsedFile]);

  const headerSamples = useMemo(() => (
    parsedFile ? getHeaderSampleValues(parsedFile) : {}
  ), [parsedFile]);

  const missingRequiredMappings = useMemo(() => getMissingRequiredMappedFields(mapping), [mapping]);
  const duplicateMappedFields = useMemo(() => getDuplicateMappedFields(mapping), [mapping]);
  const invalidRowCount = useMemo(() => drafts.filter((row) => row.clientErrors.length > 0).length, [drafts]);
  const malformedRowCount = useMemo(() => drafts.filter((row) => row.malformedMessages.length > 0).length, [drafts]);
  const rawPreviewRows = useMemo(() => parsedFile?.rows.slice(0, 20) || [], [parsedFile]);
  const activeTemplateName = useMemo(() => (
    templates.find((template) => template.id === activeTemplateId)?.name || null
  ), [activeTemplateId, templates]);

  const resetState = () => {
    setActiveTemplateId("");
    setFile(null);
    setParsedFile(null);
    setMapping({});
    setDefaults(DEFAULT_IMPORT_DEFAULTS);
    setDrafts([]);
    setParseProgress(0);
    setUploadProgress(0);
    setParsing(false);
    setBuildingDrafts(false);
    setSubmitting(false);
    setOnlyInvalidRows(false);
    setWorkflowError("");
    setBackendErrors([]);
    setImportResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileAccepted = async (nextFile: File) => {
    setWorkflowError("");
    setBackendErrors([]);
    setImportResult(null);
    setFile(nextFile);
    setParsedFile(null);
    setParseProgress(0);
    setParsing(true);

    try {
      const nextParsedFile = await parseImportFile(nextFile, setParseProgress);
      if (nextParsedFile.headers.length === 0) {
        throw new Error("The uploaded file does not contain a valid header row.");
      }

      if (nextParsedFile.rows.length === 0) {
        throw new Error("The uploaded file does not contain any data rows.");
      }

      startTransition(() => {
        setParsedFile(nextParsedFile);
        setMapping(buildSuggestedMapping(nextParsedFile.headers));
        setDefaults(DEFAULT_IMPORT_DEFAULTS);
        setActiveTemplateId("");
      });
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : "Failed to parse the selected file.");
    } finally {
      setParsing(false);
      setParseProgress(100);
    }
  };

  const handleDefaultsChange = <K extends keyof ImportDefaults>(field: K, value: ImportDefaults[K]) => {
    setDefaults((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleTemplateApply = (templateId: string) => {
    setActiveTemplateId(templateId);
    if (!templateId || !parsedFile) {
      return;
    }

    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const nextMapping = parsedFile.headers.reduce<ColumnMapping>((accumulator, header) => {
      accumulator[header] = template.mapping[header] || "";
      return accumulator;
    }, {});

    setMapping(nextMapping);
    setDefaults(template.defaults);
    showToast({
      tone: "info",
      title: "Template applied",
      description: `${template.name} has been applied to the current file.`,
    });
  };

  const handleTemplateSave = (templateName: string) => {
    if (!parsedFile) {
      return;
    }

    const now = new Date().toISOString();
    const nextTemplate: MappingTemplate = {
      id: crypto.randomUUID(),
      name: templateName,
      mapping,
      defaults,
      createdAt: now,
      updatedAt: now,
    };

    const normalizedSignature = buildTemplateSignature(parsedFile.headers);
    const nextTemplates = [
      nextTemplate,
      ...templates.filter((template) => (
        template.name.toLowerCase() !== templateName.toLowerCase()
        || buildTemplateSignature(Object.keys(template.mapping)) !== normalizedSignature
      )),
    ];

    setTemplates(nextTemplates);
    writeMappingTemplates(nextTemplates);
    setActiveTemplateId(nextTemplate.id);
    showToast({
      tone: "success",
      title: "Template saved",
      description: `${templateName} is ready to reuse on future imports.`,
    });
  };

  const handleEditCell = (
    rowIndex: number,
    field: EditableDraftField,
    value: string,
  ) => {
    setDrafts((current) => current.map((row) => (
      row.rowIndex === rowIndex ? updateDraftValue(row, field, value) : row
    )));
    setBackendErrors((current) => current.filter((error) => error.rowIndex !== rowIndex));
    setImportResult(null);
  };

  const handleSubmit = async () => {
    if (!parsedFile) {
      return;
    }

    if (missingRequiredMappings.length > 0) {
      setWorkflowError(`Map the required fields before importing: ${missingRequiredMappings.join(", ")}.`);
      return;
    }

    if (duplicateMappedFields.length > 0) {
      setWorkflowError(`Each system field can only be mapped once. Resolve duplicates for: ${duplicateMappedFields.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);
    setWorkflowError("");
    setBackendErrors([]);
    setImportResult(null);

    const payloadRows = buildImportPayloadRows(drafts);
    const uploadId = crypto.randomUUID();
    const totalBatches = Math.max(1, Math.ceil(payloadRows.length / IMPORT_UPLOAD_CHUNK_SIZE));
    const batchResults: ShipmentImportResult[] = [];

    try {
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const batchRows = payloadRows.slice(
          batchIndex * IMPORT_UPLOAD_CHUNK_SIZE,
          (batchIndex + 1) * IMPORT_UPLOAD_CHUNK_SIZE,
        );

        const result = await shipmentService.importShipments({
          shipments: batchRows,
          metadata: {
            source: parsedFile.source,
            totalRows: payloadRows.length,
            fileName: parsedFile.fileName,
            uploadId,
            batchIndex,
            totalBatches,
            templateName: activeTemplateName,
          },
        });

        batchResults.push(result);
        setUploadProgress(((batchIndex + 1) / totalBatches) * 100);
      }

      const aggregatedResult = aggregateImportResults(parsedFile, uploadId, batchResults);
      setBackendErrors(aggregatedResult.errors);
      setImportResult(aggregatedResult);

      showToast({
        tone: aggregatedResult.errors.length > 0 ? "info" : "success",
        title: aggregatedResult.errors.length > 0 ? "Import completed with issues" : "Import completed",
        description: `${aggregatedResult.summary.successful} of ${aggregatedResult.summary.total} rows were saved.`,
      });

      if (aggregatedResult.summary.successful > 0) {
        onUploaded?.();
      }
    } catch (error) {
      const aggregatedResult = batchResults.length > 0
        ? aggregateImportResults(parsedFile, uploadId, batchResults)
        : null;

      if (aggregatedResult) {
        setBackendErrors(aggregatedResult.errors);
        setImportResult(aggregatedResult);
      }

      const message = error instanceof Error ? error.message : "Shipment import failed.";
      setWorkflowError(message);
      showToast({
        tone: "error",
        title: "Import failed",
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadErrors = () => {
    if (!importResult || importResult.errors.length === 0) {
      return;
    }

    const csvContent = buildErrorReportCsv(importResult.errors, drafts);
    downloadTextFile(
      `${(parsedFile?.fileName || "shipment-import").replace(/\.[^.]+$/, "")}-errors.csv`,
      csvContent,
      "text/csv;charset=utf-8",
    );
  };

  const canSubmit = Boolean(
    parsedFile
    && drafts.length > 0
    && missingRequiredMappings.length === 0
    && duplicateMappedFields.length === 0
    && !parsing
    && !buildingDrafts
    && !submitting,
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Bulk Shipment Importer"
      description="Upload, map, validate, and import shipment data from CSV or Excel files with chunked enterprise-grade processing."
      panelClassName="max-w-7xl"
      contentClassName="max-h-[80vh] overflow-y-auto"
    >
      <div className="space-y-6">
        {workflowError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {workflowError}
          </div>
        ) : null}

        <UploadDropzone
          file={file}
          parsing={parsing}
          parseProgress={parseProgress}
          onFileAccepted={handleFileAccepted}
          onError={setWorkflowError}
        />

        {parsedFile ? (
          <>
            <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
              <div className="rounded-2xl border bg-muted/10 p-4">
                <p className="text-sm font-medium text-foreground">Detected headers</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {parsedFile.headers.map((header) => (
                    <span key={header} className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground">
                      {header}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/10 p-4">
                <p className="text-sm font-medium text-foreground">File summary</p>
                <dl className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <dt>Rows detected</dt>
                    <dd className="font-medium text-foreground">{parsedFile.rows.length.toLocaleString()}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Malformed rows</dt>
                    <dd className="font-medium text-foreground">{malformedRowCount.toLocaleString()}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Client-side invalid rows</dt>
                    <dd className="font-medium text-foreground">{invalidRowCount.toLocaleString()}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Source</dt>
                    <dd className="font-medium uppercase text-foreground">{parsedFile.source}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Raw data preview</p>
                  <p className="text-sm text-muted-foreground">
                    Review the first {Math.min(rawPreviewRows.length, 20)} uploaded rows before final mapping.
                  </p>
                </div>
                <Button type="button" variant="ghost" onClick={() => handleFileAccepted(file as File)} disabled={!file || parsing}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Re-parse file
                </Button>
              </div>
              <div className="mt-4 overflow-x-auto rounded-xl border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Row</th>
                      {parsedFile.headers.map((header) => (
                        <th key={header} className="px-4 py-3 font-medium">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rawPreviewRows.map((row) => (
                      <tr key={row.rowIndex}>
                        <td className="px-4 py-3 font-medium text-foreground">{row.rowIndex}</td>
                        {parsedFile.headers.map((header) => (
                          <td key={`${row.rowIndex}-${header}`} className="max-w-[14rem] truncate px-4 py-3 text-muted-foreground" title={row.values[header] || ""}>
                            {row.values[header] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <ColumnMapper
              headers={parsedFile.headers}
              headerSamples={headerSamples}
              mapping={mapping}
              defaults={defaults}
              templates={templates}
              activeTemplateId={activeTemplateId}
              onMappingChange={(header, field) => {
                setMapping((current) => ({
                  ...current,
                  [header]: field,
                }));
              }}
              onDefaultsChange={handleDefaultsChange}
              onTemplateApply={handleTemplateApply}
              onTemplateSave={handleTemplateSave}
            />

            {buildingDrafts ? (
              <div className="rounded-2xl border bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                Building preview rows and running client-side validation...
              </div>
            ) : (
              <DataPreviewTable
                rows={drafts}
                backendErrors={backendErrors}
                onlyInvalidRows={onlyInvalidRows}
                onOnlyInvalidRowsChange={setOnlyInvalidRows}
                onEditCell={handleEditCell}
              />
            )}

            {submitting ? (
              <div className="rounded-2xl border bg-muted/10 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Uploading import batches</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, uploadProgress)}%` }} />
                </div>
              </div>
            ) : null}

            {importResult ? (
              <div className="rounded-2xl border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">Import summary</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {importResult.summary.successful} of {importResult.summary.total} rows were saved across the bulk import run.
                    </p>
                  </div>
                  {importResult.errors.length > 0 ? (
                    <Button type="button" variant="outline" onClick={handleDownloadErrors}>
                      <Download className="mr-2 h-4 w-4" />
                      Download error CSV
                    </Button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-muted/10 p-4">
                    <p className="text-sm text-muted-foreground">Total rows</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">{importResult.summary.total}</p>
                  </div>
                  <div className="rounded-xl border bg-emerald-50 p-4">
                    <p className="text-sm text-emerald-700">Successful</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-900">{importResult.summary.successful}</p>
                  </div>
                  <div className="rounded-xl border bg-amber-50 p-4">
                    <p className="text-sm text-amber-700">Failed</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-900">{importResult.summary.failed}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/10 p-4">
                    <p className="text-sm text-muted-foreground">Inserted / Updated</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {importResult.summary.inserted} / {importResult.summary.updated}
                    </p>
                  </div>
                </div>

                {importResult.errors.length > 0 ? (
                  <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Row</th>
                          <th className="px-4 py-3 font-medium">Field</th>
                          <th className="px-4 py-3 font-medium">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {importResult.errors.slice(0, IMPORT_PREVIEW_LIMIT).map((error, index) => (
                          <tr key={`${error.rowIndex}-${error.field}-${index}`}>
                            <td className="px-4 py-3 font-medium text-foreground">{error.rowIndex}</td>
                            <td className="px-4 py-3">{error.field}</td>
                            <td className="px-4 py-3 text-muted-foreground">{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Required mappings: `destination`, `weightKg`. Optional invalid rows are still highlighted before submission.
          </p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Close
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {submitting ? "Importing..." : "Import Shipments"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
