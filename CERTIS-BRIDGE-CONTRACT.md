# CERTIS Protected Intelligence Bridge Contract v1

Status: interface contract only. This file does not expose the protected runtime and does not activate providers or financial authority.

## Endpoint

POST /api/certis/query

The public shell may call this endpoint only through an authenticated, rate-limited server-side bridge. The browser must never receive provider credentials, database paths, founder secrets, signing material, or direct access to the local CERTIS runtime.

## Request

```json
{
  "question": "string",
  "conversation_id": "opaque string",
  "mode": "public|founder",
  "requested_at": "ISO-8601"
}
```

## Response

```json
{
  "answer": "string",
  "assessment": {
    "state": "UNASSESSED|INSUFFICIENT_EVIDENCE|EMERGING|SUPPORTED|CONFLICTED",
    "evidence_strength": 0,
    "evidence_strength_meaning": "Strength of the evidence set, not probability of outcome",
    "observations": ["string"],
    "inferences": ["string"],
    "contrary_evidence": ["string"],
    "missing_evidence": ["string"],
    "next_watch": ["string"]
  },
  "sources": [
    {
      "label": "string",
      "uri": "https://...",
      "checked_at": "ISO-8601",
      "source_type": "official|market|news|filing|internal",
      "supports": ["string"],
      "challenges": ["string"]
    }
  ],
  "authority": {
    "financial_execution": false,
    "money_movement": false,
    "trading": false,
    "autonomous_purchase": false
  }
}
```

## Evidence law

1. Observations and inferences must remain separate.
2. Evidence strength below 75 MUST NOT be labeled SUPPORTED.
3. A score of 75 does not mean a 75% probability of an outcome.
4. Missing coverage and contrary evidence must reduce or qualify confidence.
5. Every market-sensitive assertion must carry a source timestamp.
6. If live evidence is unavailable, CERTIS must say so and downgrade the assessment rather than fill the gap.
7. Founder memory may supply business context but may not be presented as external market evidence.
8. CERTIS may reverse a prior assessment when stronger evidence changes the case.

## Trust boundary

Public website -> authenticated bridge -> CERTIS protected runtime

Forbidden:
- browser -> local runtime
- browser -> SQLite/database
- browser -> provider secret
- browser -> signing or execution material

## Authority

CERTIS remains decision support only. This bridge does not grant financial execution authority.
