import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';

test('real HTTP server smoke: disabled auth, no runtime access, process exits',{timeout:30000},async()=>{
 const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const env={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{PORT:String(port),CERTIS_AUTH_ENABLED:'false',CERTIS_BIND_HOST:'127.0.0.1'});
 const child=spawn(process.execPath,['backend/server.mjs'],{cwd:new URL('..',import.meta.url),env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 try{
   const start=Date.now();while(!output.includes('CERTIS_BRIDGE_LISTENING')){if(child.exitCode!==null||Date.now()-start>20000)throw Error('Server failed to start: '+output);await new Promise(r=>setTimeout(r,25));}
   const base=`http://127.0.0.1:${port}`;
   const health=await fetch(base+'/healthz');assert.equal(health.status,200);const status=await health.json();assert.equal(status.authentication_configured,false);assert.equal(status.evidence_connected,false);assert.equal(status.financial_authority,'none');
   assert.equal((await fetch(base+'/auth/login',{method:'POST',headers:{Origin:'https://certisintelligence.com'}})).status,503);
   assert.equal((await fetch(base+'/api/certis/query',{method:'POST',headers:{Origin:'https://certisintelligence.com','Content-Type':'application/json'},body:'{}'})).status,503);
   assert.equal((await fetch(base+'/state/database.sqlite')).status,404);
   assert.equal((await fetch(base+'/api/certis/query',{method:'POST',body:'x'.repeat(9000)})).status,413);
 }finally{const exited=once(child,'exit');child.kill();await exited;}
});
