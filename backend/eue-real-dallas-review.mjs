// Distinct v3-style real-report review receiver; NOT imported by public server.
// No payment, valuation, transaction, public evidence or cross-product action.
// Production requires separately signed, report-specific approval and independent
// dedicated Core->CERTIS HMAC key plus durable nonce storage.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {canonical,readJson,reply,sign} from './eue-peer.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)
  &&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)&&x!=='0'.repeat(64);
const str=(x,max=128)=>typeof x==='string'&&x.length>0&&x.length<=max&&/^[\x20-\x7e]+$/.test(x);
const fresh=(x,now,age)=>typeof x==='string'&&x.endsWith('Z')
  &&Number.isFinite(Date.parse(x))&&Date.parse(x)<=now&&now-Date.parse(x)<=age;
const allowedLimitations=new Set([
  'APPRAISAL_RECORD_NOT_LEGAL_TITLE',
  'OWNER_FIELD_NOT_DEED_OWNERSHIP_DETERMINATION',
  'APPRAISAL_VALUE_NOT_INDEPENDENT_MARKET_VALUATION',
  'PREVIOUS_MARKET_VALUE_NOT_CURRENT_MARKET_VALUE',
  'RECORDED_DEED_DATE_FIELD_NOT_CHAIN_OF_TITLE',
  'SOURCE_MAY_CONTAIN_ERRORS_OR_OMISSIONS',
]);
const pin={
  rule:'13e44eed0ba6501a1e0dcc357a46b18d0b0b62e9288b6930008ce80e5c69ff2f',
  policy:'0075ecbc85f6d0c24ff1a4816c779fa2440fb941d89759c0dfb49f11cf08198d',
};
const reject=why=>{throw Error(why);};
export const nonceKey=(id,nonce)=>'certis:eue:real:1:'+id+':nonce:'+sha(nonce);
export const reviewKey=(id,request)=>'certis:eue:real:1:'+id+':review:'+sha(request);

export function validateRealPermit(permit,{key,now}){
  const keys=['body','signature'];
  if(!exact(permit,keys)||!Buffer.isBuffer(key)||key.length!==48
    ||!hex(permit.signature))reject('INDEPENDENT_CERTIS_RELEASE_APPROVAL_REQUIRED');
  const p=permit.body;
  if(!exact(p,['schema','issuer','activation_id','mode','authorized_report_sha256',
               'source_approval_sha256','issuer_scope','recipient_scope',
               'not_before','expires_at','public_evidence_updates',
               'billing_authority','financial_action_authority','action_authority'])
    ||p.schema!=='certis-eue-real-dallas-activation/1'
    ||p.issuer!=='CERTIS_RELEASE_AUTHORITY'
    ||!/^CERTIS-REAL-[a-f0-9]{32}$/.test(p.activation_id)
    ||p.mode!=='ONE_REPORT_READ_ONLY'
    ||!hex(p.authorized_report_sha256)||!hex(p.source_approval_sha256)
    ||p.issuer_scope!=='ENTRUS_CORE'
    ||p.recipient_scope!=='CERTIS_REAL_EUE_REVIEW'
    ||p.public_evidence_updates!==false
    ||p.billing_authority!=='NONE'
    ||p.financial_action_authority!=='NONE'
    ||p.action_authority!=='NONE')reject('REAL_CONSUMER_PERMIT_SCOPE_REJECTED');
  const start=Date.parse(p.not_before),end=Date.parse(p.expires_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>now||now>=end
    ||end-start>900000||end-start<=0)reject('REAL_CONSUMER_PERMIT_EXPIRED');
  const expected=createHmac('sha256',key).update(canonical(p)).digest('hex');
  if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(permit.signature,'hex')))
    reject('INDEPENDENT_CERTIS_APPROVAL_SIGNATURE_REJECTED');
  return structuredClone(p);
}

export function verifyRealEnvelope(headers,body,{key,now}){
  try{
    const h=headers instanceof Headers?headers:new Headers(headers);
    const nonce=h.get('X-EUE-Nonce'),stamp=h.get('X-EUE-Timestamp'),sig=h.get('X-EUE-Signature');
    if(!Buffer.isBuffer(key)||key.length!==48
      ||h.get('X-EUE-Issuer')!=='ENTRUS_CORE'
      ||h.get('X-EUE-Audience')!=='CERTIS_REAL_EUE_REVIEW'
      ||h.get('X-EUE-Purpose')!=='READ_ONLY_REVIEW'
      ||!/^[a-f0-9]{48}$/.test(nonce||'')
      ||!/^\d{1,12}$/.test(stamp||'')
      ||!hex(sig)||Math.abs(Math.floor(now/1000)-Number(stamp))>120)return null;
    const expected=sign(body,{key,issuer:'ENTRUS_CORE',
      audience:'CERTIS_REAL_EUE_REVIEW',nonce,now:()=>Number(stamp)*1000})['X-EUE-Signature'];
    if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(sig,'hex')))return null;
    return {nonce};
  }catch{return null;}
}

export function validateRealDelivery(b,{activation,now}){
  if(!exact(b,['schema','request_id','report_sha256','evidence_packet_sha256',
               'source_approval_sha256','producer','consumer','purpose',
               'data_classification','evaluated_at','interpretation','issued_at'])
    ||b.schema!=='eue-real-dallas-interpretation-delivery/1'
    ||!str(b.request_id)||!hex(b.report_sha256)||!hex(b.evidence_packet_sha256)
    ||!hex(b.source_approval_sha256)
    ||b.producer!=='ENTRUS_CORE'||b.consumer!=='CERTIS'
    ||b.purpose!=='READ_ONLY_REVIEW'||b.data_classification!=='OWNER_PRIVATE'
    ||b.report_sha256!==activation.authorized_report_sha256
    ||b.source_approval_sha256!==activation.source_approval_sha256
    ||!fresh(b.evaluated_at,now,120000)||!fresh(b.issued_at,now,120000)
    ||Date.parse(b.evaluated_at)>Date.parse(b.issued_at))reject('REAL_CONTRACT_REJECTED');
  const v=b.interpretation;
  if(!exact(v,['state','knowledge_state','interpretation_executed','claims',
               'lineage','rule_certification','policy_certification',
               'qualified_fields','action_authority','financial_action_authority'])
    ||v.state!=='REVIEWABLE'||v.knowledge_state!=='INFERRED'
    ||v.interpretation_executed!==true
    ||v.rule_certification!==pin.rule||v.policy_certification!==pin.policy
    ||v.action_authority!=='NONE'||v.financial_action_authority!=='NONE'
    ||!Array.isArray(v.qualified_fields)||v.qualified_fields.length!==1
    ||v.qualified_fields[0]!=='parcel_id'
    ||!Array.isArray(v.claims)||v.claims.length!==1
    ||!Array.isArray(v.lineage)||v.lineage.length!==1)reject('REAL_INTERPRETATION_SCOPE_REJECTED');
  const c=v.claims[0],l=v.lineage[0];
  if(!exact(c,['term_id','predicate','value','evidence_ids','state'])
    ||c.term_id!=='IDENTITY'||c.predicate!=='parcel_id.exists'
    ||c.value!=='true'||c.state!=='INFERRED'
    ||!Array.isArray(c.evidence_ids)||c.evidence_ids.length!==1
    ||!str(c.evidence_ids[0])
    ||!exact(l,['evidence_id','canonical_evidence_id','source_provider_id',
                 'source_record_id','payload_sha256','observed_at','authority_limitations'])
    ||l.canonical_evidence_id!==c.evidence_ids[0]
    ||!str(l.evidence_id)||!hex(l.payload_sha256)
    ||l.source_provider_id!=='dallas-cad-dcad-qual-001'
    ||!/^dcad:\d{4}:[A-Za-z0-9-]{4,80}$/.test(l.source_record_id||'')
    ||!fresh(l.observed_at,now,86400000)
    ||!Array.isArray(l.authority_limitations)
    ||l.authority_limitations.length>20
    ||!l.authority_limitations.every(item=>allowedLimitations.has(item))
    ||!l.authority_limitations.includes('APPRAISAL_RECORD_NOT_LEGAL_TITLE')
    ||!l.authority_limitations.includes('APPRAISAL_VALUE_NOT_INDEPENDENT_MARKET_VALUATION'))
    reject('REAL_APPROVED_SOURCE_LINEAGE_REJECTED');
  return structuredClone(b);
}

export function createRealDallasReviewConsumer({enabled=false,activation,redis,key,
                                               approvalKey,now=Date.now}={}){
  if(typeof enabled!=='boolean')throw Error('EXPLICIT_BOOLEAN_ACTIVATION_REQUIRED');
  let trusted;
  if(enabled){
    if(!redis||typeof redis.set!=='function'||!Buffer.isBuffer(key)
      ||key.length!==48||!Buffer.isBuffer(approvalKey)||approvalKey.length!==48
      ||key.equals(approvalKey)||typeof now!=='function')
      throw Error('SEPARATE_DELIVERY_TRUST_AND_REPLAY_STORE_REQUIRED');
    trusted=validateRealPermit(activation,{key:approvalKey,now:now()});
    key=Buffer.from(key);approvalKey=Buffer.from(approvalKey);
  }
  return {async ingest(req){
    if(!enabled)return reply(503,{error:'REAL_REPORT_REVIEW_NOT_ACTIVATED'});
    const seen=now();
    try{validateRealPermit(activation,{key:approvalKey,now:seen});}
    catch{return reply(503,{error:'REAL_REPORT_REVIEW_PERMIT_EXPIRED'});}
    if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
    let body;try{body=await readJson(req,16384);}catch{return reply(400,{error:'REAL_REPORT_BODY_REJECTED'});}
    const auth=verifyRealEnvelope(req.headers,body,{key,now:seen});
    if(!auth)return reply(403,{error:'REAL_REPORT_DELIVERY_AUTHENTICATION_REJECTED'});
    let accepted;try{accepted=validateRealDelivery(body,{activation:trusted,now:seen});}
    catch{return reply(422,{error:'REAL_REPORT_INTERPRETATION_REJECTED'});}
    try{
      const value=await redis.set(nonceKey(trusted.activation_id,auth.nonce),'1',{NX:true,EX:900});
      if(value!=='OK')return reply(403,{error:'REAL_REPORT_NONCE_REPLAY_REJECTED'});
    }catch{return reply(503,{error:'REAL_REPORT_NONCE_STORE_UNVERIFIED'});}
    // Persist only bounded interpretation hashes/decision limits. Never raw
    // property evidence, owner IDs, addresses, parcel details or source payload.
    const metadata={
      interpretation_sha256:sha(canonical(accepted.interpretation)),
      evidence_packet_sha256:accepted.evidence_packet_sha256,
      report_sha256:accepted.report_sha256,
      source_approval_sha256:accepted.source_approval_sha256,
      review_state:'REVIEWABLE',knowledge_state:'INFERRED',
      claim:'parcel_id.exists',action_authority:'NONE',
      financial_action_authority:'NONE',
    };
    try{
      const value=await redis.set(reviewKey(trusted.activation_id,accepted.request_id),
                                  JSON.stringify(metadata),{NX:true,EX:900});
      if(value!=='OK')return reply(409,{error:'REAL_REPORT_REVIEW_ALREADY_RECEIVED'});
      return reply(202,{schema:'certis-eue-real-dallas-review/1',
        request_id:accepted.request_id,...metadata,
        state:'INSUFFICIENT_EVIDENCE',assessment_complete:false,
        evidence_strength:null,score_model:null,public_evidence_updated:false,
        billing_authority:'NONE'});
    }catch{return reply(503,{error:'REAL_REPORT_REVIEW_STORE_UNVERIFIED'});}
  }};
}
