// Pure, versioned saved-evidence validation. No fetching or product activation.
import {readFileSync} from 'node:fs';
import {createHash, timingSafeEqual} from 'node:crypto';
export const spec=JSON.parse(readFileSync(new URL('./contract.json',import.meta.url),'utf8'));
const fail=()=>{throw Error('SAVED_EVIDENCE_CONTRACT_REJECTED');};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys,optional=[])=>object(x)&&keys.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>keys.includes(k)||optional.includes(k));
const text=(x,max=128)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\u0000-\u001f\u007f]/u.test(x)&&!/[\uD800-\uDFFF]/u.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/u.test(x);
const id=x=>typeof x==='string'&&/^[-A-Za-z0-9_:]{1,128}$/u.test(x);
export function canonical(value){
  const order=x=>Array.isArray(x)?x.map(order):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,order(x[k])])):x;
  return JSON.stringify(order(value)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
function stamp(x){
  if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(x))fail();
  const t=Date.parse(x);
  if(!Number.isFinite(t)||new Date(t).toISOString().replace('.000Z','Z')!==x.replace('.000Z','Z'))fail();
  return t;
}
function record(e){
  if(!exact(e,spec.evidence_keys,spec.evidence_optional_keys))fail();
  if(!id(e.evidenceObjectId)||!text(e.sourceProviderId)||!text(e.sourceRecordId,256)||!spec.source_categories.includes(e.sourceCategory)
      ||!text(e.verificationState)||!text(e.recencyState)||e.serializationProfile!=='jcs-rfc8785+sha256:v1'
      ||!text(e.schemaVersionId)||!text(e.adapterVersion)||!hex(e.schemaHash)||!hex(e.payloadHash))fail();
  const acquired=stamp(e.acquiredAt);
  if(e.observedAt!==null&&stamp(e.observedAt)>acquired)fail();
  if(!Array.isArray(e.authorityLimitations)||e.authorityLimitations.length>20||!e.authorityLimitations.every(x=>text(x,300)))fail();
  if(!Array.isArray(e.findings)||e.findings.length>32)fail();
  for(const f of e.findings){
    if(!exact(f,['code','established'],['independence','inheritedFromProviderId'])||!text(f.code)||typeof f.established!=='boolean'
        ||(Object.hasOwn(f,'independence')&&!spec.independence.includes(f.independence))
        ||(Object.hasOwn(f,'inheritedFromProviderId')&&!text(f.inheritedFromProviderId)))fail();
  }
  if(Object.hasOwn(e,'numericFacts')){
    if(!Array.isArray(e.numericFacts)||e.numericFacts.length>24)fail();
    for(const n of e.numericFacts)if(!exact(n,spec.numeric_keys)||!spec.fact_types.includes(n.factType)||!text(n.label,128)
      ||!text(n.value,128)||!spec.units.includes(n.unit)||!spec.period_types.includes(n.periodType)||!text(n.periodValue,64)
      ||!spec.derivations.includes(n.derivation))fail();
  }
  if(Object.hasOwn(e,'temporal')&&(!exact(e.temporal,[],spec.temporal_keys)||!Object.values(e.temporal).every(x=>text(x,64))))fail();
}
export function validatePacket(value,now){
  if(!Number.isFinite(now)||!exact(value,spec.packet_keys)||Buffer.byteLength(canonical(value))>spec.max_packet_bytes)fail();
  if(value.schema!=='landitrus-saved-evidence/1'||value.producer!=='LANDITRUS'||value.consumer!=='ENTRUS_CORE'
      ||value.purpose!=='READ_ONLY_REVIEW'||value.data_classification!=='OWNER_PRIVATE'||!id(value.request_id))fail();
  const issued=stamp(value.issued_at);
  if(issued>now||now-issued>spec.transport_window_seconds*1000)fail();
  const r=value.report,a=value.authorization;
  if(!exact(r,['report_id','report_sha256','generated_at'])||typeof r.report_id!=='string'||!/^[-A-Za-z0-9]{8,128}$/u.test(r.report_id)||!hex(r.report_sha256)||stamp(r.generated_at)>issued)fail();
  if(!exact(a,['purpose','consumer','report_sha256','request_id'])||a.purpose!=='READ_ONLY_REVIEW'||a.consumer!=='CERTIS'
      ||a.report_sha256!==r.report_sha256||a.request_id!==value.request_id)fail();
  if(!Array.isArray(value.evidence)||value.evidence.length>32||!Array.isArray(value.acquisition)||value.acquisition.length>32)fail();
  const ids=new Set();
  for(const e of value.evidence){record(e);if(ids.has(e.evidenceObjectId)||stamp(e.acquiredAt)>stamp(r.generated_at))fail();ids.add(e.evidenceObjectId);}
  const sources=new Set();
  for(const s of value.acquisition){
    if(!exact(s,['sourceId','required','status','evidenceCount'])||!text(s.sourceId)||sources.has(s.sourceId)||typeof s.required!=='boolean'
        ||!['COMPLETE','UNAVAILABLE'].includes(s.status)||!Number.isInteger(s.evidenceCount)||s.evidenceCount<0||s.evidenceCount>32)fail();
    sources.add(s.sourceId);
  }
  return structuredClone(value);
}
export function projectExport(exported,issuedAt){
  if(!exact(exported,['schema','report_id','report_sha256','generated_at','authorization','evidence','acquisition','action_authority','interpretation','limitation'])
      ||exported.schema!=='landitrus-owned-evidence/1'||exported.action_authority!=='NONE'||exported.interpretation!=='NOT_EXECUTED')fail();
  // The authenticated owner exporter retains the full original. Only these
  // enumerated fields can enter this separate consumer contract.
  const project=(o,keys)=>{if(!object(o))fail();return Object.fromEntries(keys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,structuredClone(o[k])]));};
  if(!Array.isArray(exported.evidence)||!Array.isArray(exported.acquisition))fail();
  const packet={schema:'landitrus-saved-evidence/1',request_id:exported.authorization?.request_id,
    producer:'LANDITRUS',consumer:'ENTRUS_CORE',purpose:'READ_ONLY_REVIEW',data_classification:'OWNER_PRIVATE',issued_at:issuedAt,
    report:{report_id:exported.report_id,report_sha256:exported.report_sha256,generated_at:exported.generated_at},
    authorization:structuredClone(exported.authorization),
    evidence:exported.evidence.map(e=>project(e,[...spec.evidence_keys,...spec.evidence_optional_keys])),
    acquisition:exported.acquisition.map(s=>project(s,['sourceId','required','status','evidenceCount']))};
  return validatePacket(packet,stamp(issuedAt));
}
export function reviewPacket(packet,evaluatedAt){
  const now=stamp(evaluatedAt),p=validatePacket(packet,now);
  const reasons=['SAVED_SOURCE_CERTIFICATION_REQUIRED'];
  if(!p.evidence.length)reasons.push('NO_EVIDENCE');
  if(p.evidence.some(e=>e.observedAt===null))reasons.push('OBSERVATION_TIME_UNKNOWN');
  const outdated=p.evidence.some(e=>now-stamp(e.acquiredAt)>spec.evidence_max_age_seconds*1000
    ||(e.observedAt!==null&&now-stamp(e.observedAt)>spec.evidence_max_age_seconds*1000));
  if(outdated)reasons.push('EVIDENCE_OUTDATED');
  if(p.acquisition.some(s=>s.required&&s.status!=='COMPLETE'))reasons.push('REQUIRED_SOURCE_UNAVAILABLE');
  return {schema:'eue-saved-evidence-review/1',request_id:p.request_id,producer:'ENTRUS_CORE',consumer:'CERTIS',purpose:'READ_ONLY_REVIEW',
    data_classification:'OWNER_PRIVATE',report_id:p.report.report_id,report_sha256:p.report.report_sha256,evidence_packet_sha256:digest(p),
    evaluated_at:evaluatedAt,state:'HOLD',knowledge_state:outdated?'OUTDATED':'UNKNOWN',reason_codes:reasons,
    interpretation_executed:false,claims:[],source_qualification:'UNREVIEWED',payload_integrity:'REFERENCED_NOT_FETCHED',
    action_authority:'NONE',financial_action_authority:'NONE',
    lineage:p.evidence.map(e=>({evidence_id:e.evidenceObjectId,source_provider_id:e.sourceProviderId,source_record_id:e.sourceRecordId,
      payload_sha256:e.payloadHash,acquired_at:e.acquiredAt,observed_at:e.observedAt,authority_limitations:structuredClone(e.authorityLimitations)}))};
}
export function validateDelivery(body,now){
  if(!exact(body,['schema','request_id','evidence_packet','review'])||body.schema!=='eue-saved-evidence-delivery/1'
      ||body.request_id!==body.evidence_packet?.request_id||Buffer.byteLength(canonical(body))>spec.max_bytes)fail();
  validatePacket(body.evidence_packet,now);
  const evaluated=stamp(body.review?.evaluated_at);
  if(evaluated>now||now-evaluated>spec.transport_window_seconds*1000||evaluated<stamp(body.evidence_packet.issued_at))fail();
  const expected=reviewPacket(body.evidence_packet,body.review.evaluated_at);
  if(canonical(expected)!==canonical(body.review))fail();
  return structuredClone(body.review);
}
export function authenticateSavedSignature(headers,body,{key,issuer,audience,now,sign}){
  try{
    if(!Buffer.isBuffer(key)||key.length<32||typeof sign!=='function')return false;
    const h=new Headers(headers),nonce=h.get('X-EUE-Nonce'),stamp=h.get('X-EUE-Timestamp'),signature=h.get('X-EUE-Signature');
    if(h.get('X-EUE-Issuer')!==issuer||h.get('X-EUE-Audience')!==audience||h.get('X-EUE-Purpose')!=='READ_ONLY_REVIEW'
      ||!/^[\x21-\x7e]{16,128}$/u.test(nonce||'')||!/^\d{1,12}$/u.test(stamp||'')||!hex(signature)
      ||Math.abs(Math.floor(now/1000)-Number(stamp))>spec.transport_window_seconds)return false;
    const expected=sign(body,{key,issuer,audience,nonce,now:()=>Number(stamp)*1000})['X-EUE-Signature'];
    if(!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return false;
    // Store errors must retain an unknown-outcome category at the caller.
    return {issuer,nonce};
  }catch{return false;}
}
