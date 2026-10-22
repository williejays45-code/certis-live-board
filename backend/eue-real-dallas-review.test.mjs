import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {canonical,sign} from './eue-peer.mjs';
import {createRealDallasReviewConsumer,validateRealDelivery,validateRealPermit,
        verifyRealEnvelope,nonceKey,reviewKey} from './eue-real-dallas-review.mjs';

// All examples are invented in-memory test records; never customer evidence.
const now=Date.parse('2026-10-21T12:00:00.000Z'),key=Buffer.alloc(48,68),approvalKey=Buffer.alloc(48,83);
const hash='a'.repeat(64),sourceApproval='b'.repeat(64),packetHash='c'.repeat(64);
const clone=x=>structuredClone(x);
const activationBody={
  schema:'certis-eue-real-dallas-activation/1',issuer:'CERTIS_RELEASE_AUTHORITY',
  activation_id:'CERTIS-REAL-'+'f'.repeat(32),mode:'ONE_REPORT_READ_ONLY',
  authorized_report_sha256:hash,source_approval_sha256:sourceApproval,
  issuer_scope:'ENTRUS_CORE',recipient_scope:'CERTIS_REAL_EUE_REVIEW',
  not_before:'2026-10-21T11:59:00.000Z',expires_at:'2026-10-21T12:09:00.000Z',
  public_evidence_updates:false,billing_authority:'NONE',
  financial_action_authority:'NONE',action_authority:'NONE',
};
const approve=(body=activationBody,signedKey=approvalKey)=>({
  body,signature:createHmac('sha256',signedKey).update(canonical(body)).digest('hex')
});
const body={
  schema:'eue-real-dallas-interpretation-delivery/1',request_id:'TEST-ONLY-DCAD-REQUEST-001',
  report_sha256:hash,evidence_packet_sha256:packetHash,source_approval_sha256:sourceApproval,
  producer:'ENTRUS_CORE',consumer:'CERTIS',purpose:'READ_ONLY_REVIEW',
  data_classification:'OWNER_PRIVATE',evaluated_at:'2026-10-21T12:00:00.000Z',
  issued_at:'2026-10-21T12:00:00.000Z',
  interpretation:{
    state:'REVIEWABLE',knowledge_state:'INFERRED',interpretation_executed:true,
    claims:[{term_id:'IDENTITY',predicate:'parcel_id.exists',value:'true',state:'INFERRED',
             evidence_ids:['EV-'+'d'.repeat(64)]}],
    lineage:[{evidence_id:'TEST-ONLY-EV-DCAD-001',canonical_evidence_id:'EV-'+'d'.repeat(64),
      source_provider_id:'dallas-cad-dcad-qual-001',
      source_record_id:'dcad:2027:360879200B0030000',payload_sha256:'e'.repeat(64),
      observed_at:'2026-10-21T11:57:00.000Z',
      authority_limitations:['APPRAISAL_RECORD_NOT_LEGAL_TITLE','SOURCE_MAY_CONTAIN_ERRORS_OR_OMISSIONS',
        'APPRAISAL_VALUE_NOT_INDEPENDENT_MARKET_VALUATION']}],
    rule_certification:'13e44eed0ba6501a1e0dcc357a46b18d0b0b62e9288b6930008ce80e5c69ff2f',
    policy_certification:'0075ecbc85f6d0c24ff1a4816c779fa2440fb941d89759c0dfb49f11cf08198d',
    qualified_fields:['parcel_id'],action_authority:'NONE',financial_action_authority:'NONE',
  },
};
const store=()=>{
  const map=new Map();
  return {map,async set(k,v,o){assert.equal(o.NX,true);assert.equal(o.EX,900);
    if(map.has(k))return null;map.set(k,v);return 'OK';}};
};
let nonceId=0;
function request(data=body,{headers,nonce}={}){
  const actual=nonce||('a'.repeat(46)+String(++nonceId).padStart(2,'0'));
  const signed=headers??sign(data,{key,issuer:'ENTRUS_CORE',audience:'CERTIS_REAL_EUE_REVIEW',
                                      nonce:actual,now:()=>now});
  const h=new Headers(signed);h.set('Content-Type','application/json');
  return new Request('http://127.0.0.1:9915/private/real',{method:'POST',headers:h,
    body:JSON.stringify(data)});
}
function consumer(overrides={}){
  return createRealDallasReviewConsumer({enabled:true,activation:approve(),redis:store(),
    key,approvalKey,now:()=>now,...overrides});
}
test('disabled by default and no implicit production route',async()=>{
  assert.equal((await createRealDallasReviewConsumer().ingest(null)).status,503);
  assert.throws(()=>createRealDallasReviewConsumer({enabled:'true'}));
  assert.throws(()=>consumer({key:Buffer.alloc(32)}));
  assert.throws(()=>consumer({approvalKey:key}));
});
test('separately signed short-lived report-specific CERTIS permission is required',()=>{
  assert.equal(validateRealPermit(approve(),{key:approvalKey,now}).mode,'ONE_REPORT_READ_ONLY');
  assert.throws(()=>validateRealPermit(approve(activationBody,key),{key:approvalKey,now}));
  for(const mutate of [p=>p.billing_authority='CHARGE',p=>p.mode='ALL_REPORTS',
    p=>p.authorized_report_sha256='0'.repeat(64),p=>p.public_evidence_updates=true,
    p=>p.recipient_scope='ANOTHER_SERVICE',p=>p.expires_at='2026-10-21T13:00:00.000Z']){
    const p=clone(activationBody);mutate(p);
    assert.throws(()=>validateRealPermit(approve(p),{key:approvalKey,now}));
  }
});
test('real-format signed delivery passes exact one-claim private review validation',()=>{
  const approved=validateRealPermit(approve(),{key:approvalKey,now});
  const input=validateRealDelivery(body,{activation:approved,now});
  assert.equal(input.interpretation.claims[0].predicate,'parcel_id.exists');
  assert.equal(input.data_classification,'OWNER_PRIVATE');
  assert.equal(input.report_sha256,hash);
});
test('signed envelope binds issuer, audience, timestamp and payload',()=>{
  const req=request(),headers=req.headers;
  assert.ok(verifyRealEnvelope(headers,body,{key,now}));
  assert.equal(verifyRealEnvelope(headers,{...body,report_sha256:'f'.repeat(64)},{key,now}),null);
  assert.equal(verifyRealEnvelope(headers,body,{key:approvalKey,now}),null);
  const h=Object.fromEntries(headers);h['x-eue-audience']='THIRD_PARTY';
  assert.equal(verifyRealEnvelope(h,body,{key,now}),null);
});
test('one authorized real-format parcel creates only private, unscored receipt',async()=>{
  const redis=store(),r=await consumer({redis}).ingest(request()),out=await r.json();
  assert.equal(r.status,202,out.error);
  assert.equal(out.schema,'certis-eue-real-dallas-review/1');
  assert.equal(out.review_state,'REVIEWABLE');
  assert.equal(out.financial_action_authority,'NONE');
  assert.equal(out.billing_authority,'NONE');
  assert.equal(out.public_evidence_updated,false);
  assert.equal(out.assessment_complete,false);
  assert.equal(out.evidence_strength,null);
  assert.equal(out.score_model,null);
  assert.equal(redis.map.size,2);
  const stored=JSON.parse(redis.map.get(reviewKey(activationBody.activation_id,body.request_id)));
  assert.equal(stored.claim,'parcel_id.exists');
  assert.ok(!JSON.stringify(stored).includes('360879200B0030000'));
  assert.ok(!JSON.stringify(stored).includes('OWNER_NAME1'));
});
test('real-report review cannot score, trade or claim more than parcel ID',()=>{
  const perm=validateRealPermit(approve(),{key:approvalKey,now});
  for(const mutate of [b=>b.interpretation.claims[0].predicate='market_value.exists',
    b=>b.interpretation.claims[0].value='123',b=>b.interpretation.claims.push(clone(b.interpretation.claims[0])),
    b=>b.interpretation.financial_action_authority='TRADE',
    b=>b.interpretation.qualified_fields=['parcel_id','market_value'],
    b=>b.interpretation.lineage[0].authority_limitations=[],
    b=>b.interpretation.lineage[0].source_provider_id='UNKNOWN',
    b=>b.interpretation.lineage[0].canonical_evidence_id='EV-WRONG']){
    const b=clone(body);mutate(b);
    assert.throws(()=>validateRealDelivery(b,{activation:perm,now}));
  }
});
test('real-report source approval and report hash cannot mismatch independent permit',()=>{
  const perm=validateRealPermit(approve(),{key:approvalKey,now});
  for(const k of ['report_sha256','source_approval_sha256','evidence_packet_sha256']){
    const b=clone(body);b[k]='0'.repeat(64);
    assert.throws(()=>validateRealDelivery(b,{activation:perm,now}));
  }
});
test('synthetic v2, v1 and arbitrary data reject without any ledger write',async()=>{
  const redis=store();
  for(const data of [{schema:'eue-qualified-interpretation-delivery/2'},{
    schema:'eue-saved-evidence-delivery/1'},{}]){
    const r=await consumer({redis}).ingest(request(data));
    assert.equal(r.status,422);
  }
  assert.equal(redis.map.size,0);
});
test('real replay rejected across receiver restarts',async()=>{
  const redis=store(),req=request(),headers=Object.fromEntries(req.headers);
  assert.equal((await consumer({redis}).ingest(req)).status,202);
  assert.equal((await consumer({redis}).ingest(request(body,{headers}))).status,403);
  assert.equal(redis.map.size,2);
});
test('same request ID with new nonce is rejected after nonce claim',async()=>{
  const redis=store(),c=consumer({redis});
  assert.equal((await c.ingest(request())).status,202);
  assert.equal((await c.ingest(request())).status,409);
});
test('expired activation stops admission without revealing customer information',async()=>{
  const expired=approve({...activationBody,not_before:'2026-10-21T11:00:00.000Z',
    expires_at:'2026-10-21T11:05:00.000Z'});
  assert.throws(()=>consumer({activation:expired}));
  let clock=now;
  const c=consumer({now:()=>clock});clock+=600000;
  assert.equal((await c.ingest(request())).status,503);
});
test('failed or uncertain nonce and review writes never report success',async()=>{
  const noRedis={async set(){throw Error('unknown');}};
  assert.equal((await consumer({redis:noRedis}).ingest(request())).status,503);
  let count=0;
  const storeFail={async set(){return ++count===1?'OK':Promise.reject(Error('unknown'));}};
  const r=await consumer({redis:storeFail}).ingest(request());
  assert.equal(r.status,503);assert.equal(count,2);
});
