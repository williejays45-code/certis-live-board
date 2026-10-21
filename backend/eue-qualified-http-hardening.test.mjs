// Additive regression tests for the isolated EUE v2 HTTP admission boundary.
// No production imports, report access, provider calls, or external network traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signDelivery} from '../contracts/eue-qualified-v2/contract.mjs';
import {createQualifiedInterpretationConsumer} from './eue-qualified-interpretations.mjs';

const fixture=JSON.parse(readFileSync(new URL('../contracts/eue-qualified-v2/fixture.json',import.meta.url),'utf8'));
const {delivery,activation}=fixture;
const now=Date.parse(delivery.evaluated_at);
const key=Buffer.alloc(48,42);
const endpoint='http://127.0.0.1:8876/private/eue/qualified/v2';
function journal(){
  const entries=new Map();
  return {entries,async set(k,value,{NX,EX}){
    assert.equal(NX,true);assert.equal(EX,600);
    if(entries.has(k))return null;
    entries.set(k,value);return 'OK';
  }};
}
function consumer(redis,clock=()=>now){
  return createQualifiedInterpretationConsumer({enabled:true,activation,redis,key,now:clock});
}
function post(text,headers={}){
  return new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:text});
}

test('GET cannot consume a nonce or create a review',async()=>{
  const redis=journal(),c=consumer(redis);
  const r=await c.ingest(new Request(endpoint,{method:'GET'}));
  assert.equal(r.status,405);
  assert.equal(redis.entries.size,0);
});

test('malformed JSON is rejected without nonce or review writes',async()=>{
  const redis=journal(),c=consumer(redis);
  const r=await c.ingest(post('{"unterminated":'));
  assert.equal(r.status,400);
  assert.equal(redis.entries.size,0);
});

test('noncanonical signed body is rejected without creating a review',async()=>{
  const redis=journal(),c=consumer(redis);
  const changed=structuredClone(delivery);
  changed.data_classification='OWNER_PRIVATE';
  const headers=signDelivery(changed,{key,now,nonce:'a'.repeat(48)});
  const r=await c.ingest(post(JSON.stringify(changed),headers));
  assert.equal(r.status,422);
  assert.equal(redis.entries.size,0);
});

test('expired activation rejects before touching the incoming request',async()=>{
  const redis=journal();
  let clock=now;
  const c=consumer(redis,()=>clock);
  clock+=600000;
  const r=await c.ingest(post('{}'));
  assert.equal(r.status,503);
  assert.equal(redis.entries.size,0);
});

test('two requests with the same valid nonce never write two reviews',async()=>{
  const redis=journal(),c=consumer(redis);
  const headers=signDelivery(delivery,{key,now,nonce:'b'.repeat(48)});
  const a=await c.ingest(post(JSON.stringify(delivery),headers));
  const b=await c.ingest(post(JSON.stringify(delivery),headers));
  assert.equal(a.status,202);
  assert.equal(b.status,403);
  assert.equal(redis.entries.size,2);
});
