import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout } from './components/layout/AdminLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { AuthProvider, useAuth } from './hooks/useAuth';

const DashboardPage = lazy(async () => ({ default: (await import('./pages/dashboard/DashboardPage')).DashboardPage }));
const UsersPage = lazy(async () => ({ default: (await import('./pages/users/UsersPage')).UsersPage }));
const CarbonDataPage = lazy(async () => ({ default: (await import('./pages/carbon/CarbonDataPage')).CarbonDataPage }));
const AnalyticsPage = lazy(async () => ({ default: (await import('./pages/analytics/AnalyticsPage')).AnalyticsPage }));
const SettingsPage = lazy(async () => ({ default: (await import('./pages/settings/SettingsPage')).SettingsPage }));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="carbon-data" element={<CarbonDataPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
