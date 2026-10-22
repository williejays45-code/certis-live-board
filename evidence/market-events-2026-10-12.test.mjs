import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = JSON.parse(readFileSync(new URL('./market-events-2026-10-12.json', import.meta.url), 'utf8'));
test('public-only evidence and no financial execution authority', () => {
  assert.equal(bundle.access_class, 'PUBLIC_EVIDENCE_ONLY');
  assert.ok(Object.values(bundle.authority).every(value => value === false));
  assert.equal(bundle.integration_state, 'CANDIDATE_NOT_RUNTIME_ADMITTED');
});
test('five unique, dated, primary-source events with separate facts and inferences', () => {
  assert.equal(bundle.events.length, 5);
  assert.equal(new Set(bundle.events.map(e => e.id)).size, 5);
  const allowed = new Set(['xrpl.org', 'www.sc.com', 'www.bls.gov']);
  for (const event of bundle.events) {
    const url = new URL(event.source.uri);
    assert.equal(url.protocol, 'https:');
    assert.ok(allowed.has(url.hostname));
    assert.match(event.event_date, /^2026-\d{2}-\d{2}$/);
    assert.ok(event.observations.length > 0);
    assert.ok(event.limitations.length > 0);
    assert.equal(event.evidence_strength, null);
  }
});
test('security issues remain distinct and recorded as remediated with qualifications', () => {
  const security = bundle.events.filter(e => e.kind === 'security_disclosure');
  assert.equal(security.length, 2);
  assert.notEqual(security[0].id, security[1].id);
  assert.match(security[0].status, /PATCH/);
  assert.match(security[1].status, /FIX/);
});
test('live RLUSD custody not confused with planned collateral or direct XRP inflows', () => {
  const custody = bundle.events.find(e => e.kind === 'institutional_custody');
  const collateral = bundle.events.find(e => e.kind === 'planned_institutional_integration');
  assert.equal(custody.status, 'LIVE_AS_ANNOUNCED');
  assert.equal(collateral.status, 'PLANNED_NOT_LIVE');
  assert.ok(custody.limitations.join(' ').includes('Do not infer direct XRP demand'));
});
test('CPI schedule is not presented as a published economic result', () => {
  const cpi = bundle.events.find(e => e.kind === 'scheduled_macro_release');
  assert.equal(cpi.status, 'SCHEDULED_NOT_RELEASED');
  assert.ok(cpi.limitations.join(' ').includes('Do not invent'));
});
