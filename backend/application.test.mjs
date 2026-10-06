import test from 'node:test';
import assert from 'node:assert/strict';
import {SecurityStore,configuration,principalFromClaims,ISSUER,SESSION_COOKIE,LOGIN_COOKIE,readCookie} from './security.mjs';
import {createApplication} from './application.mjs';
const origin='https://certisintelligence.com';
class FakeRedis {
  values=new Map();
  async set(k,v){this.values.set(k,v);return 'OK';}async get(k){return this.values.get(k)||null;}
  async getDel(k){const value=await this.get(k);this.values.delete(k);return value;}
  async del(k){this.values.delete(k);}
  async eval(_,{keys}){const n=Number(this.values.get(keys[0])||0)+1;this.values.set(keys[0],n);return n;}
}
const request=(path,method='GET',cookie='',body)=>new Request(origin+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const pick=(r,name)=>r.headers.getSetCookie().find(c=>c.startsWith(name+'=')).split(';')[0];
function setup(){
  const redis=new FakeRedis(),store=new SecurityStore(redis);
  let completeCalls=0;
  const oidc={begin:async()=>({url:'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic',transaction:{state:'synthetic',nonce:'n',verifier:'v'}}),complete:async(url,tx)=>{completeCalls++;assert.equal(tx.state,'synthetic');return 'google:synthetic-subject';}};
  const app=createApplication({config:{enabled:true,origin},store,oidc});return {redis,store,oidc,app,get completeCalls(){return completeCalls;}};
}
test('configuration disabled by default',()=>assert.equal(configuration({}).enabled,false));
test('enabled but missing config fails startup',()=>assert.throws(()=>configuration({CERTIS_AUTH_ENABLED:'true'})));
test('arbitrary public origin cannot change callback',()=>assert.throws(()=>configuration({CERTIS_PUBLIC_ORIGIN:'https://evil.example'})));
test('unapproved account config rejected',()=>assert.throws(()=>configuration({CERTIS_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'s',REDIS_URL:'redis://internal',CERTIS_ALLOWED_EMAIL:'other@example.com'})));
test('email verification is mandatory',()=>assert.throws(()=>principalFromClaims({iss:ISSUER,sub:'s',email:'certisfounder@gmail.com',email_verified:false},'certisfounder@gmail.com')));
test('different verified email denied',()=>assert.throws(()=>principalFromClaims({iss:ISSUER,sub:'s',email:'other@example.com',email_verified:true},'certisfounder@gmail.com')));
test('principal uses issuer subject, not email role',()=>assert.equal(principalFromClaims({iss:ISSUER,sub:'s',email:'certisfounder@gmail.com',email_verified:true},'certisfounder@gmail.com'),'google:s'));
test('secure cookie parser rejects duplicates',()=>assert.equal(readCookie(request('/','GET',`${SESSION_COOKIE}=${'a'.repeat(43)}; ${SESSION_COOKIE}=${'b'.repeat(43)}`),SESSION_COOKIE),null));
test('disabled backend health succeeds but auth fails closed',async()=>{const app=createApplication({config:{enabled:false,origin}});assert.equal((await app(request('/healthz'))).status,200);assert.equal((await app(request('/auth/login','POST'))).status,503);});
test('login requires same-origin POST',async()=>{const {app}=setup();assert.equal((await app(request('/auth/login'))).status,405);assert.equal((await app(new Request(origin+'/auth/login',{method:'POST',headers:{Origin:'https://evil.example'}}))).status,403);});
test('callback requires browser transaction cookie',async()=>{const h=setup();assert.equal((await h.app(request('/auth/callback?state=synthetic'))).status,401);assert.equal(h.completeCalls,0);});
test('login session rotation, replay rejection, session lookup, logout revocation',async()=>{
 const h=setup();const oldId=await h.store.issue('google:old');
 const begin=await h.app(request('/auth/login','POST'));assert.equal(begin.status,303);const login=pick(begin,LOGIN_COOKIE);assert.match(begin.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
 const callback=await h.app(request('/auth/callback?state=synthetic&code=synthetic','GET',login+`; ${SESSION_COOKIE}=${oldId}`));assert.equal(callback.status,303);const session=pick(callback,SESSION_COOKIE);
 assert.equal(await h.store.session(oldId),null);
 assert.equal((await h.app(request('/auth/callback?state=synthetic&code=synthetic','GET',login))).status,401);
 const status=await h.app(request('/auth/session','GET',session));assert.deepEqual(await status.json(),{authenticated:true,founder_authority:false,financial_authority:'none'});
 const q={question:'Synthetic',conversation_id:'x',mode:'public',requested_at:new Date().toISOString()};
 const result=await h.app(request('/api/certis/query','POST',session,q));assert.equal(result.status,200);assert.equal((await result.json()).assessment.evidence_strength,0);
 assert.equal((await h.app(request('/api/certis/query','POST',session,{...q,mode:'founder'}))).status,403);
 assert.equal((await h.app(request('/auth/logout','POST',session))).status,303);
 assert.equal((await h.app(request('/auth/session','GET',session))).status,401);
});
test('provider error is sanitized',async()=>{const h=setup();h.oidc.complete=async()=>{throw Error('SECRET');};const begin=await h.app(request('/auth/login','POST'));const res=await h.app(request('/auth/callback?code=x','GET',pick(begin,LOGIN_COOKIE)));assert.equal(res.status,401);assert.ok(!(await res.text()).includes('SECRET'));});
test('sessions expire absolutely and never acquire founder roles',async()=>{let now=100;const store=new SecurityStore(new FakeRedis(),{now:()=>now});const id=await store.issue('google:s');assert.deepEqual((await store.session(id)).roles,[]);now+=3600001;assert.equal(await store.session(id),null);});
test('login transactions expire',async()=>{let now=100;const store=new SecurityStore(new FakeRedis(),{now:()=>now});const id=await store.transaction({state:'x'});now+=300001;assert.equal(await store.consumeTransaction(id),null);});
test('shared store rate limit persists across adapter instances',async()=>{const redis=new FakeRedis(),a=new SecurityStore(redis),b=new SecurityStore(redis);assert.equal(await a.limit('same',1),true);assert.equal(await b.limit('same',1),false);});
test('redis outage denies login',async()=>{const h=setup();h.redis.eval=async()=>{throw Error('REDIS_SECRET');};const res=await h.app(request('/auth/login','POST'));assert.equal(res.status,503);assert.ok(!(await res.text()).includes('REDIS_SECRET'));});
test('session keys do not contain bearer tokens',async()=>{const h=setup();const id=await h.store.issue('google:s');assert.ok([...h.redis.values.keys()].every(k=>!k.includes(id)));});
test('session TTL and transaction TTL are explicitly set in shared store',async()=>{const calls=[];const store=new SecurityStore({set:async(...args)=>{calls.push(args);return 'OK';}});await store.issue('google:s');await store.transaction({});assert.deepEqual(calls.map(x=>x[2]),[{EX:3600,NX:true},{EX:300,NX:true}]);});
test('failed store write cannot issue session cookie',async()=>{const store=new SecurityStore({set:async()=>null});await assert.rejects(()=>store.issue('google:s'));await assert.rejects(()=>store.transaction({}));});
