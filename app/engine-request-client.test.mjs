import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./engine-request-client.js',import.meta.url),'utf8');
const now=Date.now(),requested_at=new Date(now).toISOString(),expires_at=new Date(now+210000).toISOString(),request_id='a'.repeat(48);
const receipt=()=>({status:'pending',request_id,requested_at,expires_at});
const done=()=>({...receipt(),status:'complete',completed_at:requested_at,result:{engine:{checks:[{evaluated_at:requested_at}]}}});
function setup(responses,{initialDelay=0}={}){const calls=[],progress=[],window={};let clock=now;class Clock extends Date{static now(){return clock;}}vm.runInNewContext(source,{window,Date:Clock,AbortSignal:{timeout:milliseconds=>({milliseconds})},setTimeout:fn=>{clock+=3000;fn();},fetch:async(...a)=>{calls.push(a);if(calls.length===1){clock+=initialDelay;if(initialDelay>a[1].signal.milliseconds)throw new DOMException('Timed out','TimeoutError');}const r=responses.shift();if(r instanceof Error)throw r;return r;}});return {calls,progress,query:()=>window.CertisEngineRequests.query('BTC',p=>progress.push(p))};}
test('awaits correlated engine result and retains cookie credentials',async()=>{const h=setup([Response.json(receipt(),{status:202}),Response.json({...receipt(),status:'running'}),Response.json(done())]);const r=await h.query();assert.equal(r.request_id,request_id);assert.equal(h.calls.length,3);assert.ok(h.progress.some(p=>p.includes('protected engine')));assert.ok(h.progress.every(p=>!p.includes('two-minute')));for(const [url,o]of h.calls){assert.ok(url.startsWith('/api/certis/query?engine_request=1'));assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');}assert.equal(JSON.parse(h.calls[0][1].body).mode,'public');});
test('missing evidence response does not impersonate a completed engine request',async()=>{const h=setup([Response.json({status:'not_connected',result:{sources:[]}})]);const r=await h.query();assert.equal(r.request_id,undefined);assert.equal(h.calls.length,1);});
for(const status of [401,403,410,429,503])test('HTTP '+status+' remains an explicit failure',async()=>{const h=setup([new Response('SECRET',{status})]);await assert.rejects(h.query(),e=>e.status===status&&!e.message.includes('SECRET'));});
test('mismatched request ID cannot substitute another result',async()=>{const value=done();value.request_id='b'.repeat(48);const h=setup([Response.json(receipt(),{status:202}),Response.json(value)]);await assert.rejects(h.query(),/MISMATCH/);});
test('cached engine result predating request rejected',async()=>{const value=done();value.result.engine.checks[0].evaluated_at=new Date(now-1000).toISOString();const h=setup([Response.json(receipt(),{status:202}),Response.json(value)]);await assert.rejects(h.query(),/ATTRIBUTION/);});
test('unknown or oversized receipts cannot create arbitrary URL requests',async()=>{for(const value of [{...receipt(),request_id:'../../private'},{...receipt(),expires_at:new Date(now+9999999).toISOString()}]){const h=setup([Response.json(value,{status:202})]);await assert.rejects(h.query(),/RECEIPT/);assert.equal(h.calls.length,1);}});
test('polling ends at the deadline rather than waiting forever',async()=>{const h=setup([Response.json(receipt(),{status:202}),...Array.from({length:71},()=>Response.json(receipt()))]);await assert.rejects(h.query(),e=>e.status===410);assert.ok(h.calls.length<=72);});
test('bridge waking for 50 seconds still yields one correlated result',async()=>{
  const delayed={...receipt(),requested_at:new Date(now+50000).toISOString(),expires_at:new Date(now+260000).toISOString()};
  const completed={...delayed,status:'complete',completed_at:delayed.requested_at,result:{engine:{checks:[{evaluated_at:delayed.requested_at}]}}};
  const h=setup([Response.json(delayed,{status:202}),Response.json(completed)],{initialDelay:50000});
  assert.equal((await h.query()).request_id,request_id);
  assert.equal(h.calls.filter(([,o])=>o.method==='POST').length,1);
  assert.ok(h.progress[0].includes('waking'));
});
test('initial timeout never resubmits a request with unknown outcome',async()=>{
  const h=setup([],{initialDelay:91000});
  await assert.rejects(h.query(),e=>e.name==='TimeoutError');
  assert.equal(h.calls.length,1);
});
test('a longer initial wait cannot extend the server queue lease',async()=>{
  const invalid={...receipt(),requested_at:new Date(now+50000).toISOString(),expires_at:new Date(now+260001).toISOString()};
  const h=setup([Response.json(invalid,{status:202})],{initialDelay:50000});
  await assert.rejects(h.query(),/RECEIPT/);assert.equal(h.calls.length,1);
});
test('a future-dated request cannot extend the wait window',async()=>{
  const invalid={...receipt(),requested_at:new Date(now+56000).toISOString(),expires_at:new Date(now+266000).toISOString()};
  const h=setup([Response.json(invalid,{status:202})],{initialDelay:50000});
  await assert.rejects(h.query(),/RECEIPT/);assert.equal(h.calls.length,1);
});
test('a coalesced request that expires while receiving the receipt is rejected',async()=>{
  const expired={...receipt(),requested_at:new Date(now-170000).toISOString(),expires_at:new Date(now+40000).toISOString()};
  const h=setup([Response.json(expired,{status:202})],{initialDelay:50000});
  await assert.rejects(h.query(),/RECEIPT/);assert.equal(h.calls.length,1);
});
test('polling does not send a request after its last sleep crosses expiry',async()=>{
  const nearExpiry={...receipt(),requested_at:new Date(now-208000).toISOString(),expires_at:new Date(now+2000).toISOString()};
  const h=setup([Response.json(nearExpiry,{status:202})]);
  await assert.rejects(h.query(),e=>e.status===410);assert.equal(h.calls.length,1);
});

