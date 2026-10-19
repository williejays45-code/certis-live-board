# CERTIS Financial Intelligence Phase 2 — Codex execution handoff
Date: 2026-10-19. Source branch: `feature/certis-financial-systems-20261019`, based on PR #25 head `9f03aa1a6a3cf1eebaae3214f52998ea19220f45` (unmerged). This is a **candidate**, not a production release.

## Built in this branch
`backend/financial-systems.mjs` implements five separately importable, read-only interfaces supporting the six approved initiatives:

1. `admitPublicFinancialObservations(records,asOf)`: a closed, dated, public-only observation schema, provenance metadata, strict source URL, value and uniqueness validation. **Not an authentic-source verification or source adapter.**
2. `analyzeOperatingScenarios(input)`: exact-cent baseline, adverse and favorable sensitivities with explicit revenue/cost shocks, evidence identifiers and no projected probabilities. Does not model taxes, timing, liquidity or debt covenants.
3. `reconcileEvidenceClaims(claims,observations)`: identifies unsupported/contradictory evidence references and leaves scoring model **null**. Never confuses structural evidence linkage with corroboration or 75-point support.
4. `compareFinancialRelationships(input)`: bounded **one-hop** propagation of DECLARED basis-point sensitivities (e.g. interest-rate change to assumed borrowing cost). NO inferred causality, forecasts or transitive propagation.
5. `evaluateMonitoringCandidates(input)`: deterministic percent-change threshold candidates, **without** scheduling, real-time source polling, alerts, or delivery claims.

All outputs carry `assessment_state:not_supported`, `evidence_strength:null`, `financial_action_authority:none`. An accompanying `backend/financial-systems.test.mjs` tests fixed scenarios, guards, omissions, privilege boundaries and no-action rules. Prior PR #25 implements a dated two-year versus ten-year Treasury comparison in public reports.

## Next Codex work (no laptop initially)
1. Read `AGENTS.md`, `maintenance/PREVENTION.md`, `maintenance/policy.json`, `maintenance/accepted-scopes.json` before editing. Check latest main and PR #25/#26 differences. Never merge an older line wholesale. Base source changes on current protected line.
2. Validate NEW module directly with Node 24; run `npm test`, `npm run maintenance:test`, `npm run maintenance:contracts`, `npm run maintenance:check -- --base <verified merge base>`, and test browser presentation. Audit edge cases: evidence date units, source identity, rounding, negative values, overflow, circular assumptions, contradicting sources, duplicates, account/cross-tenant isolation.
3. Keep source-admission, source-authenticity and publisher license checks separate. Implement independently verified, **outbound-only**, allowlisted public data connector candidates for Treasury, BLS, SEC and independently corroborated market data. Never assume a URL is trusted simply because it is HTTPS. Require revision windows, timestamps, raw hashes, citations, source independence and fail-closed outage behavior. No paid feed contracts without owner approval.
4. Define and unit-test product-specific analysis contracts for stocks/ETFs, bonds (duration, coupon, liquidity and credit exposure), macro indicators and business cash-flow. Add explicit missing-data outcomes. Use scenarios, not unsupported forecasts.
5. Build a calibration/evaluation proposal for evidence scoring with adversarial datasets, negative evidence, contradictions and provenance. Do **not** activate scored conclusions or weaken the existing 75-point evidence law until the protected engine separately qualifies and accepts it.
6. Extend monitoring as read-only candidate generation with source freshness and duplicate suppression, consent, bounded frequency, accessible controls, cancellation, retention and delivery confirmation, **not** a claim that alerts were sent.
7. Build relationship intelligence across rates, credit, corporate financing, bonds, markets and property-finance **only from independently attributed assumptions**. Do not share LANDITRUS private reports without customer-specific consent and separate authorization.
8. Prepare a no-charge, no-live-credit staging acceptance and release receipt. Do not merge or deploy without protected gates, CI passing and explicit scope authority.

## Requires protected laptop / separately authorized access
- Inspect/patch protected Windows CERTIS v3.24.0 runtime internals and historical databases; verify machine identity and durable backups/restore evidence first.
- Confirm Windows evidence controller lifecycle, machine key/cert ownership, export hashes, runtime-provenance and maintenance prerequisites; preserve 2026-10-16 reported Bitcoin PASS.
- Accept a current end-to-end Windows controller → Render bridge → authenticated website financial review; only a changed dependency or observed failure justifies repeating previously accepted testing.
- Any one-time secret, OAuth, paid source configuration or billing authority. **Do not ask for credentials in chat**, or request unnecessary login/payment.
- Membership product $149 / Gold $249 / Platinum $449 must be separately gated and provider-billing-tested before activation. LANDITRUS prices and customer balances are unchanged.

## Preventive maintenance acceptance / non-negotiables
Preserve P01–P19; distinguish guidance-only from CI enforced. No private database/source files, secrets, personal account data, model confidence fabricated as evidence, autonomous transactions, speculative signals, deletion/cleanup, restored old branches as canonical, or unverified production success. Keep branch and deployment provenance, automatic rollback path, least-privilege and separate approved acceptance scopes. Use zero new charges and zero consumed credits.

## Owner summary
**Implemented:** research primitives and synthetic regression tests in a protected draft candidate.
**Not implemented:** live multi-source data acquisition, calibrated scoring, live alert delivery, a validated predictive system, protected runtime installation, billing or production activation.
**Next gate:** PR CI plus technical review, then independent source qualification. 
