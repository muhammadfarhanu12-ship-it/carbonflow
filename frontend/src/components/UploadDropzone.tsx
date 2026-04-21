import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import {
  IMPORT_FILE_ACCEPT,
  MAX_IMPORT_FILE_SIZE_BYTES,
  formatFileSize,
} from "@/src/features/shipment-import/utils";

type UploadDropzoneProps = {
  file: File | null;
  parsing: boolean;
  parseProgress: number;
  onFileAccepted: (file: File) => void;
  onError: (message: string) => void;
};

export function UploadDropzone({
  file,
  parsing,
  parseProgress,
  onFileAccepted,
  onError,
}: UploadDropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    maxSize: MAX_IMPORT_FILE_SIZE_BYTES,
    accept: IMPORT_FILE_ACCEPT,
    disabled: parsing,
    onDropAccepted: (acceptedFiles) => {
      const nextFile = acceptedFiles[0];
      if (nextFile) {
        onFileAccepted(nextFile);
      }
    },
    onDropRejected: (fileRejections) => {
      const firstRejection = fileRejections[0];
      const firstError = firstRejection?.errors[0];

      if (firstError?.code === "file-too-large") {
        onError(`File exceeds the ${formatFileSize(MAX_IMPORT_FILE_SIZE_BYTES)} limit.`);
        return;
      }

      onError("Unsupported file format. Upload a .csv or .xlsx file.");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Upload Source File</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          {...getRootProps()}
          className={[
            "cursor-pointer rounded-2xl border border-dashed px-6 py-10 transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
            parsing ? "pointer-events-none opacity-70" : "",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
              {parsing ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
            </div>
            <p className="text-base font-semibold text-foreground">
              {file ? file.name : "Drag and drop a CSV or Excel file"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Supports `.csv` and `.xlsx` files up to {formatFileSize(MAX_IMPORT_FILE_SIZE_BYTES)}
            </p>
            {file ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {formatFileSize(file.size)}
              </div>
            ) : null}
          </div>
        </div>

        {parsing ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Parsing file</span>
              <span>{Math.max(0, Math.min(100, Math.round(parseProgress)))}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(4, Math.min(100, parseProgress))}%` }}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
