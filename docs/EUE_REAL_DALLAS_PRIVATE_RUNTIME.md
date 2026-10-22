# CERTIS real Dallas receiver on the existing private host

Status: SOURCE-ONLY CANDIDATE, DEFAULT DISABLED, NOT DEPLOYED. This is not a new
public CERTIS endpoint and not a second cloud service. This entrypoint uses the
already established private EUE VM only after a separate protected release decision.

## Source and runtime boundary

- Approved receiver: backend/eue-real-dallas-review.mjs (merged in CERTIS PR #32).
- New isolated entrypoint: backend/eue-real-dallas-private.mjs.
- Public backend/server.mjs and backend/application.mjs remain unchanged.
- Old synthetic /internal/eue/interpretations receiver remains separate.
- New route: POST /private/eue/real-dallas/review on 127.0.0.1:8877 ONLY.
- GET /healthz indicates ONLY that the loopback listener is ready; it does NOT
  certify official source observation, an authorized report, cross-system
  connectivity or completed production readiness.
- No public ingress, internet binding, secrets in logs, payment or score authority.
- No new VM, cloud project, service account, Redis instance, DNS or firewall rule.

## Activation requirements (none are currently established)

Entry is disabled without ALL of these previously authorized bindings:

- CERTIS_REAL_DALLAS_ENABLED=true
- CERTIS_REAL_DALLAS_ENVIRONMENT=EXISTING_PRIVATE_VM
- CERTIS_REAL_DALLAS_ACTIVATION_FILE: process-owned 0600 regular file with
  independently signed exact one-report CERTIS activation.
- CERTIS_REAL_DALLAS_DELIVERY_KEY_FILE: dedicated, process-owned 0600 Core-to-CERTIS
  delivery key, exactly 48 bytes.
- CERTIS_REAL_DALLAS_RELEASE_KEY_FILE: distinct process-owned 0600 release
  approval verification key, exactly 48 bytes.
- CERTIS_REAL_DALLAS_REDIS_SOCKET: existing owner-private Unix Redis socket
  backed by the already governed durable replay and receipt state.

The entrypoint checks independent activation validity BEFORE opening Redis or
listening. It rejects configured public authentication, finance/public export,
synthetic receiver mode, public bind controls, unprotected files, shared key
paths and a reused signing key. It does not generate, install or rotate keys.

The activation is report-hash and source-approval-hash specific, at most
15 minutes and restricted to one read-only review. The process automatically
closes its loopback listener when the signed activation expires. The receiver
records bounded hashes and parcel-existence only, never raw owner, address or
property data, and rejects replay using the existing Redis store.

## Release dependencies still on HOLD

1. Preserve Core PR #22 and #23 draft acceptance: the 2027 DCAD archive lacks
   a source-authoritative observation time bound to its exact source snapshot.
   Never promote website update dates, ZIP entry timestamps, or acquisition
   timestamps to observedAt by assumption.
2. Reconcile exact source tree, build, installed release identity on existing
   entrus-eue-test-01 using existing authenticated VM controls. Do not overwrite
   the accepted nonproduction listener, synthetic keys, ledger or Redis store,
   or restart it merely to introduce this code.
3. Independently review one-report release approval, durable Redis persistence,
   private routing, source issuer-v2 trust bindings, recovery and rollback
   receipts, VM cost ceiling and explicit owner consent before any real transfer.
4. Preserve scheduled VM STOP Oct 26 2026 at 4:53 pm Central. No additional
   billing authorization, VM, service, key, customer report or charge is
   implied by this candidate.
5. Do not install/start the process as production listener from CI, this PR,
   or Render. Protected private deployment with exact hash verification
   is separate acceptance evidence.

## Focused tests

Run: node --test backend/eue-real-dallas-review.test.mjs backend/eue-real-dallas-private.test.mjs

Tests verify disabled-by-default, private-only loopback binding, protected
existing Unix socket, segregated keys, independently signed activation,
private route restrictions, denial of unsigned traffic and file ownership.
Passing them does not re-certify historical synthetic acceptance.

## Rollback

No runtime installed by this change, so rollback is source-only at this stage.
For a separately authorized protected release, retain prior private releases
and state. Disable only the new real-Dallas listener, preserve nonce/receipt
history and confirm accepted nonproduction runtime remains unchanged.
Never truncate or delete historical consent or audit records.
