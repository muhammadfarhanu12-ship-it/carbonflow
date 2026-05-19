# CarbonFlow Enterprise MVP

CarbonFlow is a multi-tenant carbon accounting MVP for Scope 1, Scope 2, and Scope 3 emissions, logistics carbon ledgers, supplier risk, offsets, dashboards, and enterprise report generation.

## Local Setup

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend expects `VITE_API_URL` to include the `/api` prefix, for example `http://localhost:5000/api` locally or `https://carbonflow-h9cj.onrender.com/api` in production. `VITE_API_BASE_URL` remains supported for older local setups.

## Environment Variables

Backend values are documented in `backend/.env.example`. Frontend values are documented in `frontend/.env.example`.

## Carbon Calculations

Core calculation formula:

```text
emissions = activity_data x emission_factor
```

Results are stored as both `emissionsKgCo2e` and `emissionsTCo2e` on `EmissionRecord`.

Supported MVP coverage:

- Scope 1: stationary combustion, mobile combustion, company fleet distance, fugitive refrigerants, and process-emission-ready activity records.
- Scope 2: purchased electricity with location/market-based operational baseline support, plus purchased heat/cooling/steam-ready activity records.
- Scope 3: shipments, suppliers, business travel, employee commuting, purchased goods/services, waste, upstream/downstream transportation, and fuel-and-energy-related activities.

## Emission Factors

Emission factor records support `name`, `scope`, `category`, `activityType`, `activityUnit`, `factorValue`, `factorUnit`, `sourceName`, `sourceYear`, `country`, `region`, `version`, `effectiveFrom`, `effectiveTo`, `isSample`, `isActive`, `createdBy`, and `updatedBy`. This structure is ready for official DEFRA, EPA, IPCC, GHG Protocol, grid, supplier-specific, or custom company factor imports.

If no database factor is configured, the backend falls back to clearly marked CarbonFlow sample factors for MVP calculations. Replace sample factors with official DEFRA, EPA, IPCC, GHG Protocol, grid, supplier-specific, or assured internal factors before formal reporting or assurance.

Warning: This MVP uses sample emission factors. Replace with official factors before production use. CarbonFlow sample factors must not be presented as official DEFRA/EPA/IPCC/GHG Protocol data.

## Report Generation

Reports are generated from live backend data through `POST /api/reports/generate` and downloaded through `GET /api/reports/download/:fileName`.

Reports include executive summary, Scope 1/2/3 totals, scope split, category breakdown, monthly trends, recent shipments/suppliers/offsets, methodology, emission factor notes, data-quality notes, and reduction recommendations.

## Enterprise Readiness

- Protected APIs use bearer-token authentication.
- Customer data is scoped by `companyId`/organization context on customer routes.
- Admin APIs have a separate admin authentication flow.
- Audit logs are written for report generation, settings changes, emission activity creation, and major admin actions.
- CSV/Excel import is available for shipments, and CSV import is available for Scope 1/2/3 emission activity records with preview, row validation, factor matching, and valid-row-only commit.
- Report downloads are authenticated API responses; the frontend downloads them with the existing bearer-token session.
- Activity validation rejects invalid scopes, missing categories, missing activity type/unit, negative activity values, and missing emission factors unless an explicit factor value is supplied.
- MVP RBAC permissions cover record creation/editing/approval, factor management, report generation/viewing, and audit log viewing for owner/admin/manager/data_entry/viewer/auditor roles.
- Emission records include a data-quality workflow: draft, submitted, reviewed, approved, rejected, and needs_correction.
- CSV activity import supports preview/validation and only saves valid Scope 1/2/3 rows.

## Known MVP Limits

- Sample factors are provided only as transparent placeholders.
- Facility and business-unit analytics depend on activity records containing those fields.
- Enterprise SSO and advanced role policy enforcement are prepared through organization/company scoping but are not a full SSO implementation.
- This is safe for demos and pilot evaluation, but not ready for formal enterprise production assurance until official factor libraries, SSO, stricter RBAC policy matrices, data retention controls, and assurance workflows are added.
