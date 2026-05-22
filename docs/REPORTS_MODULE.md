# CarbonFlow Reports Module

## Purpose

The Reports module generates authenticated sustainability reports from live, company-scoped backend data. It is designed for controlled internal reporting and audit review. It does not provide external assurance and must not claim GHG Protocol, ISO, or CSRD compliance unless the required boundaries, methodology, data quality review, and limitations have been independently completed.

## Report Types

- `esg_pdf`: ESG/carbon summary PDF.
- `scope_export_csv`: Scope 1/2/3 emission record CSV export.
- `custom_extract`: Selected data extract for internal analysis.
- `carbon_ledger`: Carbon ledger report.
- `supplier_esg`: Supplier ESG report.
- `shipment_emissions`: Shipment emissions report.
- `marketplace_retirement`: Marketplace retirement report when marketplace transaction data exists.

## Inclusion Policies

- `approved_only`: Default. Includes approved emission records only.
- `all_records_with_warning`: Internal-use mode. Includes draft/submitted/unapproved records and prints a warning in the report metadata, UI, PDF, and CSV.

## Readiness Check

`POST /api/reports/readiness` calculates report readiness before generation:

- approved, draft, submitted, rejected, and needs-correction records
- missing factor count
- sample factor count
- stale factor count where supported
- zero amount count
- calculation error count
- supplier-linked and unlinked counts
- official and custom factor counts
- blockers, warnings, and recommendations

Approved-record reports require enough approved data. Internal all-record reports are allowed with warnings.

## PDF Structure

PDF reports include:

- cover page
- company name
- report name/type
- reporting period
- generated timestamp
- inclusion policy
- internal/unaudited notice
- executive summary
- Scope 1/2/3 totals
- category and monthly breakdowns
- supplier and shipment breakdowns where available
- marketplace retirements where available
- data quality and record status summary
- methodology, factor source notes, limitations, report ID, and version

## CSV Structure

Scope 1/2/3 CSV exports include stable headers:

- `recordId`
- `scope`
- `category`
- `activityType`
- `activityAmount`
- `activityUnit`
- `factorKey`
- `factorValueUsed`
- `factorUnitUsed`
- `factorSourceName`
- `factorSourceYear`
- `factorVersion`
- `factorIsSample`
- `factorIsOfficial`
- `formula`
- `kgCO2e`
- `tCO2e`
- `reportingPeriodStart`
- `reportingPeriodEnd`
- `activityDate`
- `facility`
- `businessUnit`
- `supplier`
- `shipment`
- `status`
- `calculationStatus`
- `createdAt`
- `approvedAt`

CSV cells that begin with `=`, `+`, `-`, or `@` are prefixed to reduce spreadsheet formula injection risk.

## RBAC

- `report:view`: list and view report metadata.
- `report:generate`: generate reports.
- `report:download`: authenticated PDF/CSV downloads.
- `report:archive`: archive reports.
- `report:regenerate`: regenerate from report metadata.
- `report:custom_extract`: custom extract workflows.

The backend enforces authentication, RBAC, and company scoping.

## Audit Logs

The module writes audit logs for:

- `report_readiness_checked`
- `report_generation_started`
- `report_generation_completed`
- `report_generation_failed`
- `report_downloaded`
- `report_regenerated`
- `report_archived`
- `report_custom_export_generated`

## Limitations

Reports are generated from available CarbonFlow records and factor snapshots. Stored file persistence or external assurance workflows are not configured in this repository. Reports should be treated as internal/unaudited unless a formal assurance process is implemented.

## Production Smoke Checklist

1. Login as admin.
2. Create and approve carbon ledger records.
3. Open Reports page.
4. Check readiness panel.
5. Generate ESG PDF report.
6. Download PDF.
7. Generate Scope 1-2-3 CSV export.
8. Download CSV.
9. Generate custom extract.
10. Check Recent Reports table.
11. Open report details.
12. Check audit logs.
13. Test auditor can view/download if allowed.
14. Test viewer restrictions.
15. Confirm no localhost API calls in console.
16. Confirm no unauthenticated download.
