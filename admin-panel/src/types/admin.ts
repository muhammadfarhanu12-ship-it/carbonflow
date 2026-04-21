export interface AdminSessionUser {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'moderator';
  status: 'active' | 'disabled';
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  admin: AdminSessionUser;
}

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

export interface DashboardData {
  stats: {
    totalUsers: number;
    totalCompanies: number;
    totalShipments: number;
    totalAdmins: number;
    totalReports: number;
    pendingReports: number;
    totalCarbonTonnes: number;
  };
  monthlyEmissions: Array<{
    name: string;
    value: number;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    description: string;
    actor: string;
    createdAt: string;
  }>;
}

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  companyId: string | null;
  company?: {
    id: string;
    name: string;
    planType: string;
    status: string;
  } | null;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AnalyticsData {
  summary: {
    totalEmissionsTonnes: number;
    averageShipmentEmissionTonnes: number;
  };
  emissionsByCategory: Array<{
    name: string;
    value: number;
  }>;
  scopeBreakdown: Array<{
    name: string;
    value: number;
  }>;
  monthlyEmissions: Array<{
    name: string;
    value: number;
  }>;
}

export interface CarbonDataRecord {
  id: string;
  recordId: string;
  companyId: string;
  companyName: string;
  category: string;
  emissionsTonnes: number;
  dateSubmitted: string;
  status: 'Verified' | 'Pending' | 'Flagged';
  rawStatus: string;
  origin: string;
  destination: string;
  carrier: string;
}

export interface AdminSettings {
  id: string;
  platformName: string;
  supportEmail: string;
  sessionTimeoutMinutes: number;
  maintenanceMode: boolean;
  allowSelfSignup: boolean;
  emissionFactors: {
    road: number;
    air: number;
    ocean: number;
  };
}
