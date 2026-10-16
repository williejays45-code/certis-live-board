import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublicReviews,CLAIM_NEXT,PREFIX,ORIGIN} from './public-reviews.mjs';
import {PREFIX as ENGINE_PREFIX} from './engine-requests.mjs';
import {createApplication} from './application.mjs';

function setup(job){
 const token='a'.repeat(43), calls=[];
 const service=createPublicReviews({redis:{eval:async(script,args)=>{calls.push({script,args});return job?JSON.stringify(job):null;}},store:{},tokenSha256:createHash('sha256').update(token).digest('hex'),makeId:()=> 'b'.repeat(48),now:()=>1800000000000});
 const request=(body={},credential=token)=>new Request(ORIGIN+'/internal/public-work/claim',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential},body:JSON.stringify(body)});
 return {service,request,calls};
}
const common={id:'c'.repeat(48),owner:'never-export-owner',createdAt:1799999999990,claimedAt:1800000000000,expiresAt:1800000209990};
test('shared claim returns only the typed Bitcoin or public-review contract',async()=>{
 for(const fields of [{operation:'public_btc_evidence_check',asset:'btc'},{domain:'business',caseKey:'d'.repeat(64)}]){
  const s=setup({...common,...fields});const response=await s.service.machine(s.request());
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.job.id,common.id);assert.equal(result.job.lease,'b'.repeat(48));
  assert.doesNotMatch(JSON.stringify(result),/never-export-owner|createdAt|caseKey/);
  assert.deepEqual(s.calls[0].args.keys,[ENGINE_PREFIX+'queue',PREFIX+'queue']);
  assert.equal(s.calls[0].script,CLAIM_NEXT);assert.equal(s.calls.length,1);
  assert.equal(result.job.operation,fields.domain?'public_source_review':'public_btc_evidence_check');
 }
});
test('claim rejects unauthenticated callers and payload overrides before Redis',async()=>{
 const s=setup(common);
 assert.equal((await s.service.machine(s.request({},'wrong'))).status,401);
 for(const body of [{domain:'business'},{url:'http://localhost'},{owner:'another'},[]])assert.equal((await s.service.machine(s.request(body))).status,400);
 assert.equal(s.calls.length,0);
});
test('empty queues are idle; unknown operations cannot be exported',async()=>{
 const s=setup(null);assert.deepEqual(await (await s.service.machine(s.request())).json(),{status:'idle'});
 const bad=setup({...common,operation:'trade'});assert.equal((await bad.service.machine(bad.request())).status,400);
});
test('application routes the private work claim only when review integration is configured',async()=>{
 const s=setup({...common,domain:'traditional_finance',caseKey:'d'.repeat(64)});
 const commonOptions={config:{origin:ORIGIN,enabled:true},store:{},oidc:{}};
 assert.equal((await createApplication(commonOptions)(s.request())).status,503);
 assert.equal((await createApplication({...commonOptions,publicReviews:s.service})(s.request())).status,200);
});
