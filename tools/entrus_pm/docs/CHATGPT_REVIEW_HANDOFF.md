# ChatGPT collaboration handoff

User requested ChatGPT assistance. This package is ready for independent review;
no claim is made that ChatGPT has reviewed it or that a message was sent to another
chat. Supply this package and its receipt, not secrets or private audit transcripts.

Review `pm/engine.py`, `pm/__main__.py`, `ci.py`, tests, policy, coverage and rollout.

1. Attempt bypasses: wrong target/commit, stale/future receipt, altered artifact,
   synthetic customer evidence, duplicate keys/receipts, untrusted collectors and
   inaccessible evidence. Distinguish structural validation from authenticity.
2. Challenge config normalization using real Cloud Run V1 shapes: sidecars,
   dependencies, secrets, IAM, traffic and ingress boundaries. Do not propose skipping
   a material assertion to make deployment green.
3. Check Windows/Linux path behavior, crash/overlap on receipt writing, ZIP collisions,
   CI pull-request trust, metadata leakage, and exact exit-code propagation.
4. Verify controls marked partial are not represented as fully enforced; preserve
   ERA's legacy/unit/integration/system distinctions and historical product passes.
5. Return a severity-ranked patch review with concrete reproductions and affected
   tests. Do not re-audit completed product gates unless a relevant defect appears.

No provider calls are needed for this review. Suggestions do not grant authority to
deploy, rotate credentials, modify runtime state or consume customer credits.
