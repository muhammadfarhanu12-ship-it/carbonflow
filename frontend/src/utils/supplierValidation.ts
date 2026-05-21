import type { SupplierPayload } from "@/src/services/supplierService";

export type SupplierFieldErrors = Partial<Record<keyof SupplierPayload, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSupplierPayload(payload: SupplierPayload): SupplierFieldErrors {
  const errors: SupplierFieldErrors = {};
  const contactEmail = String(payload.contactEmail || "").trim();
  const lastReportedAt = payload.lastReportedAt ? new Date(payload.lastReportedAt) : null;

  if (!payload.name.trim()) errors.name = "Supplier name is required.";
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) errors.contactEmail = "Enter a valid contact email.";
  if (!payload.country.trim()) errors.country = "Country is required.";
  if (!payload.category.trim()) errors.category = "Category is required.";
  if (!Number.isFinite(payload.totalEmissions) || payload.totalEmissions < 0) errors.totalEmissions = "Total emissions must be 0 or greater.";
  if (payload.revenue !== null && payload.revenue !== undefined && payload.revenue <= 0) errors.revenue = "Revenue/activity base must be greater than 0 when provided.";
  if (payload.revenueOrActivityBase !== null && payload.revenueOrActivityBase !== undefined && payload.revenueOrActivityBase <= 0) errors.revenueOrActivityBase = "Revenue/activity base must be greater than 0 when provided.";
  if (!Number.isFinite(payload.dataTransparencyScore) || payload.dataTransparencyScore < 0 || payload.dataTransparencyScore > 100) errors.dataTransparencyScore = "Transparency score must be between 0 and 100.";
  if (payload.complianceScore !== undefined && (!Number.isFinite(payload.complianceScore) || payload.complianceScore < 0 || payload.complianceScore > 100)) errors.complianceScore = "Compliance proxy must be between 0 and 100.";
  if (lastReportedAt && (Number.isNaN(lastReportedAt.getTime()) || lastReportedAt.getTime() > Date.now())) errors.lastReportedAt = "Last reported date cannot be in the future.";
  if (!payload.verificationStatus) errors.verificationStatus = "Verification status is required.";
  if (!payload.invitationStatus) errors.invitationStatus = "Invitation status is required.";

  return errors;
}

export function hasSupplierErrors(errors: SupplierFieldErrors) {
  return Object.keys(errors).length > 0;
}
