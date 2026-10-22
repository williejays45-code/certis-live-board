// Requirements only. A complete request is ready for offline model evaluation;
// it is never evidence acceptance, a valuation, entitlement, or a scored result.
const CONTRACTS=Object.freeze({
 stock:['instrument_id','currency','price_as_of','price_cents','issuer_filing_ids','liquidity_evidence_ids','price_shock_bps'],
 etf:['instrument_id','currency','price_as_of','price_cents','holdings_as_of','holdings_evidence_ids','expense_ratio_bps','liquidity_evidence_ids','price_shock_bps'],
 bond:['instrument_id','currency','price_as_of','price_cents','coupon_bps','maturity_on','modified_duration_milli_years','yield_shock_bps','credit_evidence_ids','liquidity_evidence_ids'],
 macro:['series_id','unit','earlier_period','later_period','earlier_value','later_value','revision_evidence_ids'],
 business:['currency','period_start','period_end','opening_cash_cents','cash_inflows_cents','cash_outflows_cents','debt_service_cents','working_capital_evidence_ids','timing_evidence_ids']
});
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9_.:-]{2,79}$/.test(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const decimal=v=>typeof v==='string'&&/^-?(0|[1-9][0-9]{0,14})$/.test(v);
const cents=v=>decimal(v)&&!v.startsWith('-');
function valid(field,value){
 if(field.endsWith('_evidence_ids')||field==='issuer_filing_ids')return Array.isArray(value)&&value.length>0&&value.length<=100&&value.every(id)&&new Set(value).size===value.length;
 if(field==='currency')return value==='USD';
 if(field.endsWith('_cents'))return cents(value);
 if(['earlier_value','later_value'].includes(field))return decimal(value);
 if(field.endsWith('_bps'))return Number.isInteger(value)&&value>=((field==='price_shock_bps'||field==='yield_shock_bps')?-10000:0)&&value<=10000;
 if(field==='modified_duration_milli_years')return Number.isInteger(value)&&value>=0&&value<=100000;
 if(field.endsWith('_as_of')||field.endsWith('_on')||field.endsWith('_period')||field.startsWith('period_'))return day(value);
 return id(value);
}
export function assessAnalysisContract(kind,input){
 const fields=CONTRACTS[kind];
 if(!fields||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))throw Error('ANALYSIS_SCHEMA');
 const missing=fields.filter(k=>input[k]===null||input[k]===undefined);
 const invalid=fields.filter(k=>!missing.includes(k)&&!valid(k,input[k]));
 if(!missing.length&&!invalid.length){
  if(kind==='macro'&&input.earlier_period>=input.later_period)invalid.push('later_period');
  if(kind==='macro'&&input.earlier_value==='0')invalid.push('earlier_value');
  if(kind==='business'&&input.period_start>input.period_end)invalid.push('period_end');
  if(kind==='bond'&&input.maturity_on<=input.price_as_of)invalid.push('maturity_on');
  if(kind==='etf'&&input.holdings_as_of>input.price_as_of)invalid.push('holdings_as_of');
 }
 return {schema:'certis-financial-analysis-contract/1',kind,
  state:invalid.length?'invalid_input':missing.length?'missing_data':'ready_for_offline_evaluation',
  missing_fields:missing,invalid_fields:invalid,model_result:null,
  freshness:'not_qualified',source_authenticity:'not_qualified',
  assessment_state:'not_supported',evidence_strength:null,financial_action_authority:'none'};
}

// A declared sensitivity now has per-edge attribution. Supplied IDs remain
// structural until the independent assumption review/protected engine accepts.
export function assessRelationshipAttribution(relationships,assumptions){
 if(!Array.isArray(relationships)||relationships.length>60||!Array.isArray(assumptions)||assumptions.length>100)throw Error('ATTRIBUTION_SCOPE');
 const index=new Map();
 for(const a of assumptions){
  if(!a||Object.keys(a).sort().join('|')!=='evidence_ids|id|publisher_group|review_state'||!id(a.id)||!id(a.publisher_group)||
   !Array.isArray(a.evidence_ids)||!a.evidence_ids.length||a.evidence_ids.length>100||!a.evidence_ids.every(id)||
   new Set(a.evidence_ids).size!==a.evidence_ids.length||a.review_state!=='pending_independent_review'||index.has(a.id))throw Error('ATTRIBUTION_ASSUMPTION');
  index.set(a.id,a);
 }
 const seen=new Set();
 const edges=relationships.map(edge=>{
  if(!edge||Object.keys(edge).sort().join('|')!=='assumption_id|from|to'||![edge.from,edge.to,edge.assumption_id].every(id)||edge.from===edge.to||seen.has(edge.from+'>'+edge.to))throw Error('ATTRIBUTION_EDGE');
  seen.add(edge.from+'>'+edge.to);const a=index.get(edge.assumption_id);
  return {from:edge.from,to:edge.to,assumption_id:edge.assumption_id,
   attribution_state:a?'linked_pending_review':'missing_assumption',independence:'not_established',
   evidence_ids:a?[...a.evidence_ids]:[],publisher_group:a?.publisher_group??null};
 });
 return {edges,validated_relationships:false,causality:'not_established',assessment_state:'not_supported',evidence_strength:null,financial_action_authority:'none'};
}
