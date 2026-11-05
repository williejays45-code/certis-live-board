import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyTestWebhook,classifyTestEvent,journalTestWebhook} from './billing-stripe-test.mjs';
import {createTestCreditLedger} from './billing-ledger.mjs';
import {readFileSync} from 'node:fs';
const secret='whsec_local_test_fixture_only',timestamp=1793880000;
const make=(type='invoice.paid',extra={})=>Buffer.from(JSON.stringify({
 id:'evt_local12345',created:timestamp,type,livemode:false,
 data:{object:{id:'in_local12345',customer:'cus_local12345'}},...extra}));
const sig=(raw,ts=timestamp)=>'t='+ts+',v1='+createHmac('sha256',secret).update(String(ts)+'.').update(raw).digest('hex');
const verify=(raw,h=sig(raw))=>verifyTestWebhook(raw,h,secret,{now:()=>timestamp*1000});

test('signed test-mode Stripe event accepted but invoice grant never implied',()=>{
 const e=verify(make());
 assert.equal(e.event_type,'invoice.paid');
 assert.equal(classifyTestEvent(e).state,'held');
 assert.equal(classifyTestEvent(e).reason,'PAID_INVOICE_LINE_RECONCILIATION_REQUIRED');
});
test('signature tampering, signature replay-age and malformed headers rejected',()=>{
 const raw=make();
 for(const header of [sig(raw).replace(/.$/,'0'),'t=invalid,v1='+'a'.repeat(64),'v1='+'a'.repeat(64)])
  assert.throws(()=>verify(raw,header),/WEBHOOK/);
 assert.throws(()=>verifyTestWebhook(raw,sig(raw),secret,{now:()=>timestamp*1000+301000}),/WEBHOOK_EXPIRED/);
});
test('live-mode or malformed Stripe event cannot enter test journal',()=>{
 assert.throws(()=>verify(make('invoice.paid',{livemode:true})),/WEBHOOK_SCOPE/);
 assert.throws(()=>verify(make('invoice.paid',{id:'forged'})),/WEBHOOK_SCOPE/);
});
test('refund, dispute, subscription and unknown types do not grant credits',()=>{
 const kinds=[
  ['refund.created',{id:'re_local12345',customer:'cus_local12345'}],
  ['charge.dispute.created',{id:'dp_local12345',customer:'cus_local12345'}],
  ['customer.subscription.updated',{id:'sub_local12345',customer:'cus_local12345'}],
  ['unhandled.event',{id:'unknown_local12345'}]];
 for(const [type,object] of kinds){
  const value=verify(make(type,{data:{object}}));
  assert.notEqual(classifyTestEvent(value).state,'applied');
 }
});
test('durable journal records once; same signed delivery returns duplicate',async()=>{
 const map=new Map(),calls=[];
 const pool={connect:async()=>({
  query:async(sql,args=[])=>{
   calls.push(sql);
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
   if(sql.startsWith('INSERT INTO certis_billing.stripe_events')){
    if(map.has(args[0]))return {rowCount:0,rows:[]};
    map.set(args[0],{payload_sha256:args[2],reason_code:args[6],processing_state:args[5]});
    return {rowCount:1,rows:[{event_id:args[0]}]};
   }
   if(sql.startsWith('SELECT payload_sha256'))return {rowCount:1,rows:[map.get(args[0])]};
   throw Error('UNEXPECTED_QUERY');
  },release:()=>{} })};
 const raw=make(),first=await journalTestWebhook({raw,signature:sig(raw),secret,pool,now:()=>timestamp*1000});
 const again=await journalTestWebhook({raw,signature:sig(raw),secret,pool,now:()=>timestamp*1000});
 assert.equal(first.state,'held');assert.equal(first.credited,false);assert.equal(again.state,'duplicate');assert.equal(map.size,1);
 assert.equal(calls.filter(x=>x==='COMMIT').length,2);
});
test('same Stripe event ID with different signed payload fails closed',async()=>{
 let prior=null;
 const pool={connect:async()=>({query:async(sql,args=[])=>{
  if(sql.startsWith('INSERT')){if(prior)return {rowCount:0};prior={payload_sha256:args[2],reason_code:args[6]};return {rowCount:1};}
  if(sql.startsWith('SELECT'))return {rowCount:1,rows:[prior]};
  return {};
 },release:()=>{}})};
 const a=make(),b=make('invoice.payment_failed');
 await journalTestWebhook({raw:a,signature:sig(a),secret,pool,now:()=>timestamp*1000});
 await assert.rejects(journalTestWebhook({raw:b,signature:sig(b),secret,pool,now:()=>timestamp*1000}),/WEBHOOK_IDEMPOTENCY_CONFLICT/);
});
test('ledger cannot be created in production or with Redis-only transport',()=>{
 assert.throws(()=>createTestCreditLedger({mode:'live',enabled:true,pool:{query(){}}}),/BILLING_TEST_MODE_REQUIRED/);
 assert.throws(()=>createTestCreditLedger({mode:'test',enabled:true,pool:{get(){}}}),/BILLING_POSTGRES_REQUIRED/);
});
test('ledger functions are parameterized and never expose an unqualified grant API',async()=>{
 const accountId='d3b073e3-8792-4d20-97a4-1ee8e2add551',calls=[];
 const pool={query:async(sql,params)=>{calls.push([sql,params]);return {rows:[{reservation_id:accountId,state:'consumed',available:'4'}]};}};
 const ledger=createTestCreditLedger({mode:'test',enabled:true,pool});
 assert.equal(typeof ledger.grant,'undefined');
 await ledger.reserve({accountId,requestKey:'case:case-0001',units:1});
 await ledger.consume({accountId,requestKey:'case:case-0001',verifiedReportSha256:'a'.repeat(64)});
 await ledger.balance(accountId);
 assert.equal(calls.length,3);
 for(const [sql,params] of calls){assert.match(sql,/\$1/);assert.equal(params[0],accountId);}
 await assert.rejects(ledger.consume({accountId,requestKey:'case:case-0001',verifiedReportSha256:'bad'}),/VERIFIED_REPORT_REQUIRED/);
});
test('migration holds money-related state in PostgreSQL with no destructive rollback',()=>{
 const source=readFileSync(new URL('../billing/migrations/001_certis_billing.sql',import.meta.url),'utf8');
 for(const table of ['accounts','plans','memberships','stripe_events','credit_grants','reservations','allocations','credit_ledger','adjustments'])
  assert.match(source,new RegExp('CREATE TABLE IF NOT EXISTS certis_billing\\.'+table));
 for(const action of ['grant_credits','reserve_credits','finish_credits','reverse_grant'])
  assert.ok(source.includes('FUNCTION certis_billing.'+action));
 assert.doesNotMatch(source,/DROP TABLE|TRUNCATE TABLE/i);
 assert.match(source,/REVOKE EXECUTE ON ALL FUNCTIONS/);
});
