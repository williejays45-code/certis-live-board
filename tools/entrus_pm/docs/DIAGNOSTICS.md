# Safe triage without repeating failed actions

| Category | Next evidence/action |
| --- | --- |
| INPUT_ACCESS_UNAVAILABLE | Verify actual host, path and read permission. Do not infer deletion or runtime absence. |
| POLICY_PIN_MISMATCH | Compare approved release manifest; do not recalculate and accept a changed policy automatically. |
| TARGET_IDENTITY_MISMATCH | Reconcile exact origin, repository, service and branch before any mutation. |
| DEPLOYMENT_MAPPING_UNVERIFIED | Read current hosting/control-plane records; preserve historical receipt separately. |
| MISSING_*_EVIDENCE | Produce only the missing scoped evidence. Existing unrelated passes stay accepted. |
| STALE_OR_FUTURE_*_EVIDENCE | Reconcile time/clock/source freshness. Do not reset failed observations to fresh. |
| RECEIPT_HASH_MISMATCH | Preserve both copies; inspect provenance. Do not overwrite the expected hash. |
| MATERIAL_SPEC_DIFFERENCE | Compare exact field names privately. Never dump secret/env values. |
| SIDECAR_REQUIRES_EXPLICIT_REVIEW | Use dependency-aware configuration review; single-container normalization does not apply. |
| POSSIBLE_SECRET_LITERAL | Locate matching file using the path hash locally; do not print the match. Review exposure and authorize scoped rotation only if justified. |
| OUTBOUND_SCHEMA_REJECTED | Identify the rejected channel structurally; do not loosen the allowlist to export private content. |
| UNKNOWN_OR_MISSING_ALIAS | Correct producer/consumer identifier mapping using issued references. Never invent a citation. |
| FLEET_INVENTORY_INCOMPLETE | Complete live service ownership/mapping; never mark uninspected systems protected. |
| ENFORCEMENT_UNPROVEN | Verify installed protected gate and pin. A merged workflow is not proof of deployment enforcement. |
| CHAIN_* | Preserve ledger/head/lock, inspect interrupted writer or tampering; no automatic reset. |

UNKNOWN is a non-success outcome. It requires reconciliation rather than automatic
retry. This engine does not execute these suggestions or grant permission to do so.

Build-development note: the first local unit run encountered denied writes in the
Windows sandbox temporary directory before any test body. Tests now explicitly use
an isolated `.test-tmp` under the package workspace. This was a test harness context
failure, not a product failure; the subsequent tests exercised their bodies normally.
