const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join() === [...keys].sort().join();
const strings=(v,max=24)=>Array.isArray(v)&&v.length<=max&&v.every(s=>typeof s==='string'&&s.length>0&&s.length<=4000);
const reject=()=>{throw Error('MODEL_EXPLANATION_REJECTED')};
export function validateModelExplanation(v,admitted){
 if(['unavailable','outcome_unknown'].includes(v?.status)){
  if(!exact(v,['status','provider_called','financial_action_authority'])||(v.status==='outcome_unknown'?v.provider_called!==null:typeof v.provider_called!=='boolean')||v.financial_action_authority!=='none')reject();
  return {...v};
 }
 if(!exact(v,['status','provider_called','financial_action_authority','contract','model','authoritative','requires_human_review','assertions','missing_evidence','alternative_hypotheses','unresolved_conflicts','next_steps'])||v.status!=='accepted'||v.provider_called!==true||v.financial_action_authority!=='none'||v.contract!=='certis-generative-reasoning/1.4-candidate.2'||v.model!=='gpt-5.6-terra'||v.authoritative!==false||v.requires_human_review!==true)reject();
 if(!Array.isArray(v.assertions)||!v.assertions.length||v.assertions.length>24||!strings(v.missing_evidence)||!strings(v.alternative_hypotheses,12)||!Array.isArray(v.unresolved_conflicts)||v.unresolved_conflicts.length||!strings(v.next_steps,8)||v.next_steps.some(s=>!['research','verify','monitor','human_review','no_action'].includes(s)))reject();
 const covered=new Set();
 for(const a of v.assertions){
  if(!exact(a,['statement','assertion_class','evidence_ids','confidence'])||typeof a.statement!=='string'||!a.statement.trim()||a.statement.length>4000||!['fact','inference','hypothesis','unknown'].includes(a.assertion_class)||!['low','moderate','high'].includes(a.confidence)||!strings(a.evidence_ids,100)||a.evidence_ids.some(i=>!admitted.includes(i))||new Set(a.evidence_ids).size!==a.evidence_ids.length)reject();
  if(['fact','inference'].includes(a.assertion_class)&&!a.evidence_ids.length)reject();
  a.evidence_ids.forEach(i=>covered.add(i));
 }
 if(admitted.some(i=>!covered.has(i)))reject();
 // Return a fresh plain JSON value; it is explanation, never the assessment score.
 return JSON.parse(JSON.stringify(v));
}
