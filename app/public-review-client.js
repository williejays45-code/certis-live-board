(() => {
 const host=document.getElementById('public-reviews');if(!host)return;
 const output=document.getElementById('public-review-answer');let pending=false;
 const labels={property:'Property evidence',business:'Business evidence',traditional_finance:'Finance evidence'};
 const node=(tag,text,parent=output)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent.appendChild(e);return e;};
 const list=(heading,items)=>{node('h3',heading);const ul=node('ul');for(const text of items)node('li',text,ul);};
 const endpoint='/api/certis/query?public_review=1';
 async function call(url,body){const r=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Object.assign(Error('REVIEW_UNAVAILABLE'),{status:r.status});return r.json();}
 function render(r,archived=false){
  if(r?.schema!=='certis-public-review/1'||!Object.hasOwn(labels,r.domain)||r.financial_action_authority!=='none'||r.private_context!==false||(r.provider_called!==false&&(!r.model_explanation||r.model_explanation.provider_called!==r.provider_called))||r.evidence_strength!==null||r.assessment_state!=='not_supported'||!Array.isArray(r.observations)||r.observations.length>100||!Array.isArray(r.sources)||r.sources.length>5)throw Error('INVALID_REVIEW');
  output.replaceChildren();node('h2',labels[r.domain]);
  node('p',(archived?'Saved review — ':'')+'Not supported as a financial conclusion · evidence strength unscored. A supported assessment requires at least 75/100; evidence strength is not probability.');
  node('p','Protected CERTIS '+r.engine_version+' reviewed this evidence at '+r.generated_at+'. Source dates below govern its usefulness today.');
  list('What the sources report',r.observations.map(o=>o.metric+': '+o.value+' '+o.unit+' · period '+o.observation_period+' · '+o.freshness.replaceAll('_',' ')));
  node('h3','Sources and observation dates');
  for(const s of r.sources){const u=new URL(s.source_url);if(u.protocol!=='https:'||u.username||u.password)throw Error('INVALID_SOURCE');const p=node('p');const a=node('a',s.source_id,p);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';node('span',' · observation '+(s.observation_date||'unknown')+' · retrieved '+s.retrieved_at+' · '+s.freshness.replaceAll('_',' '),p);}
  if(r.model_explanation?.status==='accepted'){node('h3','OpenAI explanation - human review required');node('p','Provider: OpenAI. Model: '+r.model_explanation.model+'. Generated from the dated public evidence above. It does not establish a supported assessment or change the evidence score.');list('Model statements',r.model_explanation.assertions.map(a=>a.assertion_class.toUpperCase()+': '+a.statement+' | evidence '+a.evidence_ids.join(', ')));list('Model limitations',r.model_explanation.missing_evidence);}else if(r.model_explanation){node('p','AI explanation unavailable. The deterministic public evidence review is preserved.');}
  list('What remains unestablished',r.missing_evidence);list('What to watch next',r.next_watch);
  node('p','Contradiction check: not independently reconciled. No forecast, investment recommendation or financial action is authorized.');
  node('p','Persistent public case: '+r.case_id+'. Review: '+r.request_id+'.');
  const download=node('button','Download public evidence review');download.type='button';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='CERTIS-'+r.domain+'-'+r.request_id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 }
 async function act(domain){if(pending)return;pending=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);output.hidden=false;output.replaceChildren();node('p','Requesting a protected public evidence review. The node checks for work every two minutes…');try{
  if(domain==='saved'){const value=await call(endpoint+'&action=cases');output.replaceChildren();node('h2','Saved public reviews');node('p',value.retention);if(!value.reviews.length)node('p','No completed public review is saved for this account yet.');for(const r of value.reviews){const b=node('button',labels[r.domain]+' · '+r.generated_at);b.type='button';b.onclick=()=>render(r,true);}return;}
  const started=await call(endpoint,{domain,requested_at:new Date().toISOString()});const deadline=Date.parse(started.expires_at);if(!/^[a-f0-9]{48}$/.test(started.request_id)||!Number.isFinite(deadline)||deadline>Date.now()+215000)throw Error('INVALID_REQUEST');
  while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,3000));const state=await call(endpoint+'&request_id='+started.request_id);if(state.status==='complete'){render(state.result);return;}if(!['pending','running'].includes(state.status))throw Error('INVALID_STATUS');}
  throw Object.assign(Error('EXPIRED'),{status:410});
 }catch(e){output.replaceChildren();node('h2','Public review unavailable');node('p',({401:'Sign in using the existing Google account control, then try this review.',409:'Another review is still running. Let it finish before starting a different area.',410:'The node did not finish before the request expired. No assessment was accepted.',429:'The review limit was reached. Please try later.'})[e.status]||'The public review could not be verified. No assessment was accepted.');}finally{pending=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 host.querySelectorAll('[data-domain]').forEach(b=>b.addEventListener('click',()=>act(b.dataset.domain)));
})();
