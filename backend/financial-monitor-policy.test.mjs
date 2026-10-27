import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMonitorPolicy as evaluate} from './financial-monitor-policy.mjs';
function fixture(){return {scopeId:'scope.alpha',now:'2026-10-19T12:00:00.000Z',receipts:[],
 rule:{id:'rule.alpha',subject:'treasury.notes',metric:'average.rate',unit:'percent.milli',thresholdBps:500,consent:true,cancelled:false,
  expiresAt:'2026-11-01T00:00:00.000Z',minIntervalSeconds:3600,maxRetrievalAgeSeconds:86400,maxObservationAgeDays:60},
 previous:{id:'evidence.previous',subject:'treasury.notes',metric:'average.rate',unit:'percent.milli',source_id:'treasury.public',observed_on:'2026-08-31',retrieved_at:'2026-10-19T11:00:00.000Z',value:'4000',source_sha256:'a'.repeat(64)},
 current:{id:'evidence.current',subject:'treasury.notes',metric:'average.rate',unit:'percent.milli',source_id:'treasury.public',observed_on:'2026-09-30',retrieved_at:'2026-10-19T11:00:00.000Z',value:'4400',source_sha256:'b'.repeat(64)}};}
test('fresh consented change yields an offline candidate, bounded receipt and no delivery claim',()=>{
 const input=fixture(),before=JSON.stringify(input),r=evaluate(input);
 assert.equal(r.enqueue_candidate,true);assert.equal(r.notification_sent,false);assert.equal(r.delivery_confirmation,null);
 assert.ok(r.receipt.expires_at<=input.rule.expiresAt);assert.equal(JSON.stringify(input),before);
});
test('replay is suppressed across retrievals, scopes stay independent and frequency is bounded',()=>{
 const input=fixture(),r=evaluate(input);input.receipts=[r.receipt];
 assert.equal(evaluate(input).reason,'DUPLICATE');
 input.current.retrieved_at='2026-10-19T11:30:00.000Z';assert.equal(evaluate(input).reason,'DUPLICATE');
 input.current.source_sha256='c'.repeat(64);assert.equal(evaluate(input).reason,'DUPLICATE');
 input.current.value='4500';assert.equal(evaluate(input).reason,'FREQUENCY_LIMIT');
 input.scopeId='scope.beta';assert.equal(evaluate(input).enqueue_candidate,true);
});
test('freshness uses UTC calendar-day age without an extra grace day',()=>{
 const input=fixture();input.rule.maxObservationAgeDays=19;assert.equal(evaluate(input).enqueue_candidate,true);
 input.rule.maxObservationAgeDays=18;assert.equal(evaluate(input).reason,'STALE_CURRENT');
});
test('cancellation, consent, expiry, stale evidence and incomparable units cannot enqueue',()=>{
 for(const [edit,reason] of [[x=>x.rule.consent=false,'CONSENT_REQUIRED'],[x=>x.rule.cancelled=true,'CANCELLED'],
  [x=>x.rule.expiresAt=x.now,'EXPIRED'],[x=>x.current.retrieved_at='2026-10-17T11:00:00.000Z','STALE_CURRENT'],
  [x=>x.current.unit='other.unit','INCOMPARABLE_EVIDENCE'],[x=>x.current.observed_on='2026-10-20','INCOMPARABLE_EVIDENCE']]){
  const input=fixture();edit(input);const r=evaluate(input);assert.equal(r.reason,reason);assert.equal(r.enqueue_candidate,false);
 }
});
test('unknown state, malformed receipt and private schema additions fail closed',()=>{
 const input=fixture();input.rule.consent='yes';assert.throws(()=>evaluate(input),/MONITOR_POLICY/);
 const bad=fixture();bad.receipts=[{}];assert.throws(()=>evaluate(bad),/MONITOR_RECEIPT/);
 const privateInput=fixture();privateInput.current.email='private@example.test';assert.throws(()=>evaluate(privateInput),/MONITOR_OBSERVATION/);
});
