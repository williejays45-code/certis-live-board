import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAnalysisContract,assessRelationshipAttribution} from './financial-analysis-contracts.mjs';
test('all product contracts explicitly enumerate missing data without a model result',()=>{
 for(const kind of ['stock','etf','bond','macro','business']){
  const r=assessAnalysisContract(kind,{});assert.equal(r.state,'missing_data');assert.ok(r.missing_fields.length>=7);
  assert.equal(r.model_result,null);assert.equal(r.evidence_strength,null);assert.equal(r.financial_action_authority,'none');
 }
});
test('complete stock inputs are offline-evaluation readiness only; private context and unknown fields rejected',()=>{
 const input={instrument_id:'stock.example',currency:'USD',price_as_of:'2026-10-16',price_cents:'12345',
  issuer_filing_ids:['filing.example'],liquidity_evidence_ids:['liquidity.example'],price_shock_bps:-1000};
 assert.equal(assessAnalysisContract('stock',input).state,'ready_for_offline_evaluation');
 assert.throws(()=>assessAnalysisContract('stock',{...input,customer_email:'private@example.test'}),/ANALYSIS_SCHEMA/);
 assert.equal(assessAnalysisContract('stock',{...input,price_cents:'9007199254740992'}).state,'invalid_input');
 assert.equal(assessAnalysisContract('stock',{...input,price_as_of:'2026-02-30'}).state,'invalid_input');
});
test('bonds require duration, coupon, credit and liquidity evidence; matured instruments rejected',()=>{
 const input={instrument_id:'bond.example',currency:'USD',price_as_of:'2026-10-16',price_cents:'100000',coupon_bps:400,
  maturity_on:'2030-01-01',modified_duration_milli_years:3500,yield_shock_bps:100,
  credit_evidence_ids:['credit.example'],liquidity_evidence_ids:['liquidity.example']};
 assert.equal(assessAnalysisContract('bond',input).state,'ready_for_offline_evaluation');
 assert.ok(assessAnalysisContract('bond',{...input,credit_evidence_ids:null}).missing_fields.includes('credit_evidence_ids'));
 assert.equal(assessAnalysisContract('bond',{...input,maturity_on:'2026-10-16'}).state,'invalid_input');
});
test('macro zero baseline, reversed periods, duplicate evidence and currency mixing are rejected',()=>{
 const input={series_id:'cpi.us',unit:'index.milli',earlier_period:'2025-09-30',later_period:'2026-09-30',earlier_value:'300000',later_value:'310000',revision_evidence_ids:['revision.example']};
 assert.equal(assessAnalysisContract('macro',input).state,'ready_for_offline_evaluation');
 assert.equal(assessAnalysisContract('macro',{...input,earlier_value:'0'}).state,'invalid_input');
 assert.equal(assessAnalysisContract('macro',{...input,later_period:input.earlier_period}).state,'invalid_input');
 assert.equal(assessAnalysisContract('macro',{...input,revision_evidence_ids:['revision.example','revision.example']}).state,'invalid_input');
 assert.equal(assessAnalysisContract('business',{currency:'EUR'}).state,'invalid_input');
});
test('relationship assumptions bind each edge separately and never infer independent corroboration',()=>{
 const assumption={id:'assumption.rates',publisher_group:'publisher.example',evidence_ids:['evidence.rates'],review_state:'pending_independent_review'};
 const edges=[{from:'rates',to:'credit',assumption_id:assumption.id},{from:'credit',to:'bonds',assumption_id:'assumption.missing'}];
 const r=assessRelationshipAttribution(edges,[assumption]);
 assert.equal(r.edges[0].attribution_state,'linked_pending_review');assert.equal(r.edges[1].attribution_state,'missing_assumption');
 assert.equal(r.validated_relationships,false);assert.equal(r.edges[0].independence,'not_established');
 assert.throws(()=>assessRelationshipAttribution(edges,[assumption,{...assumption}]),/ATTRIBUTION_ASSUMPTION/);
});
