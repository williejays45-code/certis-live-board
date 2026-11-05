// Internal CERTIS billing ledger adapter. No customer/browser route imports this.
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const key=v=>typeof v==='string'&&v.length>=8&&v.length<=160&&/^[a-zA-Z0-9:_./-]+$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=code=>{throw Error(code);};
export function createTestCreditLedger({pool,mode,enabled}={}){
 if(mode!=='test'||enabled!==true)fail('BILLING_TEST_MODE_REQUIRED');
 if(!pool||typeof pool.query!=='function')fail('BILLING_POSTGRES_REQUIRED');
 const run=async(sql,args)=>{
   try{return await pool.query(sql,args);}
   catch(e){if(e?.code==='23505'||e?.code==='23514')fail('BILLING_CONSTRAINT');throw e;}
 };
 return Object.freeze({
  async balance(accountId){
   if(!uuid(accountId))fail('ACCOUNT_INVALID');
   const r=await run('SELECT available,reserved,consumed,revoked,financial_hold FROM certis_billing.wallet_balances WHERE account_id=$1',[accountId]);
   return r.rows[0]??null;
  },
  async reserve({accountId,requestKey,units}){
   if(!uuid(accountId)||!key(requestKey)||!Number.isInteger(units)||units<1||units>1000)fail('RESERVATION_INPUT');
   const r=await run('SELECT certis_billing.reserve_credits($1,$2,$3) AS reservation_id',[accountId,requestKey,units]);
   return {reservation_id:r.rows[0].reservation_id,state:'reserved_or_existing'};
  },
  async consume({accountId,requestKey,verifiedReportSha256}){
   if(!uuid(accountId)||!key(requestKey)||!sha(verifiedReportSha256))fail('VERIFIED_REPORT_REQUIRED');
   const r=await run('SELECT certis_billing.finish_credits($1,$2,$3,$4) AS state',[accountId,requestKey,'consume',verifiedReportSha256]);
   return {state:r.rows[0].state};
  },
  async release({accountId,requestKey}){
   if(!uuid(accountId)||!key(requestKey))fail('RESERVATION_INPUT');
   const r=await run('SELECT certis_billing.finish_credits($1,$2,$3,$4) AS state',[accountId,requestKey,'release',null]);
   return {state:r.rows[0].state};
  },
  // Refund/dispute source must be independently matched to an invoice/grant.
  // No webhook directly calls this until replay-safe reconciliation is qualified.
  async reverseApproved({accountId,sourceKey,adjustmentKey,reason}){
   if(!uuid(accountId)||!key(sourceKey)||!key(adjustmentKey)||!['refund','dispute','cancellation_reconciliation'].includes(reason))fail('REVERSAL_INPUT');
   const r=await run('SELECT certis_billing.reverse_grant($1,$2,$3,$4) AS state',[accountId,sourceKey,adjustmentKey,reason]);
   return {state:r.rows[0].state};
  }
 });
}
