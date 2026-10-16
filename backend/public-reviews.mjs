import {validateModelExplanation} from './model-explanation.mjs';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readCookie,SESSION_COOKIE} from './security.mjs';
import {ENQUEUE,CLAIM,PREFIX as ENGINE_PREFIX} from './engine-requests.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-f0-9]{48}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const DOMAINS={property:['dallas-matrix','landitrus-dcad'],business:['census-cbp-2023'],traditional_finance:['treasury-2026','bls-cpi']};
export const PREFIX='certis:bridge:v1:public-review:',ORIGIN='https://certisintelligence.com';
// Select the oldest eligible request across both bounded queues atomically.
// Each legacy claim endpoint stays compatible during the worker rollout.
export const CLAIM_NEXT=`-- CERTIS_PUBLIC_WORK_CLAIM_V1
local chosen=nil;local chosenKey=nil;local chosenQueue=nil;
for n=1,2 do
 for i=1,8 do
  local id=redis.call('LINDEX',KEYS[n],0);if not id then break end;
  local key=ARGV[n]..id;local raw=redis.call('GET',key);local job=nil;
  if raw then job=cjson.decode(raw) end;
  if job and job.status=='pending' and job.expiresAt>tonumber(ARGV[3])+80000 then
   if not chosen or job.createdAt<chosen.createdAt then chosen=job;chosenKey=key;chosenQueue=KEYS[n] end;
   break;
  else redis.call('LPOP',KEYS[n]) end;
 end;
end;
if not chosen then return false end;
redis.call('LPOP',chosenQueue);chosen.status='running';chosen.lease=ARGV[4];chosen.claimedAt=tonumber(ARGV[3]);
redis.call('SET',chosenKey,cjson.encode(chosen),'PX',math.floor(chosen.expiresAt-tonumber(ARGV[3])));
return cjson.encode(chosen)`;
const root=new URL('./public-snapshot/',import.meta.url);
const manifestRaw=readFileSync(new URL('manifest.json',root));
export const MANIFEST_SHA=hash(manifestRaw);
export const snapshots=Object.fromEntries(Object.entries(JSON.parse(manifestRaw).snapshots).map(([source,digest])=>{
 if(!sha(digest))throw Error('INVALID_SNAPSHOT_PIN');
 const raw=readFileSync(new URL(digest+'.json',root));if(hash(raw)!==digest)throw Error('SNAPSHOT_CHANGED');
 const value=JSON.parse(raw);if(value.source_id!==source||value.private_context!==false||value.financial_action_authority!=='none')throw Error('SNAPSHOT_SCOPE');
 return [source,value];
}));
export const FINISH=`-- CERTIS_PUBLIC_REVIEW_FINISH_V1
local raw=redis.call('GET',KEYS[1]);if not raw then return 0 end;local job=cjson.decode(raw);
if job.status~='running' or job.lease~=ARGV[1] or job.expiresAt<=tonumber(ARGV[2]) then return 0 end;
job.status='complete';job.completedAt=tonumber(ARGV[2]);job.result=ARGV[3];job.lease=nil;
redis.call('SET',KEYS[1],cjson.encode(job),'PX',math.floor(job.expiresAt-tonumber(ARGV[2])));
redis.call('LPUSH',KEYS[2],ARGV[3]);redis.call('LTRIM',KEYS[2],0,19);redis.call('EXPIRE',KEYS[2],2592000);return 1`;
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff'}});
const error=(status,code)=>reply(status,{error:{code}});
async function read(request,max=16384){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('JSON_REQUIRED');
 const reader=request.body?.getReader();if(!reader)throw Error('EMPTY');let count=0;const parts=[];
 for(;;){const part=await reader.read();if(part.done)break;count+=part.value.length;if(count>max){await reader.cancel();throw Error('TOO_LARGE');}parts.push(part.value);}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
}
function freshness(source,now){
 if(Date.parse(source.retrieved_at)>now+5000)return 'future_retrieval';
 if(source.observation_date===null)return 'observation_date_unknown';
 if(['dallas-matrix','census-cbp-2023'].includes(source.source_id))return 'historical_context_only';
 const age=now-Date.parse(source.observation_date+'T00:00:00Z');
 if(age<0)return 'future_observation';
 if(age>(source.source_id==='treasury-2026'?8:76)*86400000)return 'stale';
 if(now-Date.parse(source.retrieved_at)>86400000)return 'refresh_due';return 'within_review_window';
}
export function projectReview(value,job,now){
 const model=value?.schema==='certis-public-review-export/2'?value.model_explanation:undefined;
 if(model!==undefined){if(!exact(value,['schema','runtime_version','domain','case_key','case_id','request_id','generated_at','manifest_sha256','evidence_ids','reasoning_passed','financial_action_authority','private_context','external_model_calls','model_explanation'])||!['business','traditional_finance'].includes(value.domain)||value.external_model_calls!==model.provider_called)throw Error('REVIEW_SCOPE');value={...value,schema:'certis-public-review-export/1',external_model_calls:false};delete value.model_explanation;}

 if(!exact(value,['schema','runtime_version','domain','case_key','case_id','request_id','generated_at','manifest_sha256','evidence_ids','reasoning_passed','financial_action_authority','private_context','external_model_calls'])||value.schema!=='certis-public-review-export/1'||value.runtime_version!=='3.24.0'||value.domain!==job.domain||value.case_key!==job.caseKey||!/^case-[a-f0-9]{32}$/.test(value.case_id)||value.request_id!=='web-'+job.id||value.manifest_sha256!==MANIFEST_SHA||value.reasoning_passed!==true||value.financial_action_authority!=='none'||value.private_context!==false||value.external_model_calls!==false)throw Error('REVIEW_SCOPE');
 const time=Date.parse(value.generated_at);if(typeof value.generated_at!=='string'||!Number.isFinite(time)||time<job.claimedAt||time>now+5000||now-time>210000)throw Error('REVIEW_TIME');
 const selected=DOMAINS[job.domain].map(k=>snapshots[k]);
 const expected=selected.flatMap(s=>s.observations.map(o=>o.evidence_id)).sort();
 if(!Array.isArray(value.evidence_ids)||JSON.stringify([...value.evidence_ids].sort())!==JSON.stringify(expected))throw Error('REVIEW_ATTRIBUTION');
 const sources=selected.map(s=>({source_id:s.source_id,source_url:s.source_url,retrieved_at:s.retrieved_at,observation_date:s.observation_date,raw_sha256:s.raw_sha256,limitations:s.limitations,freshness:freshness(s,now)}));
 return {schema:'certis-public-review/1',domain:job.domain,case_id:value.case_id,request_id:job.id,generated_at:value.generated_at,engine_version:'3.24.0',assessment_state:'not_supported',evidence_strength:null,evidence_threshold:75,
 observations:selected.flatMap(s=>s.observations.map(o=>({...o,source_id:s.source_id,freshness:freshness(s,now)}))),sources,
 inferences:[],contrary_evidence:[],contradiction_check:'not_independently_reconciled',
 missing_evidence:['Independent corroboration and a defensible assessment score remain unestablished.',...sources.flatMap(s=>s.limitations)],
 next_watch:['Refresh sources when due and acquire independent evidence before drawing a financial conclusion.'],
 evaluation_scope:'Reference and authority checks passed; this does not establish truth, independence, or a 75-point assessment.',
 financial_action_authority:'none',provider_called:model?model.provider_called:false,private_context:false,...(model?{model_explanation:validateModelExplanation(model,expected)}:{})};
}
export function createPublicReviews({redis,store,tokenSha256,now=Date.now,makeId=()=>randomBytes(24).toString('hex')}){
 if(!redis||!store||!sha(tokenSha256))throw Error('REVIEW_CONFIGURATION');
 return {
 async browser(request){try{
  const url=new URL(request.url);if(url.origin!==ORIGIN)return error(403,'ORIGIN_DENIED');
  if(!['GET','POST'].includes(request.method))return error(405,'METHOD_NOT_ALLOWED');
  if(request.method==='POST'&&request.headers.get('origin')!==ORIGIN)return error(403,'ORIGIN_DENIED');
  const p=await store.session(readCookie(request,SESSION_COOKIE));if(!p||typeof p.principalId!=='string')return error(401,'AUTHENTICATION_REQUIRED');
  const owner=hash(p.principalId);
  if(!await store.limit('review-'+request.method+':'+owner,request.method==='POST'?6:180))return error(429,'RATE_LIMITED');
  if(request.method==='GET'){
   if(url.searchParams.get('action')==='cases')return reply(200,{reviews:(await redis.lRange(PREFIX+'history:'+owner,0,19)).map(raw=>JSON.parse(raw)),retention:'Most recent 20 reviews for 30 days after the latest completed review. Download a copy for longer retention.'});
   const requestId=url.searchParams.get('request_id');if(!id(requestId))return error(404,'REQUEST_NOT_FOUND');
   const raw=await redis.get(PREFIX+requestId);if(!raw)return error(410,'ENGINE_REQUEST_EXPIRED');const job=JSON.parse(raw);
   if(job.owner!==owner)return error(404,'REQUEST_NOT_FOUND');if(job.expiresAt<=now())return error(410,'ENGINE_REQUEST_EXPIRED');
   return reply(200,{status:job.status,request_id:job.id,expires_at:new Date(job.expiresAt).toISOString(),...(job.status==='complete'?{result:JSON.parse(job.result)}:{})});
  }
  const input=await read(request,256);
  if(!exact(input,['domain','requested_at'])||!Object.hasOwn(DOMAINS,input.domain)||typeof input.requested_at!=='string'||!Number.isFinite(Date.parse(input.requested_at))||Math.abs(Date.parse(input.requested_at)-now())>300000)return error(400,'INVALID_REQUEST');
  const requestId=makeId(),createdAt=now();if(!id(requestId))throw Error('ID_INVALID');
  const job={id:requestId,owner,caseKey:hash('public-review:'+owner+':'+input.domain),domain:input.domain,status:'pending',createdAt,expiresAt:createdAt+210000};
  const accepted=await redis.eval(ENQUEUE,{keys:[PREFIX+'queue',PREFIX+'owner:'+owner,PREFIX+requestId],arguments:[requestId,JSON.stringify(job),String(createdAt),PREFIX]});
  if(!id(accepted))return error(503,'QUEUE_UNAVAILABLE');
  const saved=JSON.parse(await redis.get(PREFIX+accepted));if(saved.domain!==input.domain)return error(409,'ANOTHER_REVIEW_PENDING');
  return reply(202,{status:saved.status,request_id:accepted,expires_at:new Date(saved.expiresAt).toISOString(),poll_after_seconds:3});
 }catch{return error(503,'PUBLIC_REVIEW_UNAVAILABLE');}},
 async machine(request){try{
  if(request.method!=='POST')return error(405,'METHOD_NOT_ALLOWED');
  const token=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(token)||!timingSafeEqual(createHash('sha256').update(token.slice(7)).digest(),Buffer.from(tokenSha256,'hex')))return error(401,'MACHINE_AUTHENTICATION_REQUIRED');
  const path=new URL(request.url).pathname;
  if(path==='/internal/public-work/claim'){
   if(!exact(await read(request,64),[]))return error(400,'INVALID_CLAIM');
   const lease=makeId();if(!id(lease))throw Error('INVALID_LEASE');
   const raw=await redis.eval(CLAIM_NEXT,{keys:[ENGINE_PREFIX+'queue',PREFIX+'queue'],arguments:[ENGINE_PREFIX,PREFIX,String(now()),lease]});
   if(!raw)return reply(200,{status:'idle'});const j=JSON.parse(raw);
   const identity={id:j.id,lease,created_at:new Date(j.createdAt).toISOString(),claimed_at:new Date(j.claimedAt).toISOString(),expires_at:new Date(j.expiresAt).toISOString()};
   if(j.domain&&Object.hasOwn(DOMAINS,j.domain))return reply(200,{status:'claimed',job:{...identity,domain:j.domain,case_key:j.caseKey,operation:'public_source_review'}});
   if(j.operation==='public_btc_evidence_check'&&j.asset==='btc')return reply(200,{status:'claimed',job:{...identity,operation:j.operation,asset:j.asset}});
   throw Error('INVALID_WORK_OPERATION');
  }
  if(path==='/internal/public-review/claim'){
   if(!exact(await read(request,64),[]))return error(400,'INVALID_CLAIM');
   const lease=makeId();if(!id(lease))throw Error('INVALID_LEASE');
   const raw=await redis.eval(CLAIM,{keys:[PREFIX+'queue'],arguments:[PREFIX,String(now()),lease]});if(!raw)return reply(200,{status:'idle'});const j=JSON.parse(raw);
   return reply(200,{status:'claimed',job:{id:j.id,lease,domain:j.domain,case_key:j.caseKey,operation:'public_source_review',created_at:new Date(j.createdAt).toISOString(),claimed_at:new Date(j.claimedAt).toISOString(),expires_at:new Date(j.expiresAt).toISOString()}});
  }
  if(path!=='/internal/public-review/complete')return error(404,'NOT_FOUND');
  const input=await read(request);if(!exact(input,['id','lease','result'])||!id(input.id)||!id(input.lease))return error(400,'INVALID_COMPLETION');
  const raw=await redis.get(PREFIX+input.id);if(!raw)return error(410,'ENGINE_REQUEST_EXPIRED');const job=JSON.parse(raw);
  if(job.status!=='running'||job.lease!==input.lease||job.expiresAt<=now())return error(409,'ENGINE_REQUEST_REPLAYED_OR_EXPIRED');
  const result=projectReview(input.result,job,now());
  const saved=await redis.eval(FINISH,{keys:[PREFIX+job.id,PREFIX+'history:'+job.owner],arguments:[input.lease,String(now()),JSON.stringify(result)]});
  return saved===1?reply(202,{status:'PUBLIC_REVIEW_COMPLETED'}):error(409,'ENGINE_REQUEST_REPLAYED_OR_EXPIRED');
 }catch{return error(400,'PUBLIC_REVIEW_REJECTED');}}
 };
}
