// CERTIS Financial Intelligence v0.2 candidate.
// All outputs are read-only research aids. NO external provider calls, credentials,
// evidence-strength scores, autonomous actions, financial advice or customer records.
const ID=/^[a-z][a-z0-9_.:-]{2,79}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const INTEGER=/^-?(0|[1-9]\d{0,14})$/;
const AUTH='none';
const preciseDay=v=>typeof v==='string'&&DAY.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const keys=(obj,expected)=>!!obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join('|')===expected.slice().sort().join('|');
const unique=arr=>new Set(arr).size===arr.length;
const fail=code=>{throw Error(code);};
const result=(kind,data)=>Object.freeze({schema:'certis-financial-research/1',kind,assessment_state:'not_supported',evidence_strength:null,financial_action_authority:AUTH,...data});

// (1) Closed structural financial evidence boundary. Data is caller-supplied:
// admission is structural, NOT certification that the publisher or prices are truthful.
export function admitPublicFinancialObservations(records,asOf){
  if(!preciseDay(asOf)||!Array.isArray(records)||records.length>100)fail('SOURCE_SCOPE');
  const accepted=[],rejected=[];
  for(const r of records){
    if(!keys(r,['id','source_id','source_url','subject','metric','value','unit','observed_on','retrieved_on','source_sha256','classification'])){rejected.push({reason:'SCHEMA'});continue;}
    if(![r.id,r.source_id,r.subject,r.metric].every(x=>typeof x==='string'&&ID.test(x))||
      typeof r.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.source_sha256)||
      !['USD_cents','basis_points','integer_count'].includes(r.unit)||
      !['source_reported','published_estimate'].includes(r.classification)||
      typeof r.value!=='string'||!INTEGER.test(r.value)||
      !preciseDay(r.observed_on)||!preciseDay(r.retrieved_on)||
      r.observed_on>r.retrieved_on||r.retrieved_on>asOf||
      typeof r.source_url!=='string'){rejected.push({reason:'INVALID_VALUE'});continue;}
    let url;try{url=new URL(r.source_url);}catch{rejected.push({reason:'INVALID_URL'});continue;}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.includes('.')){rejected.push({reason:'INVALID_URL'});continue;}
    accepted.push({...r});
  }
  if(!unique(accepted.map(r=>r.id)))fail('DUPLICATE_EVIDENCE_ID');
  return result('source_admission',{as_of:asOf,accepted,rejected,source_authenticity:'not_independently_verified',source_coverage_complete:false});
}

// (2) Customer-independent financial scenarios. Amounts are integer cents;
// shockBps denotes a change in revenue/cost relative to baseline, not a forecast.
export function analyzeOperatingScenarios({annualRevenueCents,annualCostCents,annualDebtServiceCents,scenarios,evidenceIds}){
  if(![annualRevenueCents,annualCostCents,annualDebtServiceCents].every(x=>typeof x==='string'&&/^\d{1,15}$/.test(x))||
     !Array.isArray(scenarios)||scenarios.length>12||!scenarios.length||
     !Array.isArray(evidenceIds)||!evidenceIds.length||!unique(evidenceIds)||!evidenceIds.every(x=>typeof x==='string'&&ID.test(x)))fail('SCENARIO_INPUT');
  const rev=BigInt(annualRevenueCents),cost=BigInt(annualCostCents),debt=BigInt(annualDebtServiceCents);
  const project=(r,c)=>({revenue_cents:r.toString(),cost_cents:c.toString(),debt_service_cents:debt.toString(),surplus_after_debt_cents:(r-c-debt).toString()});
  const stress=scenarios.map(s=>{
    if(!keys(s,['id','revenueShockBps','costShockBps'])||typeof s.id!=='string'||!ID.test(s.id)||
       !Number.isInteger(s.revenueShockBps)||s.revenueShockBps < -10000||s.revenueShockBps>100000||
       !Number.isInteger(s.costShockBps)||s.costShockBps < -10000||s.costShockBps>100000)fail('SCENARIO_SHOCK');
    const r=rev*BigInt(10000+s.revenueShockBps)/10000n,c=cost*BigInt(10000+s.costShockBps)/10000n;
    return {id:s.id,...project(r,c),assumption:{revenueShockBps:s.revenueShockBps,costShockBps:s.costShockBps}};
  });
  if(!unique(stress.map(x=>x.id)))fail('DUPLICATE_SCENARIO');
  return result('operating_scenarios',{baseline:project(rev,cost),scenarios:stress,evidence_ids:[...evidenceIds],assumption_policy:'user_supplied_not_predictions',rounding:'integer_cents_toward_zero',missing_evidence:['Taxes, working capital, depreciation, liquidity, timing and counterparty risk are not modeled.']});
}

// (3) Evidence-reconciliation gate, NEVER a surrogate for 75-point scoring.
export function reconcileEvidenceClaims(claims,observations){
  if(!Array.isArray(claims)||!Array.isArray(observations)||claims.length>50||observations.length>100)fail('CLAIM_SCOPE');
  const byId=new Map();
  for(const o of observations){if(!o||typeof o.id!=='string'||byId.has(o.id))fail('EVIDENCE_ID_INVALID');byId.set(o.id,o);}
  const checks=claims.map(c=>{
    if(!keys(c,['id','kind','evidence_ids','contrary_ids'])||typeof c.id!=='string'||!ID.test(c.id)||
       !['fact','inference','hypothesis'].includes(c.kind)||!Array.isArray(c.evidence_ids)||!Array.isArray(c.contrary_ids)||
       !unique([...c.evidence_ids,...c.contrary_ids])||![...c.evidence_ids,...c.contrary_ids].every(x=>typeof x==='string'&&ID.test(x)))fail('CLAIM_SCHEMA');
    const missing=c.evidence_ids.filter(x=>!byId.has(x));
    const unknownContrary=c.contrary_ids.filter(x=>!byId.has(x));
    return {id:c.id,kind:c.kind,linked_evidence:c.evidence_ids.filter(x=>byId.has(x)),missing_evidence:missing,contrary_evidence:c.contrary_ids.filter(x=>byId.has(x)),missing_contrary_references:unknownContrary,
      structural_linkage_complete:c.evidence_ids.length>0&&!missing.length&&!unknownContrary.length,
      eligible_for_scoring:false}; // Caller IDs cannot qualify authenticity or scoring.
  });
  if(!unique(checks.map(x=>x.id)))fail('DUPLICATE_CLAIM');
  return result('evidence_reconciliation',{checks,scoring_model:null,threshold_75_not_evaluated:true});
}

// (4) One-step financial relationship transmission, only user-supplied assumptions.
// No auto-inferred causality, cycles, paths, or probability.
export function compareFinancialRelationships({changes,relationships,evidenceIds}){
  if(!Array.isArray(changes)||!Array.isArray(relationships)||!Array.isArray(evidenceIds)||!evidenceIds.length||
    !unique(evidenceIds)||!evidenceIds.every(x=>typeof x==='string'&&ID.test(x))||changes.length>30||relationships.length>60)fail('RELATION_SCOPE');
  const changed=new Map();
  for(const c of changes){
    if(!keys(c,['node','deltaBps'])||typeof c.node!=='string'||!ID.test(c.node)||!Number.isInteger(c.deltaBps)||Math.abs(c.deltaBps)>10000||changed.has(c.node))fail('RELATION_CHANGE');
    changed.set(c.node,c.deltaBps);
  }
  const outcomes=relationships.map(edge=>{
    if(!keys(edge,['from','to','sensitivityBps','basis'])||![edge.from,edge.to].every(x=>typeof x==='string'&&ID.test(x))||edge.from===edge.to||
      !Number.isInteger(edge.sensitivityBps)||Math.abs(edge.sensitivityBps)>100000||edge.basis!=='declared_scenario_assumption')fail('RELATION_EDGE');
    const supplied=changed.get(edge.from);
    return {from:edge.from,to:edge.to,implied_delta_bps:supplied===undefined?null:(BigInt(supplied)*BigInt(edge.sensitivityBps)/10000n).toString(),basis:edge.basis};
  });
  if(!unique(outcomes.map(x=>x.from+'>'+x.to)))fail('DUPLICATE_RELATION');
  const graph=new Map(),active=new Set(),visited=new Set();
  for(const edge of outcomes){if(!graph.has(edge.from))graph.set(edge.from,[]);graph.get(edge.from).push(edge.to);}
  const visit=node=>{
    if(active.has(node))fail('CIRCULAR_RELATION');if(visited.has(node))return;
    active.add(node);for(const next of graph.get(node)||[])visit(next);active.delete(node);visited.add(node);
  };
  for(const node of graph.keys())visit(node);
  return result('financial_relationships',{outcomes,evidence_ids:[...evidenceIds],transmission:'one_step_non_compounding',causality:'not_established',probability:'not_established'});
}

// (5) Alert CANDIDATES only. No scheduling, push, email, or live feed operations.
export function evaluateMonitoringCandidates({previous,current,thresholdBps,subject,evidenceIds}){
  if(![previous,current].every(v=>typeof v==='string'&&INTEGER.test(v))||!Number.isInteger(thresholdBps)||thresholdBps<1||thresholdBps>10000||
    typeof subject!=='string'||!ID.test(subject)||!Array.isArray(evidenceIds)||!evidenceIds.length||!unique(evidenceIds)||!evidenceIds.every(x=>typeof x==='string'&&ID.test(x)))fail('MONITOR_INPUT');
  const a=BigInt(previous),b=BigInt(current);
  if(a===0n) return result('monitor_candidate',{subject,triggered:false,reason:'ZERO_BASELINE',notification_sent:false});
  const delta=(b-a)*10000n/(a<0n?-a:a),triggered=(delta<0n?-delta:delta)>=BigInt(thresholdBps);
  return result('monitor_candidate',{subject,triggered,change_bps:delta.toString(),threshold_bps:thresholdBps,evidence_ids:[...evidenceIds],notification_sent:false,source_freshness:'not_verified',reason:triggered?'THRESHOLD_REACHED':'BELOW_THRESHOLD'});
}
