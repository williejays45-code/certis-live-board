# EnTrus Preventive Maintenance Engine 0.1.1

This is an executable, offline maintenance gate built from the CERTIS/LANDITRUS
incident audits. It preserves successful acceptance and rejects incomplete release
claims. It has no service restart, sign-in, secret rotation, database repair,
payment, provider-call or deployment capability.

Version 0.1.1 fixes unverified fleet mappings being counted as enforced, omitted
Git type-change scans, and ZIP file/directory ancestor conflicts. It also fixes ZIP
creator metadata for consistent Windows/Linux packaging. These repairs add no
production credentials, deployment hook, or automatic repair authority.

## What runs

| Command | Checks |
| --- | --- |
| `release` | Exact target/commit/artifact; pinned receipts; tests, security, contracts; fresh configuration, explicit authorization and verified rollback for promotion; correlated live deployment/customer evidence for customer readiness |
| `reuse` | Unchanged accepted scope is reused; changes, contradictions and expiry request targeted rechecks; unavailable access alone does not erase a historical pass |
| `cloudrun-delta` | V1 revision material configuration, single-container cosmetic-name handling, pinned images, sidecar/dependency safeguards; values never printed |
| `archive` | ZIP hash, integrity, path safety, case collisions, size bounds, runtime/cache residue |
| `contract` | Narrow public quote/evidence schema, keys, numeric identifiers, alias collisions/unknown aliases and the 75-point evidence threshold |
| `scan` | Explicit/tracked files only; limited secret patterns and packaged state; findings omit matched contents |
| `fleet` | Target coverage, branch/service identity, fresh enforcement observations; missing mappings cannot become green coverage |
| `verify-log` | Sequential hash-linked receipts and optional independently retained head digest |

Python 3.11+; standard library only. From this package directory:

```text
python -B -m unittest discover -s tests -v
python -B -m pm scan --root /path/to/checkout
python -B -m pm cloudrun-delta --baseline baseline.json --input candidate.json
python -B -m pm release --policy protected-policy.json --policy-sha256 <approved-digest> --root evidence-directory --input release.json
```

`--receipts /restricted/output` appends a new hash-linked receipt after a check.
All paths above are examples; use the actual installed interpreter and existing
files on the execution host. No PowerShell version dependency is introduced.

Exit codes: **0 PASS**, **1 BLOCKED**, **2 UNKNOWN/input/access failure**.
An unavailable checker must stop promotion. Never translate exit 2 to success.

## Trust and limits

These checks validate supplied evidence; they cannot establish whether a dishonest
collector fabricated it. Protect the engine, policy pins, collectors and release
pipeline separately from application contributors. A SHA digest is integrity, not
an identity signature. The local receipt chain is tamper-evident only against an
independent retained head; it is not immutable storage and cannot detect unanchored
tail deletion. It is single-host only. An abandoned writer lock requires inspection.

`contract` is a deliberately narrow test seam, not CERTIS's installed privacy filter
or a general-purpose data-loss-prevention system. Source/contract checks cannot
prove live authentication, subscriptions, billing, provider behavior or readability.
`cloudrun-delta` does not include service traffic, IAM, ingress or Firebase/Render
routing; obtain separate safe control-plane evidence for the release gate.

CI executes on all push and pull-request branches once merged. That is source
protection, not proof that every branch is live. Existing application CI stays in
place. Rulesets/required checks and the protected deployment hook are separate
rollout work. A contributor can alter a repository-local workflow: production must
run a separately pinned copy in a protected environment before deployment.

See `docs/CONTROL_COVERAGE.md`, `docs/ROLLOUT.md`, `docs/SOFTWARE.md` and
`docs/CHATGPT_REVIEW_HANDOFF.md` for scope, rollout and review.
