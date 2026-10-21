// New synthetic-only compatibility boundary. Accepted v1 files are not changed.
import {readFileSync} from 'node:fs';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {canonical,digest} from '../eue-saved-v1/contract.mjs';
export {canonical,digest};
export const spec=Object.freeze(JSON.parse(readFileSync(new URL('./contract.json',import.meta.url),'utf8')));
const fail=code=>{throw Error(code);};
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const same=(a,b)=>canonical(a)===canonical(b);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function stamp(x){
  if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x))fail('UTC_MILLISECOND_TIMESTAMP_REQUIRED');
  const t=Date.parse(x);if(!Number.isFinite(t)||new Date(t).toISOString()!==x)fail('INVALID_TIMESTAMP');return t;
}
export function validateActivation(a,now){
  if(!Number.isFinite(now)||!exact(a,['schema','activation_id','mode','profile_sha256','baseline_sha256','not_before','expires_at',
    'real_report_transfers','external_network_enabled','billing_enabled','report_generation_enabled','financial_action_authority','action_authority']))fail('STAGING_ACTIVATION_REQUIRED');
  if(a.schema!=='eue-interpretation-staging-activation/2'||a.mode!=='SYNTHETIC_LOOPBACK_STAGING'
    ||!/^TEST-ONLY-ACT-[a-f0-9]{32}$/.test(a.activation_id)||a.profile_sha256!==spec.profile_sha256||a.baseline_sha256!==spec.baseline_sha256
    ||a.real_report_transfers!=='HOLD'||a.action_authority!=='NONE'||a.financial_action_authority!=='NONE'
    ||['external_network_enabled','billing_enabled','report_generation_enabled'].some(k=>a[k]!==false))fail('STAGING_CAPABILITY_EXPANSION_REJECTED');
  const start=stamp(a.not_before),end=stamp(a.expires_at);
  if(end<=start||end-start>spec.activation_max_seconds*1000||now<start||now>=end)fail('STAGING_ACTIVATION_OUTSIDE_WINDOW');
  return structuredClone(a);
}
export function validateDelivery(b,{activation,now=Date.now()}={}){
  const a=validateActivation(activation,now);
  if(!exact(b,['schema','fixture_id','activation_id','request_id','producer','consumer','purpose','data_classification','evaluated_at','interpretation'])
    ||Buffer.byteLength(canonical(b))>spec.max_bytes||b.schema!=='eue-qualified-interpretation-delivery/2'
    ||b.fixture_id!==spec.fixture_id||b.activation_id!==a.activation_id||!/^TEST-ONLY-V2-[a-f0-9]{32}$/.test(b.request_id)
    ||b.producer!=='ENTRUS_CORE'||b.consumer!=='CERTIS'||b.purpose!=='READ_ONLY_REVIEW'||b.data_classification!=='SYNTHETIC_FIXTURE')fail('V2_SYNTHETIC_DELIVERY_REQUIRED');
  const evaluated=stamp(b.evaluated_at);
  if(evaluated>now||now-evaluated>spec.transport_window_seconds*1000||evaluated<stamp(a.not_before)||evaluated>=stamp(a.expires_at))fail('V2_DELIVERY_OUTSIDE_WINDOW');
  const v=b.interpretation;
  if(!exact(v,['schema','activation_mode','real_report_transfers','action_authority','financial_action_authority','state','knowledge_state',
    'interpretation_executed','claims','source_qualification','profile_sha256','baseline_sha256','accepted_v1_delivery_compatible','reason_code',
    'semantic_id','registry_digest','rule_certification','policy_certification','packet_sha256','report_sha256','qualified_fields','excluded_from_interpretation','lineage']))fail('V2_CLOSED_INTERPRETATION_REQUIRED');
  if(v.schema!=='eue-synthetic-qualified-profile-result/1'||v.activation_mode!=='SYNTHETIC_OFFLINE_ONLY'||v.real_report_transfers!=='HOLD'
    ||v.action_authority!=='NONE'||v.financial_action_authority!=='NONE'||v.state!=='REVIEWABLE'||v.knowledge_state!=='INFERRED'
    ||v.interpretation_executed!==true||v.accepted_v1_delivery_compatible!==false||v.source_qualification!=='SYNTHETIC_FIELD_VALIDATION_ONLY'
    ||v.reason_code!=='CERTIFIED_READ_ONLY_PROJECTION'||!hex(v.semantic_id)||!hex(v.packet_sha256)
    ||['profile_sha256','baseline_sha256','registry_digest','rule_certification','policy_certification','report_sha256'].some(k=>v[k]!==spec[k])
    ||!same(v.qualified_fields,['parcel_id'])||!same(v.excluded_from_interpretation,['numericFacts','findings']))fail('V2_QUALIFICATION_SCOPE_REJECTED');
  if(!Array.isArray(v.claims)||v.claims.length!==1||!Array.isArray(v.lineage)||v.lineage.length!==1)fail('V2_SINGLE_FIELD_SCOPE_REQUIRED');
  const c=v.claims[0],l=v.lineage[0];
  if(!exact(c,['term_id','predicate','value','evidence_ids','state'])||c.term_id!=='IDENTITY'||c.predicate!=='parcel_id.exists'
    ||c.value!=='true'||c.state!=='INFERRED'||!same(c.evidence_ids,[l?.evidence_id]))fail('V2_CLAIM_REJECTED');
  if(!exact(l,['evidence_id','producer_evidence_id','payload_sha256','source_provider_id','source_record_id','acquired_at','observed_at','authority_limitations'])
    ||!/^EV-[a-f0-9]{64}$/.test(l.evidence_id)||['producer_evidence_id','payload_sha256','source_provider_id','source_record_id'].some(k=>l[k]!==spec[k])
    ||!same(l.authority_limitations,spec.authority_limitations))fail('V2_LINEAGE_REJECTED');
  const acquired=stamp(l.acquired_at),observed=stamp(l.observed_at);
  if(observed>acquired||acquired>evaluated||now-observed>spec.evidence_max_age_seconds*1000)fail('V2_OUTDATED_OR_INVALID_OBSERVATION');
  return structuredClone(v);
}
function signature(body,{key,nonce,timestamp}){
  if(!Buffer.isBuffer(key)||key.length!==48)fail('V2_DEDICATED_KEY_REQUIRED');
  return createHmac('sha256',key).update(canonical({domain:spec.schema,issuer:spec.issuer,audience:spec.audience,
    purpose:'READ_ONLY_REVIEW',nonce,timestamp,request:body})).digest('hex');
}
export function signDelivery(body,{key,now=Date.now(),nonce=randomBytes(24).toString('hex')}={}){
  const timestamp=String(Math.floor(now/1000));
  return {'X-EUE-Issuer':spec.issuer,'X-EUE-Audience':spec.audience,'X-EUE-Purpose':'READ_ONLY_REVIEW',
    'X-EUE-Nonce':nonce,'X-EUE-Timestamp':timestamp,'X-EUE-Signature':signature(body,{key,nonce,timestamp})};
}
export function authenticateDelivery(headers,body,{key,now=Date.now()}={}){
  try{
    const h=new Headers(headers),nonce=h.get('X-EUE-Nonce'),timestamp=h.get('X-EUE-Timestamp'),sig=h.get('X-EUE-Signature');
    if(h.get('X-EUE-Issuer')!==spec.issuer||h.get('X-EUE-Audience')!==spec.audience||h.get('X-EUE-Purpose')!=='READ_ONLY_REVIEW'
      ||!/^\d{1,12}$/.test(timestamp||'')||!hex(sig)||!/^[a-f0-9]{48}$/.test(nonce||'')
      ||Math.abs(Math.floor(now/1000)-Number(timestamp))>spec.transport_window_seconds)return null;
    return timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signature(body,{key,nonce,timestamp}),'hex'))?{nonce}:null;
  }catch{return null;}
}
