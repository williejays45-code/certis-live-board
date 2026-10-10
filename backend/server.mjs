import http from 'node:http';
import {createClient} from 'redis';
import {configuration,SecurityStore} from './security.mjs';
import {googleAuthentication} from './oidc.mjs';
import {createApplication} from './application.mjs';
import {createPublicEvidence} from './public-evidence.mjs';

const config=configuration(process.env);
let redis,store,oidc;
if(config.enabled){
  redis=createClient({url:config.redisUrl,disableOfflineQueue:true,socket:{connectTimeout:5000,reconnectStrategy:()=>false}});
  redis.on('error',()=>console.error('CERTIS_SESSION_STORE_UNAVAILABLE'));
  await redis.connect();
  store=new SecurityStore(redis);
  oidc=await googleAuthentication(config);
}
const evidence=process.env.CERTIS_PUBLIC_EXPORT_ENABLED==='true'
  ?createPublicEvidence({redis,tokenSha256:process.env.CERTIS_EXPORT_TOKEN_SHA256}):undefined;
const application=createApplication({config,store,oidc,evidence});
const server=http.createServer(async(req,res)=>{
  try{
    if(!req.url?.startsWith('/')||req.url.startsWith('//')||req.url.length>8192){res.writeHead(400);res.end();return;}
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;if(length>8192){res.writeHead(413,{'Connection':'close'});res.end();return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
    const request=new Request(new URL(req.url,config.origin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const result=await application(request);
    res.statusCode=result.status;
    for(const [key,value] of result.headers)if(key!=='set-cookie')res.setHeader(key,value);
    const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":{"code":"SERVICE_UNAVAILABLE"}}');}
});
server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=15000;server.maxHeadersCount=40;
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
server.listen(port,process.env.CERTIS_BIND_HOST||'0.0.0.0',()=>console.log('CERTIS_BRIDGE_LISTENING'));
async function shutdown(){server.close();server.closeIdleConnections();if(redis?.isOpen)await redis.quit();setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
