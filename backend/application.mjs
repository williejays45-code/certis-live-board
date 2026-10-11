import {diagnosticLine} from './auth-diagnostics.mjs';
import {createQueryHandler} from '../bridge/query.mjs';
import {SESSION_COOKIE,LOGIN_COOKIE,cookie,readCookie} from './security.mjs';
import {projectEngine,routeQuestion,areaGaps} from './engine-evidence.mjs';
import {unavailable} from '../bridge/query.mjs';
function response(status,body,headers={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});}
const error=(status,code)=>response(status,{error:{code}});
export function createApplication({config,store,oidc,evidence,intelligence,engineRequests}={}){
  const active=config.enabled && !!store && !!oidc;
  const query=createQueryHandler(active?{
    verifySession:request=>store.session(readCookie(request,SESSION_COOKIE)),
    consumeRateLimit:principal=>store.limit('query:'+principal),
    ...(evidence?{queryEvidence:async args=>{
      if(args.mode!=='public')throw Error('PUBLIC_ONLY');
      if(intelligence){
        let value;try{value=await intelligence.read();}catch{value=null;}
        if(value)return projectEngine(value,args.question);
      }
      const route=routeQuestion(args.question);
      if(route.area!=='crypto'){const out=unavailable();out.assessment.missing_evidence=areaGaps[route.area];return out;}
      return evidence.query(args);
    },maxEvidenceAgeMs:300000}:{}),
  }:{});
  return async request=>{
    const url=new URL(request.url);
    if(url.origin!==config.origin)return error(403,'ORIGIN_DENIED');
    const path=url.pathname;
    if(path==='/api/certis/query'&&url.searchParams.get('engine_request')==='1')return active&&engineRequests?engineRequests.browser(request):error(503,'ENGINE_REQUESTS_NOT_CONFIGURED');
    if(path==='/internal/public-engine/claim'||path==='/internal/public-engine/complete')return active&&engineRequests?engineRequests.machine(request):error(503,'ENGINE_REQUESTS_NOT_CONFIGURED');
    if(path==='/internal/public-evidence')return evidence?evidence.ingest(request):error(503,'EXPORT_NOT_CONFIGURED');
    if(path==='/internal/public-intelligence')return intelligence?intelligence.ingest(request):error(503,'ENGINE_EXPORT_NOT_CONFIGURED');
    if(path==='/healthz' && request.method==='GET'){
      const engineConnected=intelligence?await intelligence.available():false;
      return response(200,{status:'ok',service:'certis-bridge',authentication_configured:!!active,public_export_configured:!!evidence,evidence_connected:engineConnected||(evidence?await evidence.available():false),engine_connected:engineConnected,engine_adapter:'certis-public-engine-export/1',engine_requests_enabled:!!engineRequests,provider_enabled:false,financial_authority:'none'});
    }
    if(path==='/api/certis/query')return query(request);
    if(!['/auth/login','/auth/callback','/auth/session','/auth/logout'].includes(path))return error(404,'NOT_FOUND');
    if(!active)return error(503,'AUTHENTICATION_NOT_CONFIGURED');
    try {
      if(path==='/auth/login' && request.method==='POST'){
        if(request.headers.get('origin')!==config.origin)return error(403,'ORIGIN_DENIED');
        if(!await store.limit('login-global',30))return error(429,'RATE_LIMITED');
        const login=await oidc.begin();const id=await store.transaction(login.transaction);
        return response(303,{}, {'Location':login.url,'Set-Cookie':cookie(LOGIN_COOKIE,id,300)});
      }
      if(path==='/auth/callback' && request.method==='GET'){
        const id=readCookie(request,LOGIN_COOKIE);
        const tx=await store.consumeTransaction(id);
        if(!tx)return error(401,'LOGIN_EXPIRED_OR_REPLAYED');
        let principal;
        try{principal=await oidc.complete(url,tx);}catch(error){console.warn(diagnosticLine(error));return response(401,{error:{code:'SIGN_IN_REJECTED'}},{'Set-Cookie':cookie(LOGIN_COOKIE,'',0)});}
        await store.revoke(readCookie(request,SESSION_COOKIE));
        const sessionId=await store.issue(principal);
        const result=response(303,{}, {'Location':config.origin+'/'});
        result.headers.append('Set-Cookie',cookie(LOGIN_COOKIE,'',0));
        result.headers.append('Set-Cookie',cookie(SESSION_COOKIE,sessionId,3600));
        return result;
      }
      if(path==='/auth/session' && request.method==='GET'){
        const principal=await store.session(readCookie(request,SESSION_COOKIE));
        return response(principal?200:401,{authenticated:!!principal,founder_authority:false,financial_authority:'none'});
      }
      if(path==='/auth/logout' && request.method==='POST'){
        if(request.headers.get('origin')!==config.origin)return error(403,'ORIGIN_DENIED');
        await store.revoke(readCookie(request,SESSION_COOKIE));
        return response(303,{}, {'Location':config.origin+'/','Set-Cookie':cookie(SESSION_COOKIE,'',0)});
      }
      return error(405,'METHOD_NOT_ALLOWED');
    }catch{return error(503,'AUTH_SERVICE_UNAVAILABLE');}
  };
}
