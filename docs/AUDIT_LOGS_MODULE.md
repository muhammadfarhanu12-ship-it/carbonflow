# Audit Logs Module

CarbonFlow audit logs are backend-driven operational compliance records for actions across emissions, ledger, reports, suppliers, shipments, marketplace, optimization, admin, settings, imports, and auth flows.

## Model

Audit events support company scoping, user snapshots, readable labels, entity metadata, module, severity, category, source, status, request metadata, old/new values, changes summary, reason, retention metadata, and optional integrity hashes.

Sensitive values are redacted before storage and before API responses. Passwords, tokens, API keys, authorization headers, credentials, private keys, SMTP secrets, payment secrets, and registry credentials must not be written to audit logs.

## API

All audit endpoints require authentication and RBAC:

- `GET /api/audit-logs`
- `GET /api/audit-logs/:id`
- `GET /api/audit-logs/entity/:entityType/:entityId`
- `GET /api/audit-logs/summary`
- `GET /api/audit-logs/export?format=csv|json`

Supported filters include action, module, entity type, entity ID, user ID, user email, severity, category, status, source, request ID, search text, start date, and end date. List endpoints are paginated and default to newest events first.

## Export Behavior

CSV and JSON exports respect the active filters, require `audit:export`, and are company-scoped. CSV exports protect against spreadsheet formula injection for cells starting with `=`, `+`, `-`, or `@`.

Every export writes an `audit_log_exported` event. Downloads use authenticated blob requests from the frontend; protected exports must not be opened through unauthenticated `window.open`.

## RBAC

- Owner/admin: view and export audit logs.
- Auditor: view and export audit logs where company policy allows.
- Manager: view and export by default in the current policy.
- Viewer/data entry: blocked by default.

Frontend controls are convenience gates only. Backend middleware enforces permissions and company scoping.

## Immutability, Retention, and Integrity

Audit logs are append-only operational logs for normal application users. The application does not expose edit or delete controls for audit events.

Default retention metadata is `standard_7_years`. Each new audit event can include an `integrityHash` and `previousHash` generated from important event fields to provide tamper-evidence inside the application database. This is not a substitute for external WORM storage or a dedicated compliance archive.

## Limitations

Audit integrity is application-level tamper evidence. Full enterprise evidentiary retention still requires infrastructure controls such as database backups, restricted database administration, immutable storage, log shipping/SIEM, and formal retention/legal hold procedures.

## Smoke Checklist

1. Login as admin.
2. Open Audit Logs page.
3. Apply action filter.
4. Apply entity filter.
5. Apply user filter.
6. Apply date range.
7. Open audit event detail drawer.
8. Confirm old/new values display safely.
9. Export CSV.
10. Export JSON.
11. Confirm export creates audit event.
12. Login as auditor and confirm access if allowed.
13. Login as viewer and confirm access denied if policy blocks it.
14. Confirm another company's logs are not visible.
15. Confirm no localhost API calls in console.
16. Confirm page handles empty logs.
