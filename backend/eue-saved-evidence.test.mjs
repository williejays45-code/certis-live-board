import '../contracts/eue-saved-v1/contract.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSavedEvidenceConsumer} from './eue-saved-evidence.mjs';
import {sign} from './eue-peer.mjs';
const now=()=>Date.parse('2026-10-20T12:00:00.000Z'),key=Buffer.alloc(32,22);
const fixture=()=>JSON.parse(readFileSync(new URL('../contracts/eue-saved-v1/fixture.json',import.meta.url),'utf8'));
function body(){const f=fixture();return {schema:'eue-saved-evidence-delivery/1',request_id:f.packet.request_id,evidence_packet:f.packet,review:f.review};}
function req(value=body(),changes={},nonce='saved-test-nonce-0001'){
 const headers=sign(value,{key,issuer:'ENTRUS_CORE',audience:'CERTIS_SAVED_EVIDENCE_REVIEW',now,nonce});
 return new Request('https://example.invalid/unwired-saved-review',{method:'POST',headers:{'Content-Type':'application/json',...headers,...changes},body:JSON.stringify(value)});
}
function setup(map=new Map()){
 const redis={async set(k,v,options){assert.equal(options.NX,true);assert.equal(options.EX,k.includes(':nonce:')?600:300);if(map.has(k))return null;map.set(k,v);return 'OK';}};
 return {map,consumer:createSavedEvidenceConsumer({enabled:true,redis,key,now})};
}

test('default HOLD consumes no request body and touches no private or public store',async()=>{
 const response=await createSavedEvidenceConsumer().ingest(null);
 assert.equal(response.status,503);assert.equal((await response.json()).error,'SAVED_EVIDENCE_TRANSFERS_ON_HOLD');
 assert.throws(()=>createSavedEvidenceConsumer({enabled:'true'}));assert.throws(()=>createSavedEvidenceConsumer({enabled:true}));
});

test('authenticated stale saved evidence remains unscored HOLD and stores digest metadata only',async()=>{
 const s=setup(),response=await s.consumer.ingest(req());assert.equal(response.status,202);
 const v=await response.json();assert.equal(v.review_state,'HOLD');assert.equal(v.knowledge_state,'OUTDATED');
 assert.equal(v.interpretation_executed,false);assert.equal(v.assessment_complete,false);assert.equal(v.evidence_strength,null);
 assert.equal(v.score_model,null);assert.equal(v.action_authority,'NONE');assert.equal(v.financial_action_authority,'NONE');assert.equal(v.public_evidence_updated,false);
 assert.ok([...s.map.keys()].every(k=>k.startsWith('certis:eue:saved:v1:')));
 const stored=JSON.parse([...s.map.entries()].find(([k])=>k.includes(':review:'))[1]);
 assert.deepEqual(Object.keys(stored).sort(),['financial_action_authority','packet_sha256','report_sha256','review_sha256','state']);
 assert.equal(JSON.stringify(stored).includes(fixture().packet.evidence[0].sourceRecordId),false);
});

test('forgery, old trust scope, wrong issuer, purpose, expired signatures and durable replay are denied',async()=>{
 for(const change of [{'X-EUE-Signature':'0'.repeat(64)},{'X-EUE-Issuer':'LANDITRUS'},{'X-EUE-Audience':'CERTIS_EUE_REVIEW'},
  {'X-EUE-Purpose':'TRADE'},{'X-EUE-Timestamp':'1'}]){const s=setup();assert.equal((await s.consumer.ingest(req(undefined,change))).status,403);assert.equal(s.map.size,0);}
 const s=setup();assert.equal((await s.consumer.ingest(req())).status,202);
 assert.equal((await setup(s.map).consumer.ingest(req())).status,403);
 assert.equal((await s.consumer.ingest(req(body(),{},'saved-test-nonce-0002'))).status,409);
});

test('signed invented reasoning, numeric upgrades, authority or altered lineage never persist',async()=>{
 for(const change of [b=>b.review.interpretation_executed=true,b=>b.review.state='REVIEWABLE',b=>b.review.financial_action_authority='TRADE',
  b=>b.review.evidence_strength=100,b=>b.review.claims=[{price:'999'}],b=>b.review.lineage[0].payload_sha256='0'.repeat(64),
  b=>b.evidence_packet.evidence[0].numericFacts[0].factType='MARKET_VALUE']){
  const s=setup(),b=body();change(b);assert.equal((await s.consumer.ingest(req(b))).status,422);assert.equal(s.map.size,0);
 }
});

test('nonce and review store uncertainty have distinct explicit unknown outcomes',async()=>{
 for(const failedAt of [1,2]){let calls=0;
  const consumer=createSavedEvidenceConsumer({enabled:true,key,now,redis:{async set(){calls++;if(calls===failedAt)throw Error('TEST_STORE_OUTCOME_UNKNOWN');return 'OK';}}});
  const response=await consumer.ingest(req());assert.equal(response.status,503);
  assert.equal((await response.json()).error,failedAt===1?'SAVED_EVIDENCE_NONCE_OUTCOME_UNVERIFIED':'SAVED_EVIDENCE_STORE_OUTCOME_UNVERIFIED');
 }
});
