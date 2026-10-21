// Independent v2 consumer. No existing application/startup path imports this file.
import {createHash} from 'node:crypto';
import {validateActivation,validateDelivery,authenticateDelivery,digest} from '../contracts/eue-qualified-v2/contract.mjs';
import {readJson,reply} from './eue-peer.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export const nonceKey=(id,nonce)=>'certis:eue:qualified:v2:'+id+':nonce:'+hash(nonce);
export const reviewKey=(id,request)=>'certis:eue:qualified:v2:'+id+':review:'+hash(request);
export function createQualifiedInterpretationConsumer({enabled=false,activation,redis,key,now=Date.now}={}){
  if(typeof enabled!=='boolean')throw Error('EXPLICIT_BOOLEAN_ACTIVATION_REQUIRED');
  let trust;
  if(enabled){
    if(!redis||typeof redis.set!=='function'||!Buffer.isBuffer(key)||key.length!==48||typeof now!=='function')throw Error('V2_PRIVATE_KEY_AND_DURABLE_STORE_REQUIRED');
    trust=validateActivation(activation,now());key=Buffer.from(key);
  }
  return {async ingest(request){
    if(!enabled)return reply(503,{error:'V2_ACTIVATION_DISABLED_REAL_TRANSFERS_HOLD'});
    if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
    const observed=now();try{validateActivation(trust,observed);}catch{return reply(503,{error:'V2_ACTIVATION_EXPIRED'});}
    let body;try{body=await readJson(request,16384);}catch{return reply(400,{error:'V2_BODY_REJECTED'});}
    const auth=authenticateDelivery(request.headers,body,{key,now:observed});
    if(!auth)return reply(403,{error:'V2_AUTHENTICATION_REJECTED'});
    let value;try{value=validateDelivery(body,{activation:trust,now:observed});}catch{return reply(422,{error:'V2_CONTRACT_REJECTED'});}
    try{
      const claimed=await redis.set(nonceKey(trust.activation_id,auth.nonce),'1',{NX:true,EX:600});
      if(claimed!=='OK')return reply(403,{error:'V2_REPLAY_REJECTED'});
    }catch{return reply(503,{error:'V2_NONCE_OUTCOME_UNVERIFIED'});}
    const metadata={interpretation_sha256:digest(value),packet_sha256:value.packet_sha256,
      classification:'SYNTHETIC_FIXTURE',review_state:'REVIEWABLE',knowledge_state:'INFERRED',
      claims:value.claims,lineage:value.lineage,action_authority:'NONE',financial_action_authority:'NONE'};
    try{
      const written=await redis.set(reviewKey(trust.activation_id,body.request_id),JSON.stringify(metadata),{NX:true,EX:600});
      if(written!=='OK')return reply(409,{error:'V2_REVIEW_ALREADY_RECEIVED'});
      return reply(202,{schema:'certis-qualified-interpretation-receipt/2',activation_id:trust.activation_id,request_id:body.request_id,
        ...metadata,state:'INSUFFICIENT_EVIDENCE',interpretation_executed:true,assessment_complete:false,evidence_strength:null,
        score_model:null,public_evidence_updated:false,real_report_transfers:'HOLD'});
    }catch{return reply(503,{error:'V2_REVIEW_STORE_OUTCOME_UNVERIFIED'});}
  }};
}
