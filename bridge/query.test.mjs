import test from 'node:test';
import assert from 'node:assert/strict';
import handler, {createQueryHandler,validateAssessment,unavailable} from './query.mjs';
const now=Date.parse('2026-10-05T18:00:00Z');
const policy={now,maxEvidenceAgeMs:3600000};
const body={question:'Synthetic public evidence test',conversation_id:'synthetic_case_1',mode:'public',requested_at:new Date(now).toISOString()};
const req=(payload=body,headers={},method='POST')=>new Request('https://certisintelligence.com/api/certis/query',{method,headers:{origin:'https://certisintelligence.com','content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(payload)}:{})});
function fixture() {
 const result=unavailable();
 Object.assign(result.assessment,{state:'SUPPORTED',evidence_strength:75,observations:['Synthetic observation'],inferences:['Synthetic inference'],missing_evidence:[]});
 result.sources=[{label:'Synthetic fixture only',uri:'https://example.com/fixture',checked_at:new Date(now-1000).toISOString(),source_type:'official',supports:['Synthetic observation','Synthetic inference'],challenges:[]}];
 return result;
}
const configured=(overrides={})=>createQueryHandler({verifySession:async()=>({principalId:'server_verified_subject',roles:[]}),consumeRateLimit:async()=>true,queryEvidence:async()=>fixture(),maxEvidenceAgeMs:3600000,now:()=>now,...overrides});
test('default handler is disabled; no authentication bypass',async()=>assert.equal((await handler(req())).status,503));
test('supported exactly 75 with linked evidence passes',()=>assert.equal(validateAssessment(fixture(),policy).assessment.state,'SUPPORTED'));
for(const [name,mutate] of [
 ['supported below 75',v=>v.assessment.evidence_strength=74],
 ['non-numeric score',v=>v.assessment.evidence_strength='90'],
 ['nonfinite score',v=>v.assessment.evidence_strength=NaN],
 ['score above 100',v=>v.assessment.evidence_strength=101],
 ['unsupported enum',v=>v.assessment.state='APPROVED'],
 ['no sources',v=>v.sources=[]],
 ['stale sources',v=>v.sources[0].checked_at='2020-01-01T00:00:00Z'],
 ['future timestamp',v=>v.sources[0].checked_at='2030-01-01T00:00:00Z'],
 ['timestamp without timezone',v=>v.sources[0].checked_at='2026-10-05T17:59:00'],
 ['unreferenced claim',v=>v.assessment.observations.push('Made-up claim')],
 ['unknown source claim',v=>v.sources[0].supports.push('Other claim')],
 ['missing coverage with supported',v=>v.assessment.missing_evidence=['Gap']],
 ['contrary evidence with supported',v=>{v.assessment.contrary_evidence=['Contradiction'];v.sources[0].challenges=['Contradiction'];}],
 ['public internal source',v=>v.sources[0].source_type='internal'],
 ['financial authority expansion',v=>v.authority.trading=true],
 ['hidden upstream fields',v=>v.database_path='private.sqlite'],
 ['javascript source URI',v=>v.sources[0].uri='javascript:alert(1)'],
 ['credential URI',v=>v.sources[0].uri='https://user:secret@example.com/'],
 ['URI query leak',v=>v.sources[0].uri='https://example.com/?token=secret'],
 ['probability conflation',v=>v.assessment.evidence_strength_meaning='Probability of outcome'],
])test('reject '+name,()=>{const v=fixture();mutate(v);assert.throws(()=>validateAssessment(v,policy));});
test('founder internal-only memory cannot qualify evidence',()=>{const v=fixture();v.sources[0].source_type='internal';assert.throws(()=>validateAssessment(v,{...policy,mode:'founder'}));});
test('unavailable is unassessed at zero',()=>assert.deepEqual(validateAssessment(unavailable(),policy),unavailable()));
test('freeform upstream answer never reaches user',()=>{const v=fixture();v.answer='Unreferenced market claim';assert.ok(!validateAssessment(v,policy).answer.includes('Unreferenced'));});
test('below threshold may be insufficient, never silently upgraded',()=>{const v=fixture();v.assessment.state='INSUFFICIENT_EVIDENCE';v.assessment.evidence_strength=74;assert.equal(validateAssessment(v,policy).assessment.state,'INSUFFICIENT_EVIDENCE');});
test('cross-origin and missing-origin blocked before authentication',async()=>{let calls=0;const h=configured({verifySession:async()=>{calls++;}});assert.equal((await h(req(body,{origin:'https://evil.example'}))).status,403);assert.equal((await h(req(body,{origin:''}))).status,403);assert.equal(calls,0);});
test('GET cannot query',async()=>assert.equal((await configured()(req(body,{},'GET'))).status,405));
test('simple form CSRF blocked',async()=>assert.equal((await configured()(req(body,{'content-type':'text/plain'}))).status,415));
test('unauthenticated request cannot reach evidence',async()=>{let calls=0;const h=configured({verifySession:async()=>null,queryEvidence:async()=>{calls++;}});assert.equal((await h(req())).status,401);assert.equal(calls,0);});
test('authentication errors are sanitized',async()=>{const r=await configured({verifySession:async()=>{throw Error('SECRET');}})(req());assert.equal(r.status,401);assert.ok(!(await r.text()).includes('SECRET'));});
test('body cannot grant founder mode',async()=>assert.equal((await configured()(req({...body,mode:'founder'}))).status,403));
test('request cannot inject subject',async()=>assert.equal((await configured()(req({...body,principalId:'other'}))).status,400));
test('rate limit blocks before evidence',async()=>{let calls=0;const r=await configured({consumeRateLimit:async()=>false,queryEvidence:async()=>{calls++;}})(req());assert.equal(r.status,429);assert.equal(calls,0);});
test('limiter outage fails closed',async()=>assert.equal((await configured({consumeRateLimit:async()=>{throw Error();}})(req())).status,503));
test('oversized question rejected',async()=>assert.equal((await configured()(req({...body,question:'a'.repeat(4001)}))).status,400));
test('oversized encoded body rejected',async()=>assert.equal((await configured()(req({...body,question:'a'.repeat(9000)}))).status,400));
test('stale request rejected',async()=>assert.equal((await configured()(req({...body,requested_at:'2020-01-01T00:00:00Z'}))).status,400));
test('conversation ID cannot contain paths',async()=>assert.equal((await configured()(req({...body,conversation_id:'../../state'}))).status,400));
test('numeric conversation ID rejected without coercion',async()=>assert.equal((await configured()(req({...body,conversation_id:123}))).status,400));
test('upstream receives server principal and public mode',async()=>{let input;const r=await configured({queryEvidence:async v=>{input=v;return fixture();}})(req());assert.equal(r.status,200);assert.equal(input.principalId,'server_verified_subject');assert.equal(input.mode,'public');assert.equal(r.headers.get('cache-control'),'no-store');});
test('missing adapter returns honest unassessed response',async()=>{const r=await configured({queryEvidence:undefined})(req());assert.equal(r.status,200);assert.deepEqual(await r.json(),unavailable());});
test('upstream failure does not leak secrets',async()=>{const r=await configured({queryEvidence:async()=>{throw Error('provider-secret sqlite-path');}})(req());assert.equal(r.status,502);assert.ok(!(await r.text()).includes('provider-secret'));});
test('invalid upstream assessment fails instead of retaining supported answer',async()=>{const r=await configured({queryEvidence:async()=>{const v=fixture();v.assessment.evidence_strength=1;return v;}})(req());assert.equal(r.status,502);});
test('missing freshness policy cannot call runtime',async()=>{let calls=0;const r=await configured({maxEvidenceAgeMs:undefined,queryEvidence:async()=>{calls++;}})(req());assert.equal(r.status,503);assert.equal(calls,0);});
