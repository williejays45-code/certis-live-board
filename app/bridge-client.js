(() => {
  const el=id=>document.getElementById(id);
  const prompt=el('prompt'), button=el('ask'), transcript=el('transcript');
  const conversationId=crypto.randomUUID();
  let pending=false;
  function message(text,kind='certis') {
    const node=document.createElement('div'); node.className='message '+kind;
    const p=document.createElement('p'); p.textContent=text; node.appendChild(p); transcript.appendChild(node);
    transcript.scrollTop=transcript.scrollHeight;
    return node;
  }
  function reset() {
    el('score').textContent='0';el('meter').style.width='0%';el('state').textContent='UNASSESSED';
    el('scoreText').textContent='Unscored. No validated evidence-strength assessment is available.';
    el('evidence').textContent='No current evidence response';
    if(el('mode'))el('mode').textContent='Awaiting an evidence response';
    el('contrary').textContent='Not evaluated';el('watch').textContent='Connect and verify dated evidence.';
  }
  async function submit() {
    const question=prompt.value.trim();if(!question || pending)return;
    if(question.length>4000){message('Please limit your question to 4,000 characters.');return;}
    pending=true;button.disabled=true;reset();message(question,'user');prompt.value='';
    try {
      const response=await fetch('/api/certis/query',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,conversation_id:conversationId,mode:'public',requested_at:new Date().toISOString()}),signal:AbortSignal.timeout(15000)});
      if(!response.ok) {
        const errors={401:'Your CERTIS session is missing or expired. Sign in with Google to continue.',403:'Access was denied. No evidence was requested from the protected runtime.',429:'The request limit was reached. Please try again later.'};
        throw new Error(errors[response.status]||'The authenticated evidence bridge is unavailable. No assessment was made.');
      }
      const result=await response.json(), a=result.assessment;
      if(!a || !Number.isFinite(a.evidence_strength) || a.evidence_strength<0 || a.evidence_strength>100 || !['UNASSESSED','INSUFFICIENT_EVIDENCE','EMERGING','SUPPORTED','CONFLICTED'].includes(a.state) || (a.state==='SUPPORTED' && a.evidence_strength<75))throw new Error('The bridge returned an invalid assessment. No supported conclusion is available.');
      if(!Array.isArray(result.sources) || (a.evidence_strength>0 && !result.sources.length))throw new Error('Evidence sources are missing. No assessment was accepted.');
      for(const key of ['observations','inferences','contrary_evidence','missing_evidence','next_watch'])if(!Array.isArray(a[key])||!a[key].every(v=>typeof v==='string'))throw new Error('The assessment is incomplete.');
      if(!result.authority || ['financial_execution','money_movement','trading','autonomous_purchase'].some(k=>result.authority[k]!==false))throw new Error('The response violated the authority boundary.');
      if(typeof result.answer!=='string')throw new Error('The assessment is incomplete.');
      if(result.engine){
        const e=result.engine;
        if(!['3.22.7','3.24.0'].includes(e.version)||e.adapter!=='certis-public-engine-export/1'||e.scope!=='public_quote_checks'||e.assessment_complete!==false||e.score_model!==null||a.state!=='INSUFFICIENT_EVIDENCE'||a.evidence_strength!==0||!Array.isArray(e.checks)||!e.checks.length||e.checks.length>4||e.checks.length!==result.sources.length)throw new Error('The engine result is outside the approved public scope.');
        for(const c of e.checks)if(!['btc','eth','xrp','sol'].includes(c.asset)||c.passed!==true||c.policy_version!=='certis-reasoning-control/1.0'||!Number.isFinite(Date.parse(c.evaluated_at))||Date.parse(c.evaluated_at)>Date.now()+5000||Date.now()-Date.parse(c.evaluated_at)>300000||!Array.isArray(c.required_evidence)||!c.required_evidence.every(x=>typeof x==='string'))throw new Error('The engine evidence is stale or incomplete.');
      }
      const node=message(result.answer);
      for(const [key,label] of [['observations','Observed'],['inferences','Inference'],['contrary_evidence','Contrary evidence'],['missing_evidence','Missing evidence'],['next_watch','Next watch']]) {
        const p=document.createElement('p');p.textContent=label+': '+(a[key].join(' · ')||'None supplied');node.appendChild(p);
      }
      for(const source of result.sources){const p=document.createElement('p');p.textContent='Source: '+source.label+' · '+source.uri+' · checked '+source.checked_at;node.appendChild(p);}
      if(result.engine)for(const check of result.engine.checks){
        const p=document.createElement('p');p.textContent='CERTIS '+result.engine.version+' · '+check.asset.toUpperCase()+' evidence-reference and authority checks passed at '+check.evaluated_at+'. This is not a completed investment assessment.';node.appendChild(p);
        const labels={'digital-asset-registry-profile':'Verify asset identity and its admitted source','active-contradiction-state':'Review contradictory evidence','public-market-observation':'Obtain a current public quote','xrpl-endpoint-qualification':'Qualify the ledger evidence source','validated-ledger-anchor':'Verify the ledger reference','xrpl-security-posture':'Review network security evidence','evidence-provenance-packet':'Verify evidence provenance'};
        const plan=document.createElement('p');plan.textContent='Research requirements: '+check.required_evidence.map(x=>labels[x]||'Additional evidence review').join(' · ')+'. This plan has not acquired the missing evidence or granted approval.';node.appendChild(plan);
      }
      el('score').textContent=String(a.evidence_strength);el('meter').style.width=a.evidence_strength+'%';el('state').textContent=a.state;
      el('scoreText').textContent=a.evidence_strength===0?'Unscored. No validated evidence-strength model has been applied; 0 is not a measured probability.':'Evidence strength, not probability of an outcome.';
      el('evidence').textContent=result.sources.length+' dated '+(result.sources.length===1?'source':'sources');el('contrary').textContent=a.contrary_evidence.join(' · ')||'None supplied';el('watch').textContent=a.next_watch.join(' · ');
      if(el('mode'))el('mode').textContent=result.engine?'Engine-checked public evidence · assessment incomplete':result.sources.length?'Quotes available · engine analysis unavailable':'Evidence gap · no supported assessment';
    } catch(error) {reset();message(error.name==='TimeoutError'?'The bridge timed out. No assessment was made.':error.message);}
    finally {pending=false;button.disabled=false;prompt.focus();}
  }
  button.addEventListener('click',submit);
  prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit();}});
  document.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>{prompt.value=b.dataset.q;submit();}));
  reset();
})();
