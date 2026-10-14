import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewMarkup,readableDocument,dateLabel,observationValue,safeSourceUrl} from './review-presentation.mjs';
const fixture=()=>({domain:'traditional_finance',generated_at:'2026-10-09T12:00:00Z',observations:[{metric:'BC_3MONTH',value:'4.25',unit:'percent_par_yield',observation_period:'2026-10-09',freshness:'within_review_window',evidence_id:'public-test',source_id:'treasury-2026'}],sources:[{source_id:'treasury-2026',source_url:'https://example.com/public-data',observation_date:'2026-10-09',retrieved_at:'2026-10-09T12:00:00Z',limitations:['Reference rate, not an executable quote.']}],missing_evidence:['Independent reconciliation is missing.'],next_watch:['Check the next release.'],contrary_evidence:[],engine_version:'3.24.0',case_id:'synthetic',request_id:'synthetic',assessment_state:'not_supported',evidence_strength:null,evidence_threshold:75,financial_action_authority:'none'});
test('readable report preserves exact values, limits, threshold and immutable input',()=>{
 const r=fixture(),before=JSON.stringify(r),html=readableDocument(r);
 assert.match(html,/4\.25%/);assert.match(html,/3-month U\.S\. Treasury reference yield/);assert.match(html,/75\/100/);assert.match(html,/not a probability/);assert.match(html,/not an executable quote/);assert.match(html,/not enough evidence/i);assert.equal(JSON.stringify(r),before);
});
test('hostile source, metric, value, limitation and model strings cannot become markup',()=>{
 const r=fixture(),payload='<img src=x onerror=alert(1)>';
 r.observations[0].metric=payload;r.observations[0].value=payload;r.sources[0].limitations=[payload];r.sources[0].source_url='javascript:alert(1)';
 r.model_explanation={status:'accepted',model:payload,assertions:[{assertion_class:'fact',statement:payload,evidence_ids:['public-test']}],missing_evidence:[payload],alternative_hypotheses:[payload],unresolved_conflicts:[payload],next_steps:[payload]};
 const html=readableDocument(r);assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));assert.match(html,/&lt;img/);assert.match(html,/default-src 'none'/);
});
test('missing source match is visible and never linked to an unrelated source',()=>{
 const r=fixture();r.observations[0].source_id='missing';const html=reviewMarkup(r);assert.match(html,/Source reference could not be matched/);assert.ok(!html.includes('href="#source-1"'));
});
test('numeric zero, source dates, month-only periods and unknown dates remain honest',()=>{
 assert.equal(observationValue({value:'0',unit:'percent_par_yield'}),'0%');assert.equal(dateLabel('2026-09'),'September 2026');assert.equal(dateLabel(null),'Date not supplied');assert.match(dateLabel('2026-10-09'),/Oct 9, 2026/);
});
test('unsafe and credential-bearing source links are not clickable',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com','http://example.com'])assert.equal(safeSourceUrl(url),null);
 assert.equal(safeSourceUrl('https://example.com/evidence'),'https://example.com/evidence');
});
test('contrary evidence and unresolved model concerns survive presentation',()=>{
 const r=fixture();r.contrary_evidence=['A conflicting source exists.'];r.model_explanation={status:'accepted',model:'test',assertions:[],missing_evidence:[],alternative_hypotheses:['Alternative explanation'],unresolved_conflicts:['Unresolved conflict'],next_steps:['Verify']};const html=reviewMarkup(r);for(const text of ['A conflicting source exists.','Alternative explanation','Unresolved conflict','not actions taken'])assert.ok(html.includes(text));
});
