// frontend/src/utils/format.ts
export function uniqueMessages(messages: readonly string[]): string[] {
  return [...new Set(messages.map((message) => message.trim()).filter(Boolean))];
}

export function joinDisplayLabel(parts: readonly (string | number | null | undefined)[], separator = " "): string {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean).join(separator);
}

export function formatMonthYear(isoMonth: string): string {
  const match = isoMonth.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return isoMonth.trim();
  const [, year, month] = match;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function deriveReportingMonth(record: { reportingPeriodStart?: string | null; activityDate?: string | null; occurredAt?: string | null }): string {
  const sourceDate = record.reportingPeriodStart ?? record.activityDate ?? record.occurredAt ?? "";
  const date = new Date(sourceDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 7);
}

export function normalizeMonthLabel(label: string): string {
  const trimmed = label.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return formatMonthYear(trimmed);
  const ambiguousMatch = trimmed.match(/^([A-Z][a-z]{2})\s(\d{2})$/);
  if (!ambiguousMatch) return trimmed;
  const [, month, year] = ambiguousMatch;
  return `${month} 20${year}`;
}

export function financialTextClassName(value: number): string {
  if (value < 0) return "text-destructive";
  if (value === 0) return "text-muted-foreground";
  return "text-foreground";
}
