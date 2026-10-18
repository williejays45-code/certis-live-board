# Control coverage — October 17, 2026

The original 41 and imported 80 findings remain 121 source records with overlaps,
not 121 unique errors. Their 19 local controls and 18 imported controls retain their
original namespaces. This software does not rewrite or close those findings.

| Local control | Executable coverage in 0.1.0 | Remaining application/operational proof |
| --- | --- | --- |
| P01 release identity | release, fleet, archive | Current deploy mappings for all services |
| P02 execution context | explicit file root, access is UNKNOWN | Host/user identity collectors |
| P03 handoff | strict paths, hashes, Python CLI | Execute installed artifact on each actual host |
| P04 credentials/privacy | scan and strict public contract | Existing credential ACL/DPAPI and full app privacy tests |
| P05 complete contract | alias/schema/threshold hostile cases | Actual app producer-to-consumer integration |
| P06 diagnostics | fixed reason codes, receipts, no values | App request correlation/TTL adapters |
| P07 lifecycle | unknown outcomes cannot promote; receipt writer lock | Queue, lease, cold-start and idempotency checks |
| P08 identity/customer | customer evidence distinct from tests | Real sign-in, role separation, plan-only checkout fixtures |
| P09 config comparison | Cloud Run single-container comparator | Service IAM/ingress/traffic and routing collectors |
| P10 delivered boundary | exact artifact hash + customer correlation | Browser/device evidence and protected collector trust |
| P11 continuity/cost | scoped reuse; no paid calls or auto retry | Billing reconciliation and authorization owner |
| P12 evidence truth | schema aliases, hash-pinned receipts | Independent source identity/provenance; no arbitrary score proof |
| P13 journal | locked, hash-linked maintenance receipts | Product transaction/crash/restore integrity |
| P14 IAM rollback | rollback/authorization receipt prerequisites | Actual role policy, expiry and compensation checks |
| P15 artifact isolation | ZIP integrity/residue/bounds | Product import closure and bootstrap gates remain separate |
| P16 freshness | per-kind evidence/runtime TTL | Observation/source-year/export-format product contracts |
| P17 accurate status | engineering/promotion/customer distinct | Human claims and reports review |
| P18 consent | no purchases or credit consumption | Product entitlement and paid-action consent acceptance |
| P19 outbound | engine makes no HTTP/model requests | Product SSRF, DNS binding, redirects and transport tests |

Partial coverage is explicit. The engine is not a replacement for the products'
existing regression suites or ERA's UNIT/INTEGRATION/SYSTEM/LEGACY taxonomy.
Maintenance unit tests must never be counted as product or customer acceptance.
