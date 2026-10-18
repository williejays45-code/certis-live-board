# Preventive maintenance in development and CI

This is a public-safe engineering policy derived from the combined preventive-maintenance work. It contains no private audit, founder file path, credential or customer record. Control IDs P01–P19 below are the consolidated policy namespace; separate audit playbooks may use different numbering.

## Executable checks and limits

`npm run maintenance:install-hook` installs this checkout's staged pre-commit guard. Existing configured hooks or an existing default hook are preserved and cause installation to stop. New clones must install explicitly. Git hooks can be bypassed; the PR workflow repeats the guard independently.

`npm run maintenance:check -- --staged` validates staged changes. CI uses `npm run maintenance:check -- --base BASE_COMMIT_SHA` with the actual PR base or push-before SHA. Missing/invalid scope fails. It checks all 19 control mappings and referenced test paths, changed-text recognizable credential classes, private env files/generated residue, and preservation of historical acceptance records. It emits reason codes and paths, never matched secret values. It is not a complete secret detector, binary archive scanner, arbitrary network sandbox or deployment comparator.

`npm run maintenance:test` exercises positive and negative behavior, including actual nonzero CLI exits and hook-conflict preservation. `npm run maintenance:contracts` runs selected existing application tests listed in maintenance/policy.json, using local mock/fixture implementations. Install the application lockfiles first. Existing application CI remains intact and continues its full checks; the new policy job does not replace them.

The controls matrix explicitly separates regression-plus-guidance from guidance-only. A linked test covers only its asserted behavior, not the whole control family. Windows credential ACL/DPAPI, protected-engine internals, cloud IAM rollback, real mobile/browser rendering and production billing/acceptance are not certified by this job.

## Accepted work and corrections

maintenance/accepted-scopes.json preserves dated reported acceptance without inventing missing release metadata. Do not overwrite or delete an older row. Append a correction or superseding row, referencing the prior ID, a reason and the new evidence. Historic acceptance is not current liveness and never proves a broader feature passed. This does not authorize another payment, sign-in, model call, rotation or deployment.

## Merge enforcement

The workflow runs on pull requests and default-branch pushes, without path filters, with read-only contents permission and no deployment/secret bindings. Mandatory merge blocking additionally requires repository branch protection/rulesets. That administrative setting is separate from committing workflow files. Until it is verified, do not claim that direct pushes or admin merges are blocked.

Required contexts should include `maintenance-policy` and the existing application jobs. The checked-in maintenance/required-checks.json describes the intended additive branch-protection configuration; applying it is not performed by test code. Reconcile current settings before any future application, preserving existing protections and source/traffic separation.

## Maintenance measures

For each release, record avoidable owner repeats, missing safe diagnostic reasons, unsupported completion claims and cosmetic comparison false positives. Target zero; baseline rates are unknown. Record actual repairs, deployments, spend and credits separately. Do not manufacture a result or weaken evidence to meet a target.

## Controls

### P01 — State claims must match evidence

Every update identifies product, feature, environment, release identity, observation time and evidence level. Use proposed/implemented/tested/deployed/production-accepted distinctly. A missing tool proves no remote absence. A historical defect does not prove current regression.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P02 — One source-to-production lineage

Record canonical repo/commit, tree or package hash, built artifact digest, deployed revision and routing/traffic separately. Reconcile a delta onto the current launch line; retain rollback. Do not replace verified county bootstrap from old branches. Give divergent implementations unique release identities; label reconstructions explicitly. Compare only documented representational differences; do not disable safety-critical assertions to force promotion, and do not run assertion-based guards with optimization enabled.

CI coverage: regression_and_guidance; suites: maintenance-guard. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P03 — Preserve acceptance and execute the next authorized step

Read acceptance ledger before tests or owner requests. Preserve exact feature/environment/version scope. Recheck only changed dependencies, an actual observed failure, or time-sensitive state; an access outage does not erase historical acceptance. Continue independent authorized work.

CI coverage: regression_and_guidance; suites: maintenance-guard. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P04 — Preflight the actual execution context

Validate interpreter path/version/architecture, Windows user/SID and DPAPI ownership (presence/match only), working directory, localhost listener and process identity, scheduler launch mode and proxy settings. Supply explicit tested launcher path. Do not infer app identity from dependency executables. Use explicit UTF-8 in subprocess pipes/files and representative Unicode fixtures. Restricted process visibility is UNVERIFIED, not process absence. Use rg -g file globs and literal path operations rather than fragile Windows backslash regexes.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P05 — Actionable diagnostics without secrets

Emit stage, stable reason code, failing control, correlation ID, retryability and mutation outcome; allowlist safe fields. Separate transport, authentication, entitlement, evidence, governance, worker readiness and deployment errors. No raw env or credential dumps. Retain allowlisted UTC time, stage/category, correlation, HTTP status, retryability and mutation outcome before transient records expire. Classify OAuth explanatory errors safely; never log raw codes, tokens, credentials or entire provider responses.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P06 — Real contracts at every boundary

Use versioned request/response schemas and representative provider payloads. Preserve denied/unknown authority states. Derive evidence support server-side from admitted subject/network/hash/source; never keyword or model confidence. Cover membership-without-property and non-promo auth-token flows. Validate nested evidence identity, required/admitted source mappings, conflict references and issued aliases against the same contract. Empty/unknown citation sets must not silently become a passing answer. Test frontend and backend plan-only membership contracts separately.

CI coverage: regression_and_guidance; suites: auth-contracts, evidence-and-privacy. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P07 — Privacy boundary and isolation

Use owner-scoped stores and tab/session handoff; no sensitive query strings. Test alias collisions, unknown aliases and numeric redaction. Provide explicit local-history clear without deleting authoritative reports. Private context denied to providers until specifically authorized. Enumerate subject, question, history, nested strings, object keys, identifier lists and numeric paths in a closed export schema. Default-deny private context before sanitization; no actual export is inferred merely from a discovered bypass.

CI coverage: regression_and_guidance; suites: evidence-and-privacy. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P08 — Consent, durable state and honest transaction semantics

Separate property search from explicit report creation; bind single-use authorization to the intended action. Use durable idempotency and recovery journals; do not claim cross-database atomicity. Preserve operational state and backups; no blanket cleanup.

CI coverage: regression_and_guidance; suites: request-lifecycle. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P09 — Credential lifecycle without unnecessary recreation

Use dedicated project/secret references; encrypted storage plus exact file/directory permissions; deny unintended explicit grants; no-overwrite via exclusive create/atomic non-replacing publication, not check-then-write alone. Test separate-process same-owner access and deny wrong-context access. Prepare and test the masked destination, actual owner, ACL, encryption, exclusive creation and separate-process consumer before a one-time-view key is created. Track created, securely saved and consumer-bound states separately per app. Do not reveal secret panels. Add platform/reparse-point checks and finally cleanup. Existing accepted keys are reused; reported exposure is documented without retrieving the secret or automatically rotating it.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P10 — Scope protection to the intended surface

Public site, founder/admin and runtime export are separate boundaries. Protect mutable APIs and private destinations. Admit public-only outbound targets and validate redirects/resolution at transport. Do not put a founder-only wall across a public product. Keep cloud console login, Google OAuth, app session, public entitlement, founder authority and service health separate. Test public verified users and founder role independently. A local file preview cannot establish hosted OAuth acceptance.

CI coverage: regression_and_guidance; suites: auth-contracts. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P11 — Privilege windows and recovery defined before mutation

Use least privilege for actual plan/resource graph. Begin timed grants only when the authorized action is ready. Freeze exact tuple identity, grant order, reverse recovery, live-policy reconciliation on ambiguity, and removal verification. Expiry and physical removal are different facts.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P12 — Concrete cross-session handoff

Verify exact page/service and candidate file before work; provide accessible artifact and checksum. Use no-overwrite initial publication and explicit allowed replacement. Local Windows path does not make a file accessible in a cloud chat. Verify the exact target-host path, file hash, interpreter, working directory and public origin before handoff. A script on Windows is not available in Cloud Shell merely because a path is supplied. Provide an accessible tested artifact before asking the owner to execute.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P13 — Acceptance proves the named customer behavior

Unit/contract tests, preview rendering, deployed artifact identity and end-to-end customer flow prove different things. Follow one request correlation ID through scheduled/received/engine/governed/displayed/expired stages. Preserve model-provider and customer-activation distinctions. Review actual signed-in answer content at mobile width, contrast/focus and return navigation. Present plain-language facts, dates, uncertainty, source labels and whether a new research action incurs cost; saved answers and new research are separate modes.

CI coverage: regression_and_guidance; suites: customer-state. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P14 — Release verification is isolated and representative

Import the full application surface, compile, run relevant contract/regression checks and assert zero operational residue using temporary stores. Baseline failures remain labeled; no blind repetition of a previously passed unchanged suite. Use sanitized actual API readback shapes, including container names, against positive and material-drift negative fixtures. Verify exact nested/empty provider contracts and Unicode through the delivered wrapper; mocks and syntax checks do not establish live equivalence.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P15 — Metrics mean what their labels say

Document metric definition, source semantics, independence assumptions and outcome-vs-evidence distinction. Do not infer publisher independence from IDs, immutability from a flag, or outcome probability from a support score.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P16 — Evidence freshness and acquisition are explicit

Keep source publication/as-of, observation, retrieval and validation separate. Failed HTTP fetch cannot refresh success. Optional channels degrade partially with disclosure. Qualify endpoint methods, county format/year and current flags. Assert watch, alert, coverage and remediation consistency. An unavailable XRP observation cannot be labelled fresh/complete solely because a relationship exists.

CI coverage: regression_and_guidance; suites: evidence-and-privacy. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P17 — Independent request lifecycle, cold starts and server leases

Customer claim scheduling must not be starved by an unrelated background refresh INCOMPLETE_HOLD. Preserve crash/replay safeguards. Test enqueue, claim, completion, retrieval and expiry independently, with safe bounded metadata retained beyond transient payload TTL. Budget initial wake separately; validate returned server lease, remaining time, correlation and clock skew. Reconcile unknown POST outcomes before any retry, especially a paid call.

CI coverage: regression_and_guidance; suites: request-lifecycle. Mapped files cover selected fixture behavior only; full control-family and production acceptance require separate scoped evidence.

### P18 — Inspect the sealed release and consistent version identity

Unpack the exact final package and inspect test/cache residue, unsafe paths, duplicate entries and required files; hash that sealed artifact. Verify application version, metadata, assertions and lock headers agree before broad regression. Never call a reconstructed worktree the recovered original.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.

### P19 — Bounded outbound fetching and connection identity

Treat issuer and customer-supplied URLs as untrusted. Qualify allowed schemes, hosts, resolved destinations and redirects; reject private/internal destinations on public fetch paths using connection-bound protection appropriate to the implementation. Handle DNS changes without a validation-to-connection gap. Configure OAuth/JWKS proxy behavior deliberately. Do not weaken TLS, signatures or API authentication to make a request pass. A loopback listener alone does not authenticate a remote caller.

CI coverage: guidance_only; suites: none. Requires development review or protected runtime/infrastructure access; not mechanically certified by this repository gate.
