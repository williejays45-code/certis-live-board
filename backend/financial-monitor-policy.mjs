import {createHash} from 'node:crypto';
import {evaluateMonitoringCandidates} from './financial-systems.mjs';
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9_.:-]{2,79}$/.test(v);
const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const keys=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===fields.slice().sort().join('|');
// Pure offline decision: no persistence, scheduler, delivery, or authorization.
// An authenticated worker must bind scopeId server-side and atomically persist
// a candidate before dispatch. A returned receipt is NOT a delivery receipt.
export function evaluateMonitorPolicy({scopeId,rule,previous,current,now,receipts}){
 if(!id(scopeId)||!time(now)||!keys(rule,['id','subject','metric','unit','thresholdBps','consent','cancelled','expiresAt','minIntervalSeconds','maxRetrievalAgeSeconds','maxObservationAgeDays'])||
  ![rule.id,rule.subject,rule.metric,rule.unit].every(id)||!time(rule.expiresAt)||
  typeof rule.consent!=='boolean'||typeof rule.cancelled!=='boolean'||
  !Number.isInteger(rule.thresholdBps)||rule.thresholdBps<1||rule.thresholdBps>10000||
  !Number.isInteger(rule.minIntervalSeconds)||rule.minIntervalSeconds<3600||rule.minIntervalSeconds>2592000||
  !Number.isInteger(rule.maxRetrievalAgeSeconds)||rule.maxRetrievalAgeSeconds<1||rule.maxRetrievalAgeSeconds>86400||
  !Number.isInteger(rule.maxObservationAgeDays)||rule.maxObservationAgeDays<1||rule.maxObservationAgeDays>90||
  !Array.isArray(receipts)||receipts.length>1000)throw Error('MONITOR_POLICY');
 for(const r of receipts)if(!keys(r,['scope_id','rule_id','key','created_at','expires_at'])||!id(r.scope_id)||!id(r.rule_id)||
   !/^[a-f0-9]{64}$/.test(r.key)||!time(r.created_at)||!time(r.expires_at)||r.created_at>now||r.expires_at<=r.created_at)throw Error('MONITOR_RECEIPT');
 const result=reason=>({schema:'certis-monitor-policy/1',reason,enqueue_candidate:false,receipt:null,
  notification_sent:false,delivery_confirmation:null,assessment_state:'not_supported',evidence_strength:null,financial_action_authority:'none'});
 if(!rule.consent)return result('CONSENT_REQUIRED');
 if(rule.cancelled)return result('CANCELLED');
 if(rule.expiresAt<=now)return result('EXPIRED');
 for(const o of [previous,current]){
  if(!keys(o,['id','subject','metric','unit','source_id','observed_on','retrieved_at','value','source_sha256'])||
   ![o.id,o.subject,o.metric,o.unit,o.source_id].every(id)||!day(o.observed_on)||!time(o.retrieved_at)||
   !/^[a-f0-9]{64}$/.test(o.source_sha256)||typeof o.value!=='string'||!(/^-?(0|[1-9][0-9]{0,14})$/).test(o.value))throw Error('MONITOR_OBSERVATION');
  if(o.subject!==rule.subject||o.metric!==rule.metric||o.unit!==rule.unit||o.observed_on>o.retrieved_at.slice(0,10)||o.retrieved_at>now)return result('INCOMPARABLE_EVIDENCE');
 }
 if(previous.source_id!==current.source_id||previous.observed_on>=current.observed_on||previous.id===current.id)return result('INCOMPARABLE_EVIDENCE');
 // Historical baseline may be old; only current data establishes freshness.
 if(Date.parse(now)-Date.parse(current.retrieved_at)>rule.maxRetrievalAgeSeconds*1000||
  Date.parse(now.slice(0,10))-Date.parse(current.observed_on)>rule.maxObservationAgeDays*86400000)return result('STALE_CURRENT');
 const candidate=evaluateMonitoringCandidates({previous:previous.value,current:current.value,
  thresholdBps:rule.thresholdBps,subject:rule.subject,evidenceIds:[previous.id,current.id]});
 if(!candidate.triggered)return result(candidate.reason);
 const key=createHash('sha256').update(JSON.stringify([scopeId,rule.id,rule.subject,rule.metric,rule.unit,
  rule.thresholdBps,previous.source_id,previous.observed_on,previous.value,current.source_id,current.observed_on,current.value])).digest('hex');
 const scoped=receipts.filter(r=>r.scope_id===scopeId&&r.rule_id===rule.id&&r.expires_at>now);
 if(scoped.some(r=>r.key===key))return result('DUPLICATE');
 if(scoped.some(r=>Date.parse(now)-Date.parse(r.created_at)<rule.minIntervalSeconds*1000))return result('FREQUENCY_LIMIT');
 return {...result('THRESHOLD_REACHED'),enqueue_candidate:true,candidate,
  receipt:{scope_id:scopeId,rule_id:rule.id,key,created_at:now,
   expires_at:new Date(Math.min(Date.parse(rule.expiresAt),Date.parse(now)+30*86400000)).toISOString()}};
}
