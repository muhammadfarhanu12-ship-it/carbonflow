/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/providers/ToastProvider";
import { AppErrorBoundary } from "./components/providers/AppErrorBoundary";
import { AuthProvider } from "./components/providers/AuthProvider";

const AppLayout = lazy(async () => ({ default: (await import("./components/layout/AppLayout")).AppLayout }));
const LandingPage = lazy(async () => ({ default: (await import("./pages/LandingPage")).LandingPage }));
const DashboardPage = lazy(async () => ({ default: (await import("./pages/DashboardPage")).DashboardPage }));
const ShipmentsPage = lazy(async () => ({ default: (await import("./pages/ShipmentsPage")).ShipmentsPage }));
const SuppliersPage = lazy(async () => ({ default: (await import("./pages/SuppliersPage")).SuppliersPage }));
const OptimizationPage = lazy(async () => ({ default: (await import("./pages/OptimizationPage")).OptimizationPage }));
const MarketplacePage = lazy(async () => ({ default: (await import("./pages/MarketplacePage")).MarketplacePage }));
const ReportsPage = lazy(async () => ({ default: (await import("./pages/ReportsPage")).ReportsPage }));
const LedgerPage = lazy(async () => ({ default: (await import("./pages/LedgerPage")).LedgerPage }));
const SettingsPage = lazy(async () => ({ default: (await import("./pages/SettingsPage")).SettingsPage }));

const SigninPage = lazy(async () => ({ default: (await import("./pages/auth/SigninPage")).SigninPage }));
const SignupPage = lazy(async () => ({ default: (await import("./pages/auth/SignupPage")).SignupPage }));
const ForgotPasswordPage = lazy(async () => ({ default: (await import("./pages/auth/ForgotPasswordPage")).ForgotPasswordPage }));
const ResetPasswordPage = lazy(async () => ({ default: (await import("./pages/auth/ResetPasswordPage")).ResetPasswordPage }));
const Logout = lazy(async () => ({ default: (await import("./pages/auth/Logout")).Logout }));

const AdminLayout = lazy(async () => ({ default: (await import("./features/admin/components/AdminLayout")).AdminLayout }));
const AdminDashboard = lazy(async () => ({ default: (await import("./features/admin/pages/AdminDashboard")).AdminDashboard }));
const AdminUsersPage = lazy(async () => ({ default: (await import("./features/admin/pages/UsersPage")).UsersPage }));
const AdminCompaniesPage = lazy(async () => ({ default: (await import("./features/admin/pages/CompaniesPage")).CompaniesPage }));
const AdminShipmentsPage = lazy(async () => ({ default: (await import("./features/admin/pages/ShipmentsPage")).ShipmentsPage }));
const AdminCarbonDataPage = lazy(async () => ({ default: (await import("./features/admin/pages/CarbonDataPage")).CarbonDataPage }));
const AdminMarketplacePage = lazy(async () => ({ default: (await import("./features/admin/pages/MarketplacePage")).MarketplacePage }));
const AdminReportsPage = lazy(async () => ({ default: (await import("./features/admin/pages/ReportsPage")).ReportsPage }));
const AdminSystemLogsPage = lazy(async () => ({ default: (await import("./features/admin/pages/SystemLogsPage")).SystemLogsPage }));
const AdminSettingsPage = lazy(async () => ({ default: (await import("./features/admin/pages/SettingsPage")).SettingsPage }));

function AppLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={<AppLoadingFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />

                <Route path="/auth/signin" element={<SigninPage />} />
                <Route path="/auth/signup" element={<SignupPage />} />
                <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
                <Route path="/auth/logout" element={<Logout />} />

                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="shipments" element={<ShipmentsPage />} />
                  <Route path="suppliers" element={<SuppliersPage />} />
                  <Route path="ledger" element={<LedgerPage />} />
                  <Route path="optimization" element={<OptimizationPage />} />
                  <Route path="marketplace" element={<MarketplacePage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>

                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="companies" element={<AdminCompaniesPage />} />
                  <Route path="shipments" element={<AdminShipmentsPage />} />
                  <Route path="carbon-data" element={<AdminCarbonDataPage />} />
                  <Route path="marketplace" element={<AdminMarketplacePage />} />
                  <Route path="reports" element={<AdminReportsPage />} />
                  <Route path="system" element={<AdminSystemLogsPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                </Route>

                <Route path="*" element={<div className="p-6 text-center text-muted-foreground">Page coming soon</div>} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
