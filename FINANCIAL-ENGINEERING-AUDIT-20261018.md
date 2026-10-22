# CERTIS Financial Intelligence Engineering Audit — 2026-10-18

**Scope:** Current `williejays45-code/certis-live-board` main at `3c0d314197883c0f1e48a3c18ca7ddc8663333ae`, including the public website, Render bridge source, manifest-pinned public evidence exports, review and model boundary, tests, CI and preservation rules. Protected Windows runtime v3.24.0 internals, private databases, Google OAuth acceptance, infrastructure secrets, subscription billing and real-time market feed accuracy were **not directly accessible**. No claim about their present state is implied.

**Existing acceptance preserved:** `maintenance/accepted-scopes.json` contains a reported production PASS on 2026-10-16 for the **automatic public Bitcoin evidence flow**, explicitly excluding paid membership lifecycle, broader assessments and present liveness. Do not repeat the accepted purchase or login just to produce a new receipt.

## Findings: severity and evidence

| Priority | Engineering finding | Source evidence | Customer effect |
| --- | --- | --- | --- |
| P0 | Broad financial intelligence is **not** yet backed by a qualified live multi-asset evidence fabric. | `backend/public-reviews.mjs` finance domain pins Treasury and BLS snapshots only. `backend/engine-requests.mjs` is explicitly Bitcoin-only. `backend/engine-evidence.mjs` returns evidence gaps for equities/funds. | Do not claim live stock analysis, current bond pricing, or broad asset coverage merely because the website has a financial section. |
| P0 | Evidence score has a **75 minimum admission law but no accepted quantitative scoring/calibration methodology in this public integration**. | `bridge/query.mjs` validates a supplied score; `backend/public-reviews.mjs` correctly emits `evidence_strength:null`, `assessment_state:not_supported`. | No unsupported “high-confidence” or return-probability claims. |
| P0 | Completeness of the protected runtime and round-trip customer acceptance cannot be established from a successful code merge. | `ENGINE-CONNECTION.md` outlines narrow public export and laptop refresh; `PRODUCTION-RELEASE.md` records a controller hold at its 2026-10-14 checkpoint; 2026-10-16 BTC report is scoped and historical. | Verify new financial capabilities in staging independently of preserving the accepted BTC flow. |
| P0 | $149/$249/$449 finance subscriptions and entitlements are **not represented as working billing enforcement in this audited repository**. | Repo inventory contains no dedicated customer financial subscription/checkout/entitlement lifecycle. | Do not charge for promised intelligence capacity before entitlements and actual delivery are proved; LANDITRUS remains independent. |
| P1 | The dated Treasury and CPI inputs are insufficient for valuation, bond duration/credit analysis, inflation trend, issuer fundamentals, investment comparison or portfolio risk. | Treasury snapshot: 2026-10-09 reference par yields; BLS snapshot: 2026-08 CPI index. Both unreconciled; one CPI index is not inflation growth. | Clearly present as historical public references, not forecasts or individualized financial conclusions. |
| P1 | Financial scenario engine, stress tests, fee/tax assumptions, independent source reconciliation, contradictions and ongoing monitoring across asset classes remain unproved. | `projectReview` emits no score, inferences or independent contradiction assessment; no live alert engine found in audited public bridge. | Gold/Platinum report, monitoring and strategic-briefing promises need defined, testable service contracts. |
| P1 | Cross-service LANDITRUS financial use is not a privileged data shortcut. | `ENGINE-CONNECTION.md` excludes protected property report exchange; `backend/engine-evidence.mjs` explicitly emits the gap. | Separate customer consent, identity, provenance, and product billing boundaries. |
| P2 | Saved review state is limited, not permanent history. | `backend/public-reviews.mjs` stores most recent 20 reviews with a 30-day Redis retention; user export exists. | Membership retention promises need durable owner-scoped storage and recovery verification. |

## This candidate adds one precise, non-authoritative capability

**Module:** `backend/financial-intelligence.mjs`; tested in `backend/financial-intelligence.test.mjs`; wired to `backend/public-reviews.mjs` and displayed in `app/review-presentation.mjs`.

- Computes **10-year minus 2-year U.S. Treasury reference yield spread** in **basis points**, using integer arithmetic only when *both* exact metric values share the same source, observation date, pinned raw hash, source identity and validated evidence IDs.
- Admits **descriptive arithmetic only**: no provider activation, scoring model, yield prediction, bond recommendation, money movement or trade authority.
- Carries date, source digest, contributing evidence IDs, formula, and `stale`/`refresh_due` state into the saved and readable report. If provenance fails, no computation is emitted.
- Adds clear financial-evidence gaps about equities/filings, bond price/credit/duration, missing CPI trend and independent contradiction reviews. All assessments remain **not_supported** and evidence strength remains **null**.
- October 9 snapshot yields of 4.80% (2-year) and 5.24% (10-year) produce **+44 basis points AS OF 2026-10-09**. This historical example is **not** a live rate or recommendation.

**Candidate verification:** The five self-contained module tests were executed locally with Node 22: 5 passed, 0 failed, on synthetic data; production Node 24 and complete integration/CI must be checked on the PR. Regression assertions were added to public reviews and browser presentation. This document alone is not CI, deployment or production acceptance.

## Sequenced additions after the safe first slice

1. **Authoritative source connectors:** provenance-pinned, independently checked Treasury, BLS, SEC filings, issuer statements, equity/fund price/volume, bond reference/credit information, public FX and digital-asset sources. Per-series freshness, timezones, revisions, rate limits, licensing, source identity, outage and contradiction handling.
2. **Quantitative financial reasoning:** baseline/sensitivity/stress scenarios, explicit rates and units, bonds (duration, credit, liquidity, coupons and reinvestment), company cash-flow/debt/earnings, sector, portfolio concentration/correlation and risk drivers. Preserve “unknown” when price, period or evidence is absent. Do not infer future returns from one quote.
3. **Audited claim strength:** documented evidence-feature definitions, source independence, corroboration, negative evidence, contradiction penalties, calibration/evaluation sets and versioned policy. Only the protected engine may emit a justified score; 75 is a support threshold, **not a 75% outcome probability**.
4. **Delivery and membership:** read-only personalized views after appropriate consent, human-understandable uncertainty, durable reports with recovery test, bounded monitored topics, report-credit idempotency and separated CERTIS membership entitlements. Define what $149, $249 and $449 actually unlock before selling it.
5. **Production acceptance:** test genuinely new source and calculation paths end-to-end with safe fixtures first, real qualified sources later. Reuse historic accepted BTC scope; do not repeat payment, sign-in or credentials. Align protected engine and Render release identity, alerts and rollback before promotion.

## Non-negotiable boundaries

Financial action authority **NONE**. Source/score/provider approval cannot originate from marketing copy. No private customer data or founder secrets in a public repository, no direct browser-to-runtime access, no LANDITRUS membership/pricing changes, no charge, no report credit use, no automatic merge or deployment. Preserve historical assets, branch protection, accepted scopes, and protected backups.

**Audit conclusion:** **NEEDS REVISION for premium full-spectrum financial intelligence.** The dated-reference calculation is a tested additive candidate, not a claim that all deficits were repaired.