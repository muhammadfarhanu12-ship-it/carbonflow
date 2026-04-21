import { useEffect, useState } from 'react';
import { adminService } from '../../services/adminService';
import { adminAuthService } from '../../services/adminAuthService';
import { useAuth } from '../../hooks/useAuth';
import type { AdminSettings } from '../../types/admin';

export function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    adminService.getSettings()
      .then((response) => {
        setSettings(response);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load settings');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) {
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const updated = await adminService.updateSettings(settings);
      setSettings(updated);
      setSuccessMessage('Settings saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setIsUpdatingPassword(true);
    setError('');
    setSuccessMessage('');

    try {
      await adminAuthService.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setSuccessMessage('Admin password updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure global platform parameters and emission factors.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Platform Configuration</h2>
          <p className="text-sm text-gray-500 mt-1">Update admin-facing defaults and baseline emission factors.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Platform name</label>
              <input
                type="text"
                value={settings?.platformName || ''}
                onChange={(e) => setSettings((current) => current ? { ...current, platformName: e.target.value } : current)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Support email</label>
              <input
                type="email"
                value={settings?.supportEmail || ''}
                onChange={(e) => setSettings((current) => current ? { ...current, supportEmail: e.target.value } : current)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Session timeout (minutes)</label>
              <input
                type="number"
                min={15}
                value={settings?.sessionTimeoutMinutes || 60}
                onChange={(e) => setSettings((current) => current ? { ...current, sessionTimeoutMinutes: Number(e.target.value) } : current)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Road Freight (kg CO2e / ton-km)</label>
              <input
                type="number"
                step="0.001"
                value={settings?.emissionFactors.road || 0}
                onChange={(e) => setSettings((current) => current ? {
                  ...current,
                  emissionFactors: { ...current.emissionFactors, road: Number(e.target.value) },
                } : current)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Air Freight (kg CO2e / ton-km)</label>
              <input
                type="number"
                step="0.001"
                value={settings?.emissionFactors.air || 0}
                onChange={(e) => setSettings((current) => current ? {
                  ...current,
                  emissionFactors: { ...current.emissionFactors, air: Number(e.target.value) },
                } : current)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Ocean Freight (kg CO2e / ton-km)</label>
              <input
                type="number"
                step="0.001"
                value={settings?.emissionFactors.ocean || 0}
                onChange={(e) => setSettings((current) => current ? {
                  ...current,
                  emissionFactors: { ...current.emissionFactors, ocean: Number(e.target.value) },
                } : current)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 bg-white"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={settings?.maintenanceMode || false}
                onChange={(e) => setSettings((current) => current ? { ...current, maintenanceMode: e.target.checked } : current)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                disabled={isLoading}
              />
              Maintenance mode
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={settings?.allowSelfSignup || false}
                onChange={(e) => setSettings((current) => current ? { ...current, allowSelfSignup: e.target.checked } : current)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                disabled={isLoading}
              />
              Allow user self signup
            </label>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              onClick={handleSaveSettings}
              disabled={isLoading || isSaving || !settings}
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Admin Account</h2>
          <p className="text-sm text-gray-500 mt-1">{user?.email || 'Signed in admin session'}</p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="pt-4 flex">
            <button
              className="px-4 py-2 bg-gray-800 text-white rounded-md text-sm font-medium hover:bg-gray-900 transition-colors disabled:opacity-50"
              onClick={handleChangePassword}
              disabled={isUpdatingPassword || !currentPassword || !newPassword}
            >
              {isUpdatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
