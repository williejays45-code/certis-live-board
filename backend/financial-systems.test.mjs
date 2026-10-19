import test from 'node:test';
import assert from 'node:assert/strict';
import {admitPublicFinancialObservations,analyzeOperatingScenarios,reconcileEvidenceClaims,compareFinancialRelationships,evaluateMonitoringCandidates} from './financial-systems.mjs';
const id='evidence.public.001',sha='a'.repeat(64);
const obs=()=>({id,source_id:'treasury.us',source_url:'https://home.treasury.gov/',subject:'treasury.10y',metric:'reference_yield',value:'524',unit:'basis_points',observed_on:'2026-10-09',retrieved_on:'2026-10-11',source_sha256:sha,classification:'source_reported'});
test('structural public admission never certifies source truth or authorizes action',()=>{
 const input=obs(),r=admitPublicFinancialObservations([input],'2026-10-19');
 assert.equal(r.accepted.length,1);assert.equal(r.source_authenticity,'not_independently_verified');assert.equal(r.evidence_strength,null);assert.equal(r.financial_action_authority,'none');
 assert.deepEqual(input,obs());
});
test('financial source admission rejects credentialed URLs, future observations and schema expansion',()=>{
 const good=obs();const cases=[{...good,source_url:'https://user:pass@example.com/'},{...good,observed_on:'2026-10-20'},{...good,email:'private@test.com'},{...good,value:'NaN'},{...good,source_sha256:'b'}];
 for(const value of cases)assert.equal(admitPublicFinancialObservations([value],'2026-10-19').accepted.length,0);
 assert.throws(()=>admitPublicFinancialObservations([good,good],'2026-10-19'),/DUPLICATE/);
});
test('baseline, adverse and upside scenarios use exact cents with explicit assumptions',()=>{
 const r=analyzeOperatingScenarios({annualRevenueCents:'100000',annualCostCents:'60000',annualDebtServiceCents:'10000',evidenceIds:[id],scenarios:[{id:'adverse',revenueShockBps:-1000,costShockBps:2000},{id:'upside',revenueShockBps:500,costShockBps:0}]});
 assert.equal(r.baseline.surplus_after_debt_cents,'30000');assert.equal(r.scenarios[0].surplus_after_debt_cents,'8000');assert.equal(r.scenarios[1].surplus_after_debt_cents,'35000');assert.equal(r.assessment_state,'not_supported');
});
test('scenarios reject negative costs, missing citations and impossible shocks',()=>{
 assert.throws(()=>analyzeOperatingScenarios({annualRevenueCents:'1',annualCostCents:'-1',annualDebtServiceCents:'0',scenarios:[],evidenceIds:[]}),/SCENARIO_INPUT/);
 assert.throws(()=>analyzeOperatingScenarios({annualRevenueCents:'100',annualCostCents:'10',annualDebtServiceCents:'0',scenarios:[{id:'stress',revenueShockBps:-10001,costShockBps:0}],evidenceIds:[id]}),/SCENARIO_SHOCK/);
});
test('reconciliation cannot create a validated score and reports unknown contrary citations',()=>{
 const r=reconcileEvidenceClaims([{id:'claim.alpha',kind:'fact',evidence_ids:[id],contrary_ids:['evidence.unknown']}],[{id}]);
 assert.equal(r.scoring_model,null);assert.equal(r.checks[0].eligible_for_scoring,false);assert.deepEqual(r.checks[0].missing_contrary_references,['evidence.unknown']);assert.equal(r.threshold_75_not_evaluated,true);
});
test('relationships are one-hop scenarios, not causal chains or forecasts',()=>{
 const r=compareFinancialRelationships({changes:[{node:'rates',deltaBps:100}],relationships:[{from:'rates',to:'borrowing_costs',sensitivityBps:7500,basis:'declared_scenario_assumption'},{from:'borrowing_costs',to:'expenses',sensitivityBps:10000,basis:'declared_scenario_assumption'}],evidenceIds:[id]});
 assert.equal(r.outcomes[0].implied_delta_bps,'75');assert.equal(r.outcomes[1].implied_delta_bps,null);assert.equal(r.causality,'not_established');assert.equal(r.financial_action_authority,'none');
});
test('relationships reject duplicates and undeclared causal assumptions',()=>{
 const edge={from:'rates',to:'expenses',sensitivityBps:1000,basis:'declared_scenario_assumption'};
 assert.throws(()=>compareFinancialRelationships({changes:[],relationships:[edge,edge],evidenceIds:[id]}),/DUPLICATE_RELATION/);
 assert.throws(()=>compareFinancialRelationships({changes:[],relationships:[{...edge,basis:'guaranteed'}],evidenceIds:[id]}),/RELATION_EDGE/);
});
test('monitor evaluates candidate only and never claims a sent notification',()=>{
 const a=evaluateMonitoringCandidates({previous:'10000',current:'10500',thresholdBps:500,subject:'tenyear_yield',evidenceIds:[id]});
 assert.equal(a.triggered,true);assert.equal(a.change_bps,'500');assert.equal(a.notification_sent,false);assert.equal(a.source_freshness,'not_verified');
 const b=evaluateMonitoringCandidates({previous:'0',current:'10500',thresholdBps:500,subject:'tenyear_yield',evidenceIds:[id]});assert.equal(b.reason,'ZERO_BASELINE');assert.equal(b.triggered,false);
});
