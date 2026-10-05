// Framework-neutral server boundary. No provider, database, or localhost access.
const ORIGIN = 'https://certisintelligence.com';
const MEANING = 'Strength of the evidence set, not probability of outcome';
const AUTHORITY = Object.freeze({financial_execution:false,money_movement:false,trading:false,autonomous_purchase:false});
const states = new Set(['UNASSESSED','INSUFFICIENT_EVIDENCE','EMERGING','SUPPORTED','CONFLICTED']);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x, max=4000) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const exact = (x, keys) => plain(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x,k));
const list = x => Array.isArray(x) && x.length <= 100 && x.every(v => text(v));
const timestamp = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
function fail() { throw new Error('INVALID_EVIDENCE_RESPONSE'); }

export function unavailable() {
  return {answer:'Live evidence is unavailable. No evidence-backed assessment can be made.',assessment:{state:'UNASSESSED',evidence_strength:0,evidence_strength_meaning:MEANING,observations:[],inferences:[],contrary_evidence:[],missing_evidence:['Authenticated live evidence is not connected.'],next_watch:['Connect and verify dated evidence before assessing this question.']},sources:[],authority:{...AUTHORITY}};
}

// This validates a supplied score; it does not invent or certify a scoring model.
export function validateAssessment(value, {now=Date.now(), maxEvidenceAgeMs, mode='public'}={}) {
  if (!Number.isFinite(maxEvidenceAgeMs) || maxEvidenceAgeMs <= 0) fail();
  if (!exact(value,['answer','assessment','sources','authority']) || !text(value.answer)) fail();
  const a=value.assessment;
  if (!exact(a,['state','evidence_strength','evidence_strength_meaning','observations','inferences','contrary_evidence','missing_evidence','next_watch'])) fail();
  if (!states.has(a.state) || !Number.isFinite(a.evidence_strength) || a.evidence_strength < 0 || a.evidence_strength > 100 || a.evidence_strength_meaning !== MEANING) fail();
  for (const key of ['observations','inferences','contrary_evidence','missing_evidence','next_watch']) if (!list(a[key])) fail();
  if (!exact(value.authority,Object.keys(AUTHORITY)) || Object.values(value.authority).some(v=>v!==false)) fail();
  if (!Array.isArray(value.sources) || value.sources.length>100) fail();
  for (const s of value.sources) {
    if (!exact(s,['label','uri','checked_at','source_type','supports','challenges']) || !text(s.label,300) || !text(s.uri,2000) || !timestamp(s.checked_at) || !list(s.supports) || !list(s.challenges)) fail();
    if (!['official','market','news','filing','internal'].includes(s.source_type) || (mode==='public' && s.source_type==='internal')) fail();
    const uri=new URL(s.uri);
    if (uri.protocol!=='https:' || uri.username || uri.password || uri.search || uri.hash) fail();
    if (Date.parse(s.checked_at)>now || now-Date.parse(s.checked_at)>maxEvidenceAgeMs) fail();
    if (![...s.supports,...s.challenges].every(v=>a.observations.includes(v)||a.inferences.includes(v)||a.contrary_evidence.includes(v))) fail();
  }
  const external=value.sources.filter(s=>s.source_type!=='internal');
  if (a.evidence_strength>0 && external.length===0) fail();
  for (const claim of [...a.observations,...a.inferences]) if (!external.some(s=>s.supports.includes(claim))) fail();
  for (const claim of a.contrary_evidence) if (!external.some(s=>s.challenges.includes(claim))) fail();
  if (a.state==='SUPPORTED' && (a.evidence_strength<75 || a.missing_evidence.length || a.contrary_evidence.length || !a.observations.length || !a.inferences.length)) fail();
  if (a.state==='UNASSESSED' && a.evidence_strength!==0) fail();
  if (!external.length && (a.state!=='UNASSESSED' || a.observations.length || a.inferences.length || a.contrary_evidence.length)) fail();
  // Never emit an arbitrary answer without claim-level references in contract v1.
  // All rendered claims are the validated, source-linked strings above.
  const result=structuredClone(value);
  result.answer=external.length ? 'Review the source-linked observations and inferences below. This assessment does not authorize financial action.' : unavailable().answer;
  return result;
}

function reply(status, body) {
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Origin'}});
}
function error(status, code) { return reply(status,{error:{code}}); }
async function readBody(request) {
  const reader=request.body?.getReader();
  if (!reader) throw new Error('EMPTY');
  let length=0; const chunks=[];
  for (;;) { const {done,value}=await reader.read(); if(done)break; length+=value.length; if(length>8192){await reader.cancel();throw new Error('LARGE');} chunks.push(value); }
  const data=new Uint8Array(length); let pos=0; for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}

// Dependencies MUST be server-owned adapters, never values taken from request JSON.
// verifySession must verify a secure HttpOnly session, issuer/audience/expiry/revocation.
// Its result contains opaque principalId and server-resolved roles, not an email claim.
// consumeRateLimit must be atomic/shared across workers; no in-memory production fallback.
// queryEvidence must enforce per-principal access and return only export-approved content.
export function createQueryHandler({verifySession,consumeRateLimit,queryEvidence,maxEvidenceAgeMs,now=Date.now}={}) {
  return async request => {
    if (request.method!=='POST') return error(405,'METHOD_NOT_ALLOWED');
    if (request.headers.get('origin')!==ORIGIN) return error(403,'ORIGIN_DENIED');
    if (request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') return error(415,'JSON_REQUIRED');
    if (!verifySession || !consumeRateLimit) return error(503,'AUTHENTICATION_NOT_CONFIGURED');
    let principal;
    try { principal=await verifySession(request); } catch { return error(401,'AUTHENTICATION_REQUIRED'); }
    if (!principal || !text(principal.principalId,256) || !Array.isArray(principal.roles)) return error(401,'AUTHENTICATION_REQUIRED');
    try { if (await consumeRateLimit(principal.principalId)!==true) return error(429,'RATE_LIMITED'); } catch { return error(503,'RATE_LIMIT_UNAVAILABLE'); }
    let body;
    try { body=await readBody(request); } catch { return error(400,'INVALID_REQUEST'); }
    if (!exact(body,['question','conversation_id','mode','requested_at']) || !text(body.question,4000) || typeof body.conversation_id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.conversation_id) || !['public','founder'].includes(body.mode) || !timestamp(body.requested_at)) return error(400,'INVALID_REQUEST');
    if (Math.abs(now()-Date.parse(body.requested_at))>300000) return error(400,'STALE_REQUEST');
    if (body.mode==='founder' && !principal.roles.includes('founder')) return error(403,'FOUNDER_ACCESS_DENIED');
    if (!queryEvidence) return reply(200,unavailable());
    if (!Number.isFinite(maxEvidenceAgeMs) || maxEvidenceAgeMs<=0) return error(503,'EVIDENCE_POLICY_NOT_CONFIGURED');
    try {
      // Identity is explicit; adapter must scope conversation lookup to this principal.
      const response=await queryEvidence({principalId:principal.principalId,...body});
      return reply(200,validateAssessment(response,{now:now(),maxEvidenceAgeMs,mode:body.mode}));
    } catch { return error(502,'EVIDENCE_UNAVAILABLE_OR_INVALID'); }
  };
}

// Safe deployment default: cannot authenticate, forward or execute anything.
export default createQueryHandler();
