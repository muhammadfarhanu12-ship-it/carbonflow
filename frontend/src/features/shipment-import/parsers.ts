import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ImportFileSource, ParsedImportFile, ParsedImportRow } from "@/src/features/shipment-import/types";

function toCellString(value: unknown) {
  return String(value ?? "").trim();
}

function buildParsedRowsFromMatrix(headers: string[], matrix: unknown[][]) {
  return matrix.map<ParsedImportRow>((rowValues, index) => {
    const values = headers.reduce<Record<string, string>>((accumulator, header, headerIndex) => {
      accumulator[header] = toCellString(rowValues[headerIndex]);
      return accumulator;
    }, {});

    return {
      rowIndex: index + 2,
      values,
      malformedMessages: [],
    };
  });
}

function resolveFileSource(file: File): ImportFileSource {
  return /\.csv$/i.test(file.name) ? "csv" : "excel";
}

async function parseCsvFile(file: File, onProgress: (progress: number) => void) {
  return new Promise<ParsedImportFile>((resolve, reject) => {
    const rows: Array<Record<string, unknown>> = [];
    const rowErrorMap = new Map<number, string[]>();
    let headers: string[] = [];

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: false,
      worker: true,
      chunkSize: 1024 * 256,
      chunk: (results) => {
        if (results.meta.fields?.length) {
          headers = results.meta.fields.map((header, index) => toCellString(header) || `Column ${index + 1}`);
        }

        results.errors.forEach((error) => {
          const rowIndex = Number(error.row ?? 0) + 2;
          const messages = rowErrorMap.get(rowIndex) || [];
          messages.push(error.message);
          rowErrorMap.set(rowIndex, messages);
        });

        rows.push(...results.data);

        if (file.size > 0) {
          onProgress(Math.min(99, (Number(results.meta.cursor || 0) / file.size) * 100));
        }
      },
      complete: () => {
        const parsedRows = rows.map<ParsedImportRow>((row, index) => {
          const values = headers.reduce<Record<string, string>>((accumulator, header) => {
            accumulator[header] = toCellString(row[header]);
            return accumulator;
          }, {});

          if (Array.isArray(row.__parsed_extra) && row.__parsed_extra.length > 0) {
            const currentMessages = rowErrorMap.get(index + 2) || [];
            currentMessages.push("Row contains more values than the header row.");
            rowErrorMap.set(index + 2, currentMessages);
          }

          return {
            rowIndex: index + 2,
            values,
            malformedMessages: rowErrorMap.get(index + 2) || [],
          };
        });

        onProgress(100);
        resolve({
          source: "csv",
          fileName: file.name,
          headers,
          rows: parsedRows,
        });
      },
      error: (error) => reject(error),
    });
  });
}

async function parseExcelFile(file: File, onProgress: (progress: number) => void) {
  onProgress(10);
  const buffer = await file.arrayBuffer();
  onProgress(40);

  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!matrix.length) {
    throw new Error("The uploaded spreadsheet is empty.");
  }

  const headerRow = (matrix[0] || []).map((headerValue, index) => toCellString(headerValue) || `Column ${index + 1}`);
  const parsedRows = buildParsedRowsFromMatrix(headerRow, matrix.slice(1));

  onProgress(100);
  return {
    source: "excel",
    fileName: file.name,
    headers: headerRow,
    rows: parsedRows,
  } satisfies ParsedImportFile;
}

export async function parseImportFile(file: File, onProgress: (progress: number) => void) {
  const source = resolveFileSource(file);

  if (source === "csv") {
    return parseCsvFile(file, onProgress);
  }

  return parseExcelFile(file, onProgress);
}
