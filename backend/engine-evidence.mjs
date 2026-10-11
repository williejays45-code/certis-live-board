import {createHash,timingSafeEqual} from 'node:crypto';
import {validateExport,AGE_MS} from './public-evidence.mjs';
import {unavailable} from '../bridge/query.mjs';

const KEY='certis:bridge:v1:public-engine-evidence';
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x));
const requirementIds=new Set(['digital-asset-registry-profile','public-market-observation','active-contradiction-state','xrpl-endpoint-qualification','validated-ledger-anchor','xrpl-security-posture','evidence-provenance-packet']);
const canonical={btc:'bitcoin',eth:'ether',xrp:'xrp',sol:'solana'};
const scaled=s=>{const [a,b='']=s.split('.');return BigInt(a)*10n**12n+BigInt(b.padEnd(12,'0'));};
const fixed=(n,d)=>{const s=n.toString().padStart(d+1,'0');return s.slice(0,-d)+'.'+s.slice(-d);};
export function claims(q){
  const bid=scaled(q.bid),ask=scaled(q.ask),spread=ask-bid;
  const pct=fixed(spread*200n*10n**6n/(ask+bid),6);
  return {
    fact:`${q.asset.toUpperCase()}/USD reference quote: last ${q.last}, bid ${q.bid}, ask ${q.ask}.`,
    inference:`The quoted ${q.asset.toUpperCase()}/USD bid-ask spread is ${fixed(spread,12)} USD (${pct}% of the midpoint, rounded down). This calculation describes one provider's quote, not a forecast or executable price.`
  };
}
export function validateEngineExport(v,now=Date.now()){
  if(!exact(v,['schema','runtime_version','generated_at','quotes','analyses'])||v.schema!=='certis-public-engine-export/1')throw Error('INVALID_ENGINE_EXPORT');
  validateExport({schema:'certis-public-market-export/1',runtime_version:v.runtime_version,generated_at:v.generated_at,quotes:v.quotes},now);
  if(!v.quotes.length||!Array.isArray(v.analyses)||v.analyses.length!==v.quotes.length)throw Error('MISSING_ENGINE_ANALYSIS');
  const seen=new Set();
  for(const a of v.analyses){
    const q=v.quotes.find(q=>q.asset===a?.asset);
    if(!q||seen.has(a.asset)||!exact(a,['asset','evaluated_at','evaluation','plan']))throw Error('INVALID_ENGINE_ANALYSIS');
    seen.add(a.asset);
    if(!iso(a.evaluated_at)||Date.parse(a.evaluated_at)<Date.parse(q.observed_at)||Date.parse(a.evaluated_at)>Date.parse(v.generated_at))throw Error('INVALID_ENGINE_TIME');
    if(!exact(a.evaluation,['policy_version','passed','assertion_count','citation_grounding','required_evidence_coverage','contradiction_disclosure','authoritative_verdict','financial_action_authority'])||a.evaluation.policy_version!=='certis-reasoning-control/1.0'||a.evaluation.passed!==true||a.evaluation.assertion_count!==2||a.evaluation.citation_grounding!==1||a.evaluation.required_evidence_coverage!==1||a.evaluation.contradiction_disclosure!==1||a.evaluation.authoritative_verdict!==false||a.evaluation.financial_action_authority!=='none')throw Error('ENGINE_CHECK_FAILED');
    const p=a.plan;
    if(!exact(p,['canonical_asset_id','state','required_evidence','automatic_execution_enabled','integrity_verified'])||p.canonical_asset_id!==canonical[a.asset]||!['ready_for_safe_acquisition','needs_customer_input'].includes(p.state)||p.automatic_execution_enabled!==false||p.integrity_verified!==true||!Array.isArray(p.required_evidence)||p.required_evidence.length<2||p.required_evidence.length>7||new Set(p.required_evidence).size!==p.required_evidence.length||!p.required_evidence.every(x=>requirementIds.has(x))||!p.required_evidence.includes('digital-asset-registry-profile')||!p.required_evidence.includes('active-contradiction-state'))throw Error('INVALID_ENGINE_PLAN');
  }
  return structuredClone(v);
}

const reply=(status,code)=>new Response(JSON.stringify({status:code}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createEngineEvidence({redis,tokenSha256,now=Date.now}){
  if(!redis||!/^[a-f0-9]{64}$/.test(tokenSha256||''))throw Error('ENGINE_CONFIGURATION_INVALID');
  return {
    async read(){const raw=await redis.get(KEY);if(!raw)return null;return validateEngineExport(JSON.parse(raw).value,now());},
    async available(){try{return !!await this.read();}catch{return false;}},
    async ingest(request){
      if(request.method!=='POST')return reply(405,'METHOD_NOT_ALLOWED');
      const token=request.headers.get('authorization')||'';
      if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(token)||!timingSafeEqual(createHash('sha256').update(token.slice(7)).digest(),Buffer.from(tokenSha256,'hex')))return reply(401,'EXPORT_AUTHENTICATION_REQUIRED');
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,'JSON_REQUIRED');
      try{
        const reader=request.body?.getReader();if(!reader)return reply(400,'INVALID_ENGINE_EXPORT');
        const chunks=[];let length=0;
        for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();return reply(413,'EXPORT_TOO_LARGE');}chunks.push(value);}
        const value=validateEngineExport(JSON.parse(Buffer.concat(chunks).toString('utf8')),now());
        const generation=Date.parse(value.generated_at);
        const script="local old=redis.call('GET',KEYS[1]); if old and tonumber(cjson.decode(old).generation)>=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',300); return 1";
        const ok=await redis.eval(script,{keys:[KEY],arguments:[String(generation),JSON.stringify({generation,value})]});
        return ok===1?reply(202,'ENGINE_EXPORT_ACCEPTED'):reply(409,'EXPORT_REPLAYED');
      }catch{return reply(503,'ENGINE_EXPORT_REJECTED_OR_STORE_UNAVAILABLE');}
    }
  };
}

export function routeQuestion(question){
  if(/\b(bitcoin cash|ethereum classic|wrapped bitcoin|wrapped ether|doge|dogecoin|ada|cardano|avax|avalanche|bch|wbtc)\b/i.test(question))return {area:'unresolved',assets:[]};
  const assets=[];for(const [id,pattern] of Object.entries({btc:/\b(btc|bitcoin)\b/i,eth:/\b(eth|ether|ethereum)\b/i,xrp:/\bxrp\b/i,sol:/\b(sol|solana)\b/i}))if(pattern.test(question))assets.push(id);
  const areas=[];
  if(assets.length||/\b(crypto|cryptocurrency|digital assets?|public market|market evidence)\b/i.test(question))areas.push('crypto');
  if(/\b(stocks?|equities|equity|funds?|etfs?|bonds?|traditional finance|aapl|spy|sp500)\b/i.test(question))areas.push('traditional_finance');
  if(/\b(property|land|real estate|parcel|county|landitrus)\b/i.test(question))areas.push('property');
  if(/\b(business|entrus|revenue|cash flow|budget|profit|arts)\b/i.test(question))areas.push('business');
  if(areas.length>1)return {area:'cross_domain',assets:[]};
  if(!areas.length&&/^(certis[, ]*)?(what (are you seeing|can you see)( right now)?[?.!]?|show me what matters[?.!]?)$/i.test(question.trim()))areas.push('crypto');
  return {area:areas[0]||'unresolved',assets};
}
export const areaGaps={
  traditional_finance:['No qualified equity/fund prices, filings, or relevant market-risk evidence is connected to this public workspace.'],
  property:['A verified LANDITRUS property identity and dated property/comparable evidence are required. No protected LANDITRUS report exchange is connected here.'],
  business:['Verified EnTrus revenue, cost, cash-flow and decision assumptions are required. Private business records are not connected to this public workspace.'],
  cross_domain:['This question crosses intelligence areas. Specify one asset or decision first; cross-domain evidence is not connected.'],
  unresolved:['The subject is unresolved. Specify BTC, XRP, ETH, SOL, an equity/fund, a LANDITRUS property, or an EnTrus business decision.']
};
export function projectEngine(value,question){
  const route=routeQuestion(question),out=unavailable();
  if(route.area!=='crypto'){
    out.assessment.missing_evidence=areaGaps[route.area];
    out.assessment.next_watch=['Supply qualified evidence for this area before drawing a conclusion.'];
    return out;
  }
  const selected=value.quotes.filter(q=>!route.assets.length||route.assets.includes(q.asset));
  if(!selected.length){out.assessment.missing_evidence=['No fresh engine-checked observation exists for the requested asset. Bitcoin is the currently activated recurring feed.'];return out;}
  out.assessment.state='INSUFFICIENT_EVIDENCE';
  out.assessment.missing_evidence=[
    'No validated evidence-strength scoring model has been applied. Zero means unscored, not a measured zero-confidence investment conclusion.',
    'Independent corroboration, relevant historical/fundamental evidence and a decision-specific assessment are missing.',
    'The engine checked citation references and authority constraints; it did not independently establish source accuracy.',
    'Contradiction coverage is limited to this admitted quote set. Broader contradictory evidence has not been acquired.'
  ];
  out.assessment.next_watch=['Refresh quotes before their five-minute freshness limit; an offline or held node produces an evidence gap.','Verify independent evidence and the engine intake requirements before assessing a thesis.'];
  for(const q of selected){
    const c=claims(q);out.assessment.observations.push(c.fact);out.assessment.inferences.push(c.inference);
    out.sources.push({label:`Kraken ${q.asset.toUpperCase()}/USD public ticker`,uri:'https://api.kraken.com/0/public/Ticker',checked_at:q.observed_at,source_type:'market',supports:[c.fact,c.inference],challenges:[]});
  }
  out.engine={version:value.runtime_version,adapter:'certis-public-engine-export/1',scope:'public_quote_checks',assessment_complete:false,score_model:null,
    checks:selected.map(q=>{const a=value.analyses.find(a=>a.asset===q.asset);return {asset:q.asset,evaluated_at:a.evaluated_at,policy_version:a.evaluation.policy_version,passed:true,intake_state:a.plan.state,required_evidence:a.plan.required_evidence};})};
  return out;
}
