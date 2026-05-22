# Settings Module

CarbonFlow Settings is the organization control center for profile, company configuration, carbon accounting defaults, team management, security preferences, API keys, and integration status.

## Backend-Driven Settings

Settings are served from authenticated backend endpoints under `/api/settings` and `/api/user/settings`. Settings are company-scoped through the authenticated user's `companyId`; frontend state is only an editing surface.

## Profile

Profile settings expose name, email, verification status, role, workspace, locale/timezone placeholders, last login, and account creation metadata where available. Email is read-only in the Settings page because changing email requires a verification workflow. Profile changes create `profile_updated` audit events.

## Organization Configuration

Organization settings support company profile, reporting boundaries, fiscal year, reporting year, currency, net zero target year, carbon price, revenue, shipment weight, preferred units, report inclusion policy, and retention years.

Editable organization settings require `settings:organization:update`. Viewers and auditors receive read-only behavior.

## Emissions and Factor Override Governance

Operational baseline inputs remain separate from emission factor overrides. Numeric inputs are validated to be non-negative and renewable electricity percentage must be 0-100.

Factor overrides require source name, source year, unit, region, and reason. Override changes create `factor_override_updated` or `emissions_settings_updated` audit events. Reports and ledger calculations can identify custom factor override usage through the stored override metadata.

## Team and RBAC

Team management uses backend user APIs and requires `settings:team:manage` or `user:manage`. Supported workspace roles include admin, manager, data entry, viewer, and auditor. The backend blocks unauthorized role assignment and prevents removing/demoting the last workspace administrator.

Audited actions include `user_invited`, `user_role_changed`, and `user_deactivated`.

## Security

Password changes require current-password verification and a strong new password. Passwords are hashed server-side and `password_changed` is audited.

MFA, active session revocation, and SSO are displayed as readiness states when not implemented. The UI does not pretend unsupported security controls are active.

Notification preferences are backend persisted and audited through `notification_preferences_updated`.

## API Key Security

API keys are generated server-side. New and rotated keys are shown only once in the response. Stored API keys use SHA-256 hashes and masked display values only.

Key records support name, scopes, expiration, last used metadata, created by, status, revoke, and rotate. Legacy full keys are migrated to hash-only records when settings are read.

Audited actions include `api_key_created`, `api_key_rotated`, and `api_key_revoked`.

## Integrations

Integration cards are backend-driven. Supported cards include ERP Feed, Carrier API, Email/SMTP, Registry Provider, Payment Provider, and Storage Provider.

The backend does not mark an integration connected unless configuration metadata indicates it is configured. Test and sync actions on unconfigured integrations fail honestly with a safe error message and audit `integration_sync_failed`.

## Permissions

Primary permissions:

- `settings:view`
- `settings:profile:update`
- `settings:organization:update`
- `settings:emissions:update`
- `settings:team:manage`
- `settings:security:update`
- `settings:api_keys:manage`
- `settings:integrations:manage`

Backend middleware and service checks enforce permissions. Frontend disabled controls are only usability hints.

## Limitations

MFA, SSO/SAML/OIDC, active session inventory, email-change verification, real invitation email delivery, and real third-party integration credential storage/testing require additional provider or identity infrastructure. The Settings module now presents those states honestly instead of simulating them.

## Production Smoke Checklist

1. Login.
2. Update profile.
3. Update organization settings as admin.
4. Confirm viewer cannot edit organization.
5. Update emissions settings with valid values.
6. Try invalid emissions values.
7. Invite team member as admin.
8. Confirm viewer cannot invite.
9. Change password.
10. Generate API key.
11. Confirm full key shown once.
12. Refresh and confirm key is masked.
13. Revoke API key.
14. Confirm integrations show not configured unless backend configuration exists.
15. Run test/sync and confirm status/history.
16. Check audit logs for settings changes.
17. Confirm no localhost API calls in production console.
18. Confirm no secrets/full API keys exposed.
