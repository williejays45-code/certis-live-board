import {createHash,timingSafeEqual} from 'node:crypto';
import {unavailable} from '../bridge/query.mjs';

// Narrow data transfer, not an HTTP tunnel or remote runtime command interface.
export const AGE_MS=300000;
const KEY='certis:bridge:v1:public-market-export';
const assets=new Set(['btc','eth','xrp','sol']);
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const price=x=>typeof x==='string'&&/^(?:0|[1-9]\d{0,8})(?:\.\d{1,12})?$/.test(x)&&Number(x)>0;
export function validateExport(value,now=Date.now()){
  if(!exact(value,['schema','runtime_version','generated_at','quotes'])||value.schema!=='certis-public-market-export/1'||value.runtime_version!=='3.22.7'||!date(value.generated_at)||Date.parse(value.generated_at)>now||now-Date.parse(value.generated_at)>AGE_MS||!Array.isArray(value.quotes)||value.quotes.length>4)throw Error('INVALID_EXPORT');
  const seen=new Set();
  for(const q of value.quotes){
    if(!exact(q,['asset','observed_at','last','bid','ask'])||!assets.has(q.asset)||seen.has(q.asset)||!date(q.observed_at)||Date.parse(q.observed_at)>Date.parse(value.generated_at)||now-Date.parse(q.observed_at)>AGE_MS||!['last','bid','ask'].every(k=>price(q[k]))||Number(q.bid)>Number(q.ask))throw Error('INVALID_EXPORT');
    seen.add(q.asset);
  }
  return structuredClone(value);
}
const reply=(status,code)=>new Response(JSON.stringify({status:code}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createPublicEvidence({redis,tokenSha256,now=Date.now}={}){
  if(!redis||!/^[a-f0-9]{64}$/.test(tokenSha256||''))throw Error('EXPORT_CONFIGURATION_INVALID');
  return {
    async available(){
      try{const raw=await redis.get(KEY);return !!raw&&validateExport(JSON.parse(raw).value,now()).quotes.length>0;}catch{return false;}
    },
    async ingest(request){
      if(request.method!=='POST')return reply(405,'METHOD_NOT_ALLOWED');
      const token=request.headers.get('authorization')||'';
      if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(token)||!timingSafeEqual(createHash('sha256').update(token.slice(7)).digest(),Buffer.from(tokenSha256,'hex')))return reply(401,'EXPORT_AUTHENTICATION_REQUIRED');
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,'JSON_REQUIRED');
      try{
        const reader=request.body?.getReader();if(!reader)return reply(400,'INVALID_EXPORT');
        const chunks=[];let size=0;
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return reply(413,'EXPORT_TOO_LARGE');}chunks.push(value);}
        const parsed=validateExport(JSON.parse(Buffer.concat(chunks).toString('utf8')),now());
        // Atomic monotonic replacement across workers: replay cannot refresh TTL.
        const script="local old=redis.call('GET',KEYS[1]); if old and tonumber(cjson.decode(old).generation)>=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',300); return 1";
        const generation=Date.parse(parsed.generated_at);
        const accepted=await redis.eval(script,{keys:[KEY],arguments:[String(generation),JSON.stringify({generation,value:parsed})]});
        return accepted===1?reply(202,'EXPORT_ACCEPTED'):reply(409,'EXPORT_REPLAYED');
      }catch{return reply(503,'EXPORT_REJECTED_OR_STORE_UNAVAILABLE');}
    },
    async query({mode,question}){
      if(mode!=='public')throw Error('PUBLIC_EXPORT_ONLY');
      const raw=await redis.get(KEY);if(!raw)return unavailable();
      const value=validateExport(JSON.parse(raw).value,now());
      const out=unavailable();
      // No persistence, private memory lookup, or use of conversation IDs.
      const questionAssets=new Set();
      const names={btc:['btc','bitcoin'],eth:['eth','ethereum'],xrp:['xrp'],sol:['sol','solana']};
      for(const [id,aliases] of Object.entries(names))if(aliases.some(a=>new RegExp('\\b'+a+'\\b','i').test(question)))questionAssets.add(id);
      const quotes=value.quotes.filter(q=>questionAssets.size===0||questionAssets.has(q.asset));
      out.assessment.missing_evidence=['These are single-provider reference quotes, not an evaluated investment thesis. No evidence-strength scoring model has been applied.'];
      if(!quotes.length)out.assessment.missing_evidence.push('No fresh admitted observation is available for the requested asset.');
      out.assessment.next_watch=['Refresh admitted observations and obtain independent, relevant evidence before assessing a conclusion.'];
      for(const q of quotes){
        const claim=`${q.asset.toUpperCase()}/USD reference quote: last ${q.last}, bid ${q.bid}, ask ${q.ask}.`;
        out.assessment.observations.push(claim);
        out.sources.push({label:`Kraken ${q.asset.toUpperCase()}/USD public ticker`,uri:'https://api.kraken.com/0/public/Ticker',checked_at:q.observed_at,source_type:'market',supports:[claim],challenges:[]});
      }
      return out;
    }
  };
}
