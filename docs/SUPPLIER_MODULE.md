# CarbonFlow Supplier Module

## Setup

The Supplier module is available through the authenticated API under `/api/suppliers` and the frontend supplier workspace. Supplier records are scoped by `companyId`; all list, scorecard, questionnaire, and evidence endpoints require an authenticated user.

Production URLs:

- Frontend: `https://carbonflow-nu.vercel.app`
- Backend: `https://carbonflow-h9cj.onrender.com`
- API base: `https://carbonflow-h9cj.onrender.com/api`

## Permissions

Supplier routes use the shared RBAC middleware.

- `owner`, `admin`, `manager`: view, create, edit, archive, recalculate scores, send questionnaires, and manage evidence.
- `viewer`: view supplier data only.
- `auditor`: view supplier data and audit logs only.
- Audit log access uses `audit:view`, available to owner/admin/auditor roles.

Current RBAC is role based. It does not yet support custom per-user policies or field-level permissions.

## Scoring Model

Supplier scoring combines emissions intensity, certifications, transparency, compliance/verification, reporting freshness, category/region risk, data quality, questionnaire state, and evidence state.

Evidence affects scoring:

- Verified ISO 14001 evidence can improve certification scoring.
- Verified SBTi evidence can improve certification scoring.
- Verified GHG inventory can improve compliance and verification confidence.
- Expired evidence reduces data quality and creates follow-up recommendations.
- Missing GHG inventory evidence creates a recommended action.

## Benchmarking

Supplier benchmarking uses company supplier data first. It compares suppliers against category average, region average, company average, and best/worst category performers. A category benchmark requires at least three suppliers with usable intensity data.

When benchmark data is insufficient, the UI and API expose a clear unavailable state instead of inventing external data.

Known limitation: external benchmark datasets are not integrated yet.

## Questionnaire Email Workflow

Questionnaire endpoints:

- `POST /api/suppliers/:id/send-questionnaire`
- `POST /api/suppliers/:id/resend-questionnaire`
- `PATCH /api/suppliers/:id/questionnaire-status`
- `GET /api/suppliers/:id/questionnaire`

Supported email environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `FRONTEND_URL`
- `BACKEND_URL`

If SMTP is not configured, the backend does not crash. It creates the questionnaire metadata and returns: `Questionnaire created but email provider is not configured.`

Public questionnaire endpoints:

- `GET /api/public/questionnaire/:token`
- `POST /api/public/questionnaire/:token/submit`
- `POST /api/public/questionnaire/:token/evidence/upload`

Questionnaire links use a supplier-specific random token. Only the token hash is stored.

## Evidence Tracking

Evidence endpoints:

- `GET /api/suppliers/:id/evidence`
- `POST /api/suppliers/:id/evidence`
- `POST /api/suppliers/:id/evidence/upload`
- `GET /api/suppliers/:id/evidence/:evidenceId/download`
- `PATCH /api/suppliers/:id/evidence/:evidenceId`
- `PATCH /api/suppliers/:id/evidence/:evidenceId/verify`
- `PATCH /api/suppliers/:id/evidence/:evidenceId/reject`

Evidence types include ISO 14001 certificates, SBTi commitments, GHG inventory, ESG reports, audit reports, utility/fuel data, carbon reduction plans, questionnaire answers, and other metadata.

Metadata-only evidence still works. File uploads add file name, size, MIME type, storage key, uploaded user/source, virus scan placeholder, expiry, verification user, and download metadata.

Storage uses an adapter pattern. Local development stores files under the backend upload directory. Production can later swap the adapter for S3, Supabase Storage, Cloudinary, or another provider.

Storage environment variables:

- `STORAGE_PROVIDER`
- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_PUBLIC_URL`

Allowed evidence file extensions are PDF, PNG, JPG/JPEG, DOC/DOCX, XLSX, and CSV. The current max file size is 10 MB and upload endpoints accept one file per request. Virus scanning is a placeholder status only; no scanner is integrated yet.

## Audit Logs

Supplier workflows write audit events with action, entity type, entity ID, company ID, user ID, old/new values where available, IP address, user agent, and creation timestamp.

Supplier actions include:

- `supplier_created`
- `supplier_updated`
- `supplier_archived`
- `supplier_score_recalculated`
- `questionnaire_sent`
- `questionnaire_resent`
- `questionnaire_status_changed`
- `evidence_requested`
- `evidence_submitted`
- `evidence_file_uploaded`
- `evidence_file_downloaded`
- `evidence_verified`
- `evidence_rejected`

## MVP Limitations

- No external supplier benchmark provider is connected.
- Production cloud storage is adapter-ready but not wired to a real cloud provider in this repository.
- Evidence virus scanning is a placeholder status only.
- RBAC is role based, not policy based.
- Evidence expiry is evaluated at read/scoring time; there is no scheduled expiry job yet.
