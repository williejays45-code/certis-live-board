// Private saved-evidence review only. No application route or env activation.
import {createHash} from 'node:crypto';
import {validateDelivery,authenticateSavedSignature,digest} from '../contracts/eue-saved-v1/contract.mjs';
import {sign,readJson,reply} from './eue-peer.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function createSavedEvidenceConsumer({enabled=false,redis,key,now=Date.now}={}){
  if(typeof enabled!=='boolean')throw Error('EXPLICIT_BOOLEAN_ACTIVATION_REQUIRED');
  if(enabled&&(!redis||typeof redis.set!=='function'||!Buffer.isBuffer(key)||key.length<32||typeof now!=='function'))throw Error('SCOPED_KEY_AND_DURABLE_STORE_REQUIRED');
  return {async ingest(request){
    if(!enabled)return reply(503,{error:'SAVED_EVIDENCE_TRANSFERS_ON_HOLD'});
    if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
    let body;try{body=await readJson(request,65536);}catch{return reply(400,{error:'SAVED_EVIDENCE_BODY_REJECTED'});}
    const observed=now();
    // Validate the full contract before claiming a nonce or storing a review.
    // Authentication still precedes admission; shape alone grants no trust.
    let review;try{review=validateDelivery(body,observed);}catch{return reply(422,{error:'SAVED_EVIDENCE_CONTRACT_REJECTED'});}
    const authenticated=authenticateSavedSignature(request.headers,body,{key,issuer:'ENTRUS_CORE',audience:'CERTIS_SAVED_EVIDENCE_REVIEW',now:observed,sign});
    if(!authenticated)return reply(403,{error:'SAVED_EVIDENCE_AUTH_SCOPE_REPLAY_OR_STORE_REJECTED'});
    try{
      const claim=await redis.set('certis:eue:saved:v1:nonce:'+hash(authenticated.issuer+':'+authenticated.nonce),'1',{NX:true,EX:600});
      if(claim!=='OK')return reply(403,{error:'SAVED_EVIDENCE_REPLAY_REJECTED'});
    }catch{return reply(503,{error:'SAVED_EVIDENCE_NONCE_OUTCOME_UNVERIFIED'});}
    const metadata={review_sha256:digest(review),packet_sha256:review.evidence_packet_sha256,report_sha256:review.report_sha256,
      state:'HOLD',financial_action_authority:'NONE'};
    try{
      const written=await redis.set('certis:eue:saved:v1:review:'+hash(body.request_id),JSON.stringify(metadata),{NX:true,EX:300});
      if(written!=='OK')return reply(409,{error:'SAVED_EVIDENCE_REVIEW_ALREADY_RECEIVED'});
      return reply(202,{schema:'certis-saved-evidence-review/1',request_id:body.request_id,...metadata,
        state:'INSUFFICIENT_EVIDENCE',review_state:'HOLD',knowledge_state:review.knowledge_state,reason_codes:review.reason_codes,
        interpretation_executed:false,assessment_complete:false,evidence_strength:null,score_model:null,
        action_authority:'NONE',public_evidence_updated:false});
    }catch{return reply(503,{error:'SAVED_EVIDENCE_STORE_OUTCOME_UNVERIFIED'});}
  }};
}
