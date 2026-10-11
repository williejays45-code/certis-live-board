import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source = readFileSync(new URL('./account-client.js', import.meta.url),'utf8');
const statusResponse = authenticated => Response.json({authenticated,founder_authority:false,financial_authority:'none'},{status:authenticated?200:401});
function harness(fetcher) {
  const nodes = new Map(), events = {}, timers = new Map(), calls = [];
  const make = () => ({textContent:'',hidden:false,disabled:false,events:{},addEventListener(k,f){this.events[k]=f;},querySelector(){return this.button ??= make();}});
  const get = id => {if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
  let next=0;
  const document={getElementById:get,visibilityState:'visible',addEventListener(k,f){events[k]=f;}};
  vm.runInNewContext(source,{document,window:{addEventListener(k,f){events[k]=f;}},AbortSignal,
    fetch:async(...args)=>{calls.push(args);return fetcher(...args);},
    setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
  const flush = () => new Promise(resolve=>setImmediate(resolve));
  return {get,calls,events,flush,timers,document,status:()=>get('certis-session-status').textContent,
    submit:id=>{let prevented=false;get(id).events.submit({preventDefault(){prevented=true;}});return prevented;}};
}
test('verified session shows signed in and only sign out',async()=>{const h=harness(()=>statusResponse(true));await h.flush();assert.match(h.status(),/^Signed in/);assert.equal(h.get('certis-login').hidden,true);assert.equal(h.get('certis-logout').hidden,false);assert.equal(h.calls.length,1);const [url,o]=h.calls[0];assert.equal(url,'/auth/session');assert.equal(o.method,'GET');assert.equal(o.credentials,'same-origin');assert.equal(o.cache,'no-store');assert.equal(o.redirect,'error');});
test('verified absence of session shows Google sign in only',async()=>{const h=harness(()=>statusResponse(false));await h.flush();assert.match(h.status(),/^Signed out/);assert.equal(h.get('certis-login').hidden,false);assert.equal(h.get('certis-logout').hidden,true);});
for(const [name,fn] of [
  ['service failure',()=>new Response('SECRET',{status:503})],
  ['invalid JSON',()=>new Response('SECRET',{status:200})],
  ['contradictory status',()=>Response.json({authenticated:true,founder_authority:false,financial_authority:'none'},{status:401})],
  ['unexpected authority',()=>Response.json({authenticated:true,founder_authority:true,financial_authority:'none'})],
  ['oversized response',()=>new Response('x'.repeat(1025))],
  ['blocked or failed request',()=>{throw Error('SECRET');}]
])test(name+' stays unknown without revealing raw diagnostics',async()=>{const h=harness(fn);await h.flush();assert.match(h.status(),/^Sign-in status unavailable/);assert.doesNotMatch(h.status(),/SECRET|Signed in/);assert.equal(h.get('certis-login').hidden,false);assert.equal(h.get('certis-logout').hidden,false);});
test('login shows immediate feedback but retains native POST; duplicates are blocked',async()=>{const h=harness(()=>statusResponse(false));await h.flush();assert.equal(h.submit('certis-login'),false);assert.equal(h.submit('certis-login'),true);assert.equal(h.status(),'Opening Google…');assert.equal(h.calls.length,1);assert.equal(h.get('certis-login').button.disabled,true);assert.equal(h.timers.size,1);});
test('logout also retains native POST without pretending it completed',async()=>{const h=harness(()=>statusResponse(true));await h.flush();assert.equal(h.submit('certis-logout'),false);assert.equal(h.status(),'Signing out…');});
test('navigation stall recovers the buttons after a bounded delay',async()=>{const h=harness(()=>statusResponse(false));await h.flush();h.submit('certis-login');[...h.timers.values()][0]();assert.equal(h.get('certis-login').button.disabled,false);assert.match(h.status(),/did not finish opening/);assert.equal(h.submit('certis-login'),false);});
test('back/forward cache restores button state and rechecks server session',async()=>{let signed=false;const h=harness(()=>statusResponse(signed));await h.flush();h.submit('certis-login');signed=true;h.events.pageshow({persisted:true});await h.flush();assert.match(h.status(),/^Signed in/);assert.equal(h.get('certis-logout').button.disabled,false);assert.equal(h.timers.size,0);});
test('returning to the tab rechecks expired session',async()=>{let signed=true;const h=harness(()=>statusResponse(signed));await h.flush();signed=false;h.events.visibilitychange();await h.flush();assert.match(h.status(),/^Signed out/);});
test('late status check cannot replace in-progress login feedback',async()=>{let release;const h=harness(()=>new Promise(resolve=>release=resolve));h.submit('certis-login');release(statusResponse(false));await h.flush();assert.equal(h.status(),'Opening Google…');});
test('account UI uses existing auth routes and preserves market and motion source',()=>{const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const mark of ['id="certis-session-status" role="status"','id="certis-login" action="/auth/login" method="post"','id="certis-logout" action="/auth/logout" method="post"','src="/app/account-client.js?v=sign-in-feedback-20261011"'])assert.ok(html.includes(mark));const tail=html.slice(html.indexOf('const initial='),html.indexOf('</script>',html.indexOf('const initial=')));assert.equal(createHash('sha256').update(tail).digest('hex'),'b5766f4523ddd03a17ac78c0be1a5771d3f177355777fd894f2c3105908714b8');assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|innerHTML/);});
