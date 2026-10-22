import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireFinancialSource} from './financial-sources.mjs';
import {reconcileEvidenceClaims,analyzeOperatingScenarios,compareFinancialRelationships} from './financial-systems.mjs';
import {assessAnalysisContract,assessRelationshipAttribution} from './financial-analysis-contracts.mjs';
import {evaluateMonitorPolicy} from './financial-monitor-policy.mjs';
test('source-to-reasoning/scenario/relationship/monitor contracts preserve evidence IDs and no-action boundary',async()=>{
 const now='2026-10-19T12:00:00.000Z';
 const acquired=await acquireFinancialSource('treasury','treasury.notes',{clock:()=>now,read:async()=>Buffer.from(JSON.stringify({data:[
  {record_date:'2026-08-31',security_desc:'Treasury Notes',avg_interest_rate_amt:'4.000'},
  {record_date:'2026-09-30',security_desc:'Treasury Notes',avg_interest_rate_amt:'4.400'}]}))});
 assert.equal(acquired.status,'candidate');const source=acquired.candidate,ids=source.observations.map(o=>o.id);
 const reasoning=reconcileEvidenceClaims([{id:'claim.rate',kind:'fact',evidence_ids:ids,contrary_ids:[]}],source.observations);
 assert.equal(reasoning.checks[0].structural_linkage_complete,true);assert.equal(reasoning.checks[0].eligible_for_scoring,false);
 const scenario=analyzeOperatingScenarios({annualRevenueCents:'100000',annualCostCents:'60000',annualDebtServiceCents:'10000',
  scenarios:[{id:'assumption.adverse',revenueShockBps:-1000,costShockBps:2000}],evidenceIds:ids});
 assert.equal(scenario.scenarios[0].surplus_after_debt_cents,'8000');
 const relationship=compareFinancialRelationships({changes:[{node:'rates',deltaBps:100}],
  relationships:[{from:'rates',to:'credit',sensitivityBps:7500,basis:'declared_scenario_assumption'}],evidenceIds:ids});
 assert.equal(relationship.outcomes[0].implied_delta_bps,'75');
 const attribution=assessRelationshipAttribution([{from:'rates',to:'credit',assumption_id:'assumption.rates'}],
  [{id:'assumption.rates',publisher_group:'us.treasury',evidence_ids:ids,review_state:'pending_independent_review'}]);
 assert.equal(attribution.validated_relationships,false);
 const observations=source.observations.map(o=>({id:o.id,subject:o.subject,metric:o.metric,unit:o.unit,source_id:source.publisher_group,
  observed_on:o.period.end,retrieved_at:source.retrieved_at,value:o.value,source_sha256:source.raw_sha256}));
 const monitor=evaluateMonitorPolicy({scopeId:'scope.fixture',previous:observations[0],current:observations[1],now,receipts:[],rule:{
  id:'rule.fixture',subject:'treasury.notes',metric:'average_interest_rate',unit:'percent_milli',thresholdBps:500,
  consent:true,cancelled:false,expiresAt:'2026-11-01T00:00:00.000Z',minIntervalSeconds:3600,maxRetrievalAgeSeconds:86400,maxObservationAgeDays:60}});
 assert.equal(monitor.enqueue_candidate,true);assert.equal(monitor.notification_sent,false);
 const contract=assessAnalysisContract('bond',{});assert.equal(contract.state,'missing_data');
 for(const output of [source,reasoning,scenario,relationship,attribution,monitor,contract]){
  assert.equal(output.evidence_strength,null);assert.equal(output.financial_action_authority,'none');
 }
});
