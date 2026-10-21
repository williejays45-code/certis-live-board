// Private synthetic review inventory; never enters public financial evidence.
import {createHash} from 'node:crypto';
import {canonical,privateKey,verifier,readJson,reply,FIXTURE} from './eue-peer.mjs';
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const pins={registry:'7e84937a4f1e17a03876e2ff89b4b1fe370a5bf654f96f7447e5db0a0e5dc1dc',rule:'13e44eed0ba6501a1e0dcc357a46b18d0b0b62e9288b6930008ce80e5c69ff2f',policy:'0075ecbc85f6d0c24ff1a4816c779fa2440fb941d89759c0dfb49f11cf08198d'};
const hash=x=>createHash('sha256').update(x).digest('hex');
function fresh(x,now,age){return typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))&&Date.parse(x)<=now&&now-Date.parse(x)<=age;}
export function validateEue(body,now=Date.now()){
  const fail=()=>{throw Error('INVALID_EUE_INTERPRETATION');};
  if(!exact(body,['fixture_id','request_id','interpretation'])||body.fixture_id!==FIXTURE||!/^[-A-Za-z0-9_:]{1,128}$/.test(body.request_id||''))fail();
  const v=body.interpretation;
  if(!exact(v,['schema','fixture_id','request_id','producer','consumer','purpose','action_authority','data_classification','evaluated_at','interpretation_executed','knowledge_state','claims','lineage','semantic_id','registry_digest','rule_certification','policy_certification','evidence_packet_sha256','state','reason_code']))fail();
  if(v.schema!=='eue-interpretation/1'||v.fixture_id!==body.fixture_id||v.request_id!==body.request_id||v.producer!=='ENTRUS_CORE'||v.consumer!=='CERTIS'||v.purpose!=='READ_ONLY_REVIEW'||v.action_authority!=='NONE'||v.data_classification!=='SYNTHETIC'||v.interpretation_executed!==true||v.knowledge_state!=='INFERRED'||v.state!=='REVIEWABLE'||v.reason_code!=='CERTIFIED_READ_ONLY_PROJECTION'||!fresh(v.evaluated_at,now,120000)||!hex(v.semantic_id)||!hex(v.evidence_packet_sha256)||v.registry_digest!==pins.registry||v.rule_certification!==pins.rule||v.policy_certification!==pins.policy)fail();
  if(!Array.isArray(v.claims)||v.claims.length!==1||!Array.isArray(v.lineage)||v.lineage.length!==1)fail();
  const c=v.claims[0],l=v.lineage[0];
  if(!exact(c,['term_id','predicate','value','evidence_ids','state'])||c.term_id!=='IDENTITY'||c.predicate!=='parcel_id.exists'||c.value!=='true'||c.state!=='INFERRED'||!Array.isArray(c.evidence_ids)||c.evidence_ids.length!==1)fail();
  if(!exact(l,['evidence_id','producer_evidence_id','payload_sha256','source_provider_id','source_record_id','county','acquired_at','observed_at','authority_limitations'])||!/^EV-[a-f0-9]{64}$/.test(l.evidence_id)||!hex(l.payload_sha256)||c.evidence_ids[0]!==l.evidence_id||l.producer_evidence_id!=='SYNTH-EO-001'||l.source_provider_id!=='SYNTHETIC-TEST-ONLY'||l.source_record_id!=='TEST-ONLY-PARCEL-001'||l.county!=='TX-DALLAS'||!fresh(l.acquired_at,now,86400000)||!fresh(l.observed_at,now,86400000)||Date.parse(l.observed_at)>Date.parse(l.acquired_at)||Date.parse(l.acquired_at)>Date.parse(v.evaluated_at)||!Array.isArray(l.authority_limitations)||!l.authority_limitations.includes('NOT_REAL_PROPERTY')||!l.authority_limitations.every(x=>typeof x==='string'&&x.length<=300))fail();
  return structuredClone(v);
}
export function createEueConsumer({redis,key,now=Date.now}){
  if(!redis)throw Error('DURABLE_REPLAY_STORE_REQUIRED');
  const verify=verifier({key,issuer:'ENTRUS_CORE',audience:'CERTIS_EUE_REVIEW',now,
    claimNonce:async(issuer,nonce)=>(await redis.set('certis:eue:v1:nonce:'+hash(issuer+':'+nonce),'1',{NX:true,EX:600}))==='OK'});
  return {async ingest(request){
    if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
    let body;try{body=await readJson(request);}catch{return reply(400,{error:'INVALID_REQUEST'});}
    if(!await verify(request.headers,body))return reply(403,{error:'EUE_AUTHENTICATION_SCOPE_OR_REPLAY_REJECTED'});
    let value;try{value=validateEue(body,now());}catch{return reply(422,{error:'EUE_EVIDENCE_REJECTED'});}
    const digest=hash(canonical(value));
    try{
      const stored=await redis.set('certis:eue:v1:review:'+hash(body.request_id),JSON.stringify({digest,value}),{NX:true,EX:300});
      if(stored!=='OK')return reply(409,{error:'INTERPRETATION_ALREADY_RECEIVED'});
      return reply(202,{schema:'certis-eue-review/1',request_id:body.request_id,
        interpretation_sha256:digest,evidence_packet_sha256:value.evidence_packet_sha256,
        state:'INSUFFICIENT_EVIDENCE',assessment_complete:false,evidence_strength:null,
        score_model:null,action_authority:'NONE',financial_action_authority:'NONE',
        classification:'SYNTHETIC',public_evidence_updated:false});
    }catch{return reply(503,{error:'EUE_STORE_OUTCOME_UNVERIFIED'});}
  }};
}
export function prepareEueConsumer(environment,redis){
  if(environment.CERTIS_EUE_ENABLED!=='true')return undefined;
  if(environment.CERTIS_EUE_ENVIRONMENT!=='NONPRODUCTION')throw Error('NONPRODUCTION_EUE_ONLY');
  return createEueConsumer({redis,key:privateKey(environment.CERTIS_EUE_CORE_KEY_FILE)});
}
