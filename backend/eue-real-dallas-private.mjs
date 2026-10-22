/** Real Dallas EUE receiver entrypoint for the EXISTING private CERTIS host.
 * Not imported by backend/server.mjs, public routes or the synthetic staging unit.
 * Source-only candidate: no VM installation, startup change, key creation or grant.
 */
import http from 'node:http';
import {lstatSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {privateKey,reply} from './eue-peer.mjs';
import {createRealDallasReviewConsumer,validateRealPermit} from './eue-real-dallas-review.mjs';

export const PRIVATE_REAL_DALLAS_PATH='/private/eue/real-dallas/review';
export const PRIVATE_REAL_DALLAS_PORT=8877;
const MAX_BYTES=16384;
const sensitive=['GOOGLE_CLIENT_SECRET','REDIS_URL','CERTIS_EXPORT_TOKEN_SHA256'];
const publicSwitches=['CERTIS_AUTH_ENABLED','CERTIS_PUBLIC_EXPORT_ENABLED',
                       'CERTIS_ENGINE_REQUESTS_ENABLED','CERTIS_EUE_ENABLED'];

function pathField(value){
  if(typeof value!=='string'||!value.startsWith('/')||value.includes('\u0000')||
     value.split('/').includes('..'))throw Error('PRIVATE_EXISTING_HOST_PATH_REQUIRED');
  return value;
}
function ownedStat(path,kind){
  const s=lstatSync(path);
  if(s.isSymbolicLink()||s.uid!==process.geteuid()||(s.mode&0o077)||
     (kind==='file'&&!s.isFile())||(kind==='socket'&&!s.isSocket()))
    throw Error('PRIVATE_EXISTING_HOST_FILE_OR_SOCKET_REQUIRED');
  return s;
}
function protectedActivation(path){
  const size=ownedStat(path,'file').size;
  if(size<2||size>4096)throw Error('PRIVATE_ACTIVATION_SIZE_REJECTED');
  return JSON.parse(readFileSync(path,'utf8'));
}

export function privateRealDallasConfiguration(env){
  if(env?.CERTIS_REAL_DALLAS_ENABLED!=='true')
    throw Error('REAL_DALLAS_PRIVATE_RECEIVER_DISABLED');
  if(env.CERTIS_REAL_DALLAS_ENVIRONMENT!=='EXISTING_PRIVATE_VM')
    throw Error('EXISTING_PRIVATE_VM_REQUIRED');
  if(publicSwitches.some(k=>env[k]&&env[k]!=='false')||
     sensitive.some(k=>Boolean(env[k]))||
     env.CERTIS_BIND_HOST||env.PORT)
    throw Error('PUBLIC_SERVICE_BINDING_REJECTED');
  const config={
    activationFile:pathField(env.CERTIS_REAL_DALLAS_ACTIVATION_FILE),
    deliveryKeyFile:pathField(env.CERTIS_REAL_DALLAS_DELIVERY_KEY_FILE),
    releaseKeyFile:pathField(env.CERTIS_REAL_DALLAS_RELEASE_KEY_FILE),
    redisSocket:pathField(env.CERTIS_REAL_DALLAS_REDIS_SOCKET),
    host:'127.0.0.1',port:PRIVATE_REAL_DALLAS_PORT,
  };
  if(new Set([config.activationFile,config.deliveryKeyFile,
              config.releaseKeyFile,config.redisSocket]).size!==4)
    throw Error('SEPARATE_PRIVATE_BINDINGS_REQUIRED');
  return Object.freeze(config);
}

export function privateRealDallasHandler(consumer){
  if(!consumer||typeof consumer.ingest!=='function')
    throw Error('DEDICATED_REAL_CONSUMER_REQUIRED');
  return async(request)=>{
    const url=new URL(request.url);
    if(url.search||url.hash||url.pathname!==PRIVATE_REAL_DALLAS_PATH)
      return reply(404,{error:'PRIVATE_ROUTE_NOT_FOUND'});
    if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
    return consumer.ingest(request);
  };
}

export async function startPrivateRealDallas({env=process.env,now=Date.now,
                                              redisFactory}={}){
  const config=privateRealDallasConfiguration(env);
  const activation=protectedActivation(config.activationFile);
  const key=privateKey(config.deliveryKeyFile);
  const approvalKey=privateKey(config.releaseKeyFile);
  if(key.equals(approvalKey))throw Error('SEPARATE_DELIVERY_AND_RELEASE_KEYS_REQUIRED');
  validateRealPermit(activation,{key:approvalKey,now:now()});
  ownedStat(config.redisSocket,'socket');
  const createClient=redisFactory??(await import('redis')).createClient;
  const redis=createClient({socket:{path:config.redisSocket,connectTimeout:3000,
                                     reconnectStrategy:()=>false},
                            disableOfflineQueue:true});
  redis.on('error',()=>console.error('CERTIS_REAL_DALLAS_PRIVATE_STORE_UNAVAILABLE'));
  await redis.connect();
  let server,timer,closed=false;
  try{
    const consumer=createRealDallasReviewConsumer({
      enabled:true,activation,redis,key,approvalKey,now,
    });
    const handle=privateRealDallasHandler(consumer);
    server=http.createServer(async(req,res)=>{
      try{
        if(!req.url?.startsWith('/')||req.url.startsWith('//')||
           req.url.length>512) {
          res.writeHead(400,{'Connection':'close'});res.end();return;
        }
        // All routes are private; a health result never asserts evidence qualification.
        if(req.url==='/healthz'&&req.method==='GET'){
          const v=reply(200,{schema:'certis-eue-real-dallas-private/1',
            listener:'LOOPBACK_ONLY',source_qualification:'NOT_ASSERTED',
            customer_report_processed:false,financial_action_authority:'NONE'});
          res.writeHead(v.status,Object.fromEntries(v.headers));
          res.end(Buffer.from(await v.arrayBuffer()));return;
        }
        const headers=new Headers();
        for(const [k,v] of Object.entries(req.headers))
          if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
        let size=0,chunks=[];
        if(!['GET','HEAD'].includes(req.method)){
          for await(const chunk of req){
            size+=chunk.length;
            if(size>MAX_BYTES){
              res.writeHead(413,{'Connection':'close'});res.end();return;
            }
            chunks.push(chunk);
          }
        }
        const request=new Request('http://127.0.0.1:'+config.port+req.url,{
          method:req.method,headers,
          ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{}),
        });
        const v=await handle(request);
        res.writeHead(v.status,Object.fromEntries(v.headers));
        res.end(Buffer.from(await v.arrayBuffer()));
      }catch{
        const v=reply(503,{error:'PRIVATE_REAL_DALLAS_OUTCOME_UNVERIFIED'});
        res.writeHead(v.status,Object.fromEntries(v.headers));
        res.end(Buffer.from(await v.arrayBuffer()));
      }
    });
    server.requestTimeout=10000;
    server.headersTimeout=10000;
    server.timeout=15000;
    server.maxHeadersCount=32;
    const close=async()=>{
      if(closed)return;
      closed=true;
      clearTimeout(timer);
      server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));
      if(redis.isOpen)await redis.quit();
    };
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(config.port,config.host,resolve);
    });
    timer=setTimeout(()=>{void close();},
                     Math.max(1,Date.parse(activation.body.expires_at)-now()));
    timer.unref();
    console.log('CERTIS_REAL_DALLAS_PRIVATE_LOOPBACK_READY');
    return {server,redis,close};
  }catch(error){
    if(server?.listening){
      server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));
    }
    if(redis.isOpen)await redis.quit();
    throw error;
  }
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  startPrivateRealDallas().then(({close})=>{
    process.once('SIGTERM',()=>{void close();});
    process.once('SIGINT',()=>{void close();});
  }).catch(()=>{console.error('CERTIS_REAL_DALLAS_PRIVATE_START_REJECTED');process.exitCode=2;});
}
