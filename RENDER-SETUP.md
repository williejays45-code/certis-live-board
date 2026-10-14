# CERTIS separate Web Service candidate

Do not replace or move the existing `certis-live-board` Static Site. This document prepares a separate backend; no service, paid resource, DNS change or OAuth client has been created by this change.

## Service settings for review

- Proposed new name: `certis-auth-bridge` (not an existing service identity).
- Repository: `williejays45-code/certis-live-board`.
- Review branch: `codex/protected-evidence-bridge`; do not merge until review passes.
- Runtime: Node 24. Build: `npm ci --ignore-scripts`. Start: `npm start`.
- Health path: `/healthz`. Render supplies `PORT`; leave `CERTIS_BIND_HOST` unset on Render.
- Set `CERTIS_AUTH_ENABLED=false` for first deploy. Health reports evidence disconnected and authentication unconfigured. Queries and sign-in return 503. No production data is needed.
- Disable automatic deployments initially. Choose the service/resource plan explicitly; this proposal authorizes no spending or paid resource creation.

## Authentication configuration, after service ownership and routing are verified

Use a dedicated Google **Web application** OAuth client for this website. Do not change or reuse an unverified historical Desktop/client configuration. No OAuth client is created or switched by this PR.

Register exactly `https://certisintelligence.com/auth/callback` as the redirect URI for the reviewed same-origin routing arrangement. Required backend-only variables:

| Variable | Value / source |
| --- | --- |
| CERTIS_AUTH_ENABLED | `true` only after configuration verification |
| CERTIS_PUBLIC_ORIGIN | `https://certisintelligence.com` |
| CERTIS_ALLOWED_EMAIL | `certisfounder@gmail.com` |
| GOOGLE_CLIENT_ID | Dedicated Web client's ID |
| GOOGLE_CLIENT_SECRET | Secret entered only into Render's protected environment UI |
| REDIS_URL | Dedicated private Render Key Value connection or verified TLS Redis URL |

Redis must support GETDEL and EVAL; session and rate-limit keys are namespaced. Use a private connection on Render, or TLS for external stores. Do not put environment files in the Static Site's publish directory. The lockfile pins exact dependency versions and package integrity hashes.

Only a Google-verified ID token for the allowlisted account can create website access. Subjects identify sessions. This **does not bind the protected CERTIS founder registry** and never assigns the `founder` role. Sessions expire after one hour; login transactions after five minutes. Logout deletes the Redis session. Google logout/token revocation is not automatically propagated: revoke the website session keys to invalidate them immediately, otherwise the absolute one-hour limit applies. No Google API access token or refresh token is retained.

## Routing proof required

Render documents Static Site rewrites with URL destinations: https://render.com/docs/redirects-rewrites . Proposed rules after the actual backend URL is known:

- `/api/*` → `https://<verified-backend-host>/api/*`, Rewrite
- `/auth/*` → `https://<verified-backend-host>/auth/*`, Rewrite

These are a proposed configuration, not proof that the deployed proxy preserves the required POST bodies, Origin, cookies, Set-Cookie, redirect headers, and no-store behavior. Test all of those before enabling login. If the Static Site proxy cannot pass them faithfully, use a separately reviewed application-origin design; do not weaken origin or cookie checks to compensate. Never enable response caching on auth or API routes. Existing assets take precedence over rewrite rules, so avoid files at those route paths.

Verify exact callback matching, secure host-only cookies, no callback-query logging at the hosting edge, rate limit persistence across restarts/workers, store-outage denial, logout/replay rejection, and synthetic query behavior. Login uses POST `/auth/login`; callback is GET; logout is POST `/auth/logout`. `GET /auth/session` returns only authentication state, not identity details.

## Protected evidence stays disconnected

Successful website sign-in currently returns only zero/UNASSESSED for queries. No database, local runtime, provider or founder memory is contacted. The separately reviewed runtime adapter must enforce data access/export and the existing runtime's authentication boundary; stripping forwarding headers is prohibited.

## Rollback

Remove only the newly introduced `/api/*` and `/auth/*` rewrites, disable authentication and stop the new service if needed. Retain the prior Static Site release and Render settings before changes. Invalidate only this bridge's namespaced session records if revocation is needed; do not modify historical or active CERTIS databases.
