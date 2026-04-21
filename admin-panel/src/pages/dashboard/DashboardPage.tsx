import { useEffect, useState, type ComponentType } from 'react';
import {
  Users,
  Activity,
  Building2,
  FileBarChart2,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { adminService } from '../../services/adminService';
import type { DashboardData } from '../../types/admin';

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        <div className="p-2 bg-gray-50 rounded-md">
          <Icon className="h-5 w-5 text-gray-400" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
        <span className="text-sm text-gray-500">{subtitle}</span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    adminService.getDashboard()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setDashboard(response);
      })
      .catch((err: Error) => {
        if (!isMounted) {
          return;
        }

        setError(err.message || 'Failed to load dashboard');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = dashboard?.stats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor overall platform performance and activity.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Users"
          value={isLoading ? '...' : formatNumber(stats?.totalUsers || 0)}
          subtitle="Registered app users"
          icon={Users}
        />
        <StatCard
          title="Total Companies"
          value={isLoading ? '...' : formatNumber(stats?.totalCompanies || 0)}
          subtitle="Organizations onboarded"
          icon={Building2}
        />
        <StatCard
          title="Shipments Tracked"
          value={isLoading ? '...' : formatNumber(stats?.totalShipments || 0)}
          subtitle="Carbon records in the ledger"
          icon={FileBarChart2}
        />
        <StatCard
          title="Emissions Tracked"
          value={isLoading ? '...' : `${formatNumber(stats?.totalCarbonTonnes || 0, 1)} t`}
          subtitle={`${formatNumber(stats?.pendingReports || 0)} reports processing`}
          icon={Activity}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Emissions Tracked Over Time</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard?.monthlyEmissions || []} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#111827' }}
                />
                <Area type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity Logs</h2>
          <div className="space-y-6">
            {(dashboard?.recentActivity || []).map((log) => (
              <div key={log.id} className="flex gap-4">
                <div className="relative mt-1">
                  <div className="h-2 w-2 rounded-full bg-green-500 ring-4 ring-green-50"></div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{log.description}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{log.actor}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {!isLoading && (dashboard?.recentActivity || []).length === 0 && (
              <p className="text-sm text-gray-500">No recent admin activity yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
