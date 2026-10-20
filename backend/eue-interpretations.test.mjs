import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateEue,createEueConsumer,prepareEueConsumer} from './eue-interpretations.mjs';
import {sign} from './eue-peer.mjs';
import {createApplication} from './application.mjs';
const now=()=>Date.parse('2026-10-20T12:00:00Z'),key=Buffer.alloc(32,3);
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/eue-interpretation.json',import.meta.url),'utf8'));
function setup(){const map=new Map(),redis={async set(k,v,{NX}){if(NX&&map.has(k))return null;map.set(k,v);return 'OK';}};return {map,consumer:createEueConsumer({redis,key,now})};}
function request(body=fixture(),changes={}){
 const headers=sign(body,{key,issuer:'ENTRUS_CORE',audience:'CERTIS_EUE_REVIEW',now});
 return new Request('https://certisintelligence.com/internal/eue/interpretations',{method:'POST',headers:{'Content-Type':'application/json',...headers,...changes},body:JSON.stringify(body)});
}
test('actual EUE result is unscored review with no public evidence or financial authority',async()=>{
 const s=setup(),body=fixture();assert.equal(validateEue(body,now()).claims[0].predicate,'parcel_id.exists');
 const app=createApplication({config:{origin:'https://certisintelligence.com',enabled:false},eue:s.consumer});
 const result=await app(request(body));assert.equal(result.status,202);const v=await result.json();
 assert.equal(v.financial_action_authority,'NONE');assert.equal(v.evidence_strength,null);assert.equal(v.assessment_complete,false);assert.equal(v.public_evidence_updated,false);
 assert.ok([...s.map.keys()].every(k=>k.startsWith('certis:eue:v1:')));
});
test('identity, scopes, forgery and replay are rejected',async()=>{
 for(const mutation of [{'X-EUE-Signature':'0'.repeat(64)},{'X-EUE-Issuer':'LANDITRUS'},{'X-EUE-Audience':'PUBLIC'},{'X-EUE-Purpose':'TRADE'},{'X-EUE-Timestamp':'1'}])assert.equal((await setup().consumer.ingest(request(undefined,mutation))).status,403);
 const s=setup(),r=request();assert.equal((await s.consumer.ingest(r.clone())).status,202);assert.equal((await s.consumer.ingest(r.clone())).status,403);
});
test('altered lineage, unsupported claims, stale evidence and authority fail the signed contract',async()=>{
 const changes=[v=>v.action_authority='TRADE',v=>v.interpretation_executed=false,v=>v.knowledge_state='KNOWN',v=>v.registry_digest='a'.repeat(64),v=>v.claims[0].predicate='price.forecast',v=>v.claims[0].evidence_ids=['EV-'+'b'.repeat(64)],v=>v.lineage[0].observed_at='2026-10-18T12:00:00Z',v=>v.lineage[0].authority_limitations=[],v=>v.data_classification='CUSTOMER',v=>v.evidence_strength=99,v=>v.evaluated_at='2026-10-21T12:00:00Z'];
 for(const mutate of changes){const body=fixture();mutate(body.interpretation);assert.throws(()=>validateEue(body,now()));assert.equal((await setup().consumer.ingest(request(body))).status,422);}
});
test('disabled configuration and unavailable durable store fail closed',async()=>{
 assert.equal(prepareEueConsumer({},undefined),undefined);assert.throws(()=>createEueConsumer({key}));
 const consumer=createEueConsumer({key,now,redis:{async set(){throw Error('STORE_DOWN');}}});assert.equal((await consumer.ingest(request())).status,403);
 const app=createApplication({config:{origin:'https://certisintelligence.com',enabled:false}});assert.equal((await app(request())).status,503);
});
