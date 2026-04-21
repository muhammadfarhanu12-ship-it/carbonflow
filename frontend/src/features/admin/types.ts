import type { MarketplaceListingStatus, PaginatedResponse } from "@/src/types/platform";

export interface AdminCompany {
  id: string;
  name: string;
  industry: string;
  headquarters: string;
  planType: "TRIAL" | "STARTER" | "GROWTH" | "ENTERPRISE";
  status: "ACTIVE" | "TRIAL" | "SUSPENDED";
  createdAt: string;
  _count?: {
    users: number;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "USER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  companyId: string | null;
  company?: AdminCompany | null;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AdminShipment {
  id: string;
  companyId: string;
  company?: AdminCompany | null;
  origin: string;
  destination: string;
  transportMode: "ROAD" | "RAIL" | "AIR" | "OCEAN";
  weightKg: number;
  costUsd: number;
  emissionsTonnes: number;
  createdAt: string;
}

export interface EmissionFactor {
  id: string;
  name: string;
  category: string;
  value: number;
  unit: string;
  source?: string | null;
  updatedAt: string;
}

export interface AdminMarketplaceProject {
  id: string;
  name: string;
  registry: string;
  pricePerTon: number;
  carbonCreditsAvailable: number;
  retiredCredits: number;
  immutable: boolean;
  status: MarketplaceListingStatus;
}

export interface AdminSystemLog {
  id: string;
  actionType: string;
  description: string;
  user?: {
    id: string;
    email: string;
    name: string;
  } | null;
  createdAt: string;
}

export interface AdminDashboardMetrics {
  totalCompanies: number;
  totalUsers: number;
  totalShipments: number;
  totalCarbonCalculated: number;
  activeCarbonCredits: number;
  platformRevenue: number;
  monthlyTrends: Array<{
    name: string;
    shipments: number;
    emissions: number;
  }>;
}

export interface AdminPlatformSettings {
  id: string;
  platformName: string;
  supportEmail: string;
  sessionTimeoutMinutes: number;
  maintenanceMode: boolean;
  allowSelfSignup: boolean;
}

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "USER";
  companyId: string | null;
  company?: AdminCompany | null;
}

export interface BillingOverview {
  totalInvoiced: number;
  paidRevenue: number;
  outstandingRevenue: number;
  paidInvoices: number;
  overdueInvoices: number;
  totalInvoices: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amountUsd: number;
  status: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE" | "CANCELLED";
  issuedAt: string;
  dueAt?: string | null;
  paidAt?: string | null;
  company?: AdminCompany | null;
}

export type AdminPaginated<T> = PaginatedResponse<T>;
