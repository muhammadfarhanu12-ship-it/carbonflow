# Optimization Module

CarbonFlow Optimization is an authenticated, company-scoped, rule-based decision-support engine. It uses real backend records and does not create mock, demo, or fake recommendations.

## How It Works

- `GET /api/optimization/context` returns coverage and data quality issues.
- `POST /api/optimization/analyze` runs deterministic analysis against company data.
- `GET /api/optimization/runs` and `GET /api/optimization/runs/:id` return saved run history.
- `PATCH /api/optimization/recommendations/:id/status` updates workflow status.
- `POST /api/optimization/runs/:id/export` and `GET /api/optimization/runs/:id/download/:format` export authenticated PDF or CSV reports.

Analysis mode is `rule_based` unless future AI controls are explicitly enabled and configured. The current implementation does not send company data to external AI.

## Data Sources

- Shipments: route, lane, mode, carrier, distance, weight, cost, emissions, carbon cost.
- Suppliers: category, country, risk, ESG transparency, reported emissions, questionnaire status.
- Carbon ledger records: scope, category, factor source, sample/official factor flags, approval status, activity and emissions amounts.
- Financial ledger entries: logistics cost, internal carbon price, carbon tax, carbon cost, total cost.

## Recommendation Categories

- Route/lane optimization: repeated lanes and consolidation opportunities.
- Mode shift: AIR to OCEAN or ROAD to RAIL only when distance, weight, tonne-km, and emissions support it.
- Carrier performance: emissions per tonne-km and cost per tonne-km compared with alternative carriers observed in the same company data.
- Supplier mix: high-risk suppliers and missing supplier ESG/emissions data.
- Data quality: sample factors, zero records, unapproved records, and missing factors.
- Financial exposure: recorded carbon cost and tax exposure.

Savings are returned as `null` when required data is missing. The UI displays “Insufficient data” or “Not enough data” instead of inventing estimates.

## Export and Reports

Optimization exports include company name, generatedBy, generatedAt, analysis mode, question, filters, data coverage, top recommendations, affected records, assumptions, required data, calculation basis, next actions, data quality warnings, limitations, and the decision-support disclaimer.

CSV exports include one row per recommendation with recommendationId, category, priority, title, estimated savings, cost impact, confidence, effort, timeframe, affected records, status, assumptions, required data, and next actions.

Downloads are authenticated blob/API responses. Do not use unauthenticated `window.open` for Optimization exports.

## RBAC

- `optimization:view`: owner, admin, manager, viewer, auditor, data_entry.
- `optimization:run`: owner, admin, manager.
- `optimization:update`: owner, admin, manager.
- `optimization:export`: owner, admin, manager.

All endpoints require bearer-token authentication and companyId scoping.

## Audit Logs

The backend writes:

- `optimization_analysis_run`
- `optimization_recommendation_status_changed`
- `optimization_recommendation_dismissed`
- `optimization_report_generated`

Audit metadata includes companyId, userId, action, filters/question where applicable, recommendation count, format, and timestamp.

## Privacy and Future AI Controls

AI is disabled by default. Required placeholders:

```text
AI_ENABLED=false
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=
AI_DATA_RETENTION_MODE=none
AI_REDACT_SENSITIVE_DATA=true
```

Allowed retention modes are `none`, `private`, and `log_metadata_only`. Future AI-assisted mode must redact unnecessary sensitive data, log metadata only, never log secrets or raw bearer tokens, never calculate emissions independently unless formulas and data are supplied, and must fall back to rule-based recommendations on provider failure.

## Production Smoke Test

Non-mutating checks:

```bash
cd backend
node scripts/smoke-optimization.js
```

Authenticated mutating checks:

```bash
cd backend
$env:SMOKE_TEST_EMAIL="admin@example.com"
$env:SMOKE_TEST_PASSWORD="replace"
$env:SMOKE_RUN_MUTATING_TESTS="true"
node scripts/smoke-optimization.js
```

Optional URL overrides:

```text
SMOKE_FRONTEND_URL=https://carbonflow-nu.vercel.app
SMOKE_BACKEND_URL=https://carbonflow-h9cj.onrender.com
SMOKE_API_BASE=https://carbonflow-h9cj.onrender.com/api
```

Mutating smoke tests may create optimization runs, status changes, and export audit logs. Do not enable them against production unless a dedicated smoke-test account and dataset are approved.

## Production Checklist

1. Login as admin.
2. Add shipments with distance, weight, mode, carrier, cost, and calculated emissions.
3. Add supplier data with category, country, risk, and emissions/ESG fields.
4. Add or calculate carbon ledger records.
5. Run a route optimization query.
6. Run a carrier benchmark query.
7. Run a supplier mix query.
8. Confirm recommendations cite real affected shipments, suppliers, or ledger records.
9. Confirm no recommendations appear when data is insufficient except honest data-quality recommendations.
10. Mark a recommendation as planned.
11. Export PDF and CSV.
12. Check audit logs for analysis, status update, and export.
13. Test that a viewer can view but cannot run or export.
14. Confirm no localhost calls in the browser console when `VITE_API_URL` points to production.

## Known Limitations

- Optimization recommendations are decision support, not automatic operational changes.
- Mode-shift estimates are conservative assumptions and require lead-time/service validation.
- Supplier recommendations do not claim savings until primary supplier data or approved factors exist.
- Future AI assistance is code-ready but intentionally disabled by default.
