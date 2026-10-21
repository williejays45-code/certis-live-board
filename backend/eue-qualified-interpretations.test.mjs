import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateActivation,validateDelivery,authenticateDelivery,signDelivery,digest,spec} from '../contracts/eue-qualified-v2/contract.mjs';
import {validateDelivery as validateV1} from '../contracts/eue-saved-v1/contract.mjs';
import {createQualifiedInterpretationConsumer,reviewKey} from './eue-qualified-interpretations.mjs';

const fixture=JSON.parse(readFileSync(process.env.EUE_V2_FIXTURE_FILE||new URL('../contracts/eue-qualified-v2/fixture.json',import.meta.url),'utf8'));
const body=fixture.delivery,activation=fixture.activation,now=Date.parse(body.evaluated_at),key=Buffer.alloc(48,42);
const clone=x=>structuredClone(x);
function store(){const values=new Map();return {values,async set(k,v,options){assert.equal(options.NX,true);assert.equal(options.EX,600);if(values.has(k))return null;values.set(k,v);return 'OK';}};}
const request=(b=body,headers=signDelivery(b,{key,now}))=>{
  const h=new Headers(headers);h.set('Content-Type','application/json');
  return new Request('http://127.0.0.1:8876/private/eue/qualified/v2',{method:'POST',headers:h,body:JSON.stringify(b)});
};
const consumer=(overrides={})=>createQualifiedInterpretationConsumer({enabled:true,activation,redis:store(),key,now:()=>now,...overrides});

test('new v2 accepts actual producer result and retains the single INFERRED lineage',()=>{
  const value=validateDelivery(body,{activation,now});assert.equal(value.state,'REVIEWABLE');
  assert.equal(value.claims[0].evidence_ids[0],value.lineage[0].evidence_id);assert.equal(value.financial_action_authority,'NONE');
});
test('the actual Python producer signature authenticates in CERTIS',()=>assert.ok(authenticateDelivery(fixture.producer_headers,body,{key,now})));
test('v1 consumer still rejects the new delivery',()=>assert.throws(()=>validateV1(body,now)));
test('v2 rejects an old v1 delivery without broadening v1',()=>assert.throws(()=>validateDelivery({schema:'eue-saved-evidence-delivery/1'},{activation,now})));
test('activation defaults disabled without accessing body, keys or store',async()=>assert.equal((await createQualifiedInterpretationConsumer().ingest(null)).status,503));
test('activation requires a separate protected window and a dedicated key',()=>{
  assert.throws(()=>consumer({activation:fixture.offline_activation}));assert.throws(()=>consumer({key:Buffer.alloc(32)}));
  assert.throws(()=>consumer({enabled:'true'}));assert.throws(()=>consumer({redis:null}));
});
test('activation expiry is enforced for every admission',async()=>{
  let clock=now;const c=consumer({now:()=>clock});clock+=600000;assert.equal((await c.ingest(request())).status,503);
});
test('real transfer, network, report, billing and action permissions remain denied',()=>{
  for(const [k,v] of [['real_report_transfers','ALLOW'],['external_network_enabled',true],['billing_enabled',true],['report_generation_enabled',true],['action_authority','WRITE']]){
    const a=clone(activation);a[k]=v;assert.throws(()=>validateActivation(a,now));
  }
});
test('real classification, unknown fields and source authorities cannot be relabelled synthetic',()=>{
  for(const change of [b=>b.data_classification='OWNER_PRIVATE',b=>b.report={},b=>b.interpretation.source_qualification='OFFICIAL_COUNTY',
    b=>b.interpretation.lineage[0].source_provider_id='COUNTY',b=>b.interpretation.lineage[0].source_record_id='actual-parcel']){
    const b=clone(body);change(b);assert.throws(()=>validateDelivery(b,{activation,now}));
  }
});
test('all trust pins and single-field claim restrictions fail closed',()=>{
  for(const k of ['profile_sha256','baseline_sha256','registry_digest','rule_certification','policy_certification','report_sha256']){
    const b=clone(body);b.interpretation[k]='0'.repeat(64);assert.throws(()=>validateDelivery(b,{activation,now}));
  }
  for(const change of [b=>b.interpretation.claims.push(clone(b.interpretation.claims[0])),b=>b.interpretation.claims[0].predicate='market_value.exists',
    b=>b.interpretation.claims[0].value='123.45',b=>b.interpretation.financial_action_authority='TRADE']){
    const b=clone(body);change(b);assert.throws(()=>validateDelivery(b,{activation,now}));
  }
});
test('missing, conflicting, stale lineage and stripped limitations cannot become accepted readiness',()=>{
  for(const change of [b=>b.interpretation.lineage=[],b=>b.interpretation.lineage[0].authority_limitations=[],
    b=>b.interpretation.claims[0].evidence_ids=['EV-'+'0'.repeat(64)],b=>b.interpretation.lineage[0].observed_at='2026-10-01T00:00:00.000Z']){
    const b=clone(body);change(b);assert.throws(()=>validateDelivery(b,{activation,now}));
  }
});
test('v2 signature binds body, audience, issuer, purpose and timestamp',()=>{
  const h=signDelivery(body,{key,now});assert.ok(authenticateDelivery(h,body,{key,now}));
  for(const [k,v] of [['X-EUE-Audience','CERTIS_SAVED_EVIDENCE_REVIEW'],['X-EUE-Issuer','ENTRUS_CORE'],['X-EUE-Purpose','TRADE'],['X-EUE-Timestamp','1']])
    assert.equal(authenticateDelivery({...h,[k]:v},body,{key,now}),null);
  const b=clone(body);b.request_id='TEST-ONLY-V2-'+'c'.repeat(32);assert.equal(authenticateDelivery(h,b,{key,now}),null);
  assert.equal(authenticateDelivery(h,body,{key:Buffer.alloc(48,43),now}),null);
});
test('admission is unscored, private and incapable of financial actions',async()=>{
  const redis=store(),r=await consumer({redis}).ingest(request()),v=await r.json();assert.equal(r.status,202);
  assert.equal(v.state,'INSUFFICIENT_EVIDENCE');assert.equal(v.review_state,'REVIEWABLE');assert.equal(v.evidence_strength,null);
  assert.equal(v.assessment_complete,false);assert.equal(v.public_evidence_updated,false);assert.equal(v.real_report_transfers,'HOLD');
  const saved=JSON.parse(redis.values.get(reviewKey(activation.activation_id,body.request_id)));assert.equal(saved.interpretation_sha256,digest(body.interpretation));
  assert.ok(!Object.hasOwn(saved,'report'));assert.equal(redis.values.size,2);
});
test('durable namespace rejects replay after consumer recreation',async()=>{
  const redis=store(),r=request();const h=Object.fromEntries(r.headers);assert.equal((await consumer({redis}).ingest(r)).status,202);
  assert.equal((await consumer({redis}).ingest(request(body,h))).status,403);assert.equal(redis.values.size,2);
});
test('fresh nonce cannot create a duplicate request review',async()=>{
  const c=consumer();assert.equal((await c.ingest(request())).status,202);assert.equal((await c.ingest(request())).status,409);
});
test('malformed or invalid contracts have no store effects',async()=>{
  const redis=store(),b=clone(body);b.interpretation.score=100;
  assert.equal((await consumer({redis}).ingest(request(b))).status,422);assert.equal(redis.values.size,0);
});
test('authentication rejection has no store effects',async()=>{
  const redis=store();assert.equal((await consumer({redis}).ingest(request(body,{}))).status,403);assert.equal(redis.values.size,0);
});
test('nonce store uncertainty remains unverified',async()=>{
  const redis={async set(){throw Error('unavailable');}};
  const r=await consumer({redis}).ingest(request());assert.equal(r.status,503);assert.equal((await r.json()).error,'V2_NONCE_OUTCOME_UNVERIFIED');
});
test('review store uncertainty is distinct and never automatically retried',async()=>{
  let writes=0;const redis={async set(){if(++writes===1)return 'OK';throw Error('unknown');}};
  const r=await consumer({redis}).ingest(request());assert.equal(r.status,503);assert.equal(writes,2);
  assert.equal((await r.json()).error,'V2_REVIEW_STORE_OUTCOME_UNVERIFIED');
});
