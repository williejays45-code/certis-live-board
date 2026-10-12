# CERTIS | October 12 public market evidence integration candidate

## Scope and status
This change stages **source-verified public evidence**, not a new production data feed, AI provider activation, financial advice, or authority elevation. Source repository: `certis-live-board`; authoritative CERTIS v3.22.7 local/protected runtime is not modified. Data belongs in the protected bridge's curated public-evidence admission queue, not hardcoded into browser-generated financial assessments.

## Source evidence and key separations
- **XRPL overflow**: disclosed October 9; reported September 22; `xrpld` 3.4.1 patch released September 25; publisher reports no known public-network exploitation.
- **XRPL Batch validation**: separate issue reported September 18; `fixBatchV1_2` enabled on Mainnet October 9. Publisher reports no incorrect Mainnet processing before activation.
- **RLUSD custody**: Standard Chartered's DIFC branch announced live RLUSD custody on XRPL October 12. This is not a report of spot XRP purchases.
- **LMAX collateral**: future/pending integration, dependent on testing, documentation and approvals. Do not render as live.
- **CPI**: September U.S. CPI is scheduled for October 14, 2026, 08:30 ET. Results unknown as of October 12.

## Integration destination
Map the JSON event data to the existing `CERTIS-BRIDGE-CONTRACT.md` after server-side verification, with `sources[].checked_at` generated from **actual** source retrieval time, not fabricated from `observed_on`. Map `observations`, `inferences`, and `limitations` (limitations inform `contrary_evidence` and `missing_evidence`). Never mark `assessment.state=SUPPORTED` or fabricate `evidence_strength` from this fixture; protected CERTIS Authority computes those fields and preserves the 75-point evidence threshold.

## Admission/acceptance gates
1. Validate required event identifiers, dates, source HTTPS origins, authority flags and separation of facts from inference.
2. Reject unknown source URLs, changed content without revalidation, duplicate event IDs, and stale market price assertions.
3. Map the two XRPL vulnerabilities to different event identities; require patched vs ongoing-risk qualifiers and avoid a confirmed-exploit claim.
4. Verify that RLUSD custody is **live**, LMAX collateral is **planned**, and neither is classified as direct XRP buy-side flow.
5. CPI calendar may create a watch condition, but no CPI result or price alert without primary release and independent market data.
6. Test missing evidence, contradictions, change-of-status updates, deduplicated alerts, citation timestamps, and authority `NONE`.
7. Keep browser and API-provider boundaries intact. Do not deploy to the production site without protected runtime tests, owner review and controlled acceptance.

## Provenance
- XRPL official disclosure: https://xrpl.org/blog/2026/vulnerabilitydisclosurereport-bug-20261009
- Standard Chartered official release: https://www.sc.com/en/press-release/standard-chartered-launches-rlusd-custody-and-joins-planned-collateral-integration-with-ripple-and-lmax-group/
- U.S. BLS October release schedule: https://www.bls.gov/schedule/2026/10_sched_list.htm

## Non-mutation
No keys, customer financial details, private data, trading functionality, production traffic, billing, payments, account state, or local CERTIS runtime are modified by this evidence candidate.
