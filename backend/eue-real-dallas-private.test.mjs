import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtempSync,writeFileSync,chmodSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {canonical} from './eue-peer.mjs';
import {privateRealDallasConfiguration,privateRealDallasHandler,
        PRIVATE_REAL_DALLAS_PORT,startPrivateRealDallas} from './eue-real-dallas-private.mjs';

const k=Buffer.alloc(48,68),approval=Buffer.alloc(48,83);
const fixed='f'.repeat(64);
const at=milliseconds=>new Date(milliseconds).toISOString();
function activation(now=Date.now()){
  const body={schema:'certis-eue-real-dallas-activation/1',
    issuer:'CERTIS_RELEASE_AUTHORITY',
    activation_id:'CERTIS-REAL-'+'a'.repeat(32),mode:'ONE_REPORT_READ_ONLY',
    authorized_report_sha256:fixed,source_approval_sha256:'b'.repeat(64),
    issuer_scope:'ENTRUS_CORE',recipient_scope:'CERTIS_REAL_EUE_REVIEW',
    not_before:at(now-3000),expires_at:at(now+120000),
    public_evidence_updates:false,billing_authority:'NONE',
    financial_action_authority:'NONE',action_authority:'NONE'};
  return {body,signature:createHmac('sha256',approval).update(canonical(body)).digest('hex')};
}
const env=(root)=>({
  CERTIS_REAL_DALLAS_ENABLED:'true',
  CERTIS_REAL_DALLAS_ENVIRONMENT:'EXISTING_PRIVATE_VM',
  CERTIS_REAL_DALLAS_ACTIVATION_FILE:join(root,'permit.json'),
  CERTIS_REAL_DALLAS_DELIVERY_KEY_FILE:join(root,'delivery.key'),
  CERTIS_REAL_DALLAS_RELEASE_KEY_FILE:join(root,'approval.key'),
  CERTIS_REAL_DALLAS_REDIS_SOCKET:join(root,'redis.sock')
});

test('default disabled and never converts public or synthetic service to real',()=>{
  assert.throws(()=>privateRealDallasConfiguration({}),/DISABLED/);
  assert.throws(()=>privateRealDallasConfiguration({
    CERTIS_REAL_DALLAS_ENABLED:'true',
    CERTIS_REAL_DALLAS_ENVIRONMENT:'NONPRODUCTION',
  }),/EXISTING_PRIVATE_VM_REQUIRED/);
  const e=env('/tmp');
  assert.equal(privateRealDallasConfiguration(e).host,'127.0.0.1');
  assert.equal(privateRealDallasConfiguration(e).port,8877);
  for(const [k,value] of [['PORT','3000'],['CERTIS_BIND_HOST','0.0.0.0'],
    ['REDIS_URL','redis://public'],['CERTIS_AUTH_ENABLED','true'],
    ['CERTIS_EUE_ENABLED','true'],['CERTIS_PUBLIC_EXPORT_ENABLED','true'],
    ['CERTIS_ENGINE_REQUESTS_ENABLED','true']]){
    assert.throws(()=>privateRealDallasConfiguration({...e,[k]:value}),
                  /PUBLIC_SERVICE_BINDING_REJECTED/,k);
  }
  assert.throws(()=>privateRealDallasConfiguration({
    ...e,CERTIS_REAL_DALLAS_RELEASE_KEY_FILE:e.CERTIS_REAL_DALLAS_DELIVERY_KEY_FILE
  }),/SEPARATE_PRIVATE_BINDINGS_REQUIRED/);
  assert.throws(()=>privateRealDallasConfiguration({
    ...e,CERTIS_REAL_DALLAS_REDIS_SOCKET:'/tmp/../elsewhere'
  }),/PRIVATE_EXISTING_HOST_PATH_REQUIRED/);
});

test('no import or listener changes to public CERTIS server',()=>{
  const code=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');
  assert.ok(!code.includes('eue-real-dallas-private'));
  assert.ok(!code.includes('eue-real-dallas-review'));
});

test('private handler admits exact path and POST only',async()=>{
  const seen=[];
  const handle=privateRealDallasHandler({async ingest(req){
    seen.push(req.method);return new Response('denied',{status:403});
  }});
  const origin='http://127.0.0.1:'+PRIVATE_REAL_DALLAS_PORT;
  const r=path=>new Request(origin+path,{method:'POST'});
  assert.equal((await handle(r('/internal/eue/interpretations'))).status,404);
  assert.equal((await handle(r('/private/eue/real-dallas/review?x=1'))).status,404);
  assert.equal((await handle(new Request(origin+'/private/eue/real-dallas/review'))).status,405);
  assert.equal((await handle(r('/private/eue/real-dallas/review'))).status,403);
  assert.deepEqual(seen,['POST']);
});

test('protected loopback host uses existing Unix socket and rejects unsanctioned delivery',async(t)=>{
  if(process.platform==='win32')return t.skip('POSIX file and socket permissions required');
  const root=mkdtempSync(join(tmpdir(),'certis-eue-real-'));
  const e=env(root);
  writeFileSync(e.CERTIS_REAL_DALLAS_ACTIVATION_FILE,JSON.stringify(activation()),{mode:0o600});
  writeFileSync(e.CERTIS_REAL_DALLAS_DELIVERY_KEY_FILE,k,{mode:0o600});
  writeFileSync(e.CERTIS_REAL_DALLAS_RELEASE_KEY_FILE,approval,{mode:0o600});
  const unix=createServer();
  await new Promise((resolve,reject)=>{
    unix.once('error',reject);
    unix.listen(e.CERTIS_REAL_DALLAS_REDIS_SOCKET,resolve);
  });
  chmodSync(e.CERTIS_REAL_DALLAS_REDIS_SOCKET,0o600);
  const writes=[],redis={
    isOpen:false,
    on(){},
    async connect(){this.isOpen=true;},
    async quit(){this.isOpen=false;},
    async set(...args){writes.push(args);return 'OK';},
  };
  let started;
  t.after(async()=>{
    if(started)await started.close();
    await new Promise(resolve=>unix.close(resolve));
    rmSync(root,{recursive:true,force:true});
  });
  // Keys and activation must already exist; no request is allowed to provision them.
  chmodSync(e.CERTIS_REAL_DALLAS_RELEASE_KEY_FILE,0o644);
  await assert.rejects(
    startPrivateRealDallas({env:e,redisFactory:()=>redis}),
    /PRIVATE_KEY_PERMISSIONS_REQUIRED/);
  assert.equal(redis.isOpen,false);
  chmodSync(e.CERTIS_REAL_DALLAS_RELEASE_KEY_FILE,0o600);
  started=await startPrivateRealDallas({env:e,redisFactory:()=>redis});
  assert.equal(started.server.address().address,'127.0.0.1');
  assert.equal(started.server.address().port,8877);
  const origin='http://127.0.0.1:'+PRIVATE_REAL_DALLAS_PORT;
  const health=await fetch(origin+'/healthz');
  assert.equal(health.status,200);
  const status=await health.json();
  assert.equal(status.source_qualification,'NOT_ASSERTED');
  assert.equal(status.financial_action_authority,'NONE');
  assert.equal(status.customer_report_processed,false);
  assert.equal((await fetch(origin+'/auth/session')).status,404);
  assert.equal((await fetch(origin+'/private/eue/real-dallas/review',{method:'POST',
    headers:{'Content-Type':'application/json'},body:'{"schema":"invented"}'})).status,403);
  assert.deepEqual(writes,[]);
  // A listener on the private host is not an activation for any report.
  await started.close();started=null;
  assert.equal(redis.isOpen,false);
});

test('expired signed permit cannot open a listener',async(t)=>{
  if(process.platform==='win32')return t.skip('POSIX permissions required');
  const root=mkdtempSync(join(tmpdir(),'certis-eue-expired-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const e=env(root),old=Date.now()-3600000;
  writeFileSync(e.CERTIS_REAL_DALLAS_ACTIVATION_FILE,JSON.stringify(activation(old)),{mode:0o600});
  writeFileSync(e.CERTIS_REAL_DALLAS_DELIVERY_KEY_FILE,k,{mode:0o600});
  writeFileSync(e.CERTIS_REAL_DALLAS_RELEASE_KEY_FILE,approval,{mode:0o600});
  await assert.rejects(startPrivateRealDallas({env:e,redisFactory:()=>{throw Error('MUST_NOT_CONNECT');}}),
                       /REAL_CONSUMER_PERMIT_EXPIRED/);
});
