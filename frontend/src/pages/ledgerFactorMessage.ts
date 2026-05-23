import type { EmissionFactor } from "@/src/services/emissionsService";

export function buildLedgerFactorMessage(factor: EmissionFactor | null | undefined) {
  if (factor === undefined) {
    return "Checking emission factor match...";
  }

  if (factor === null) {
    return "No matching emission factor found for this scope/category/activity/unit/fuel.";
  }

  const factorValue = factor.factorValue ?? factor.value;
  const sourceName = factor.sourceName || "Configured emission factor";
  const sourceYear = factor.sourceYear || "";
  const factorUnit = factor.factorUnit || "kgCO2e/unit";

  if (factor.isSample !== false) {
    return "This activity uses a sample emission factor. Replace with an official/custom factor before official reporting.";
  }

  const status = factor.isCustom ? "custom" : "official";
  return `Using ${status} emission factor: ${sourceName} ${sourceYear}, ${factorValue} ${factorUnit}.`;
}
