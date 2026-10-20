/** Private staging bootstrap for the actual CERTIS application and EUE consumer.
 * Uses a separate persistent Redis Unix socket. No production session/export
 * credentials or customer authentication are loaded by this entrypoint.
 */
import http from 'node:http';
import {lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createApplication} from './application.mjs';
import {prepareEueConsumer} from './eue-interpretations.mjs';

export function stagingConfiguration(env){
  if(env.CERTIS_EUE_ENVIRONMENT!=='NONPRODUCTION'||env.CERTIS_EUE_ENABLED!=='true')throw Error('EXPLICIT_NONPRODUCTION_EUE_REQUIRED');
  for(const key of ['CERTIS_AUTH_ENABLED','CERTIS_PUBLIC_EXPORT_ENABLED','CERTIS_ENGINE_REQUESTS_ENABLED']){
    if(env[key]&&env[key]!=='false')throw Error('CUSTOMER_OR_PUBLIC_CAPABILITY_REJECTED');
  }
  if(env.GOOGLE_CLIENT_SECRET||env.REDIS_URL||env.CERTIS_EXPORT_TOKEN_SHA256)throw Error('PRODUCTION_CREDENTIAL_BINDING_REJECTED');
  const socket=env.CERTIS_EUE_REDIS_SOCKET;
  if(typeof socket!=='string'||!/^\/[A-Za-z0-9_./-]+$/.test(socket)||socket.split('/').includes('..'))throw Error('PRIVATE_REDIS_SOCKET_REQUIRED');
  return {socket,host:'127.0.0.1',port:8766,origin:'https://certisintelligence.com'};
}

export async function startEueStaging(env=process.env){
  const config=stagingConfiguration(env),st=lstatSync(config.socket);
  if(!st.isSocket()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('PRIVATE_REDIS_SOCKET_OWNERSHIP_REQUIRED');
  const {createClient}=await import('redis');
  const redis=createClient({socket:{path:config.socket,connectTimeout:5000,reconnectStrategy:()=>false},disableOfflineQueue:true});
  redis.on('error',()=>console.error('CERTIS_EUE_STAGING_STORE_UNAVAILABLE'));
  await redis.connect();
  const eue=prepareEueConsumer(env,redis);
  const application=createApplication({config:{enabled:false,origin:config.origin},eue});
  const server=http.createServer(async(req,res)=>{
    try{
      if(!req.url?.startsWith('/')||req.url.startsWith('//')||req.url.length>8192){res.writeHead(400);res.end();return;}
      let length=0;const chunks=[];
      for await(const chunk of req){length+=chunk.length;if(length>8192){res.writeHead(413,{'Connection':'close'});res.end();return;}chunks.push(chunk);}
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
      const request=new Request(new URL(req.url,config.origin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const result=await application(request);res.statusCode=result.status;
      for(const [key,value] of result.headers)res.setHeader(key,value);
      res.end(Buffer.from(await result.arrayBuffer()));
    }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":{"code":"STAGING_UNAVAILABLE"}}');}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=15000;server.maxHeadersCount=40;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,resolve);});
  console.log('CERTIS_EUE_PRIVATE_STAGING_LISTENING');
  const close=async()=>{server.close();server.closeIdleConnections();if(redis.isOpen)await redis.quit();};
  process.once('SIGTERM',()=>{void close();});process.once('SIGINT',()=>{void close();});
  return {server,redis,close};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  startEueStaging().catch(()=>{console.error('CERTIS_EUE_STAGING_START_REJECTED');process.exit(2);});
}
