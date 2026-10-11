(() => {
  const form=document.getElementById('ask'), input=document.getElementById('question'), answer=document.getElementById('answer');
  if(!form||!input||!answer)return;
  const button=form.querySelector('button[type="submit"]');
  let pending=false;
  const listKeys=['observations','inferences','contrary_evidence','missing_evidence','next_watch'];
  const requirementLabels={
    'digital-asset-registry-profile':'Verify asset identity and its admitted source',
    'active-contradiction-state':'Review contradictory evidence',
    'public-market-observation':'Obtain a current public quote',
    'xrpl-endpoint-qualification':'Qualify the ledger evidence source',
    'validated-ledger-anchor':'Verify the ledger reference',
    'xrpl-security-posture':'Review network security evidence',
    'evidence-provenance-packet':'Verify evidence provenance'
  };
  const string=v=>typeof v==='string'&&v.length<=8000;
  const stringList=v=>Array.isArray(v)&&v.length<=50&&v.every(string);
  const fresh=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.now()+5000&&Date.now()-Date.parse(v)<=300000;
  function requireResult(result){
    const a=result?.assessment;
    if(!a||!string(result.answer)||!Number.isFinite(a.evidence_strength)||a.evidence_strength<0||a.evidence_strength>100||!['UNASSESSED','INSUFFICIENT_EVIDENCE','EMERGING','SUPPORTED','CONFLICTED'].includes(a.state)||(a.state==='SUPPORTED'&&a.evidence_strength<75))throw Error('INVALID_ASSESSMENT');
    if(!listKeys.every(k=>stringList(a[k])))throw Error('INVALID_ASSESSMENT');
    if(!result.authority||['financial_execution','money_movement','trading','autonomous_purchase'].some(k=>result.authority[k]!==false))throw Error('AUTHORITY_BOUNDARY');
    if(!Array.isArray(result.sources)||result.sources.length>50||(a.evidence_strength>0&&!result.sources.length))throw Error('INVALID_SOURCES');
    for(const s of result.sources){
      if(!s||!string(s.label)||!string(s.uri)||!fresh(s.checked_at))throw Error('INVALID_SOURCES');
      const url=new URL(s.uri);
      if(url.protocol!=='https:'||url.username||url.password)throw Error('INVALID_SOURCES');
    }
    if(result.engine){
      const e=result.engine;
      if(e.version!=='3.22.7'||e.adapter!=='certis-public-engine-export/1'||e.scope!=='public_quote_checks'||e.assessment_complete!==false||e.score_model!==null||a.state!=='INSUFFICIENT_EVIDENCE'||a.evidence_strength!==0||!Array.isArray(e.checks)||!e.checks.length||e.checks.length>4||e.checks.length!==result.sources.length)throw Error('INVALID_ENGINE');
      if(new Set(e.checks.map(c=>c?.asset)).size!==e.checks.length)throw Error('INVALID_ENGINE');
      for(const c of e.checks)if(!c||!['btc','eth','xrp','sol'].includes(c.asset)||c.passed!==true||c.policy_version!=='certis-reasoning-control/1.0'||!fresh(c.evaluated_at)||!stringList(c.required_evidence)||!c.required_evidence.every(k=>Object.hasOwn(requirementLabels,k)))throw Error('INVALID_ENGINE');
    }
    return result;
  }
  function node(tag,text,parent=answer,className){
    const n=document.createElement(tag);if(text!==undefined)n.textContent=text;
    if(className)n.className=className;
    parent.appendChild(n);return n;
  }
  function section(title,values,empty){
    node('h3',title);
    if(!values.length){node('p',empty);return;}
    const ul=node('ul');for(const value of values)node('li',value,ul);
  }
  function render(result){
    const a=result.assessment;
    answer.replaceChildren();
    node('h2','CERTIS evidence response');
    node('p',a.state.replaceAll('_',' ')+' · '+(a.evidence_strength===0?'Evidence strength: unscored':a.evidence_strength+'/100 evidence strength, not probability'),answer,'assessment-status');
    node('p',result.answer);
    section('What is observed',a.observations,'No verified observation is connected for this question.');
    section('What can be inferred',a.inferences,'No inference is supported by the connected evidence.');
    section('What challenges it',a.contrary_evidence,'No contrary evidence was supplied. This does not establish that none exists.');
    section('What is missing',a.missing_evidence,'No missing-evidence items were supplied.');
    section('What to watch next',a.next_watch,'No next-watch condition was supplied.');
    if(result.sources.length){
      node('h3','Sources and timestamps');
      for(const source of result.sources){
        const p=node('p');const link=node('a',source.label,p);link.href=source.uri;link.target='_blank';link.rel='noopener noreferrer';
        node('span',' · checked '+source.checked_at,p);
      }
    }
    if(result.engine){
      node('h3','Protected engine checks');
      for(const check of result.engine.checks){
        node('p','CERTIS '+result.engine.version+' · '+check.asset.toUpperCase()+' citation and authority checks passed at '+check.evaluated_at+'.');
        section('Further research',check.required_evidence.map(k=>requirementLabels[k]),'No intake requirements were supplied.');
      }
      node('p','These checks are not a completed investment assessment. Further evidence has not been acquired or approved.',answer,'fine');
    }
    node('p','Financial action authority: none. CERTIS does not trade, move money, or approve investments.',answer,'fine');
  }
  async function submit(event){
    event.preventDefault();
    const question=input.value.trim();
    if(pending||!question)return;
    answer.hidden=false;answer.replaceChildren();
    if(question.length>500){node('p','Please limit your question to 500 characters.');return;}
    pending=true;button.disabled=true;answer.setAttribute('aria-busy','true');
    node('p','Checking connected CERTIS evidence…');
    let failure='The evidence response could not be verified. No assessment was accepted.';
    try{
      const response=await window.CertisEngineRequests.query(question,message=>{answer.replaceChildren();node('p',message);});
      render(requireResult(response.result));
      if(response.request_id)node('p','Protected engine completed this request at '+response.completed_at+'. Reference: '+response.request_id.slice(0,12)+'.',answer,'fine');
    }catch(error){
      failure=({401:'Sign in with Google using the account control at the top of this page, then submit your question again.',403:'Access was denied. No assessment was made.',410:'The protected engine did not complete this request before it expired. Check that the CERTIS node is awake and its refresh is running, then try again.',429:'The request limit was reached. Please try again later.',503:'The protected-engine request connection is unavailable. No assessment was made.'})[error?.status]||failure;
      answer.replaceChildren();node('h2','CERTIS connection');
      node('p',error?.name==='TimeoutError'?'CERTIS did not respond in time. No assessment was made.':failure);
    }finally{
      pending=false;button.disabled=false;answer.setAttribute('aria-busy','false');
    }
  }
  form.addEventListener('submit',submit);
})();
