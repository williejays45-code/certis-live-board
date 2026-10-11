import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {readCookie,SESSION_COOKIE} from './security.mjs';
import {routeQuestion,projectEngine,areaGaps,validateEngineExport} from './engine-evidence.mjs';
import {unavailable,validateAssessment} from '../bridge/query.mjs';

export const PREFIX='certis:bridge:v1:engine-request:';
const QUEUE=PREFIX+'queue', TTL=210000, ORIGIN='https://certisintelligence.com';
const hash=s=>createHash('sha256').update(s).digest('hex');
const id=()=>randomBytes(24).toString('hex');
const validId=s=>typeof s==='string'&&/^[a-f0-9]{48}$/.test(s);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff'}});
const error=(status,code)=>reply(status,{error:{code}});
async function body(request,max=8192){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('JSON_REQUIRED');
  const reader=request.body?.getReader();if(!reader)throw Error('EMPTY');
  const chunks=[];let length=0;
  for(;;){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>max){await reader.cancel();throw Error('TOO_LARGE');}chunks.push(r.value);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}

// Atomic shared queue. Only a fixed public BTC check can be represented.
export const ENQUEUE=`-- CERTIS_ENQUEUE_V1
local prior=redis.call('GET',KEYS[2]);
if prior then local raw=redis.call('GET',ARGV[4]..prior); if raw then local old=cjson.decode(raw); if old.expiresAt>tonumber(ARGV[3]) and (old.status=='pending' or old.status=='running') then return prior end end end;
local items=redis.call('LRANGE',KEYS[1],0,-1);redis.call('DEL',KEYS[1]);
for _,v in ipairs(items) do if redis.call('EXISTS',ARGV[4]..v)==1 then redis.call('RPUSH',KEYS[1],v) end end;
if redis.call('LLEN',KEYS[1])>=8 then return false end;
redis.call('SET',KEYS[3],ARGV[2],'PX',210000,'NX');
redis.call('SET',KEYS[2],ARGV[1],'PX',210000);
redis.call('RPUSH',KEYS[1],ARGV[1]);redis.call('PEXPIRE',KEYS[1],210000);return ARGV[1]`;
export const CLAIM=`-- CERTIS_CLAIM_V1
for i=1,8 do local next=redis.call('LPOP',KEYS[1]); if not next then return false end;
local key=ARGV[1]..next;local raw=redis.call('GET',key);
if raw then local job=cjson.decode(raw);if job.status=='pending' and job.expiresAt>tonumber(ARGV[2])+20000 then
job.status='running';job.lease=ARGV[3];job.claimedAt=tonumber(ARGV[2]);
redis.call('SET',key,cjson.encode(job),'PX',math.floor(job.expiresAt-tonumber(ARGV[2])));return cjson.encode(job) end end end;return false`;
export const COMPLETE=`-- CERTIS_COMPLETE_V1
local raw=redis.call('GET',KEYS[1]);if not raw then return 0 end;local job=cjson.decode(raw);
if job.status~='running' or job.lease~=ARGV[1] or job.expiresAt<=tonumber(ARGV[2]) then return 0 end;
job.status='complete';job.completedAt=tonumber(ARGV[2]);job.result=cjson.decode(ARGV[3]);job.lease=nil;
redis.call('SET',KEYS[1],cjson.encode(job),'PX',math.floor(job.expiresAt-tonumber(ARGV[2])));return 1`;

export function createEngineRequests({redis,store,tokenSha256,now=Date.now,makeId=id}){
  if(!redis||!store||!/^[a-f0-9]{64}$/.test(tokenSha256||''))throw Error('REQUEST_CONFIGURATION_INVALID');
  function machine(request){const token=request.headers.get('authorization')||'';return /^Bearer [A-Za-z0-9_-]{43}$/.test(token)&&timingSafeEqual(createHash('sha256').update(token.slice(7)).digest(),Buffer.from(tokenSha256,'hex'));}
  async function principal(request){const p=await store.session(readCookie(request,SESSION_COOKIE));return p&&typeof p.principalId==='string'?p:null;}
  return {
    async browser(request){
      try{
        const url=new URL(request.url);
        if(url.origin!==ORIGIN)return error(403,'ORIGIN_DENIED');
        if(!['POST','GET'].includes(request.method))return error(405,'METHOD_NOT_ALLOWED');
        if(request.method==='POST'&&request.headers.get('origin')!==ORIGIN)return error(403,'ORIGIN_DENIED');
        const p=await principal(request);if(!p)return error(401,'AUTHENTICATION_REQUIRED');
        const owner=hash(p.principalId);
        if(request.method==='GET'){
          const requestId=url.searchParams.get('request_id');if(!validId(requestId))return error(404,'REQUEST_NOT_FOUND');
          if(!await store.limit('engine-poll:'+owner,180))return error(429,'RATE_LIMITED');
          const raw=await redis.get(PREFIX+requestId);if(!raw)return error(410,'ENGINE_REQUEST_EXPIRED');
          const job=JSON.parse(raw);if(job.owner!==owner)return error(404,'REQUEST_NOT_FOUND');
          if(job.expiresAt<=now())return error(410,'ENGINE_REQUEST_EXPIRED');
          const result={status:job.status,request_id:requestId,requested_at:new Date(job.createdAt).toISOString(),expires_at:new Date(job.expiresAt).toISOString()};
          if(job.status==='complete'){result.completed_at=new Date(job.completedAt).toISOString();result.result=validateAssessment(job.result,{now:now(),maxEvidenceAgeMs:300000});}
          return reply(200,result);
        }
        if(url.pathname!=='/api/certis/query'||url.searchParams.get('engine_request')!=='1')return error(404,'NOT_FOUND');
        if(!await store.limit('engine-submit:'+owner,6))return error(429,'RATE_LIMITED');
        let input;try{input=await body(request,2048);}catch{return error(400,'INVALID_REQUEST');}
        if(!exact(input,['question','mode','requested_at'])||input.mode!=='public'||typeof input.question!=='string'||!input.question.trim()||input.question.length>500||typeof input.requested_at!=='string'||!Number.isFinite(Date.parse(input.requested_at))||Math.abs(now()-Date.parse(input.requested_at))>300000)return error(400,'INVALID_REQUEST');
        const route=routeQuestion(input.question);
        if(route.area!=='crypto'||route.assets.some(asset=>asset!=='btc')){
          const value=unavailable();value.assessment.missing_evidence=route.area==='crypto'?['The on-demand protected-engine connection currently supports Bitcoin only. No requested additional asset feed has been activated.']:areaGaps[route.area];
          return reply(200,{status:'not_connected',result:validateAssessment(value,{now:now(),maxEvidenceAgeMs:300000})});
        }
        const requestId=makeId(),createdAt=now();if(!validId(requestId))throw Error('INVALID_ID');
        const job={id:requestId,owner,operation:'public_btc_evidence_check',asset:'btc',status:'pending',createdAt,expiresAt:createdAt+TTL};
        const accepted=await redis.eval(ENQUEUE,{keys:[QUEUE,PREFIX+'owner:'+owner,PREFIX+requestId],arguments:[requestId,JSON.stringify(job),String(createdAt),PREFIX]});
        if(!validId(accepted))return error(503,'ENGINE_QUEUE_UNAVAILABLE');
        const saved=JSON.parse(await redis.get(PREFIX+accepted));
        return reply(202,{status:saved.status,request_id:accepted,requested_at:new Date(saved.createdAt).toISOString(),expires_at:new Date(saved.expiresAt).toISOString(),poll_after_seconds:3});
      }catch{return error(503,'ENGINE_REQUEST_UNAVAILABLE');}
    },
    async machine(request){
      try{
        if(request.method!=='POST')return error(405,'METHOD_NOT_ALLOWED');
        if(!machine(request))return error(401,'MACHINE_AUTHENTICATION_REQUIRED');
        const path=new URL(request.url).pathname;
        if(path==='/internal/public-engine/claim'){
          const input=await body(request,64);if(!exact(input,[]))return error(400,'INVALID_CLAIM');
          const lease=makeId();if(!validId(lease))throw Error('INVALID_ID');
          const raw=await redis.eval(CLAIM,{keys:[QUEUE],arguments:[PREFIX,String(now()),lease]});
          if(!raw)return reply(200,{status:'idle'});
          const job=JSON.parse(raw);
          return reply(200,{status:'claimed',job:{id:job.id,lease,operation:'public_btc_evidence_check',asset:'btc',created_at:new Date(job.createdAt).toISOString(),claimed_at:new Date(job.claimedAt).toISOString(),expires_at:new Date(job.expiresAt).toISOString()}});
        }
        if(path!=='/internal/public-engine/complete')return error(404,'NOT_FOUND');
        const input=await body(request);
        if(!exact(input,['id','lease','evidence'])||!validId(input.id)||!validId(input.lease))return error(400,'INVALID_COMPLETION');
        const raw=await redis.get(PREFIX+input.id);if(!raw)return error(410,'ENGINE_REQUEST_EXPIRED');
        const job=JSON.parse(raw);if(job.status!=='running'||job.lease!==input.lease||job.expiresAt<=now())return error(409,'ENGINE_REQUEST_REPLAYED_OR_EXPIRED');
        const evidence=validateEngineExport(input.evidence,now());
        if(evidence.quotes.length!==1||evidence.quotes[0].asset!=='btc'||evidence.analyses.length!==1||Date.parse(evidence.analyses[0].evaluated_at)<job.claimedAt) return error(400,'ENGINE_REQUEST_ATTRIBUTION_FAILED');
        const result=validateAssessment(projectEngine(evidence,'BTC'),{now:now(),maxEvidenceAgeMs:300000});
        const saved=await redis.eval(COMPLETE,{keys:[PREFIX+input.id],arguments:[input.lease,String(now()),JSON.stringify(result)]});
        return saved===1?reply(202,{status:'ENGINE_REQUEST_COMPLETED'}):error(409,'ENGINE_REQUEST_REPLAYED_OR_EXPIRED');
      }catch{return error(400,'ENGINE_REQUEST_REJECTED');}
    }
  };
}
