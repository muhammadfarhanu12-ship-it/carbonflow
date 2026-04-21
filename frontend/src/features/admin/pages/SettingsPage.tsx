import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { adminService } from "../services/adminService";
import type { AdminPlatformSettings, AdminProfile } from "../types";

export function SettingsPage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [settings, setSettings] = useState<AdminPlatformSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminService.getProfile(),
      adminService.getPlatformSettings(),
    ])
      .then(([profileData, settingsData]) => {
        setProfile(profileData);
        setSettings(settingsData);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleSave() {
    if (!profile || !settings) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await Promise.all([
        adminService.updateProfile({
          name: profile.name,
          email: profile.email,
        }),
        adminService.updatePlatformSettings({
          platformName: settings.platformName,
          supportEmail: settings.supportEmail,
          sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
        }),
      ]);

      setMessage("Settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Platform Settings</h2>
        <p className="text-muted-foreground">Manage global configuration and your admin profile.</p>
      </div>

      {message && <div className="rounded-xl border bg-card p-4 text-sm text-primary">{message}</div>}
      {error && <div className="rounded-xl border bg-card p-4 text-sm text-destructive">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Admin Profile</CardTitle>
            <CardDescription>Update the primary profile used for platform administration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name">Name</Label>
              <Input
                id="admin-name"
                value={profile?.name || ""}
                onChange={(event) => setProfile((current) => current ? { ...current, name: event.target.value } : current)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={profile?.email || ""}
                onChange={(event) => setProfile((current) => current ? { ...current, email: event.target.value } : current)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>General Platform Settings</CardTitle>
            <CardDescription>Adjust the global support and session policies for CarbonFlow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform-name">Platform Name</Label>
              <Input
                id="platform-name"
                value={settings?.platformName || ""}
                onChange={(event) => setSettings((current) => current ? { ...current, platformName: event.target.value } : current)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-email">Support Email</Label>
              <Input
                id="support-email"
                type="email"
                value={settings?.supportEmail || ""}
                onChange={(event) => setSettings((current) => current ? { ...current, supportEmail: event.target.value } : current)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
              <Input
                id="session-timeout"
                type="number"
                value={settings?.sessionTimeoutMinutes || 60}
                onChange={(event) => setSettings((current) => current ? { ...current, sessionTimeoutMinutes: Number(event.target.value) } : current)}
              />
            </div>

            <Button onClick={handleSave}>Save Changes</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
