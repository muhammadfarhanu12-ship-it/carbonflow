# Carbon Ledger Backfill

Use `backend/scripts/backfill-emission-record-snapshots.js` to validate and backfill older emission records that were created before audit-grade calculation snapshot fields existed.

Always back up the production database before running with `--apply`.

## Dry Run

```powershell
cd backend
node scripts/backfill-emission-record-snapshots.js
```

For one tenant:

```powershell
node scripts/backfill-emission-record-snapshots.js --companyId=<company-id>
```

## Apply

```powershell
node scripts/backfill-emission-record-snapshots.js --apply --companyId=<company-id>
```

## Force Mode

Force mode may overwrite existing snapshot fields. Use it only after manual review.

```powershell
node scripts/backfill-emission-record-snapshots.js --apply --force --companyId=<company-id>
```

## Summary Fields

The script prints:
- total records scanned
- records needing backfill
- records backfilled
- records skipped
- records with missing factors
- records with invalid activity amount
- records needing manual review
- records with missing reporting period
- records with missing supplier snapshot

## Manual Review Guidance

Manually review records with missing factors, invalid activity amounts, missing reporting periods, or missing supplier snapshots before using them in approved reports.
