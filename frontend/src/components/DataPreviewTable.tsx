import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import type { EditableDraftField, ImportShipmentDraft } from "@/src/features/shipment-import/types";
import { IMPORT_PREVIEW_LIMIT, TRANSPORT_MODE_OPTIONS } from "@/src/features/shipment-import/utils";
import type { ShipmentImportError } from "@/src/types/platform";

type DataPreviewTableProps = {
  rows: ImportShipmentDraft[];
  backendErrors: ShipmentImportError[];
  onlyInvalidRows: boolean;
  onOnlyInvalidRowsChange: (nextValue: boolean) => void;
  onEditCell: (rowIndex: number, field: EditableDraftField, value: string) => void;
};

function buildBackendErrorMap(errors: ShipmentImportError[]) {
  return errors.reduce<Record<number, ShipmentImportError[]>>((accumulator, error) => {
    if (!accumulator[error.rowIndex]) {
      accumulator[error.rowIndex] = [];
    }

    accumulator[error.rowIndex].push(error);
    return accumulator;
  }, {});
}

export function DataPreviewTable({
  rows,
  backendErrors,
  onlyInvalidRows,
  onOnlyInvalidRowsChange,
  onEditCell,
}: DataPreviewTableProps) {
  const backendErrorMap = buildBackendErrorMap(backendErrors);
  const visibleRows = (onlyInvalidRows ? rows.filter((row) => row.clientErrors.length > 0 || backendErrorMap[row.rowIndex]?.length) : rows)
    .slice(0, IMPORT_PREVIEW_LIMIT);
  const invalidRowCount = rows.filter((row) => row.clientErrors.length > 0).length;

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>3. Preview, Validate, and Fix</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing up to {IMPORT_PREVIEW_LIMIT} rows. Inline edits update the import payload before submission.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyInvalidRows}
              onChange={(event) => onOnlyInvalidRowsChange(event.target.checked)}
            />
            Show only invalid rows ({invalidRowCount})
          </label>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {rows.length - invalidRowCount} rows ready
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            {invalidRowCount} rows need attention
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[1100px] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Row</th>
                <th className="px-4 py-3 font-medium">Origin</th>
                <th className="px-4 py-3 font-medium">Destination</th>
                <th className="px-4 py-3 font-medium">Weight (kg)</th>
                <th className="px-4 py-3 font-medium">Distance (km)</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">Fuel Type</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Carrier</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-6 text-center text-muted-foreground">
                    No preview rows available yet.
                  </td>
                </tr>
              ) : visibleRows.map((row) => {
                const allErrors = [...row.clientErrors, ...(backendErrorMap[row.rowIndex] || [])];
                const hasErrors = allErrors.length > 0;
                const cellClassName = hasErrors ? "border-amber-300 bg-amber-50/60" : "";

                return (
                  <tr key={row.rowIndex} className={hasErrors ? "bg-amber-50/20" : ""}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.rowIndex}</td>
                    <td className="px-4 py-3">
                      <input
                        className={`w-36 rounded-md border border-input bg-background px-3 py-2 text-sm ${cellClassName}`}
                        value={row.origin}
                        onChange={(event) => onEditCell(row.rowIndex, "origin", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className={`w-40 rounded-md border border-input bg-background px-3 py-2 text-sm ${cellClassName}`}
                        value={row.destination}
                        onChange={(event) => onEditCell(row.rowIndex, "destination", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className={`w-28 rounded-md border border-input bg-background px-3 py-2 text-sm ${cellClassName}`}
                        type="number"
                        value={row.weightKg}
                        onChange={(event) => onEditCell(row.rowIndex, "weightKg", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className={`w-28 rounded-md border border-input bg-background px-3 py-2 text-sm ${cellClassName}`}
                        type="number"
                        value={row.distanceKm}
                        onChange={(event) => onEditCell(row.rowIndex, "distanceKm", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className={`w-28 rounded-md border border-input bg-background px-3 py-2 text-sm ${cellClassName}`}
                        value={row.transportMode}
                        onChange={(event) => onEditCell(row.rowIndex, "transportMode", event.target.value)}
                      >
                        {TRANSPORT_MODE_OPTIONS.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.fuelType}
                        onChange={(event) => onEditCell(row.rowIndex, "fuelType", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.reference}
                        onChange={(event) => onEditCell(row.rowIndex, "reference", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.supplierName}
                        onChange={(event) => onEditCell(row.rowIndex, "supplierName", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={row.carrier}
                        onChange={(event) => onEditCell(row.rowIndex, "carrier", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className={`w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ${cellClassName}`}
                        type="number"
                        min="0"
                        value={row.costUsd}
                        onChange={(event) => onEditCell(row.rowIndex, "costUsd", event.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {allErrors.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {allErrors.map((error, index) => (
                            <span
                              key={`${row.rowIndex}-${error.field}-${index}`}
                              className="cursor-help rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700"
                              title={`${error.field}: ${error.message}`}
                            >
                              {error.field}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-emerald-700">No issues</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
