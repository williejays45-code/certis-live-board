import {reviewMarkup,readableDocument,reviewTitles,dateLabel} from './review-presentation.mjs';
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
  output.innerHTML=reviewMarkup(r,archived);
  const actions=node('div');actions.className='review-actions';
  function save(label,content,type,extension){const button=node('button',label,actions);button.type='button';button.onclick=()=>{const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download='CERTIS-'+r.domain+'-'+r.request_id+'.'+extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};}
  save('Download readable report',readableDocument(r),'text/html;charset=utf-8','html');
  save('Download technical data (JSON)',JSON.stringify(r,null,2),'application/json','json');
  node('p','The readable report opens in your browser. Use Print → Save as PDF to keep a PDF copy.');
  output.querySelector('h2')?.focus();
 }
 async function act(domain){if(pending)return;pending=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);output.hidden=false;output.replaceChildren();output.setAttribute('aria-busy','true');node('p',domain==='saved'?'Loading your saved reviews…':'Your review is queued. This can take up to three and a half minutes. Keep this page open; the result will appear here.');try{
  if(domain==='saved'){const value=await call(endpoint+'&action=cases');output.replaceChildren();node('h2','Saved public reviews');node('p','Your most recent 20 reviews are available here for 30 days. Download a readable report to keep a copy. Opening a saved review does not request new analysis.');if(!value.reviews.length)node('p','No completed public review is saved for this account yet.');const history=node('div');history.className='review-history';for(const r of value.reviews){const b=node('button',undefined,history);b.type='button';node('strong',reviewTitles[r.domain]||labels[r.domain],b);node('span',dateLabel(r.generated_at,true),b);node('span','Saved evidence review · decision not established',b);b.onclick=()=>render(r,true);}return;}
  const started=await call(endpoint,{domain,requested_at:new Date().toISOString()});const deadline=Date.parse(started.expires_at);if(!/^[a-f0-9]{48}$/.test(started.request_id)||!Number.isFinite(deadline)||deadline>Date.now()+215000)throw Error('INVALID_REQUEST');
  while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,3000));const state=await call(endpoint+'&request_id='+started.request_id);if(state.status==='complete'){render(state.result);return;}output.firstElementChild.textContent=state.status==='running'?'Reviewing the dated evidence and preparing your explanation…':'Your review is queued. This can take up to three and a half minutes. Keep this page open; the result will appear here.';if(!['pending','running'].includes(state.status))throw Error('INVALID_STATUS');}
  throw Object.assign(Error('EXPIRED'),{status:410});
 }catch(e){output.replaceChildren();node('h2','Public review unavailable');node('p',({401:'Sign in using the existing Google account control, then try this review.',409:'Another review is still running. Let it finish before starting a different area.',410:'Your review did not finish in time. No result was accepted. Try again later or contact support if this continues.',429:'Your review limit has been reached. You can still open saved reviews. Contact support for help with access.'})[e.status]||'The public review could not be verified. No assessment was accepted.');}finally{output.setAttribute('aria-busy','false');pending=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 host.querySelectorAll('[data-domain]').forEach(b=>b.addEventListener('click',()=>act(b.dataset.domain)));
})();
