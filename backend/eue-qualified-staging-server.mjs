// Explicit one-operation staging bootstrap. Not imported by product startup.
import http from 'node:http';
import {readFileSync,lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {privateKey,reply} from './eue-peer.mjs';
import {validateActivation} from '../contracts/eue-qualified-v2/contract.mjs';
import {createQualifiedInterpretationConsumer} from './eue-qualified-interpretations.mjs';

export function protectedFile(path){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('V2_PRIVATE_CONFIGURATION_REQUIRED');
  return readFileSync(path);
}
export async function startQualifiedStaging({activationFile,keyFile,socket}){
  if(process.env.EUE_QUALIFIED_STAGING!=='SYNTHETIC_LOOPBACK_STAGING')throw Error('V2_EXPLICIT_STAGING_BOOTSTRAP_REQUIRED');
  const activation=validateActivation(JSON.parse(protectedFile(activationFile)),Date.now());
  protectedFile(keyFile);const key=privateKey(keyFile),st=lstatSync(socket);
  if(!st.isSocket()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('V2_PRIVATE_STORE_REQUIRED');
  const {createClient}=await import('redis');
  const redis=createClient({socket:{path:socket,connectTimeout:3000,reconnectStrategy:()=>false},disableOfflineQueue:true});
  redis.on('error',()=>console.error('V2_STORE_UNAVAILABLE'));
  await redis.connect();
  const consumer=createQualifiedInterpretationConsumer({enabled:true,activation,redis,key});
  const server=http.createServer(async(req,res)=>{
    try{
      let result;
      if(req.url==='/health'&&req.method==='GET')result=reply(200,{schema:'certis-qualified-staging/2',real_report_transfers:'HOLD',activation_id:activation.activation_id});
      else if(req.url!=='/private/eue/qualified/v2')result=reply(404,{error:'V2_ROUTE_NOT_FOUND'});
      else{
        let length=0;const chunks=[];
        for await(const chunk of req){length+=chunk.length;if(length>16384){res.writeHead(413,{'Connection':'close'});res.end();return;}chunks.push(chunk);}
        const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
        result=await consumer.ingest(new Request('http://127.0.0.1:8876/private/eue/qualified/v2',{
          method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}));
      }
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
    }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"V2_STAGING_OUTCOME_UNVERIFIED"}');}
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.timeout=8000;server.maxHeadersCount=24;
  const close=async()=>{server.close();server.closeAllConnections();if(redis.isOpen)await redis.quit();};
  const timer=setTimeout(()=>{void close();},Math.max(1,Date.parse(activation.expires_at)-Date.now()));timer.unref();
  process.once('SIGTERM',()=>{void close();});process.once('SIGINT',()=>{void close();});
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8876,'127.0.0.1',resolve);});}
  catch(e){clearTimeout(timer);await close();throw e;}
  console.log('CERTIS_QUALIFIED_V2_PRIVATE_LISTENING');return {server,redis,close};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  const [activationFile,keyFile,socket]=process.argv.slice(2);
  startQualifiedStaging({activationFile,keyFile,socket}).catch(()=>{console.error('V2_STAGING_START_REJECTED');process.exit(2);});
}
