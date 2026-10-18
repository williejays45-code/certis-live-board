# Rollout contract

## Verified source targets

- CERTIS: `williejays45-code/certis-live-board`; frontend `main`; Render bridge
  `codex/protected-evidence-bridge`. Both source heads were identical at discovery.
- LANDITRUS: `williejays45-code/landrix`, `master`. Current Cloud Run/Firebase
  artifact and traffic mappings still need read-only reconciliation for this rollout.
- EnTrus Core/ERA: `williejays45-code/entrusarts`, `main`, contains `era/`, the
  verification taxonomy and Windows private-beta supervisor. This identifies code;
  it does not prove which Core runtime is installed.

The owner listing also contains two apparel repositories and `david-backend`.
Their current live roles are unverified and they are not silently declared covered.
The fleet policy therefore deliberately has `inventory_complete: false`.

## Installation and enforcement

1. Review the identical maintenance package in each integration PR. Changes add
   `tools/entrus_pm/` and a separate `.github/workflows/entrus-maintenance.yml`.
   They do not change application startup, secrets, billing or authorization.
2. Run the maintenance tests and existing repository CI. Review adverse scan results;
   do not add broad suppressions or classify old archived code as current production.
3. Merge the source guard after review. Keep the CERTIS bridge branch synchronized
   with the approved engine version; do not change Render's selected branch.
4. In a protected deployment runner, install the approved engine by digest and pin
   the independently reviewed fleet policy. Produce bounded, safe evidence receipts
   from existing CI/control-plane collectors. Run `release` for stage `promotion`.
   Call the existing deployment command only after exact exit code 0. Exit 1/2 stops.
   Reconcile unknown outcomes before retry. Preserve the immediate rollback digest.
5. Capture the actual deployed artifact and correlated customer acceptance. Run stage
   `customer` separately. A promotion result is not customer readiness.
6. Record fresh fleet observations only after verifying the protected hook is installed.
   Turn `inventory_complete` true only after every live service is reconciled.

Discovery-time empty rulesets did not establish the absence of classic branch
protection. CERTIS main now has verified classic protection: maintenance-policy,
browser-client-tests and test are required, the branch must be current, and
administrator bypass is disabled. Preserve that completed gate. The engine's
maintenance-source-checks workflow complements those requirements.

LANDITRUS's current private-repository plan does not enforce merge protection.
No upgrade or visibility change is assumed. Its deployment enforcement must live
outside the application repository's editable workflows, with narrowly scoped
deployment credentials available only to the protected runner. Source CI passing
is not evidence that this production boundary has been installed.

CERTIS website auto-deploy was observed as on-commit and its build command as
true on October 18 UTC; the bridge's auto-deploy was off. Maintenance-only merges
can use Render's documented [skip render] marker while the protected gate is being
installed. This one-commit marker is not ongoing deployment enforcement. Installing
the gate requires control-plane configuration and proof that an invalid candidate
cannot trigger a deployment through the actual configured path.

## No automatic repair authority

The engine reports a category and blocks an unsafe proposed promotion. It never
restarts a live service, rotates a secret, modifies IAM, migrates a database or
retries a payment. A product defect gets a separate scoped correction with existing
acceptance retained and rollback recorded. Core's supervisor remains its sole process
recovery owner; this engine must not introduce a competing watchdog.

## Initial examples

`examples/build_fixture.py` creates synthetic evidence in an empty directory and
prints a working release-gate command. Its sample receipts are explicitly synthetic;
they demonstrate engineering gates only. Do not enroll them as production evidence.

The JSON policy is a draft inventory with collector labels, not cryptographic
collector authentication. Production collectors must run under protected pipeline
identities and store evidence where application contributors cannot rewrite it.
