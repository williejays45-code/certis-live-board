# CERTIS billing and credit ledger | test-mode foundation v0.1
Date: 2026-11-05. Scope: isolated feature branch based on public GitHub main fa3fc22d9a700833630f1e43174a8e079365c860.
Commercial status: HOLD. Public runtime, customer entitlements and payment services unchanged.

## Ownership and architecture
- PostgreSQL (dedicated CERTIS billing database) is the only future billing source of truth for member state, price/tier mapping, Stripe event receipts, invoice credit grants, report reservations, consumption, release, reversal, disputes and immutable audit rows.
- Redis remains only authentication/session, queue and rate-limit/cache support. The billing module does not read/write Redis.
- Stripe is the external payment processor and invoice truth. Customer account binding originates from authenticated CERTIS account identity, never public metadata, query parameters or a webhook-supplied user ID.
- CERTIS financial ingestion, source qualification, evidence scoring and action authority are separate systems. Billing cannot override financial source admission or the NO-TRADING/NO-TRANSFER controls.

## Fixed business choices, NOT live billing
- CERTIS $149/month, Gold $249/month, Platinum $449/month, USD.
- The migration seeds price amounts, but plan.stripe_test_price_id, credits_per_cycle are NULL and enabled=false. No unapproved report allowances are invented.
- Individual report purchase pricing, credit expiry/rollover and tier proration/cancellation economics remain explicit policy decisions. Never infer them from another product.
- LANDITRUS memberships, prices, customer data and payment configuration are untouched.

## Implemented
billing/migrations/001_certis_billing.sql:
- accounts with hashed principal reference and independently bound Stripe customer ID;
- three plan rows, disabled until operator approval;
- memberships and Stripe event receipts;
- credit grants (source invoice), per-report reservations, allocations and append-only credit ledger;
- owner/account-locked SQL functions to grant, reserve across lots, consume after a reported verified artifact hash, release on failure or revoke unused credits when an invoice is refunded/disputed;
- financial hold if any already-consumed disputed credits require review; no auto-clear;
- immutable Stripe event/adjustment/credit ledger rows and a wallet balance view.

backend/billing-stripe-test.mjs:
- raw-body HMAC-SHA256 Stripe-Signature verification, bounded timestamp/size, safe parsing and strict livemode=false;
- durable PostgreSQL event journal with event-id uniqueness and payload fingerprint conflict checks;
- all actionable subscription/payment/refund/dispute events HOLD for independent customer/price/invoice mapping. Unknown types ignored. NO automatic membership change or credit grant.
- No public webhook route, key configuration, Stripe API call or production activation.

backend/billing-ledger.mjs:
- explicit mode=test and enabled=true dependency-injected PostgreSQL client;
- parameterized SQL calls for wallet read, reservation, consumption, release and separately approved source reversal.
- Does not expose granting to the customer API; the SQL function is reserved for a future independently reconciled invoice worker.

backend/billing-foundation.test.mjs:
- synthetic test-mode Stripe signature/invalid signature/replay/idempotency;
- scope and no-credit grant properties;
- SQL schema invariants, parameterized calls and prevention of accidental live setup.
- NO live Stripe, payments, provider calls, report credits, external database or user credentials used.

## Important limitations (must not be confused with release readiness)
1. The new functions are source-only. No dedicated PostgreSQL instance has been provisioned, migration applied or database backup/restore tested. Current Render inventory showed a session Redis instance, no Postgres.
2. Schema and credit-state transitions have NOT yet passed real PostgreSQL integration/concurrency tests. Unit/static checks are not an ACID database test.
3. Stripe test-only event receipts currently classify subscription, invoices and refunds as HELD. A new idempotent reconciliation worker must authenticate Stripe object state (including invoice payment and price/line IDs), bind a pre-provisioned customer and tier, guard out-of-order events, and call grant_credits only when plan quantities are approved.
4. Webhook redelivery after receipt is deliberately deduplicated. HELD events require a durable manual/worker replay procedure; do not incorrectly treat a held receipt as fulfilled.
5. Billing amount is separate from credit quantity. No plan quantities are approved, so none are granted.
6. The report completion adapter receives a verified hash supplied by a trusted caller; it is not independently proof that the report bytes were persisted. Implement a durable report artifact receipt and idempotent finalization cross-check.
7. Event journal stores only hashes, reason codes and identity. A safe reconciliation locator/inbox is needed so held events can be resolved after 30-day Stripe event retrieval limits; do not store raw payment credentials.
8. DB functions are SECURITY INVOKER in this migration. Provision a dedicated least-privileged test billing service role and separately grant only needed routines with controlled table privileges; do not hand unrestricted public SQL access to any browser or generic service principal.
9. Refund/dispute outcomes and member cancellation have policy decisions outstanding. Reversal safeguards suspend spending where previously consumed credits need independent adjudication; they do not refund money through Stripe.

## Next Codex execution against THIS repository
1. Checkout the exact feature branch and preserve main/current Render release separation and BTC 2026-10-16 historical acceptance. Read AGENTS.md, maintenance/PREVENTION.md and accepted-scopes before modifications.
2. Run Node 24 app + policy suites; start a local isolated PostgreSQL 15+ instance (not the production store), run migration in a single transaction, and test concurrent reserve/consume/release/reversal under process crashes and duplicate requests.
3. Validate existing immutable history, source keys, customer isolation and cross-grant allocations. Add failure cases for insufficient credits, reversals after consumption, held disputes, stale price/tier updates, webhook order, duplicate invoice IDs and migration rollback.
4. Build a TEST-MODE-ONLY Stripe reconciliation worker that reads held event IDs from PostgreSQL, independently fetches Stripe test invoice/subscription/line state with a securely provided sk_test_ key, enforces configured price IDs and approved grant amounts, preserves event lineage, and atomically grants once. No test charges are required to test synthetic webhook fixtures.
5. Add test-only authenticated customer binding, test mode Checkout portal flow, clear subscription terms and explicit refund/cancellation/credit policy; keep fees and any live purchase gated.
6. Add data retention, recovery/restore, separate DB service account grants, least-privilege, non-leaking diagnostics, and rigorous staging acceptance.
7. Do not merge/promote until protected CI and source-to-deploy gates pass. Preserve LANDITRUS pricing. No financial execution.

## Acceptance checklist
[ ] Verified local PostgreSQL migration and downgrade policy (without destructive deletion)
[ ] Parallel atomic reservation and exactly-once consumption
[ ] Durable recovery/restore and report issuance reconciliation
[ ] Stripe signed test webhooks, replay, out-of-order, partial refunds and disputes
[ ] Approved exact tier prices, credit quantities and handling of tier changes
[ ] Account ownership, isolation, authenticated server-to-provider mapping
[ ] Payment/customer service disclosure and consent
[ ] Protected review/CI, staging receipt and rollback
[ ] Production authority for launch (separate, NOT implied)

No live charges, credits, cloud resources, SQL migrations or Stripe setup were executed by this source change.
