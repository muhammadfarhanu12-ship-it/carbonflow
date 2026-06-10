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
import { hasPermission, NO_PERMISSION_MESSAGE } from "@/src/utils/permissions";

const initialTeamForm = {
  name: "",
  email: "",
  role: "DATA_ENTRY" as UserRole,
};

const TEAM_PERMISSION_MESSAGE = "Your role does not have permission to manage workspace users. Ask an Owner or Admin for access.";

export function SettingsPage() {
  const { showToast } = useToast();
  const session = authService.getSession();
  const canViewSettings = hasPermission(session.user, "settings:view");
  const canUpdateProfile = hasPermission(session.user, "settings:profile:update");
  const canUpdateOrganization = hasPermission(session.user, "settings:organization:update");
  const canUpdateEmissions = hasPermission(session.user, "settings:emissions:update");
  const canManageUsers = hasPermission(session.user, "settings:team:manage") || hasPermission(session.user, "user:manage");
  const canUpdateSecurity = hasPermission(session.user, "settings:security:update");
  const canManageApiKeys = hasPermission(session.user, "settings:api_keys:manage");
  const canManageIntegrations = hasPermission(session.user, "settings:integrations:manage");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [team, setTeam] = useState<ManagedUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<ManagedUser[]>([]);
  const [teamForm, setTeamForm] = useState(initialTeamForm);
  const [loading, setLoading] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "organization" | "emissions" | "team" | "security" | "api">("profile");
  const [savingTab, setSavingTab] = useState("");
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [apiKeyForm, setApiKeyForm] = useState({ label: "", expiresAt: "", scopes: ["emissions:read"] });
  const [oneTimeApiKey, setOneTimeApiKey] = useState("");

  const loadSettings = async () => {
    try {
      setError("");
      if (!canViewSettings) {
        setError(NO_PERMISSION_MESSAGE);
        return;
      }
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
      const [teamMembers, invites] = await Promise.all([
        userService.listTeam(),
        userService.listPendingInvites(),
      ]);
      setTeam(teamMembers);
      setPendingInvites(invites);
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
      const updated = await settingsService.createApiKey({
        label: apiKeyForm.label || `Workspace Key ${new Date().toLocaleDateString()}`,
        scopes: apiKeyForm.scopes,
        expiresAt: apiKeyForm.expiresAt || null,
      });
      setSettings(updated);
      setOneTimeApiKey(updated.oneTimeApiKey || "");
      showToast({
        tone: "success",
        title: "API key generated",
        description: "Copy this key now. You will not be able to see it again.",
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
      await userService.inviteUser({
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

  const roleOptions = useMemo<UserRole[]>(() => {
    const currentRole = String(session.user?.role || "").toUpperCase();
    if (currentRole === "OWNER" || currentRole === "SUPERADMIN") {
      return ["OWNER", "ADMIN", "MANAGER", "DATA_ENTRY", "VIEWER", "AUDITOR"];
    }

    return ["ADMIN", "MANAGER", "DATA_ENTRY", "VIEWER", "AUDITOR"];
  }, [session.user?.role]);

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
      {!canViewSettings && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{NO_PERMISSION_MESSAGE}</CardContent>
        </Card>
      )}

      {settings && canViewSettings && (
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
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Full name" value={settings.profile.name} onChange={(value) => setSettings((prev) => prev ? { ...prev, profile: { ...prev.profile, name: value } } : prev)} disabled={!canUpdateProfile} />
                    <Field label="Email" type="email" value={settings.profile.email} onChange={() => undefined} disabled />
                    <ReadOnlyField label="Email status" value={settings.profile.emailVerified ? "Verified" : "Unverified - email changes require verification workflow"} />
                    <ReadOnlyField label="Role" value={settings.profile.role || session.user?.role || "-"} />
                    <ReadOnlyField label="Workspace" value={settings.profile.companyName || settings.organization.companyName || "-"} />
                    <ReadOnlyField label="Last login" value={settings.profile.lastLoginAt ? new Date(settings.profile.lastLoginAt).toLocaleString() : "Not available"} />
                    <Field label="Timezone" value={settings.profile.timezone || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, profile: { ...prev.profile, timezone: value } } : prev)} disabled={!canUpdateProfile} />
                    <Field label="Locale" value={settings.profile.locale || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, profile: { ...prev.profile, locale: value } } : prev)} disabled={!canUpdateProfile} />
                  </div>
                  <Button onClick={() => save({ profile: { name: settings.profile.name, timezone: settings.profile.timezone, locale: settings.profile.locale } }, "Profile updated", "profile")} disabled={savingTab === "profile" || !canUpdateProfile}>
                    {savingTab === "profile" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save profile
                  </Button>
                  {!canUpdateProfile ? <p className="text-sm text-muted-foreground">{NO_PERMISSION_MESSAGE}</p> : null}
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
                  <SectionTitle title="Company Profile" />
                  <Field label="Organization Name" value={settings.organization.companyName} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, companyName: value }, company: { ...prev.company, companyName: value } } : prev)} disabled={!canUpdateOrganization} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Legal Name" value={settings.organization.legalName || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, legalName: value }, company: { ...prev.company, legalName: value } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Industry" value={settings.organization.industry} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, industry: value }, company: { ...prev.company, industry: value } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Headquarters" value={settings.organization.headquarters} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, headquarters: value }, company: { ...prev.company, headquarters: value } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Country" value={settings.organization.country || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, country: value }, company: { ...prev.company, country: value } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Region" value={settings.organization.region} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, region: value }, company: { ...prev.company, region: value } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Currency" value={settings.organization.currency} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, currency: value.toUpperCase() }, company: { ...prev.company, currency: value.toUpperCase() } } : prev)} disabled={!canUpdateOrganization} />
                  </div>
                  <SectionTitle title="Reporting & Boundaries" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Fiscal Year Start Month" type="number" value={String(settings.organization.fiscalYearStartMonth || 1)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, fiscalYearStartMonth: Number(value) }, company: { ...prev.company, fiscalYearStartMonth: Number(value) } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Reporting Year" type="number" value={String(settings.organization.reportingYear || new Date().getFullYear())} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, reportingYear: Number(value) }, company: { ...prev.company, reportingYear: Number(value) } } : prev)} disabled={!canUpdateOrganization} />
                    <SelectField label="Default Reporting Boundary" value={settings.organization.defaultReportingBoundary || "operational_control"} options={["operational_control", "financial_control", "equity_share"]} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, defaultReportingBoundary: value as typeof prev.organization.defaultReportingBoundary }, company: { ...prev.company, defaultReportingBoundary: value as typeof prev.company.defaultReportingBoundary } } : prev)} disabled={!canUpdateOrganization} />
                    <SelectField label="Default Report Inclusion Policy" value={settings.organization.defaultReportInclusionPolicy || "approved_only"} options={["approved_only", "all_with_warning"]} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, defaultReportInclusionPolicy: value as typeof prev.organization.defaultReportInclusionPolicy }, company: { ...prev.company, defaultReportInclusionPolicy: value as typeof prev.company.defaultReportInclusionPolicy } } : prev)} disabled={!canUpdateOrganization} />
                  </div>
                  <SectionTitle title="Financial Planning" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Net Zero Target Year" type="number" value={String(settings.organization.netZeroTargetYear)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, netZeroTargetYear: Number(value) }, company: { ...prev.company, netZeroTargetYear: Number(value) } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Carbon Price Per Ton" type="number" value={String(settings.organization.carbonPricePerTon)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, carbonPricePerTon: Number(value) }, company: { ...prev.company, carbonPricePerTon: Number(value) } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Annual Revenue" type="number" value={String(settings.organization.revenueUsd)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, revenueUsd: Number(value) }, company: { ...prev.company, revenueUsd: Number(value) }, operationalMetrics: { ...prev.operationalMetrics, revenueUsd: Number(value) } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Annual Shipment Weight (kg)" type="number" value={String(settings.organization.annualShipmentWeightKg)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, annualShipmentWeightKg: Number(value) }, company: { ...prev.company, annualShipmentWeightKg: Number(value) }, operationalMetrics: { ...prev.operationalMetrics, annualShipmentWeightKg: Number(value) } } : prev)} disabled={!canUpdateOrganization} />
                  </div>
                  <SectionTitle title="Units & Data Retention" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField label="Preferred Units" value={settings.organization.preferredUnits || "metric"} options={["metric", "imperial"]} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, preferredUnits: value as typeof prev.organization.preferredUnits }, company: { ...prev.company, preferredUnits: value as typeof prev.company.preferredUnits } } : prev)} disabled={!canUpdateOrganization} />
                    <Field label="Data Retention Years" type="number" value={String(settings.organization.dataRetentionYears || 7)} onChange={(value) => setSettings((prev) => prev ? { ...prev, organization: { ...prev.organization, dataRetentionYears: Number(value) }, company: { ...prev.company, dataRetentionYears: Number(value) } } : prev)} disabled={!canUpdateOrganization} />
                  </div>
                  <ReadOnlyField label="Last updated" value={settings.organization.updatedAt ? new Date(settings.organization.updatedAt).toLocaleString() : "Not available"} />
                  <Button onClick={() => save({ organization: settings.organization }, "Organization settings updated", "organization")} disabled={savingTab === "organization" || !canUpdateOrganization}>
                    {savingTab === "organization" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save organization
                  </Button>
                  {!canUpdateOrganization ? <p className="text-sm text-muted-foreground">Read-only mode. {NO_PERMISSION_MESSAGE}</p> : null}
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
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Factor overrides affect calculations and reports. Use official/custom factors with documented source.
                  </div>
                  <SectionTitle title="Operational Baseline Inputs" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Electricity Consumption (kWh)" type="number" value={String(settings.operationalMetrics.electricityConsumptionKwh)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, electricityConsumptionKwh: Number(value) } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Renewable Electricity (%)" type="number" value={String(settings.operationalMetrics.renewableElectricityPct)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, renewableElectricityPct: Number(value) } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Stationary Fuel (liters)" type="number" value={String(settings.operationalMetrics.stationaryFuelLiters)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, stationaryFuelLiters: Number(value) } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Mobile Fuel (liters)" type="number" value={String(settings.operationalMetrics.mobileFuelLiters)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, mobileFuelLiters: Number(value) } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Company Vehicle Distance (km)" type="number" value={String(settings.operationalMetrics.companyVehicleKm)} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, companyVehicleKm: Number(value) } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Default Reporting Period" value={settings.operationalMetrics.defaultReportingPeriod || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, defaultReportingPeriod: value } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Notes / Source" value={settings.operationalMetrics.source || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, operationalMetrics: { ...prev.operationalMetrics, source: value } } : prev)} disabled={!canUpdateEmissions} />
                  </div>
                  <SectionTitle title="Emission Factor Overrides" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Road Factor Override" type="number" value={String(settings.emissionFactors.transport.ROAD ?? 0)} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactors: { ...prev.emissionFactors, transport: { ...prev.emissionFactors.transport, ROAD: Number(value) } } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Air Factor Override" type="number" value={String(settings.emissionFactors.transport.AIR ?? 0)} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactors: { ...prev.emissionFactors, transport: { ...prev.emissionFactors.transport, AIR: Number(value) } } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Electricity Factor Override" type="number" value={String(settings.emissionFactors.electricity[settings.organization.region] ?? 0)} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactors: { ...prev.emissionFactors, electricity: { ...prev.emissionFactors.electricity, [prev.organization.region]: Number(value) } } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Override Source Name" value={settings.emissionFactorMetadata?.sourceName || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactorMetadata: { ...prev.emissionFactorMetadata, sourceName: value } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Override Source Year" type="number" value={String(settings.emissionFactorMetadata?.sourceYear || "")} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactorMetadata: { ...prev.emissionFactorMetadata, sourceYear: Number(value) } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Override Unit" value={settings.emissionFactorMetadata?.unit || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactorMetadata: { ...prev.emissionFactorMetadata, unit: value } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Override Region" value={settings.emissionFactorMetadata?.region || settings.organization.region} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactorMetadata: { ...prev.emissionFactorMetadata, region: value } } : prev)} disabled={!canUpdateEmissions} />
                    <Field label="Override Reason" value={settings.emissionFactorMetadata?.reason || ""} onChange={(value) => setSettings((prev) => prev ? { ...prev, emissionFactorMetadata: { ...prev.emissionFactorMetadata, reason: value } } : prev)} disabled={!canUpdateEmissions} />
                  </div>
                  <ReadOnlyField label="Override Status" value={settings.emissionFactorMetadata?.approvalStatus || "No active documented override"} />
                  <Button onClick={() => save({ operationalMetrics: settings.operationalMetrics, emissionFactors: settings.emissionFactors, emissionFactorMetadata: settings.emissionFactorMetadata }, "Operational carbon inputs updated", "emissions")} disabled={savingTab === "emissions" || !canUpdateEmissions}>
                    {savingTab === "emissions" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save carbon inputs
                  </Button>
                  {!canUpdateEmissions ? <p className="text-sm text-muted-foreground">Read-only mode. {NO_PERMISSION_MESSAGE}</p> : null}
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
                            {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
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
                                    await userService.updateUserRole(member.id, event.target.value as UserRole);
                                    await loadTeam();
                                  }}>
                                    {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                                  </select>
                                </td>
                                <td className="px-4 py-4">{member.status}</td>
                                <td className="px-4 py-4">{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : "Never"}</td>
                                <td className="px-4 py-4 text-right">
                                  <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                                    await userService.updateUserStatus(member.id, member.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED");
                                    await loadTeam();
                                  }}>
                                    {member.status === "SUSPENDED" ? "Reactivate" : "Deactivate"}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Pending invites</h3>
                          <p className="text-sm text-muted-foreground">Invited users stay pending until they complete onboarding.</p>
                        </div>
                        <div className="overflow-x-auto rounded-xl border">
                          <table className="w-full text-left text-sm">
                            <thead className="border-b bg-muted/50 text-muted-foreground">
                              <tr>
                                <th className="px-4 py-3 font-medium">Invitee</th>
                                <th className="px-4 py-3 font-medium">Role</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {loadingTeam ? (
                                <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">Loading invites...</td></tr>
                              ) : pendingInvites.length === 0 ? (
                                <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No pending invites.</td></tr>
                              ) : pendingInvites.map((invite) => (
                                <tr key={invite.id}>
                                  <td className="px-4 py-4">
                                    <div className="font-medium text-foreground">{invite.name}</div>
                                    <div className="text-xs text-muted-foreground">{invite.email}</div>
                                  </td>
                                  <td className="px-4 py-4">{invite.role}</td>
                                  <td className="px-4 py-4">{invite.status}</td>
                                  <td className="px-4 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                      <Button variant="outline" size="sm" onClick={async () => {
                                        await userService.resendInvite(invite.id);
                                        showToast({ tone: "success", title: "Invite resent", description: `${invite.email} has been resent an invite.` });
                                        await loadTeam();
                                      }}>
                                        Resend
                                      </Button>
                                      <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                                        await userService.cancelInvite(invite.id);
                                        await loadTeam();
                                      }}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{TEAM_PERMISSION_MESSAGE}</p>
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
                    <Field label="Confirm new password" type="password" value={password.confirmPassword} onChange={(value) => setPassword((prev) => ({ ...prev, confirmPassword: value }))} />
                    <p className="text-xs text-muted-foreground">{settings.security?.passwordPolicy || "Minimum 10 characters with uppercase, lowercase, number, and symbol."}</p>
                    <Button
                      onClick={async () => {
                        await save({ password }, "Password updated", "password");
                        setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
                      }}
                      disabled={savingTab === "password" || !password.currentPassword || !password.newPassword || password.newPassword !== password.confirmPassword || !canUpdateSecurity}
                    >
                      {savingTab === "password" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Change password
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Enterprise security readiness</CardTitle>
                    <CardDescription>MFA, SSO, and active session controls are shown honestly based on backend capability.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    <ReadOnlyField label="MFA" value={settings.security?.mfaStatus === "configured" ? "Configured" : "MFA not configured yet"} />
                    <ReadOnlyField label="Active Sessions" value={settings.security?.activeSessionsSupported ? "Supported" : "Current session only - revocation not implemented"} />
                    <ReadOnlyField label="SSO/SAML/OIDC" value={settings.security?.ssoStatus === "configured" ? "Configured" : "Not configured"} />
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
                    <ToggleRow
                      label="Report notifications"
                      description="Report generation, failures, and download notifications."
                      checked={settings.preferences.reportNotificationsEnabled !== false}
                      onToggle={() => setSettings((prev) => prev ? { ...prev, preferences: { ...prev.preferences, reportNotificationsEnabled: !prev.preferences.reportNotificationsEnabled } } : prev)}
                    />
                    <ToggleRow
                      label="Integration sync notifications"
                      description="Integration test, sync, and failure notifications."
                      checked={settings.preferences.integrationSyncNotificationsEnabled !== false}
                      onToggle={() => setSettings((prev) => prev ? { ...prev, preferences: { ...prev.preferences, integrationSyncNotificationsEnabled: !prev.preferences.integrationSyncNotificationsEnabled } } : prev)}
                    />
                    <ToggleRow
                      label="Marketplace and budget notifications"
                      description="Marketplace budget and offset workflow notifications."
                      checked={settings.preferences.marketplaceNotificationsEnabled !== false}
                      onToggle={() => setSettings((prev) => prev ? { ...prev, preferences: { ...prev.preferences, marketplaceNotificationsEnabled: !prev.preferences.marketplaceNotificationsEnabled } } : prev)}
                    />
                    <Button onClick={() => save({ preferences: settings.preferences }, "Security preferences updated", "preferences")} disabled={savingTab === "preferences" || !canUpdateSecurity}>
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
                    <CardDescription>Generate and manage workspace keys for trusted integrations. Full keys are shown only once.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {oneTimeApiKey ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        <p className="font-semibold">Copy this key now. You will not be able to see it again.</p>
                        <p className="mt-2 break-all font-mono">{oneTimeApiKey}</p>
                        <Button className="mt-3" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(oneTimeApiKey)}>Copy key</Button>
                      </div>
                    ) : null}
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Key name" value={apiKeyForm.label} onChange={(value) => setApiKeyForm((prev) => ({ ...prev, label: value }))} disabled={!canManageApiKeys} />
                      <Field label="Expiration date" type="date" value={apiKeyForm.expiresAt} onChange={(value) => setApiKeyForm((prev) => ({ ...prev, expiresAt: value }))} disabled={!canManageApiKeys} />
                      <SelectField label="Scope" value={apiKeyForm.scopes[0] || "emissions:read"} options={["emissions:read", "emissions:write", "suppliers:read", "suppliers:write", "shipments:read", "reports:read", "reports:generate", "marketplace:read", "audit:read"]} onChange={(value) => setApiKeyForm((prev) => ({ ...prev, scopes: [value] }))} disabled={!canManageApiKeys} />
                    </div>
                    <Button onClick={createApiKey} disabled={savingTab === "api-key" || !canManageApiKeys}>
                      {savingTab === "api-key" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Generate API key
                    </Button>
                    {!canManageApiKeys ? <p className="text-sm text-muted-foreground">{NO_PERMISSION_MESSAGE}</p> : null}
                    {settings.apiKeys.map((apiKey) => (
                      <div key={apiKey.id || apiKey.maskedKey || apiKey.createdAt} className="rounded-lg border border-border p-4">
                        <p className="font-medium text-foreground">{apiKey.label}</p>
                        <p className="mt-1 break-all font-mono text-sm text-muted-foreground">{apiKey.maskedKey || apiKey.key || "cf_••••••••"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Scopes: {(apiKey.scopes || []).join(", ") || "emissions:read"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Status: {apiKey.status || "active"} - Created {new Date(apiKey.createdAt).toLocaleString()}{apiKey.expiresAt ? ` - Expires ${new Date(apiKey.expiresAt).toLocaleDateString()}` : ""}</p>
                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" size="sm" disabled={!canManageApiKeys || apiKey.status === "revoked" || !apiKey.id} onClick={async () => {
                            const updated = await settingsService.rotateApiKey(apiKey.id || "");
                            setSettings(updated);
                            setOneTimeApiKey(updated.oneTimeApiKey || "");
                          }}>Rotate</Button>
                          <Button variant="outline" size="sm" className="text-destructive" disabled={!canManageApiKeys || apiKey.status === "revoked" || !apiKey.id} onClick={async () => {
                            setSettings(await settingsService.revokeApiKey(apiKey.id || ""));
                          }}>Revoke</Button>
                        </div>
                      </div>
                    ))}
                    {settings.apiKeys.length === 0 ? <p className="text-sm text-muted-foreground">No API keys created yet.</p> : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Integrations</CardTitle>
                    <CardDescription>Sync enterprise connections and record the last successful handshake.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {settings.integrations.map((integration) => (
                      <div key={integration.name} className="flex flex-col gap-4 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium text-foreground">{integration.name}</p>
                          <p className="text-sm text-muted-foreground">{readableStatus(integration.status)} {integration.lastSuccessfulSyncAt ? `- Last successful sync ${new Date(integration.lastSuccessfulSyncAt).toLocaleString()}` : ""}</p>
                          {integration.lastError ? <p className="mt-1 text-sm text-destructive">{integration.lastError}</p> : null}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" disabled={!canManageIntegrations} onClick={async () => {
                            setSavingTab(`${integration.name}-test`);
                            try {
                              setSettings(await settingsService.testIntegration(integration.name));
                            } catch (syncError) {
                              setError(syncError instanceof Error ? syncError.message : "Failed to test integration");
                            } finally {
                              setSavingTab("");
                            }
                          }}>
                            {savingTab === `${integration.name}-test` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Test
                          </Button>
                          <Button variant="outline" size="sm" disabled={!canManageIntegrations || integration.status !== "connected"} onClick={async () => {
                            setSavingTab(integration.name);
                            try {
                              const updated = await settingsService.syncIntegration(integration.name);
                              setSettings(updated);
                              showToast({ tone: "success", title: `${integration.name} sync processed` });
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
                      </div>
                    ))}
                    {settings.integrations.length === 0 ? <p className="text-sm text-muted-foreground">No integrations configured.</p> : null}
                    {!canManageIntegrations ? <p className="text-sm text-muted-foreground">{NO_PERMISSION_MESSAGE}</p> : null}
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

function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  const id = `settings-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </div>
  );
}

function SelectField({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) {
  const id = `settings-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm disabled:opacity-60" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map((option) => <option key={option} value={option}>{readableStatus(option)}</option>)}
      </select>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="border-b pb-2 text-sm font-semibold text-foreground">{title}</h3>;
}

function readableStatus(value: string) {
  return String(value || "-").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (char) => char.toUpperCase());
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
