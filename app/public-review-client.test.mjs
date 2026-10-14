import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {reviewMarkup,readableDocument,reviewTitles,dateLabel} from './review-presentation.mjs';
const moduleSource=readFileSync(new URL('./public-review-client.js',import.meta.url),'utf8');
const importLine="import {reviewMarkup,readableDocument,reviewTitles,dateLabel} from './review-presentation.mjs';";
assert.ok(moduleSource.startsWith(importLine));
const source=moduleSource.slice(importLine.length);
function harness(result){
 const all=[];const make=tag=>{const e={tag,textContent:'',children:[],dataset:{},disabled:false,events:{},appendChild(n){this.children.push(n)},replaceChildren(){this.children=[]},addEventListener(k,f){this.events[k]=f},setAttribute(){},querySelector(){return null},set innerHTML(html){this.markup=html}};all.push(e);return e;};
 const button=make('button');button.dataset.domain='business';const host=make('section');host.querySelectorAll=()=>[button];const output=make('output');
 let calls=0;vm.runInNewContext(source,{reviewMarkup,readableDocument,reviewTitles,dateLabel,document:{getElementById:id=>id==='public-reviews'?host:output,createElement:make},fetch:async()=>{calls++;return {ok:true,json:async()=>calls===1?{request_id:'a'.repeat(48),expires_at:new Date(Date.now()+120000).toISOString()}:{status:'complete',result}}},Date,URL,AbortSignal,setTimeout:f=>f()});
 return {run:()=>button.events.click(),text:()=>all.map(e=>e.textContent+(e.markup||'')).join('\n'),calls:()=>calls};
}
const result=()=>({schema:'certis-public-review/1',domain:'business',financial_action_authority:'none',private_context:false,provider_called:true,evidence_strength:null,assessment_state:'not_supported',observations:[],sources:[],missing_evidence:['Public evidence incomplete'],next_watch:['Review sources'],model_explanation:{status:'accepted',provider_called:true,assertions:[{assertion_class:'unknown',statement:'<img src=x onerror=alert(1)>',evidence_ids:['e1']}],missing_evidence:['Independent verification required']}});
test('public UI labels AI as review-required text while keeping unsupported score',async()=>{const h=harness(result());await h.run();assert.match(h.text(),/Check it against the cited findings/);assert.match(h.text(),/Not enough evidence for a financial conclusion/);assert.match(h.text(),/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(h.text(),/<img\b/);assert.equal(h.calls(),2)});
test('provider failure and unknown call outcome retain deterministic evidence',async()=>{for(const called of [false,true,null]){const r=result();r.provider_called=called;r.model_explanation={status:called===null?'outcome_unknown':'unavailable',provider_called:called};const h=harness(r);await h.run();assert.match(h.text(),/source findings below remain available/);assert.doesNotMatch(h.text(),/No assessment was accepted/);}});
