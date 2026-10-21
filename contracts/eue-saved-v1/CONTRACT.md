# Saved evidence review contract v1

Status: source candidate; real-report transfers remain on owner HOLD. No product
route, environment variable, deployed service or existing key enables this code.
Tests use synthetic saved-report objects, isolated signing keys and temporary
stores. No new report, acquisition, credit use, charge or network transfer occurs.

LANDITRUS first applies its existing authenticated owner, exact report ID/hash,
origin and explicit CERTIS/READ_ONLY_REVIEW consent checks. An export object or
hash alone is not a reusable authorization grant. The separate projection uses
only the fields enumerated by contract.json. It excludes address, addressKey,
sourceUri, payloadRef, full report sections, request/session owner provenance and
acquisition messages. Evidence IDs, source identity/category, original times,
payload/schema hashes, schema/adapter versions, limitations, findings, temporal
precision and numeric fact taxonomy remain unchanged. No county or parcel mapping
is guessed from provider names. OWNER_PRIVATE describes the prospective contract;
the checked-in fixture contains synthetic test data only.

Packets use `landitrus-saved-evidence/1`. Signed transport scopes are LANDITRUS →
ENTRUS_CORE_SAVED_EVIDENCE and ENTRUS_CORE → CERTIS_SAVED_EVIDENCE_REVIEW. Purpose
is always READ_ONLY_REVIEW. Separate explicitly provisioned keys are required
before future activation; existing synthetic trust keys are not widened. The
HMAC covers issuer, audience, purpose, nonce, timestamp and canonical body using
the existing EUE signing format. Receivers atomically claim nonces in durable
stores. Timestamp validity is 120 seconds, evidence age is 24 hours, size is
bounded, and duplicate evidence/source IDs and unknown fields fail closed.

The report hash is LANDITRUS's authenticated attestation about its saved report,
not a consumer recomputation of unexported bytes. The packet digest covers the
minimized packet. Referenced raw payloads are not fetched; payload integrity is
explicitly REFERENCED_NOT_FETCHED. A valid signature, hash, source category,
finding, numeric fact or acquisition COMPLETE status does not certify authority.

The existing certified interpretation profile has not qualified saved-report
sources. V1 therefore returns HOLD, claims=[], interpretation_executed=false,
source_qualification=UNREVIEWED and action/financial authority NONE. It records
SAVED_SOURCE_CERTIFICATION_REQUIRED plus applicable missing, unknown-date, stale
or unavailable-source reasons. Fresh packet issuance cannot refresh old evidence.
Conflicting source findings/numeric values are preserved; no winner or inferred
contradiction is fabricated. Certification and real interpretation require a
separately reviewed profile; this contract is not evidence that reasoning ran.

Core signs an `eue-saved-evidence-delivery/1` containing the packet and its review.
CERTIS independently validates the packet, recomputes its digest, derives the
expected HOLD review and compares every field and lineage item. Changed state,
claims, certifications, scores, dates, lineage or authority cannot enter through
an extra field. Its accepted receipt is an unscored INSUFFICIENT_EVIDENCE review,
assessment_complete=false, public_evidence_updated=false and financial authority
NONE. Only private digest metadata is retained for 300 seconds; nonce claims
last 600 seconds. Redis write ambiguity returns an explicit unknown outcome;
callers must reconcile instead of blindly retrying a POST.

The Core boundary and CERTIS consumer default to disabled and are deliberately
absent from application startup/routing. Existing synthetic services, production,
recovery assets and cost controls remain unchanged. Source contract tests do not
establish deployed or real-report staging acceptance. Shared files and golden
fixtures must remain byte-identical across the three repositories.
