import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveFinancialReferences,financialEvidenceGaps} from './financial-intelligence.mjs';
const digest='a'.repeat(64);
function fixture(freshness='stale') {
 const observations=[['BC_2YEAR','4.80','public-'+'a'.repeat(32)],['BC_10YEAR','5.24','public-'+'b'.repeat(32)]].map(([metric,value,evidence_id])=>({metric,value,evidence_id,unit:'percent_par_yield',classification:'source_reported',observation_period:'2026-10-09'}));
 return {s:{source_id:'treasury-2026',raw_sha256:digest,observation_date:'2026-10-09',observations},status:{source_id:'treasury-2026',raw_sha256:digest,observation_date:'2026-10-09',freshness}};
}
test('calculates exact signed basis-point spread from same-date pinned Treasury observations',()=>{
 const {s,status}=fixture(),before=JSON.stringify(s),v=deriveFinancialReferences([s],[status]);
 assert.equal(v.length,1);assert.equal(v[0].value,'44');assert.equal(v[0].unit,'basis_points');assert.equal(v[0].freshness,'stale');
 assert.equal(v[0].observation_date,'2026-10-09');assert.equal(v[0].assessment_state,'not_supported');assert.equal(v[0].financial_action_authority,'none');
 assert.deepEqual(v[0].evidence_ids,[s.observations[0].evidence_id,s.observations[1].evidence_id]);assert.equal(JSON.stringify(s),before);
});
test('handles inverted and flat reference spreads without forecasts',()=>{
 const {s,status}=fixture();s.observations[1].value='4.01';assert.equal(deriveFinancialReferences([s],[status])[0].value,'-79');
 s.observations[1].value='4.80';assert.equal(deriveFinancialReferences([s],[status])[0].value,'0');
});
test('fails closed for mismatched dates, units, source hash, duplicate, identity or invalid price',()=>{
 const edits=[
 (s,state)=>s.observations[1].observation_period='2026-10-08',
 (s,state)=>s.observations[1].unit='USD',
 (s,state)=>state.raw_sha256='f'.repeat(64),
 (s,state)=>s.observations.push({...s.observations[1]}),
 (s,state)=>s.observations[0].evidence_id='private',
 (s,state)=>s.observations[0].value='NaN',
 (s,state)=>s.observations[0].value='4.801',
 (s,state)=>state.observation_date='2026-10-08',
 (s,state)=>state.freshness='future_observation'
 ];
 for(const edit of edits){const {s,status}=fixture();edit(s,status);assert.deepEqual(deriveFinancialReferences([s],[status]),[]);}
});
test('missing, duplicate, or non-Treasury input cannot silently compute',()=>{
 const {s,status}=fixture();assert.deepEqual(deriveFinancialReferences([],[]),[]);assert.deepEqual(deriveFinancialReferences([s,s],[status]),[]);
 assert.deepEqual(deriveFinancialReferences([{...s,source_id:'non-treasury'}],[status]),[]);
});
test('financial evidence gaps remain visible when arithmetic succeeds',()=>{
 const {s,status}=fixture();const v=deriveFinancialReferences([s],[status]);
 const gaps=financialEvidenceGaps([status,{source_id:'bls-cpi',freshness:'stale'}],v);
 assert.ok(gaps.some(s=>s.includes('independently corroborated equity')));
 assert.ok(gaps.some(s=>s.includes('historical, stale')));
 assert.ok(gaps.some(s=>s.includes('not establish an executable bond price')));
 assert.ok(financialEvidenceGaps([],[]).some(s=>s.includes('source coverage is missing')));
});
