export type UserRole = "SUPERADMIN" | "ADMIN" | "MANAGER" | "ANALYST" | "USER";
export type SupplierRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type SupplierInsightType = "warning" | "info";
export type SupplierBenchmarkComparison = "ABOVE_AVERAGE" | "AT_AVERAGE" | "BELOW_AVERAGE" | "UNKNOWN";
export type VerificationStatus = "VERIFIED" | "PENDING" | "ACTION_REQUIRED";
export type ShipmentStatus = "PLANNED" | "IN_TRANSIT" | "DELAYED" | "DELIVERED";
export type TransportMode = "ROAD" | "RAIL" | "AIR" | "OCEAN";
export type MarketplaceListingStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "SOLD_OUT";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
  certificationScore: number;
  transparencyScore: number;
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
  insights: SupplierScoreInsight[];
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
  emissionFactor: number;
  emissionIntensity: number;
  complianceScore: number;
  countryRiskIndex: number;
  verificationStatus: VerificationStatus;
  onTimeDeliveryRate: number;
  renewableRatio: number;
  complianceFlags: number;
  totalEmissions: number;
  revenue?: number | null;
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
  riskTrend?: string | null;
  scoreCalculatedAt?: string | null;
  scoreVersion?: string | null;
  scoreResult?: SupplierScoreResult;
  invitationStatus: "SENT" | "ACCEPTED" | "NOT_SENT";
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Shipment {
  id: string;
  companyId: string;
  organizationId?: string;
  supplierId: string;
  reference: string;
  origin: string;
  destination: string;
  distanceKm: number;
  transportMode: TransportMode;
  carrier: string;
  vehicleType?: string | null;
  fuelType?: string | null;
  weightKg: number;
  costUsd: number;
  carbonPricePerTon: number;
  emissionsTonnes: number;
  carbonCostUsd: number;
  status: ShipmentStatus;
  shipmentDate: string;
  distanceSource?: "MANUAL" | "ESTIMATED";
  notes?: string | null;
  createdAt: string;
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
  description?: string | null;
  amountTonnes: number;
  costUsd: number;
  factorValue: number;
  factorUnit?: string | null;
  activityData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  periodMonth: number;
  periodYear: number;
}

export interface LedgerEntry {
  id: string;
  companyId: string;
  shipmentId?: string | null;
  entryDate: string;
  category: "FREIGHT" | "OFFSET" | "TAX" | "ADJUSTMENT";
  description: string;
  logisticsCostUsd: number;
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
}

export interface LedgerBreakdowns {
  byCategory: Array<{ name: string; value: number }>;
  bySupplier: Array<{ name: string; value: number }>;
  byMonth: Array<{ name: string; scope1: number; scope2: number; scope3: number }>;
}

export interface LedgerOverview extends PaginatedResponse<LedgerEntry> {
  records: EmissionRecord[];
  summary: LedgerSummary;
  breakdowns: LedgerBreakdowns;
}

export interface CarbonProject {
  id: string;
  name: string;
  type: string;
  location: string;
  description?: string | null;
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
  pricePerTonUsd?: number;
  availableCredits: number;
  reservedCredits: number;
  availableToPurchase: number;
  retiredCredits: number;
  status: MarketplaceListingStatus;
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
  registryRecordId?: string | null;
  blockchainHash?: string | null;
  vintageYear: number;
  shipmentId?: string | null;
  shipmentReference?: string | null;
  shipmentStatus?: Shipment["status"] | null;
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
  status: "PENDING" | "COMPLETED" | "FAILED";
  paymentReference: string;
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

export interface ReportItem {
  id: string;
  name: string;
  type: "ESG" | "COMPLIANCE" | "ANALYTICS" | "CUSTOM";
  format: "CSV" | "PDF";
  generatedAt: string;
  status: "READY" | "PROCESSING" | "FAILED";
  downloadUrl: string;
}

export interface IntegrationStatus {
  name: string;
  status: string;
  lastSync: string | null;
}

export interface ApiKeyItem {
  label: string;
  key: string;
  createdAt: string;
}

export interface OrganizationSettings {
  companyName: string;
  industry: string;
  headquarters: string;
  region: string;
  currency: string;
  carbonPricePerTon: number;
  netZeroTargetYear: number;
  revenueUsd: number;
  annualShipmentWeightKg: number;
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
}

export interface EmissionFactorOverrides {
  transport: Record<string, number>;
  electricity: Record<string, number>;
  fuels: Record<string, number>;
  fleet: Record<string, number>;
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
  };
  company: OrganizationSettings;
  organization: OrganizationSettings;
  operationalMetrics: OperationalMetrics;
  emissionFactors: EmissionFactorOverrides;
  preferences: {
    notificationsEnabled: boolean;
    securityAlertsEnabled: boolean;
  };
  integrations: IntegrationStatus[];
  apiKeys: ApiKeyItem[];
}

export interface SettingsPayload {
  profile?: {
    name: string;
    email: string;
  };
  company?: Partial<OrganizationSettings>;
  organization?: Partial<OrganizationSettings>;
  operationalMetrics?: Partial<OperationalMetrics>;
  emissionFactors?: Partial<EmissionFactorOverrides>;
  preferences?: {
    notificationsEnabled: boolean;
    securityAlertsEnabled: boolean;
  };
  password?: {
    currentPassword: string;
    newPassword: string;
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
  origin?: string;
  destination: string;
  weightKg: number | "";
  distanceKm?: number | "";
  transportMode?: TransportMode;
  fuelType?: string;
  reference?: string;
  supplierId?: string;
  supplierName?: string;
  carrier?: string;
  costUsd?: number | "";
  status?: ShipmentStatus;
  shipmentDate?: string;
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

export interface DashboardSummary {
  totalEmissions: number;
  scope1: number;
  scope2: number;
  scope3: number;
  carbonIntensity: number;
  carbonIntensityUnit?: string;
  totalCost: number;
  totalLogisticsCost?: number;
  totalOffsets: number;
  offsetsRetired?: number;
  highRiskSuppliers: number;
  activeProjects: number;
  averageSupplierScore: number;
  totalSpend: number;
  totalCarbonTax: number;
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

export interface DashboardData {
  summary: DashboardSummary;
  monthly: DashboardMonthlyMetric[];
  costVsEmissions: DashboardCostVsEmissionsMetric[];
  transportModes: DashboardTransportModeMetric[];
}
