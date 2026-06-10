export type UserRole = "SUPERADMIN" | "ADMIN" | "MANAGER" | "ANALYST" | "USER" | "OWNER" | "DATA_ENTRY" | "VIEWER" | "AUDITOR";
export type SupplierRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SupplierInsightType = "warning" | "info";
export type SupplierBenchmarkComparison = "ABOVE_AVERAGE" | "AT_AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN";
export type VerificationStatus =
  | "pending"
  | "self_reported"
  | "third_party_verified"
  | "expired"
  | "rejected"
  | "VERIFIED"
  | "PENDING"
  | "ACTION_REQUIRED";
export type SupplierStatus = "draft" | "invited" | "submitted" | "under_review" | "verified" | "rejected" | "needs_update" | "approved" | "high_risk" | "archived";
export type SupplierInvitationStatus = "not_sent" | "sent" | "opened" | "submitted" | "overdue" | "expired" | "SENT" | "ACCEPTED" | "NOT_SENT";
export type SupplierQuestionnaireStatus = "not_sent" | "sent" | "opened" | "submitted" | "overdue" | "expired";
export type SupplierEvidenceType =
  | "iso_14001_certificate"
  | "sbti_commitment"
  | "ghg_inventory"
  | "esg_report"
  | "audit_report"
  | "utility_fuel_data"
  | "carbon_reduction_plan"
  | "supplier_questionnaire_answers"
  | "other";
export type SupplierEvidenceStatus = "requested" | "submitted" | "under_review" | "verified" | "rejected" | "expired";
export type ShipmentStatus = "DRAFT" | "SUBMITTED" | "PLANNED" | "IN_TRANSIT" | "DELAYED" | "DELIVERED" | "CANCELLED" | "ARCHIVED";
export type TransportMode = "ROAD" | "RAIL" | "AIR" | "OCEAN";
export type MarketplaceListingStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "PAUSED" | "ARCHIVED" | "SOLD_OUT";
export type CarbonRegistry = "VERRA" | "GOLD_STANDARD" | "PURO_EARTH";
export type ProjectVerificationStatus = "VERIFIED" | "PENDING" | "ACTION_REQUIRED";
export type ProjectSdgGoal =
  | "SDG_6_CLEAN_WATER"
  | "SDG_7_AFFORDABLE_CLEAN_ENERGY"
  | "SDG_13_CLIMATE_ACTION"
  | "SDG_14_LIFE_BELOW_WATER"
  | "SDG_15_LIFE_ON_LAND";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface SessionUser {
  id: string;
  companyId: string;
  organizationId?: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: SessionUser;
}

export interface SupplierScoreBreakdown {
  emissionScore: number;
  emissionsScore?: number;
  emissionWeightedScore?: number;
  certificationScore: number;
  certificationWeightedScore?: number;
  transparencyScore: number;
  transparencyWeightedScore?: number;
  complianceScore?: number;
  reportingFreshnessScore?: number;
  dataQualityScore?: number;
  categoryRegionRiskScore?: number;
}

export interface SupplierScoreInsight {
  type: SupplierInsightType;
  message: string;
}

export interface SupplierBenchmark {
  industryKey: string;
  industryLabel: string;
  industryAverageIntensity: number;
  percentileRank: number | null;
  industryComparison: SupplierBenchmarkComparison;
  isAboveIndustryAverage: boolean | null;
  variancePct: number | null;
  categoryAverageIntensity?: number | null;
  regionAverageIntensity?: number | null;
  companyAverageIntensity?: number | null;
  bestPerformerIntensity?: number | null;
  worstPerformerIntensity?: number | null;
  percentile?: number | null;
  benchmarkLabel?: SupplierBenchmarkComparison | "UNAVAILABLE";
  comparisonMessage?: string;
  isBenchmarkAvailable?: boolean;
  bestPerformerSupplierId?: string | null;
  bestPerformerSupplierName?: string | null;
  worstPerformerSupplierId?: string | null;
  worstPerformerSupplierName?: string | null;
  categorySupplierCount?: number;
  regionSupplierCount?: number;
  categoryComparison?: SupplierBenchmarkComparison;
  regionComparison?: SupplierBenchmarkComparison;
  companyComparison?: SupplierBenchmarkComparison;
  isBestInClass?: boolean;
  isAboveCategoryAverage?: boolean | null;
  benchmarkSource?: "internal_company_data" | "uploaded_benchmark_dataset" | "external_provider" | "unavailable";
  benchmarkSourceName?: string | null;
  benchmarkSourceYear?: number | null;
  benchmarkSourceVersion?: string | null;
  benchmarkProvider?: string | null;
  benchmarkIsOfficial?: boolean;
  benchmarkIsSample?: boolean;
  benchmarkWarning?: string | null;
  benchmarkMetadata?: {
    medianIntensity?: number | null;
    percentile25?: number | null;
    percentile75?: number | null;
    country?: string | null;
    region?: string | null;
    industryCode?: string | null;
  };
}

export interface SupplierScoreResult {
  supplierId: string | null;
  supplierName: string;
  totalScore: number;
  riskLevel: SupplierRiskLevel;
  riskTrend?: string | null;
  emissionIntensity: number | null;
  intensitySource: "computed" | "provided" | "unavailable";
  breakdown: SupplierScoreBreakdown;
  benchmark: SupplierBenchmark;
  complianceScore?: number;
  certificationScore?: number;
  transparencyScore?: number;
  reportingFreshnessScore?: number;
  dataQualityScore?: number;
  benchmarkScore?: number | null;
  latestScoreExplanation?: string;
  explanation?: string;
  recommendedActions?: string[];
  insights: SupplierScoreInsight[];
  evidenceSummary?: SupplierEvidenceSummary | null;
  calculatedAt: string;
}

export interface BulkSupplierScoreResponse {
  scoredSuppliers: SupplierScoreResult[];
  stats: {
    avgScore: number;
    highRiskCount: number;
    distribution: Record<SupplierRiskLevel, number>;
  };
}

export interface Supplier {
  id: string;
  companyId: string;
  organizationId?: string;
  name: string;
  contactEmail: string;
  country: string;
  region: string;
  category: string;
  status?: SupplierStatus;
  emissionFactor: number;
  emissionIntensity: number;
  intensityUnit?: string;
  complianceScore: number;
  countryRiskIndex: number;
  verificationStatus: VerificationStatus;
  onTimeDeliveryRate: number;
  renewableRatio: number;
  complianceFlags: number;
  totalEmissions: number;
  totalEmissionsTco2e?: number;
  revenue?: number | null;
  revenueOrActivityBase?: number | null;
  hasISO14001: boolean;
  hasSBTi: boolean;
  dataTransparencyScore: number;
  lastReportedAt?: string | null;
  carbonScore: number;
  esgScore?: number;
  riskScore: number;
  riskLevel: SupplierRiskLevel;
  supplierScoreBreakdown?: SupplierScoreBreakdown;
  supplierScoreInsights?: SupplierScoreInsight[];
  supplierBenchmark?: SupplierBenchmark;
  dataQualityScore?: number;
  benchmarkScore?: number | null;
  latestScoreExplanation?: string | null;
  recommendedActions?: string[];
  riskTrend?: string | null;
  scoreCalculatedAt?: string | null;
  scoreVersion?: string | null;
  scoreResult?: SupplierScoreResult;
  evidenceStatus?: "complete" | "missing" | "expired" | "under_review";
  evidenceSummary?: SupplierEvidenceSummary | null;
  invitationStatus: SupplierInvitationStatus;
  questionnaireStatus?: SupplierQuestionnaireStatus;
  questionnaireSentAt?: string | null;
  questionnaireOpenedAt?: string | null;
  questionnaireSubmittedAt?: string | null;
  questionnaireDueDate?: string | null;
  questionnaireReminderCount?: number;
  lastReminderSentAt?: string | null;
  certifications?: string[];
  notes?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SupplierEvidence {
  id: string;
  supplierId: string;
  companyId: string;
  evidenceType: SupplierEvidenceType;
  title: string;
  status: SupplierEvidenceStatus;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  storageKey?: string | null;
  signedUrl?: string | null;
  uploadedAt?: string | null;
  uploadedBy?: string | null;
  uploadedVia?: "app" | "questionnaire" | null;
  virusScanStatus?: "not_scanned" | "pending" | "clean" | "failed";
  expiryReminder30SentAt?: string | null;
  expiryReminder7SentAt?: string | null;
  lastReminderSentAt?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
  daysUntilExpiry?: number | null;
  reminderSent?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SupplierEvidenceSummary {
  indicator: "complete" | "missing" | "expired" | "under_review";
  total: number;
  counts: Record<SupplierEvidenceStatus, number>;
  verifiedTypes: SupplierEvidenceType[];
  missingTypes: SupplierEvidenceType[];
  hasVerifiedISO14001: boolean;
  hasVerifiedSBTi: boolean;
  hasVerifiedGHGInventory: boolean;
  hasExpiredEvidence: boolean;
  hasUnderReviewEvidence: boolean;
  items?: SupplierEvidence[];
}

export interface SupplierQuestionnaire {
  supplierId: string;
  supplierName: string;
  contactEmail: string;
  questionnaireStatus: SupplierQuestionnaireStatus;
  questionnaireSentAt: string | null;
  questionnaireOpenedAt: string | null;
  questionnaireSubmittedAt: string | null;
  questionnaireDueDate: string | null;
  questionnaireReminderCount: number;
  lastReminderSentAt: string | null;
  invitationStatus: SupplierInvitationStatus;
  emailStatus?: {
    configured: boolean;
    sent: boolean;
    message: string | null;
    questionnaireUrl?: string;
  } | null;
}

export interface Shipment {
  id: string;
  companyId: string;
  organizationId?: string;
  supplierId?: string | null;
  linkedSupplierId?: string | null;
  linkedSupplierSnapshot?: {
    id?: string | null;
    name?: string | null;
    category?: string | null;
    country?: string | null;
    region?: string | null;
    riskLevel?: SupplierRiskLevel | null;
  } | null;
  reference: string;
  shipmentReference?: string | null;
  bolNumber?: string | null;
  billOfLading?: string | null;
  containerId?: string | null;
  origin: string;
  originCountry?: string | null;
  originRegion?: string | null;
  destination: string;
  destinationCountry?: string | null;
  destinationRegion?: string | null;
  distanceKm: number;
  distanceUnit?: "km";
  transportMode: TransportMode;
  carrier: string;
  carrierId?: string | null;
  vehicleType?: string | null;
  fuelType?: string | null;
  weightKg: number;
  weightUnit?: "kg" | "tonnes";
  costUsd: number;
  cost?: number;
  currency?: string;
  carbonPricePerTon: number;
  emissionFactor?: number;
  factorSource?: string | null;
  emissionFactorId?: string | null;
  emissionFactorKey?: string | null;
  emissionFactorValue?: number;
  emissionFactorUnit?: string | null;
  emissionFactorSourceName?: string | null;
  emissionFactorSourceYear?: number | null;
  emissionFactorType?: "sample" | "official" | "custom" | "missing";
  calculationFormula?: string | null;
  emissionsKgCo2e?: number;
  emissionsTonnes: number;
  kgCO2e?: number;
  tCO2e?: number;
  carbonIntensityKgCo2ePerTonKm?: number;
  calculationStatus?: "calculated" | "missing_factor" | "invalid_input" | "estimated";
  dataQualityWarnings?: string[];
  calculatedAt?: string | null;
  carbonCostUsd: number;
  status: ShipmentStatus;
  shipmentDate: string;
  reportingPeriod?: string | null;
  distanceSource?: "MANUAL" | "ESTIMATED";
  notes?: string | null;
  metadata?: {
    billOfLading?: string | null;
    bolNumber?: string | null;
    bol?: string | null;
    containerId?: string | null;
    containerID?: string | null;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  supplier?: Supplier;
}

export interface EmissionRecord {
  id: string;
  companyId: string;
  scope: 1 | 2 | 3;
  category: string;
  sourceType: string;
  sourceId?: string | null;
  shipmentId?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierRiskLevel?: SupplierRiskLevel | null;
  notes?: string | null;
  description?: string | null;
  methodology?: string | null;
  registryName?: string | null;
  registryProjectId?: string | null;
  registryUrl?: string | null;
  country?: string | null;
  region?: string | null;
  amountTonnes: number;
  emissionsKgCo2e?: number;
  emissionsTCo2e?: number;
  calculationStatus?: "calculated" | "missing_factor" | "draft_incomplete" | "calculation_error";
  emissionFactorId?: string | null;
  costUsd: number;
  factorValue: number;
  factorValueUsed?: number;
  factorUnit?: string | null;
  factorUnitUsed?: string | null;
  factorSource?: string | null;
  factorSourceName?: string | null;
  factorSourceYear?: number | null;
  factorRegion?: string | null;
  factorCountry?: string | null;
  factorVersion?: string | null;
  factorIsSample?: boolean;
  factorIsOfficial?: boolean;
  factorIsCustom?: boolean;
  formula?: string | null;
  activityAmount?: number;
  activityUnit?: string | null;
  facilityName?: string | null;
  facilityId?: string | null;
  businessUnit?: string | null;
  reportingPeriod?: string | null;
  reportingPeriodStart?: string | null;
  reportingPeriodEnd?: string | null;
  dataStatus?: "draft" | "submitted" | "reviewed" | "approved" | "rejected" | "needs_correction" | "archived";
  submittedBy?: string | null;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  correctionNotes?: string | null;
  approvalNotes?: string | null;
  archivedBy?: string | null;
  archivedAt?: string | null;
  factorStillActive?: boolean;
  latestAvailableFactorId?: string | null;
  latestAvailableFactorValue?: number | null;
  latestAvailableFactorVersion?: string | null;
  latestAvailableFactorSourceName?: string | null;
  latestAvailableFactorSourceYear?: number | null;
  latestAvailableFactorUnit?: string | null;
  latestAvailableFactorIsSample?: boolean | null;
  isStaleFactor?: boolean;
  staleFactorReason?: string | null;
  canRecalculateWithLatestFactor?: boolean;
  activityData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  periodMonth: number;
  periodYear: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface LedgerEntry {
  id: string;
  companyId: string;
  shipmentId?: string | null;
  emissionRecordId?: string | null;
  entryDate: string;
  category: "FREIGHT" | "OFFSET" | "TAX" | "ADJUSTMENT";
  description: string;
  logisticsCostUsd: number;
  offsetCostUsd?: number;
  internalCarbonPriceUsd?: number;
  currency?: string;
  supplierVendor?: string | null;
  emissionsTonnes: number;
  carbonTaxUsd: number;
  carbonCostUsd: number;
  totalCostUsd: number;
  shipment?: Shipment;
}

export interface LedgerSummary {
  totalSpend: number;
  totalCarbonTax: number;
  totalCarbonCost: number;
  totalEmissions: number;
  carbonCostRatio: number;
  scope1: number;
  scope2: number;
  scope3: number;
  totalTco2e?: number;
  scope1Tco2e?: number;
  scope2Tco2e?: number;
  scope3Tco2e?: number;
  totalRecords?: number;
  approvedRecords?: number;
  draftRecords?: number;
  submittedRecords?: number;
  rejectedRecords?: number;
  needsCorrectionRecords?: number;
  reviewedRecords?: number;
  archivedRecords?: number;
  missingFactorRecords?: number;
  sampleFactorRecords?: number;
  zeroAmountRecords?: number;
  calculationErrorRecords?: number;
  supplierLinkedRecords?: number;
  unlinkedSupplierRecords?: number;
  missingFacilityRecords?: number;
  missingReportingPeriodRecords?: number;
  inclusionPolicy?: DashboardInclusionPolicy;
}

export interface LedgerBreakdowns {
  byCategory: Array<{ name: string; value: number }>;
  bySupplier: Array<{ supplierId?: string | null; name: string; value: number; recordCount?: number; sharePct?: number; riskLevel?: SupplierRiskLevel | null; category?: string | null; country?: string | null; linkStatus?: "linked" | "unverified" }>;
  byMonth: Array<{ name: string; scope1: number; scope2: number; scope3: number; draftScope1?: number; draftScope2?: number; draftScope3?: number; missingFactorCount?: number }>;
}

export interface LedgerOverview extends PaginatedResponse<LedgerEntry> {
  records: EmissionRecord[];
  summary: LedgerSummary;
  breakdowns: LedgerBreakdowns;
  categoryBreakdown?: Array<{ name: string; value: number }>;
  supplierBreakdown?: LedgerBreakdowns["bySupplier"];
  monthlyBreakdown?: LedgerBreakdowns["byMonth"];
  financialExposure?: {
    totalSpend: number;
    carbonTax: number;
    ledgerCarbonCost: number;
    carbonCostRatio: number;
  };
  dataQualityIssues?: DashboardDataQualityIssue[];
}

export interface CarbonProject {
  id: string;
  name: string;
  type: string;
  location: string;
  description?: string | null;
  methodology?: string | null;
  registryName?: string | null;
  registryProjectId?: string | null;
  registryUrl?: string | null;
  country?: string | null;
  region?: string | null;
  coordinates?: {
    latitude: number | null;
    longitude: number | null;
  } | null;
  pddDocuments?: Array<{
    name: string;
    url: string;
  }>;
  certification: string;
  registry?: string | null;
  vintageYear?: number;
  verificationStandard?: string | null;
  rating: number;
  pricePerCreditUsd: number;
  pricePerTco2e?: number;
  currency?: string;
  totalQuantityTco2e?: number;
  availableQuantityTco2e?: number;
  retiredQuantityTco2e?: number;
  reservedQuantityTco2e?: number;
  pricePerTonUsd?: number;
  availableCredits: number;
  reservedCredits: number;
  availableToPurchase: number;
  retiredCredits: number;
  status: MarketplaceListingStatus;
  verificationStatus?: "UNVERIFIED" | "SELF_REPORTED" | "THIRD_PARTY_VERIFIED" | "REGISTRY_VERIFIED" | "REJECTED" | "EXPIRED";
  isDemo?: boolean;
  isSample?: boolean;
  isRealInventory?: boolean;
  evidenceDocuments?: Array<{
    name: string;
    url: string;
    type?: string;
  }>;
  verificationDetails?: {
    registries: CarbonRegistry[];
    verificationStatus: ProjectVerificationStatus;
    registryProjectId?: string | null;
    verifiedBy?: string | null;
    verificationDate?: string | null;
    methodology?: string | null;
    vintageYear: number;
    sdgGoals: ProjectSdgGoal[];
  } | null;
  lifecycle?: {
    hasTransactionHistory: boolean;
    transactionCount: number;
    completedTransactionCount: number;
    certificateCount: number;
    purchasedCredits: number;
    isImmutable: boolean;
    canHardDelete: boolean;
  };
}

export interface CertificateMetadata {
  transactionId: string;
  issuedAt: string;
  certificateUrl: string;
  checksum: string;
}

export interface CarbonCreditTransaction {
  id: string;
  companyId: string;
  projectId?: string | null;
  companyName: string;
  projectName: string;
  registry: string;
  registryProjectId?: string | null;
  registryRecordId?: string | null;
  registryRetirementId?: string | null;
  blockchainHash?: string | null;
  vintageYear: number;
  shipmentId?: string | null;
  shipmentIds?: string[];
  shipmentReference?: string | null;
  shipmentReferences?: string[];
  shipmentStatus?: Shipment["status"] | null;
  shipmentStatuses?: Array<Shipment["status"]>;
  pricePerTon: number;
  pricePerTonUsd: number;
  quantity: number;
  credits: number;
  subtotalUsd?: number;
  platformFeeUsd?: number;
  totalCost: number;
  totalCostUsd: number;
  tCO2eRetired: number;
  serialNumber: string | null;
  certificateId?: string | null;
  isDemo?: boolean;
  isRealRetirement?: boolean;
  status: "PENDING" | "COMPLETED" | "FAILED";
  lifecycleStatus?: "draft" | "pending_budget_approval" | "pending_payment" | "payment_verified" | "pending_registry_retirement" | "retired" | "completed" | "failed" | "cancelled" | "refunded";
  paymentReference: string;
  paymentProvider?: string;
  paymentStatus?: "not_required" | "pending" | "invoice_sent" | "paid" | "failed" | "refunded" | "cancelled";
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  registryProvider?: string;
  registryRetirementStatus?: "not_required" | "pending" | "submitted" | "retired" | "failed" | "manual_verification_required" | "manually_verified";
  registryRetirementUrl?: string | null;
  registryRetiredAt?: string | null;
  createdAt: string;
  completedAt: string | null;
  retiredAt: string | null;
  lockId?: string | null;
  lockExpiresAt?: string | null;
  lockStatus?: "PENDING" | "ACTIVE" | "COMPLETED" | "RELEASED" | "EXPIRED" | null;
  certificateMetadata?: CertificateMetadata | null;
  certificate?: (CertificateMetadata & {
    certificateId?: string;
    storagePath?: string;
    fileName?: string;
  }) | null;
  metadata?: Record<string, unknown>;
}

export type OffsetTransaction = CarbonCreditTransaction;

export interface CheckoutTransactionResult {
  transactionId: string;
  status: CarbonCreditTransaction["status"];
  paymentReference: string;
  createdAt: string;
  lockId: string | null;
  lockExpiresAt: string | null;
}

export interface CreditCheckoutPayload {
  companyName: string;
  projectId: string;
  shipmentId?: string | null;
  shipmentIds?: string[];
  quantity: number;
  idempotencyKey?: string | null;
}

export interface MarketplaceOverview extends PaginatedResponse<CarbonProject> {
  transactions: CarbonCreditTransaction[];
  summary: {
    totalCreditsRetired: number;
    totalSpendUsd: number;
  };
}

export interface MarketplaceBudget {
  id: string | null;
  companyId: string | null;
  totalBudget: number;
  settledSpend: number;
  pendingSpend: number;
  remainingBudget: number;
  currency: string;
  monthlyBudget?: number | null;
  approvalRequiredThreshold?: number | null;
  updatedAt?: string | null;
  isConfigured: boolean;
}

export interface MarketplaceBudgetRequest {
  id: string;
  companyId: string;
  requestedAmount: number;
  currentBudget: number;
  reason?: string | null;
  status: "pending" | "approved" | "rejected";
  requestedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface AutoOffsetRule {
  enabled: boolean;
  carbonIntensityThreshold: number;
  intensityThreshold: number;
  maxSpendPerMonth?: number | null;
  preferredProjectTypes: string[];
  preferredRegistries: string[];
  requireApproval: boolean;
  lastEvaluatedAt?: string | null;
  lastEvaluation?: Record<string, unknown>;
  isConfigured: boolean;
}

export interface ReportItem {
  id: string;
  name: string;
  reportName?: string;
  type: "ESG" | "COMPLIANCE" | "ANALYTICS" | "CUSTOM";
  reportType?: "esg_pdf" | "scope_export_csv" | "custom_extract" | "carbon_ledger" | "supplier_esg" | "shipment_emissions" | "marketplace_retirement";
  format: "CSV" | "PDF" | "JSON";
  outputFormat?: "CSV" | "PDF" | "JSON";
  reportingPeriodStart?: string | null;
  reportingPeriodEnd?: string | null;
  inclusionPolicy?: "approved_only" | "all_records_with_warning" | "all_records";
  generatedAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  generatedBy?: string | null;
  status: "READY" | "PROCESSING" | "FAILED" | "queued" | "generating" | "completed" | "failed" | "archived";
  downloadUrl: string;
  recordCounts?: Record<string, number>;
  scopeTotals?: Record<string, number>;
  dataQualitySummary?: Record<string, unknown>;
  sampleFactorCount?: number;
  missingFactorCount?: number;
  unapprovedRecordCount?: number;
  staleFactorCount?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface AuditLogItem {
  id: string;
  companyId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  action: string;
  actionLabel?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  module?: "auth" | "user" | "supplier" | "shipment" | "emission" | "ledger" | "report" | "marketplace" | "optimization" | "admin" | "settings" | "system" | "import" | string;
  severity?: "info" | "low" | "medium" | "high" | "critical" | string;
  category?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  source?: "web" | "admin_panel" | "api" | "system" | "import" | "automation" | string;
  status?: "success" | "failed" | string;
  errorCode?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  changesSummary?: string[];
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  retentionUntil?: string | null;
  retentionPolicy?: string | null;
  integrityHash?: string | null;
  previousHash?: string | null;
  createdAt: string;
}

export interface AuditSummary {
  totalEvents: number;
  highCriticalEvents: number;
  failedActions: number;
  exportsDownloads: number;
  permissionSecurityEvents: number;
  eventsInSelectedPeriod: number;
}

export interface IntegrationStatus {
  id?: string;
  name: string;
  providerType?: string;
  providerName?: string;
  status: string;
  lastSync: string | null;
  lastSyncAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastFailedSyncAt?: string | null;
  lastError?: string | null;
  syncStatus?: string;
  configMetadata?: Record<string, unknown>;
  syncHistory?: Array<Record<string, unknown>>;
}

export interface ApiKeyItem {
  id?: string;
  label: string;
  key?: string;
  maskedKey?: string;
  prefix?: string;
  last4?: string;
  scopes?: string[];
  status?: "active" | "revoked" | "expired" | string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface OrganizationSettings {
  companyName: string;
  legalName?: string | null;
  industry: string;
  headquarters: string;
  region: string;
  country?: string | null;
  currency: string;
  fiscalYearStartMonth?: number;
  reportingYear?: number;
  carbonPricePerTon: number;
  netZeroTargetYear: number;
  revenueUsd: number;
  annualShipmentWeightKg: number;
  preferredUnits?: "metric" | "imperial";
  defaultReportingBoundary?: "operational_control" | "financial_control" | "equity_share";
  defaultReportInclusionPolicy?: "approved_only" | "all_with_warning";
  dataRetentionYears?: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface OperationalMetrics {
  revenueUsd: number;
  annualShipmentWeightKg: number;
  electricityConsumptionKwh: number;
  renewableElectricityPct: number;
  stationaryFuelLiters: number;
  mobileFuelLiters: number;
  companyVehicleKm: number;
  stationaryFuelType: string;
  mobileFuelType: string;
  defaultReportingPeriod?: string;
  notes?: string;
  source?: string;
}

export interface EmissionFactorOverrides {
  transport: Record<string, number>;
  electricity: Record<string, number>;
  fuels: Record<string, number>;
  fleet: Record<string, number>;
}

export interface EmissionFactorOverrideMetadata {
  sourceName?: string;
  sourceYear?: number | "";
  unit?: string;
  region?: string;
  country?: string;
  reason?: string;
  approvalStatus?: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  companyId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserSettings {
  id: string;
  companyId: string;
  profile: {
    name: string;
    email: string;
    emailVerified?: boolean;
    role?: UserRole;
    companyName?: string;
    timezone?: string | null;
    locale?: string | null;
    lastLoginAt?: string | null;
    createdAt?: string | null;
  };
  company: OrganizationSettings;
  organization: OrganizationSettings;
  operationalMetrics: OperationalMetrics;
  emissionFactors: EmissionFactorOverrides;
  emissionFactorMetadata?: EmissionFactorOverrideMetadata;
  preferences: {
    notificationsEnabled: boolean;
    securityAlertsEnabled: boolean;
    reportNotificationsEnabled?: boolean;
    integrationSyncNotificationsEnabled?: boolean;
    marketplaceNotificationsEnabled?: boolean;
  };
  security?: {
    mfaStatus?: string;
    activeSessionsSupported?: boolean;
    ssoStatus?: string;
    passwordPolicy?: string;
  };
  integrations: IntegrationStatus[];
  apiKeys: ApiKeyItem[];
  oneTimeApiKey?: string;
  oneTimeApiKeyId?: string;
}

export interface SettingsPayload {
  profile?: {
    name: string;
    email?: string;
    timezone?: string | null;
    locale?: string | null;
  };
  company?: Partial<OrganizationSettings>;
  organization?: Partial<OrganizationSettings>;
  operationalMetrics?: Partial<OperationalMetrics>;
  emissionFactors?: Partial<EmissionFactorOverrides>;
  emissionFactorMetadata?: EmissionFactorOverrideMetadata;
  preferences?: {
    notificationsEnabled: boolean;
    securityAlertsEnabled: boolean;
    reportNotificationsEnabled?: boolean;
    integrationSyncNotificationsEnabled?: boolean;
    marketplaceNotificationsEnabled?: boolean;
  };
  password?: {
    currentPassword: string;
    newPassword: string;
    confirmPassword?: string;
  };
}

export interface UploadResult {
  fileName: string;
  importedRows: number;
  createdCount: number;
  errorCount: number;
  createdShipments: Shipment[];
  errors: Array<{ row: number; message: string }>;
}

export interface ShipmentImportRowPayload {
  rowIndex: number;
  reference?: string;
  shipmentReference?: string;
  bolNumber?: string;
  containerId?: string;
  origin?: string;
  originCountry?: string;
  originRegion?: string;
  destination: string;
  destinationCountry?: string;
  destinationRegion?: string;
  weightKg: number | "";
  distanceKm?: number | "";
  transportMode?: TransportMode;
  carrierId?: string;
  fuelType?: string;
  supplierId?: string;
  linkedSupplierId?: string;
  supplierName?: string;
  carrier?: string;
  costUsd?: number | "";
  cost?: number | "";
  currency?: string;
  status?: ShipmentStatus;
  shipmentDate?: string;
  reportingPeriod?: string;
  vehicleType?: string;
  notes?: string;
  rawData?: Record<string, string>;
}

export interface ShipmentImportMetadata {
  source: "csv" | "excel";
  totalRows: number;
  fileName?: string;
  uploadId?: string;
  batchIndex?: number;
  totalBatches?: number;
  templateName?: string | null;
}

export interface ShipmentImportError {
  rowIndex: number;
  field: string;
  message: string;
  value?: unknown;
}

export interface ShipmentImportSummary {
  total: number;
  successful: number;
  "\u0938\u092B\u0932": number;
  failed: number;
  inserted: number;
  updated: number;
}

export interface ShipmentImportResult {
  summary: ShipmentImportSummary;
  errors: ShipmentImportError[];
  metadata: ShipmentImportMetadata & {
    processedRows: number;
  };
}

export type DashboardInclusionPolicy = "approved_only" | "all_records" | "draft_included";

export interface DashboardDataQualityIssue {
  type: string;
  count: number;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface DashboardSummary {
  totalEmissions: number;
  scope1: number;
  scope2: number;
  scope3: number;
  carbonIntensity: number | null;
  carbonIntensityUnit?: string;
  carbonIntensityBasis?: string | null;
  totalCost: number;
  totalLogisticsCost?: number;
  totalOffsets: number;
  offsetsRetired?: number;
  highRiskSuppliers: number;
  activeProjects: number;
  averageSupplierScore: number;
  totalSpend: number;
  totalCarbonTax: number;
  dataCompletenessPct?: number;
  dataQualityScore?: number;
  activitiesRecorded?: number;
  totalRecords?: number;
  calculatedRecords?: number;
  draftRecords?: number;
  submittedRecords?: number;
  reviewedRecords?: number;
  approvedRecords?: number;
  rejectedRecords?: number;
  needsCorrectionRecords?: number;
  unapprovedRecords?: number;
  missingFactorRecords?: number;
  sampleFactorRecords?: number;
  zeroAmountRecords?: number;
  calculationErrorRecords?: number;
  includedRecordsCount?: number;
  excludedRecordsCount?: number;
  inclusionPolicy?: DashboardInclusionPolicy;
  missingFactorCount?: number;
  sampleFactorUsageCount?: number;
  reportsGenerated?: number;
  reportStatus?: string;
  supplierIntelligence?: SupplierIntelligenceSummary;
}

export interface SupplierIntelligenceSummary {
  bestPerformingSupplier: string | null;
  worstPerformingSupplier: string | null;
  categoriesWithHighestSupplierRisk: Array<{
    category: string;
    supplierCount: number;
    aboveBenchmarkCount: number;
  }>;
  suppliersAboveBenchmark: number;
  suppliersMissingBenchmarkData: number;
}

export interface DashboardMonthlyMetric {
  name: string;
  scope1: number;
  scope2: number;
  scope3: number;
  emissions: number;
  cost: number;
}

export interface DashboardCostVsEmissionsMetric {
  name: string;
  cost: number;
  emissions: number;
}

export interface DashboardTransportModeMetric {
  name: string;
  value: number;
}

export interface DashboardScopeBreakdownMetric {
  name: string;
  value: number;
  percentage: number;
}

export interface DashboardCategoryMetric {
  name: string;
  value: number;
  scope1: number;
  scope2: number;
  scope3: number;
}

export interface DashboardFacilityMetric {
  name: string;
  value: number;
}

export interface DashboardDataQuality {
  completenessPct: number;
  requiredSignals: number;
  completedSignals: number;
  sampleFactorRecords: number;
  missingFactorRecords: number;
  zeroAmountRecords?: number;
  calculationErrorRecords?: number;
  calculatedRecords?: number;
  includedRecordsCount?: number;
  excludedRecordsCount?: number;
  inclusionPolicy?: DashboardInclusionPolicy;
  score?: number;
  issues?: DashboardDataQualityIssue[];
  draftRecords?: number;
  submittedRecords?: number;
  reviewedRecords?: number;
  approvedRecords?: number;
  rejectedRecords?: number;
  needsCorrectionRecords?: number;
  unapprovedRecords?: number;
  status: "READY" | "PARTIAL" | "NEEDS_DATA";
}

export interface DashboardReportStatus {
  generatedCount: number;
  latestStatus: string;
  latestGeneratedAt: string | null;
}

export interface DashboardData {
  summary: DashboardSummary;
  monthly: DashboardMonthlyMetric[];
  costVsEmissions: DashboardCostVsEmissionsMetric[];
  transportModes: DashboardTransportModeMetric[];
  scopeBreakdown: DashboardScopeBreakdownMetric[];
  categories: DashboardCategoryMetric[];
  facilities: DashboardFacilityMetric[];
  dataQuality: DashboardDataQuality;
  reportStatus: DashboardReportStatus;
  totalRecords?: number;
  calculatedRecords?: number;
  draftRecords?: number;
  submittedRecords?: number;
  approvedRecords?: number;
  missingFactorRecords?: number;
  sampleFactorRecords?: number;
  zeroAmountRecords?: number;
  calculationErrorRecords?: number;
  includedRecordsCount?: number;
  excludedRecordsCount?: number;
  inclusionPolicy?: DashboardInclusionPolicy;
  scopeTotals?: DashboardScopeBreakdownMetric[];
  categoryTotals?: DashboardCategoryMetric[];
  monthlyTrend?: DashboardMonthlyMetric[];
  dataQualityScore?: number;
  dataQualityIssues?: DashboardDataQualityIssue[];
}
