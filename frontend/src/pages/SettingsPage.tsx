import { useEffect, useMemo, useState } from "react";
import { Bell, Building2, Key, Loader2, Shield, UserRound, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { settingsService } from "@/src/services/settingsService";
import { socketService } from "@/src/services/socketService";
import { useToast } from "@/src/components/providers/ToastProvider";
import { userService } from "@/src/services/userService";
import { authService } from "@/src/services/authService";
import type { ManagedUser, SettingsPayload, UserRole, UserSettings } from "@/src/types/platform";

const initialTeamForm = {
  name: "",
  email: "",
  role: "ANALYST" as UserRole,
};

export function SettingsPage() {
  const { showToast } = useToast();
  const session = authService.getSession();
  const canManageUsers = ["ADMIN", "MANAGER", "SUPERADMIN"].includes(session.user?.role || "");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [team, setTeam] = useState<ManagedUser[]>([]);
  const [teamForm, setTeamForm] = useState(initialTeamForm);
  const [loading, setLoading] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "organization" | "emissions" | "team" | "security" | "api">("profile");
  const [savingTab, setSavingTab] = useState("");
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "" });

  const loadSettings = async () => {
    try {
      setError("");
      setSettings(await settingsService.getSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const loadTeam = async () => {
    if (!canManageUsers) {
      return;
    }

    setLoadingTeam(true);
    try {
      const response = await userService.listUsers("?pageSize=25");
      setTeam(response.data);
    } catch (teamError) {
      setError(teamError instanceof Error ? teamError.message : "Failed to load workspace users");
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadSettings(), loadTeam()]);
    const unsubscribers = [
      socketService.on("settingsUpdated", loadSettings),
      socketService.on("supplierUpdated", loadSettings),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const save = async (payload: SettingsPayload, successMessage: string, tab: string) => {
    if (!settings) return;
    setSavingTab(tab);
    try {
      const updated = await settingsService.updateSettings(payload);
      setSettings(updated);
      showToast({ tone: "success", title: successMessage });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingTab("");
    }
  };

  const createApiKey = async () => {
    setSavingTab("api-key");
    try {
      const updated = await settingsService.createApiKey(`Workspace Key ${new Date().toLocaleDateString()}`);
      setSettings(updated);
      showToast({
        tone: "success",
        title: "API key generated",
        description: "A new key has been added to your workspace settings.",
      });
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Failed to generate API key");
    } finally {
      setSavingTab("");
    }
  };

  const createTeamUser = async () => {
    setSavingTab("team-create");
    try {
      await userService.createUser({
        ...teamForm,
        status: "INVITED",
      });
      showToast({
        tone: "success",
        title: "Team member invited",
        description: `${teamForm.email} has been added to the organization workspace.`,
      });
      setTeamForm(initialTeamForm);
      await loadTeam();
    } catch (teamError) {
      setError(teamError instanceof Error ? teamError.message : "Failed to create team member");
    } finally {
      setSavingTab("");
    }
  };

  const tabs = useMemo(() => ([
    { key: "profile", label: "Profile", icon: UserRound },
    { key: "organization", label: "Organization", icon: Building2 },
    { key: "emissions", label: "Emissions", icon: Building2 },
    { key: "team", label: "Team", icon: Users },
    { key: "security", label: "Security", icon: Shield },
    { key: "api", label: "API Keys", icon: Key },
  ]), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage organization controls, carbon inputs, security, integrations, and team access.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="text-sm text-muted-foreground">Loading settings...</div>}

      {settings && (
        <div className="grid gap-6 md:grid-cols-4">
          <div className="space-y-1 md:col-span-1">
            {tabs.map((tab) => (
              <Button
                key={tab.key}
                variant="ghost"
                className={`w-full justify-start ${activeTab === tab.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
              >
                <tab.icon className="mr-2 h-4 w-4" />
                {tab.label}
              </Button>
            ))}
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => save({
              preferences: {
                notificationsEnabled: !settings.preferences.notificationsEnabled,
                securityAlertsEnabled: settings.preferences.securityAlertsEnabled,
              },
            }, "Notification preference updated", "notifications")}>
              <Bell className="mr-2 h-4 w-4" />
              {settings.preferences.notificationsEnabled ? "Disable notifications" : "Enable notifications"}
            </Button>
          </div>

          <div className="space-y-6 md:col-span-3">
            {activeTab === "profile" ? (
              <Card>
                <CardHeader>
                  <CardTitle>Profile settings</CardTitle>
                  <CardDescription>Manage your personal account information used across the workspace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Full name" value={settings.profile.name} onChange={(value) => setSettings((prev) => prev ? { ...prev, profile: { ...prev.profile, name: value } } : prev)} />
                  <Field label="Email" type="email" value={settings.profile.email} onChange={(value) => setSettings((prev) => prev ? { ...prev, profile: { ...prev.profile, email: value } } : prev)} />
                  <Button onClick={() => save({ profile: settings.profile }, "Profile updated", "profile")} disabled={savingTab === "profile"}>
                    {savingTab === "profile" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save profile
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {activeTab === "organization" ? (
              <Card>
                <CardHeader>
                  <CardTitle>Organization settings</CardTitle>
                  <CardDescription>Configure company context, financial baseline, and enterprise planning targets.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Organization Name" value={settings.organization.companyName} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, companyName: value }, company: { ...prev.company, companyName: value } } : prev)} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Industry" value={settings.organization.industry} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, industry: value }, company: { ...prev.company, industry: value } } : prev)} />
                    <Field label="Headquarters" value={settings.organization.headquarters} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, headquarters: value }, company: { ...prev.company, headquarters: value } } : prev)} />
                    <Field label="Region" value={settings.organization.region} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, region: value }, company: { ...prev.company, region: value } } : prev)} />
                    <Field label="Currency" value={settings.organization.currency} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, currency: value }, company: { ...prev.company, currency: value } } : prev)} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Net Zero Target Year" type="number" value={String(settings.organization.netZeroTargetYear)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, netZeroTargetYear: Number(value) }, company: { ...prev.company, netZeroTargetYear: Number(value) } } : prev)} />
                    <Field label="Carbon Price Per Ton" type="number" value={String(settings.organization.carbonPricePerTon)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, carbonPricePerTon: Number(value) }, company: { ...prev.company, carbonPricePerTon: Number(value) } } : prev)} />
                    <Field label="Annual Revenue (USD)" type="number" value={String(settings.organization.revenueUsd)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, revenueUsd: Number(value) }, company: { ...prev.company, revenueUsd: Number(value) }, operationalMetrics: { ...prev.operationalMetrics, revenueUsd: Number(value) } } : prev)} />
                    <Field label="Annual Shipment Weight (kg)" type="number" value={String(settings.organization.annualShipmentWeightKg)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, annualShipmentWeightKg: Number(value) }, company: { ...prev.company, annualShipmentWeightKg: Number(value) }, operationalMetrics: { ...prev.operationalMetrics, annualShipmentWeightKg: Number(value) } } : prev)} />
                  </div>
                  <Button onClick={() => save({ organization: settings.organization }, "Organization settings updated", "organization")} disabled={savingTab === "organization"}>
                    {savingTab === "organization" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save organization
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {activeTab === "emissions" ? (
              <Card>
                <CardHeader>
                  <CardTitle>Operational Carbon Inputs</CardTitle>
                  <CardDescription>Update Scope 1 and Scope 2 drivers, plus organization-specific emission factor overrides.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Electricity Consumption (kWh)" type="number" value={String(settings.operationalMetrics.electricityConsumptionKwh)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, electricityConsumptionKwh: Number(value) } } : prev)} />
                    <Field label="Renewable Electricity (%)" type="number" value={String(settings.operationalMetrics.renewableElectricityPct)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, renewableElectricityPct: Number(value) } } : prev)} />
                    <Field label="Stationary Fuel (liters)" type="number" value={String(settings.operationalMetrics.stationaryFuelLiters)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, stationaryFuelLiters: Number(value) } } : prev)} />
                    <Field label="Mobile Fuel (liters)" type="number" value={String(settings.operationalMetrics.mobileFuelLiters)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, mobileFuelLiters: Number(value) } } : prev)} />
                    <Field label="Company Vehicle Distance (km)" type="number" value={String(settings.operationalMetrics.companyVehicleKm)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, companyVehicleKm: Number(value) } } : prev)} />
                    <Field label="Road Factor Override" type="number" value={String(settings.emissionFactors.transport.ROAD ?? 0)} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactors: { ...prev.emissionFactors, transport: { ...prev.emissionFactors.transport, ROAD: Number(value) } } } : prev)} />
                    <Field label="Air Factor Override" type="number" value={String(settings.emissionFactors.transport.AIR ?? 0)} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactors: { ...prev.emissionFactors, transport: { ...prev.emissionFactors.transport, AIR: Number(value) } } } : prev)} />
                    <Field label="Electricity Factor Override" type="number" value={String(settings.emissionFactors.electricity[settings.organization.region] ?? 0)} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactors: { ...prev.emissionFactors, electricity: { ...prev.emissionFactors.electricity, [prev.organization.region]: Number(value) } } } : prev)} />
                  </div>
                  <Button onClick={() => save({ operationalMetrics: settings.operationalMetrics, emissionFactors: settings.emissionFactors }, "Operational carbon inputs updated", "emissions")} disabled={savingTab === "emissions"}>
                    {savingTab === "emissions" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save carbon inputs
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {activeTab === "team" ? (
              <Card>
                <CardHeader>
                  <CardTitle>User management</CardTitle>
                  <CardDescription>Invite analysts and managers into the organization workspace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {canManageUsers ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-4">
                        <Field label="Full name" value={teamForm.name} onChange={(value) => setTeamForm((prev) => ({ ...prev, name: value }))} />
                        <Field label="Email" value={teamForm.email} onChange={(value) => setTeamForm((prev) => ({ ...prev, email: value }))} />
                        <div className="space-y-2">
                          <Label>Role</Label>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={teamForm.role} onChange={(event) => setTeamForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}>
                            {["ANALYST", "MANAGER", "ADMIN"].map((role) => <option key={role} value={role}>{role}</option>)}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <Button className="w-full" onClick={createTeamUser} disabled={savingTab === "team-create" || !teamForm.name || !teamForm.email}>
                            {savingTab === "team-create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Invite user
                          </Button>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b bg-muted/50 text-muted-foreground">
                            <tr>
                              <th className="px-4 py-3 font-medium">User</th>
                              <th className="px-4 py-3 font-medium">Role</th>
                              <th className="px-4 py-3 font-medium">Status</th>
                              <th className="px-4 py-3 font-medium">Last Login</th>
                              <th className="px-4 py-3 font-medium text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {loadingTeam ? (
                              <tr><td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">Loading users...</td></tr>
                            ) : team.length === 0 ? (
                              <tr><td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">No users available.</td></tr>
                            ) : team.map((member) => (
                              <tr key={member.id} className="hover:bg-muted/50">
                                <td className="px-4 py-4">
                                  <div className="font-medium text-foreground">{member.name}</div>
                                  <div className="text-xs text-muted-foreground">{member.email}</div>
                                </td>
                                <td className="px-4 py-4">
                                  <select className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={member.role} onChange={async (event) => {
                                    await userService.updateUser(member.id, { role: event.target.value as UserRole });
                                    await loadTeam();
                                  }}>
                                    {["ANALYST", "MANAGER", "ADMIN"].map((role) => <option key={role} value={role}>{role}</option>)}
                                  </select>
                                </td>
                                <td className="px-4 py-4">{member.status}</td>
                                <td className="px-4 py-4">{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : "Never"}</td>
                                <td className="px-4 py-4 text-right">
                                  <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                                    await userService.deleteUser(member.id);
                                    await loadTeam();
                                  }}>
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Your role does not have permission to manage workspace users.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {activeTab === "security" ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>Change your password with current-password verification.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="Current password" type="password" value={password.currentPassword} onChange={(value) => setPassword((prev) => ({ ...prev, currentPassword: value }))} />
                    <Field label="New password" type="password" value={password.newPassword} onChange={(value) => setPassword((prev) => ({ ...prev, newPassword: value }))} />
                    <Button
                      onClick={async () => {
                        await save({ password }, "Password updated", "password");
                        setPassword({ currentPassword: "", newPassword: "" });
                      }}
                      disabled={savingTab === "password" || !password.currentPassword || !password.newPassword}
                    >
                      {savingTab === "password" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Change password
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Preferences</CardTitle>
                    <CardDescription>Choose how CarbonFlow alerts your team.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ToggleRow
                      label="Product notifications"
                      description="Shipment, upload, and report updates."
                      checked={settings.preferences.notificationsEnabled}
                      onToggle={() => setSettings((prev) => prev ? { ...prev, preferences: { ...prev.preferences, notificationsEnabled: !prev.preferences.notificationsEnabled } } : prev)}
                    />
                    <ToggleRow
                      label="Security alerts"
                      description="Critical auth and account activity notices."
                      checked={settings.preferences.securityAlertsEnabled}
                      onToggle={() => setSettings((prev) => prev ? { ...prev, preferences: { ...prev.preferences, securityAlertsEnabled: !prev.preferences.securityAlertsEnabled } } : prev)}
                    />
                    <Button onClick={() => save({ preferences: settings.preferences }, "Security preferences updated", "preferences")} disabled={savingTab === "preferences"}>
                      {savingTab === "preferences" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save preferences
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : null}

            {activeTab === "api" ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>API keys</CardTitle>
                    <CardDescription>Generate and manage workspace keys for trusted integrations.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={createApiKey} disabled={savingTab === "api-key"}>
                      {savingTab === "api-key" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Generate API key
                    </Button>
                    {settings.apiKeys.map((apiKey) => (
                      <div key={apiKey.key} className="rounded-lg border border-border p-4">
                        <p className="font-medium text-foreground">{apiKey.label}</p>
                        <p className="mt-1 break-all text-sm text-muted-foreground">{apiKey.key}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Created {new Date(apiKey.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Integrations</CardTitle>
                    <CardDescription>Sync enterprise connections and record the last successful handshake.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {settings.integrations.map((integration) => (
                      <div key={integration.name} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div>
                          <p className="font-medium text-foreground">{integration.name}</p>
                          <p className="text-sm text-muted-foreground">{integration.status} {integration.lastSync ? `- Last sync ${new Date(integration.lastSync).toLocaleString()}` : ""}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={async () => {
                          setSavingTab(integration.name);
                          try {
                            const updated = await settingsService.syncIntegration(integration.name);
                            setSettings(updated);
                            showToast({ tone: "success", title: `${integration.name} synced` });
                          } catch (syncError) {
                            setError(syncError instanceof Error ? syncError.message : "Failed to sync integration");
                          } finally {
                            setSavingTab("");
                          }
                        }}>
                          {savingTab === integration.name ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Sync now
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ToggleRow({ label, description, checked, onToggle }: { label: string; description: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border p-4">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button type="button" className={`h-7 w-12 rounded-full p-1 transition ${checked ? "bg-primary" : "bg-muted"}`} onClick={onToggle}>
        <span className={`block h-5 w-5 rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}
