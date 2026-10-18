# Development and CI maintenance

Read maintenance/PREVENTION.md and maintenance/policy.json before changing this project. These are public-safe operating rules; private audit records and Windows paths must not be copied into this repository.

- Work from the current default branch and inspect newer work before edits. Keep source correction, tests, deployment and customer acceptance distinct.
- Read maintenance/accepted-scopes.json before requesting another login, payment, credential entry or unchanged acceptance test. Unknown release metadata does not erase the recorded pass. Append corrections/supersession with evidence; do not rewrite history.
- Keep public login, founder/admin authorization, membership, one-time purchases, provider connectivity and evidence acceptance separate. Do not bypass a denial to make a check green.
- Apply the smallest correction and preserve unrelated source, records, balances and rollback. Never substitute historical recovery folders for active source.
- Use synthetic/mocked fixtures for regression tests; no live charge, report-credit use, credential rotation, model call or deployment merely to prove this CI gate.
- Never print secrets or raw private data. Report stable stage/reason and outcome; an unknown result must be reconciled before retry.
- Run `npm run maintenance:check -- --staged` before committing, and the affected application tests. `npm run maintenance:test` verifies the guard; `npm run maintenance:contracts` runs the mapped fixture suites after application dependencies are installed.
- Install the local hook with `npm run maintenance:install-hook`. It refuses to replace an existing hook or hooksPath; preserve and chain existing hooks deliberately.
- Reuse unaffected acceptance; record a concrete changed dependency, observed contradiction or freshness requirement before repeating owner work.
- Report actual check results and exact limits. This policy does not grant financial execution authority or certify all 19 controls as fully automated.
