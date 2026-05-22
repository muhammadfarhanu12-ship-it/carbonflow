# CarbonFlow Marketplace Production Readiness

## Data Model

Marketplace listings are stored as `CarbonProject` records with marketplace lifecycle fields, inventory counters, registry metadata, evidence links, demo/sample flags, and real-inventory flags. Published buyer inventory must be backend-driven; demo/test records must set `isDemo` or `isSample` and are not valid for real offset claims.

Budgets are stored in `MarketplaceBudget`, budget increase requests in `MarketplaceBudgetRequest`, and auto-offset settings in `AutoOffsetRule`. Spend is calculated from persisted marketplace transactions.

## Listing Lifecycle

Supported listing statuses are `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `PAUSED`, `SOLD_OUT`, and `ARCHIVED`. Only `PUBLISHED` listings are checkout-eligible. `SOLD_OUT` listings may be visible for review but checkout is disabled. Archived listings are retained for audit history.

## Checkout Lifecycle

Checkout is server-side validated. The backend verifies authentication, RBAC, company scoping, listing status, inventory, price, budget, linked shipments, demo status, and registry metadata before reserving or completing a transaction. Inventory updates use conditional updates and checkout locks so available credits cannot go negative in normal operation.

## Registry And Evidence Rules

CarbonFlow must not fabricate registry IDs, retirement IDs, blockchain hashes, or certificates. Registry retirement references are stored only when supplied by a real integration or administrator workflow. If registry data is missing, the UI must show `Registry not provided` or a missing metadata warning.

Demo certificates must state: `Demo Certificate — Not valid for real offset claims.`

### Registry Provider Architecture

Registry providers live under `backend/services/registry`.

- `REGISTRY_PROVIDER=disabled`: no registry retirement is submitted. The app preserves an internal transaction record only and must not claim registry retirement.
- `REGISTRY_PROVIDER=manual`: admins can record a verified external registry retirement reference after completing retirement outside CarbonFlow. Manual verification requires a retirement reference plus evidence URL/reference and is fully audited.
- Future providers: `verra`, `gold_standard`, and `custom` must implement the provider interface and return real provider responses only.

Registry transaction fields include `registryProvider`, `registryRetirementStatus`, `registryRetirementId`, `registryRetirementUrl`, `registryRetiredAt`, safe `registryResponseSnapshot`, and `registryError`.

Registry operations:

- `POST /api/marketplace/transactions/:id/submit-retirement`
- `PATCH /api/marketplace/transactions/:id/manual-retirement`
- `GET /api/marketplace/transactions/:id/retirement-status`

## Payment And Settlement

Payment providers live under `backend/services/payment`.

- `PAYMENT_PROVIDER=disabled`: no payment is captured or marked settled automatically. Transactions remain pending payment/manual operations unless an explicit no-payment policy is introduced.
- `PAYMENT_PROVIDER=manual_invoice`: CarbonFlow creates a manual invoice reference and an admin must mark payment as paid after external verification.
- Future provider: `stripe` should implement real invoice/payment/webhook behavior before being used for automated settlement.

Payment transaction fields include `paymentProvider`, `paymentStatus`, `paymentReference`, `invoiceNumber`, `invoiceUrl`, `paidAt`, `settledAt`, and `settlementNotes`.

Payment operations:

- `POST /api/marketplace/transactions/:id/create-invoice`
- `PATCH /api/marketplace/transactions/:id/mark-paid`
- `PATCH /api/marketplace/transactions/:id/mark-failed`
- `PATCH /api/marketplace/transactions/:id/cancel`
- `PATCH /api/marketplace/transactions/:id/refund`
- `GET /api/marketplace/transactions/:id/payment-status`

## Budget Management

Budgets are backend-driven. If no budget exists, real checkout is blocked until an owner/admin configures one. Budget increase requests are persisted even when email delivery is not configured.

Budget approvals support `pending`, `approved`, `rejected`, and `cancelled`. Owners/admins approve or reject. Requesters can cancel their own pending requests. Approval updates the company marketplace budget and all actions are audited.

## Auto-Offset

Auto-offset rules are persisted per company. Auto-offset will not purchase real credits without approval unless explicitly configured. Rule evaluation records eligible shipments/listings and writes audit logs.

## RBAC

Marketplace permissions:

- `marketplace:view`
- `marketplace:manage`
- `marketplace:checkout`
- `marketplace:budget:request`
- `marketplace:budget:manage`
- `marketplace:certificate:view`
- `marketplace:auto_offset:manage`

## Smoke Checklist

1. Login as admin.
2. Create a marketplace listing with registry metadata.
3. Add evidence metadata.
4. Publish listing.
5. Confirm listing appears in marketplace.
6. Select listing.
7. Enter valid quantity.
8. Link shipment.
9. Confirm checkout summary.
10. Complete checkout.
11. Confirm inventory decreases.
12. Confirm budget updates.
13. Confirm transaction appears.
14. Download certificate.
15. Confirm certificate disclaimer and registry data.
16. Test invalid quantity is blocked.
17. Test unpublished listing checkout is blocked.
18. Test viewer cannot manage listings.
19. Test cross-company shipment/certificate access is blocked.
20. Confirm audit logs.

## Production Smoke Script

Run non-mutating production checks:

```bash
node backend/scripts/smoke-marketplace.js
```

Optional environment:

- `SMOKE_FRONTEND_URL`
- `SMOKE_ADMIN_URL`
- `SMOKE_BACKEND_URL`
- `SMOKE_API_BASE`
- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`
- `SMOKE_RUN_MUTATING_TESTS=false`

Mutating smoke tests are intentionally disabled by default and require dedicated test-company setup.

## Required Marketplace Env Vars

- `REGISTRY_PROVIDER=disabled|manual|verra|gold_standard|custom`
- `REGISTRY_API_KEY`
- `REGISTRY_API_SECRET`
- `REGISTRY_BASE_URL`
- `REGISTRY_ACCOUNT_ID`
- `REGISTRY_WEBHOOK_SECRET`
- `PAYMENT_PROVIDER=disabled|manual_invoice|stripe`
- `PAYMENT_API_KEY`
- `PAYMENT_WEBHOOK_SECRET`
- `PAYMENT_CURRENCY_DEFAULT=USD`

## Admin Marketplace Operations

The admin panel includes Marketplace Management with sections for operational cards, listings/inventory, transactions, budget approvals, payment verification, registry retirement verification, and evidence-oriented manual retirement inputs. Admin operations call backend APIs and do not duplicate backend validation.

Manual mode means CarbonFlow stores real backend records, RBAC-protected admin decisions, evidence metadata, and audit logs for work completed outside CarbonFlow. Disabled mode means CarbonFlow does not perform that class of operation and must present the result as an internal record only.

To enable real automated registry retirement or payment settlement, the operator must configure real provider credentials, implement provider-specific API/webhook behavior, validate provider response signatures, handle reconciliation and retries, and pass provider certification where required. Without those credentials and integrations, CarbonFlow cannot honestly claim automated registry retirement or automated payment settlement.

## Transaction Lifecycle

Operational transaction states include `draft`, `pending_budget_approval`, `pending_payment`, `payment_verified`, `pending_registry_retirement`, `retired`, `completed`, `failed`, `cancelled`, and `refunded`.

## Certificate Claim Validity

Certificates carry `certificateType`, `retirementStatus`, and `claimValidity`:

- `demo`: not valid for real offset claims.
- `internal_transaction`: internal transaction record only, no registry retirement completed.
- `manual_registry_verified`: externally retired and manually verified by an authorized admin with evidence. Certificate wording: `Registry retirement manually verified by admin.`
- `registry_retired`: real provider returned a retirement reference.

When no retirement exists, certificate wording must state: `Internal transaction record only — no registry retirement completed.`

## Known Limitations

No live automated registry provider or card/payment provider is configured in this repository. Enterprise production operation is supported through manual registry verification and manual invoice verification when those provider modes are enabled and backed by operational controls. Automated Verra/Gold Standard/Puro/Stripe operation still requires vendor credentials, contracts, webhook hardening, and provider certification.
