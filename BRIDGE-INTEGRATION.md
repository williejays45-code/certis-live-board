# Protected bridge candidate — 2026-10-05

Source anchor: certis-live-board commit 71f4bff4654eb2655bf1d984a3ee8cb2dcb21fd3.

User-confirmed recorded hosting service: Render / certis-live-board. Account ownership remains unverified. No existing CERTIS sign-in service is verified. These are integration prerequisites, not reasons to reopen completed runtime/package gates.

This is a reviewable candidate, not a connected or authenticated deployment. It does not modify the sealed v3.22.7 runtime, its controls, or databases. No external model calls or financial actions occur. The backend extension adds a runnable HTTP service, Google OIDC login, Redis-backed sessions and an atomic shared limiter. Configuration is disabled by default; see RENDER-SETUP.md.

## Implemented

`bridge/query.mjs` exports a standard Web Request/Response handler for POST /api/certis/query. Its default export denies access with 503 because no authentication adapter is configured. It checks origin, JSON content type, request size/shape, server-resolved identity and founder role, an injected shared rate limiter, evidence shape, timestamps and configured freshness, claim/source links, and all-false financial authority. Errors exclude upstream details; responses are never cached.

Scores below 75 cannot be SUPPORTED. This conservative first adapter also rejects SUPPORTED when gaps or contradictions are present. No scoring formula is invented: the protected evidence engine must supply and justify the score. The bridge checks consistency, not factual truth or statistical calibration.

The existing v1 contract lacks claim references for its free-text answer, so this candidate uses a neutral summary and renders only individually source-linked observations/inferences. Source URLs cannot carry credentials, query strings or fragments; the UI renders them as text. Internal memory cannot qualify evidence strength, and public responses cannot include internal sources. These are deliberate conservative restrictions, not claims of full privacy sanitization. The runtime adapter must authorize and sanitize every exported string before returning it.

The candidate app sends only to its same-origin bridge, displays clear unavailable/sign-in errors, renders text without HTML interpolation, and uses zero/UNASSESSED without evidence. It never calls localhost. Conversation IDs are per-page and do not establish persistent memory.

## Required before live connection

1. Confirm the actual CERTIS hosting service and backend routing. A static host will not execute this module; there is deliberately no claimed production API route yet.
2. Configure and acceptance-test the Google Web OAuth client and Redis session store. The implementation uses openid-client for signature/issuer/audience/expiry/state/nonce/PKCE verification and Secure, HttpOnly, SameSite cookies. Sessions rotate at login and are revoked at website logout. Website sessions grant no protected founder role. Google account revocation does not proactively invalidate website sessions; website session revocation or their one-hour expiry is required.
3. Acceptance-test Redis GETDEL/EVAL, session persistence and the shared limiter across real workers, plus ingress limits/timeouts. Redis tests currently use a fake store; the OIDC protocol tests use the real library with locally signed synthetic responses. No real Google sign-in has occurred.
4. Implement an authenticated, read-only, timeout-bounded `queryEvidence` adapter. Scope every conversation lookup to principal ID; verify access before reading founder context. Pass only approved public evidence for public mode. Define evidence freshness per data class and a documented scoring model. Do not rely on request timestamps for source freshness.
5. The v3.22.7 standalone runtime rejects forwarded traffic. Do not remove/strip forwarding headers or relay external traffic as local to bypass that boundary. Runtime integration requires its separately reviewed authenticated interface.
6. Verify real login/logout, expiry/revocation, cross-user conversation isolation, persistent limiter behavior, export sanitization, backend outage, and hosting route behavior before deployment. Existing package verification gates remain closed.

## Validation

Run `npm ci --ignore-scripts` then `npm test` with Node 24. The complete 89-test suite uses synthetic evidence, a fake Redis store, and the real OpenID library with synthetic signed tokens. One smoke test launches a disposable disabled-auth HTTP process on a random loopback port and stops it. Tests need no real credentials, external authentication/model calls or protected state. Dependencies are pinned in package-lock.json. The npm audit returned zero known vulnerabilities at verification time. Browser-based acceptance, real Redis operations and real identity-provider tests remain pending.

## Rollback and authority

Keep the source anchor and deployed public files preserved. This candidate is an overlay for review, not a full website archive. Deployment must retain the prior release and route configuration. Provider activation remains HOLD. Financial authority remains NONE.
