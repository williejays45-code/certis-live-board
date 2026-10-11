import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unavailable} from '../bridge/query.mjs';
import {projectEngine} from '../backend/engine-evidence.mjs';
const source=readFileSync(new URL('./homepage-client.js',import.meta.url),'utf8');
function harness(fetcher){
  const nodes=new Map();
  const make=()=>({textContent:'',value:'',children:[],events:{},attributes:{},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];this.textContent='';},addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this.attributes[k]=v;},querySelector(){return get('submit');},set innerHTML(_){throw Error('UNSAFE_HTML');}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
  const calls=[];
  vm.runInNewContext(source,{document:{getElementById:get,createElement:make},window:{CertisEngineRequests:{query:async question=>{const args=['/api/certis/query?engine_request=1',{method:'POST',credentials:'same-origin',redirect:'error',body:JSON.stringify({question,mode:'public'})}];calls.push(args);const r=await fetcher(...args);if(!r.ok)throw Object.assign(Error('FAILED'),{status:r.status});const text=await r.text();if(text.length>65536)throw Error('OVERSIZED');return {result:JSON.parse(text)};}}},AbortSignal,Date,URL});
  return {get,calls,submit:async q=>{get('question').value=q;await get('ask').events.submit({preventDefault(){}});},rendered:()=>JSON.stringify(get('answer').children)};
}
function checked(){const time=new Date(Date.now()-1000).toISOString();return projectEngine({runtime_version:'3.22.7',quotes:[{asset:'btc',observed_at:time,last:'101.5',bid:'100',ask:'102'}],analyses:[{asset:'btc',evaluated_at:time,evaluation:{policy_version:'certis-reasoning-control/1.0'},plan:{state:'ready_for_safe_acquisition',required_evidence:['digital-asset-registry-profile','active-contradiction-state']}}]},'BTC');}
test('homepage submits exactly one public request to the existing same-origin bridge',async()=>{const h=harness(async()=>Response.json(checked()));await h.submit('BTC');assert.equal(h.calls.length,1);const [url,options]=h.calls[0];assert.equal(url,'/api/certis/query?engine_request=1');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).mode,'public');assert.match(h.rendered(),/INSUFFICIENT EVIDENCE/);assert.match(h.rendered(),/unscored/);assert.match(h.rendered(),/1\.980198/);assert.match(h.rendered(),/Protected engine checks/);assert.match(h.rendered(),/Verify asset identity/);assert.equal(h.get('answer').attributes['aria-busy'],'false');});
test('native homepage form handles Enter through submit and does not navigate away',async()=>{const h=harness(async()=>Response.json(unavailable()));let prevented=false;h.get('question').value='Property';await h.get('ask').events.submit({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.calls.length,1);assert.equal(h.get('question').value,'Property');});
test('missing evidence stays visible without fake quote or preset answer',async()=>{const v=unavailable();v.assessment.missing_evidence=['Verified LANDITRUS identity is required'];const h=harness(async()=>Response.json(v));await h.submit('Property');assert.match(h.rendered(),/LANDITRUS/);assert.doesNotMatch(h.rendered(),/Protected engine checks|Illustrative evaluation framework/);});
test('engine checks and sources show actual supplied timestamps',async()=>{const v=checked(),h=harness(async()=>Response.json(v));await h.submit('BTC');assert.ok(h.rendered().includes(v.sources[0].checked_at));assert.ok(h.rendered().includes(v.engine.checks[0].evaluated_at));});
for(const status of [401,403,429,503])test('HTTP '+status+' clears previously rendered evidence and never shows raw errors',async()=>{let calls=0;const h=harness(async()=>++calls===1?Response.json(checked()):new Response('PRIVATE_PROVIDER_SECRET',{status}));await h.submit('BTC');await h.submit('BTC');assert.doesNotMatch(h.rendered(),/83077|Protected engine checks|PRIVATE_PROVIDER_SECRET/);assert.equal(h.get('submit').disabled,false);if(status===401)assert.match(h.rendered(),/Sign in with Google/);});
for(const [name,mutate] of [
  ['supported below 75',v=>{v.assessment.state='SUPPORTED';v.assessment.evidence_strength=74;}],
  ['authority expansion',v=>v.authority.trading=true],
  ['stale source',v=>v.sources[0].checked_at='2000-01-01T00:00:00Z'],
  ['stale engine',v=>v.engine.checks[0].evaluated_at='2000-01-01T00:00:00Z'],
  ['completed assessment claim',v=>v.engine.assessment_complete=true],
  ['unsafe source URL',v=>v.sources[0].uri='javascript:alert(1)'],
  ['unknown requirement',v=>v.engine.checks[0].required_evidence=['private-secret']],
])test('reject '+name,async()=>{const v=checked();mutate(v);const h=harness(async()=>Response.json(v));await h.submit('BTC');assert.match(h.rendered(),/No assessment was accepted/);assert.doesNotMatch(h.rendered(),/Protected engine checks/);});
test('HTML-shaped content is rendered only as text',async()=>{const v=unavailable();v.answer='<img src=x onerror=alert(1)>';const h=harness(async()=>Response.json(v));await h.submit('BTC');assert.ok(h.get('answer').children.some(n=>n.textContent===v.answer));});
test('malformed response and network errors do not leak raw upstream content',async()=>{for(const response of [()=>new Response('<html>SECRET</html>'),()=>{throw Error('SECRET');}]){const h=harness(async()=>response());await h.submit('BTC');assert.doesNotMatch(h.rendered(),/SECRET/);assert.match(h.rendered(),/No assessment was accepted/);}});
test('duplicate requests are blocked while pending',async()=>{let release;const h=harness(()=>new Promise(r=>release=r));const first=h.submit('BTC');await h.submit('BTC');assert.equal(h.calls.length,1);release(Response.json(unavailable()));await first;});
test('empty and overlong questions do not call the bridge',async()=>{const h=harness();await h.submit(' ');await h.submit('x'.repeat(501));assert.equal(h.calls.length,0);assert.match(h.rendered(),/500 characters/);});
test('city page retains video, poster, live market script and controls',()=>{const current=readFileSync(new URL('../index.html',import.meta.url),'utf8');const tail=current.slice(current.indexOf('const initial='),current.indexOf('</script>',current.indexOf('const initial=')));assert.equal(createHash('sha256').update(tail).digest('hex'),'b5766f4523ddd03a17ac78c0be1a5771d3f177355777fd894f2c3105908714b8');for(const src of ['certis-city.mp4','certis-city-poster.jpg','id="city-motion"','id="stream-toggle"','action="/auth/login"','action="/auth/logout"'])assert.ok(current.includes(src));assert.ok(current.includes('src="/app/homepage-client.js?v=engine-request-20261011"'));assert.doesNotMatch(current,/const examples=|No question is sent to a server|responses below are illustrative/);});
