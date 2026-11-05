// CERTIS Stripe TEST webhook admission. No route is mounted in production.
// Raw signed events are classified and durably journaled; a held event never
// grants credits or changes a subscription without independent reconciliation.
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';

const types=new Set([
 'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted',
 'invoice.paid','invoice.payment_failed','refund.created','refund.updated',
 'charge.dispute.created','charge.dispute.closed'
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[A-Za-z0-9]{4,160}$').test(value);
const error=code=>{throw Error(code);};

export function verifyTestWebhook(raw,header,secret,{now=Date.now,toleranceSeconds=300}={}){
 if(!Buffer.isBuffer(raw)||raw.length<2||raw.length>262144 ||
    typeof header!=='string'||header.length>2048||
    typeof secret!=='string'||!secret.startsWith('whsec_')||
    !Number.isInteger(toleranceSeconds)||toleranceSeconds<1||toleranceSeconds>300)error('WEBHOOK_INPUT');
 const parts=header.split(',').map(x=>x.trim());
 const stamps=parts.filter(x=>x.startsWith('t=')).map(x=>x.slice(2));
 const sigs=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
 if(stamps.length!==1||!sigs.length||!sigs.every(s=>/^[a-f0-9]{64}$/.test(s)))error('WEBHOOK_SIGNATURE');
 const timestamp=Number(stamps[0]);
 if(!/^[0-9]{10,12}$/.test(stamps[0])||!Number.isSafeInteger(timestamp)||
    Math.abs(Math.floor(now()/1000)-timestamp)>toleranceSeconds)error('WEBHOOK_EXPIRED');
 const expected=createHmac('sha256',secret).update(String(timestamp)).update('.').update(raw).digest();
 if(!sigs.some(s=>timingSafeEqual(Buffer.from(s,'hex'),expected)))error('WEBHOOK_SIGNATURE');
 let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{error('WEBHOOK_PAYLOAD');}
 if(!event||typeof event!=='object'||Array.isArray(event)||!id(event.id,'evt')||
    event.livemode!==false||!Number.isSafeInteger(event.created)||event.created<=0||
    typeof event.type!=='string'||event.type.length>120||
    !event.data||typeof event.data.object!=='object'||!event.data.object)error('WEBHOOK_SCOPE');
 return {event_id:event.id,event_type:event.type,stripe_created:event.created,
         payload_sha256:sha(raw),livemode:false,object:event.data.object};
}

// Classification is NOT credit fulfillment. Enforce object identities and
// independent price/owner lookup at the later PostgreSQL reconciliation gate.
export function classifyTestEvent(e){
 if(!types.has(e.event_type))return {state:'ignored',reason:'UNSUPPORTED_EVENT'};
 const o=e.object;
 const validCustomer=id(o.customer,'cus');
 if(e.event_type.startsWith('customer.subscription.')){
  if(!id(o.id,'sub')||!validCustomer)return {state:'held',reason:'SUBSCRIPTION_IDENTITY_UNVERIFIED'};
  return {state:'held',reason:'ACCOUNT_PLAN_AND_SUBSCRIPTION_RECONCILIATION_REQUIRED'};
 }
 if(e.event_type.startsWith('invoice.')){
  if(!id(o.id,'in')||!validCustomer)return {state:'held',reason:'INVOICE_IDENTITY_UNVERIFIED'};
  // invoice.paid includes out-of-band marking, so payment must be independently
  // reconciled to the exact test-mode invoice/line/price before any grant.
  return {state:'held',reason:'PAID_INVOICE_LINE_RECONCILIATION_REQUIRED'};
 }
 if(e.event_type.startsWith('refund.')){
  if(!id(o.id,'re'))return {state:'held',reason:'REFUND_IDENTITY_UNVERIFIED'};
  return {state:'held',reason:'REFUND_TO_GRANT_RECONCILIATION_REQUIRED'};
 }
 if(e.event_type.startsWith('charge.dispute.')){
  if(!id(o.id,'dp'))return {state:'held',reason:'DISPUTE_IDENTITY_UNVERIFIED'};
  return {state:'held',reason:'DISPUTE_TO_GRANT_RECONCILIATION_REQUIRED'};
 }
 return {state:'held',reason:'RECONCILIATION_REQUIRED'};
}

// A PG pool supplies connect(); client supplies query() and release().
// Event insertion and conflict resolution occur in one ACID transaction.
// No external Stripe calls and no Redis balance mutations.
export async function journalTestWebhook({raw,signature,secret,pool,now=Date.now}){
 const e=verifyTestWebhook(raw,signature,secret,{now});
 const classification=classifyTestEvent(e);
 if(!pool||typeof pool.connect!=='function')error('BILLING_DB_NOT_CONFIGURED');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const inserted=await client.query(
   'INSERT INTO certis_billing.stripe_events(event_id,event_type,payload_sha256,stripe_created,livemode,processing_state,reason_code) VALUES ($1,$2,$3,$4,FALSE,$5,$6) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
   [e.event_id,e.event_type,e.payload_sha256,e.stripe_created,classification.state,classification.reason]);
  if(inserted.rowCount===0){
   const prior=await client.query('SELECT payload_sha256,processing_state,reason_code FROM certis_billing.stripe_events WHERE event_id=$1',[e.event_id]);
   if(prior.rowCount!==1||prior.rows[0].payload_sha256.trim()!==e.payload_sha256)error('WEBHOOK_IDEMPOTENCY_CONFLICT');
   await client.query('COMMIT');
   return {state:'duplicate',reason:prior.rows[0].reason_code,credited:false};
  }
  await client.query('COMMIT');
  return {state:classification.state,reason:classification.reason,credited:false};
 }catch(ex){
  try{await client.query('ROLLBACK');}catch{}
  throw ex;
 }finally{client.release();}
}
