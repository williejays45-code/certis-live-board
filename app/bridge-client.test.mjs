import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {unavailable} from '../bridge/query.mjs';
const source=readFileSync(new URL('./bridge-client.js',import.meta.url),'utf8');
function harness(fetcher) {
 const nodes=new Map();
 const make=()=>({textContent:'',value:'',style:{},children:[],events:{},appendChild(v){this.children.push(v);},addEventListener(k,v){this.events[k]=v;},focus(){},set innerHTML(_){throw Error('Unsafe HTML rendering');}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
 let calls=[];
 vm.runInNewContext(source,{document:{getElementById:get,createElement:make,querySelectorAll:()=>[]},crypto:{randomUUID:()=> 'synthetic_conversation'},AbortSignal,Date,console,fetch:async(...args)=>{calls.push(args);return fetcher(...args);}});
 return {get,calls,submit:async text=>{get('prompt').value=text;await get('ask').events.click();},rendered:()=>JSON.stringify(get('transcript').children)};
}
test('initial state is zero and unassessed',()=>{const h=harness();assert.equal(h.get('score').textContent,'0');assert.equal(h.get('state').textContent,'UNASSESSED');assert.equal(h.calls.length,0);});
test('synthetic request goes only to same-origin API with public mode',async()=>{const h=harness(async()=>Response.json(unavailable()));await h.submit('Synthetic question');const [url,opts]=h.calls[0];assert.equal(url,'/api/certis/query');assert.equal(opts.credentials,'same-origin');assert.equal(opts.redirect,'error');assert.equal(JSON.parse(opts.body).mode,'public');assert.equal(h.get('score').textContent,'0');});
for(const status of [401,403,404,429,500,503])test('HTTP '+status+' clears assessment instead of inventing score',async()=>{const h=harness(async()=>new Response('',{status}));await h.submit('How confident are you?');assert.equal(h.get('state').textContent,'UNASSESSED');assert.equal(h.get('score').textContent,'0');assert.equal(h.get('ask').disabled,false);});
test('malicious prompt renders as literal text',async()=>{const h=harness(async()=>Response.json(unavailable()));await h.submit('<img src=x onerror=alert(1)>');assert.equal(h.get('transcript').children[0].children[0].textContent,'<img src=x onerror=alert(1)>');});
test('malformed JSON is not an assessment',async()=>{const h=harness(async()=>new Response('<html>fallback</html>'));await h.submit('Synthetic');assert.equal(h.get('score').textContent,'0');});
test('server score below 75 cannot display supported',async()=>{const v=unavailable();v.assessment.state='SUPPORTED';v.assessment.evidence_strength=74;const h=harness(async()=>Response.json(v));await h.submit('Synthetic');assert.equal(h.get('state').textContent,'UNASSESSED');});
test('response cannot expand authority',async()=>{const v=unavailable();v.authority.trading=true;const h=harness(async()=>Response.json(v));await h.submit('Synthetic');assert.equal(h.get('state').textContent,'UNASSESSED');assert.match(h.rendered(),/authority boundary/);});
test('network rejection clears evidence',async()=>{const h=harness(async()=>{throw Error('Unavailable');});await h.submit('Synthetic');assert.equal(h.get('score').textContent,'0');assert.equal(h.get('ask').disabled,false);});
test('duplicate submit while pending does not issue duplicate query',async()=>{let release;const h=harness(()=>new Promise(r=>release=r));const pending=h.submit('First');await h.submit('Second');assert.equal(h.calls.length,1);release(Response.json(unavailable()));await pending;});
