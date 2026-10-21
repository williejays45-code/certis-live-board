# Qualified synthetic interpretation delivery v2

This is a separately governed EUE → CERTIS compatibility boundary. The accepted
`eue-saved-v1` contract and HOLD-only consumer remain byte-for-byte unchanged.
This version admits only the reviewed Dallas synthetic parcel-existence profile.
It does not admit real reports, authorize a county source, infer consent from a
test permit, or introduce valuation, scores, financial actions or report creation.

The producer can construct only the literal reviewed test fixture. Its new
in-memory observations are explicitly synthetic; the accepted historical fixture
is not overwritten or refreshed. There is no caller-provided report or raw-payload
argument. The accepted offline EIA → certified RIL → UnderstandingEngine profile
runs unchanged. Its original result schema and `SYNTHETIC_OFFLINE_ONLY` designation
remain inside the new delivery, alongside `accepted_v1_delivery_compatible=false`.

A different permit governs staging transport: version 2, mode
`SYNTHETIC_LOOPBACK_STAGING`, reviewed profile/baseline pins, unique activation ID,
at most 900 seconds, real transfers HOLD, and external network, billing and report
generation disabled. It is local operator configuration, not source authority or
owner authorization. Both producer and consumer default disabled. CERTIS loads a
private permit and dedicated 48-byte key independently; a permit inside a request
cannot activate admission. The actual staging bootstrap is a separate CLI file,
absent from production application imports, environment and routes.

The delivery is a closed schema, bounded to 16 KiB and 120 seconds. CERTIS checks
the fixture, classification, activation window/identity, baseline/profile/registry/
rule/policy pins, one INFERRED IDENTITY / parcel_id.exists / true claim, original
observations, exact synthetic source identity, raw-payload digest, limitations and
evidence references. It trusts the independently authenticated EUE attestation for
the computed semantic and packet digests; it does not independently rerun the EUE
reasoner. The producer checks its packet digest against the actual admitted input.
No raw payload, owner authorization object, report contents, numeric facts or
findings are delivered to CERTIS.

HMAC-SHA256 binds the canonical request, contract domain, dedicated v2 issuer and
audience, READ_ONLY_REVIEW purpose, nonce and timestamp. V1 envelopes and delivery
schemas fail this boundary. A separate Redis namespace binds activation and nonce;
NX writes expire after 600 seconds. Private review records contain the interpretation
digest, packet digest, single claim, lineage and explicit authority limitations.
They cannot populate public financial evidence. The 202 response retains
INSUFFICIENT_EVIDENCE, assessment_complete=false, evidence_strength=null,
score_model=null, public_evidence_updated=false and action/financial authority NONE.
REVIEWABLE describes the synthetic interpretation alone, not investment readiness.

Nonce and review writes are separate operations, not an atomic cross-store promise.
Store exceptions return explicit outcome-unverified errors; there is no automatic
POST retry. One controlled activation writes one positive review, tests that exact
envelope's replay denial, verifies the actual Redis digest and stops its new
processes. It reuses installed offline runtimes on the existing VM with separate
state/socket/key. It neither restarts accepted units nor enables boot services.
Source, receipts, nonce journal and all existing recovery assets are retained.
The October 26 VM stop deadline and e2-small/private-IAP configuration are preserved.

New compatibility checks only:

```bash
python -B -m tools.entrus_integration.verify_interpretation_v2 --certis-root ../certis
```

The runner calls only the eight new producer/activation tests and nineteen new
CERTIS boundary tests, passing the actual Python-produced delivery and signature
into the JavaScript consumer suite. Existing qualification and accepted integration
suites are reused from their accepted receipts. Hosted maintenance remains enabled.
An engineering test fixture is not a generated customer report. No provider,
payment, report-generation, entitlement or credit-redemption route is called.
