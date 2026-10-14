# Public engine connection, version 1

The existing authenticated website now accepts narrowly projected results from
the protected v3.22.7 runtime. The Windows connector calls the existing local
reasoning evaluation, digital-asset intake plan and intake verification routes.
It does not import the application, open an inbound listener, forward user
questions, call a model, or execute the resulting acquisition plan.

## Actual capability

For the currently activated Bitcoin feed, the engine checks citation references,
required evidence references, contradiction disclosure and authority constraints
for the admitted quote and a deterministic bid/ask-spread calculation. Its intake
planner identifies further evidence requirements. This is limited public decision
support, not a completed investment thesis or an independent audit of Kraken.

`/internal/public-intelligence` requires the existing machine credential and
stores only the exact `certis-public-engine-export/1` projection for five minutes.
The source observation timestamp remains authoritative for freshness. Replay
cannot refresh TTL. Exported fields contain public quote strings, bounded asset
and policy enums, timestamps, fixed check results and allowlisted requirement IDs.
Arbitrary keys, arrays, numeric account values and raw runtime text are rejected.
Only a website session can query the public projection; a session cannot upload
machine evidence or acquire protected founder authority.

## Truth boundaries

- Engine pass does not measure source reliability or evidence strength. No 0–100
  scoring model is defined here; the response retains zero as unscored and
  `INSUFFICIENT_EVIDENCE`. It cannot pass the server's 75-point supported gate.
- No contradictory items in one quote set does not mean a broader contradiction
  review was completed. That remains an explicit missing-evidence item.
- Equities/funds, property/land and EnTrus business requests return distinct
  evidence gaps. They must never receive Bitcoin as substitute evidence.
- Property identity remains LANDITRUS-owned. Private report exchange, founder
  case memory, founder authorization, provider activation and financial action
  are outside this connector. No claims of those gates being complete are made.
- XRP/ETH/SOL are recognized subjects but have no newly activated recurring feed.

## Operation and rollback

The existing Bitcoin-only two-minute Windows refresh task is retained, with a
new pinned controller directory and the same global overlap lock. The old
controller, failed/held state, task XML and pre-activation SQLite snapshots are
preserved locally. The new controller warms/checks Render before acquisition,
checks the existing runtime before and after collection and again before transfer,
and retains the three-failure/interrupted-cycle hold. It never auto-clears a hold.
No credential, service plan, scheduled frequency, sealed runtime, or database
mapping changes are required. The laptop still must be awake and logged in.

Bridge rollback is commit d42256b07db10b79ec019345fcc25540ea44be01; website rollback
is 3220cfde3ceabcfef0039946bb3f964dc33c1daf. Local rollback disables future refreshes
and restores the saved task action. The preserved old controller is held and
must not be blindly rearmed. Never restore databases just to disable refresh.

Validation includes adversarial schema/authority/freshness/session tests, actual
read-only local engine calls on a clearly synthetic fixture, and live acceptance
only after deployment. A synthetic fixture is never uploaded as market evidence.
