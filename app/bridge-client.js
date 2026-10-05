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
    el('scoreText').textContent='No validated evidence assessment is available.';
    el('evidence').textContent='Authenticated evidence bridge not connected';
    el('contrary').textContent='Not evaluated';el('watch').textContent='Connect and verify dated evidence.';
  }
  async function submit() {
    const question=prompt.value.trim();if(!question || pending)return;
    if(question.length>4000){message('Please limit your question to 4,000 characters.');return;}
    pending=true;button.disabled=true;reset();message(question,'user');prompt.value='';
    try {
      const response=await fetch('/api/certis/query',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,conversation_id:conversationId,mode:'public',requested_at:new Date().toISOString()}),signal:AbortSignal.timeout(15000)});
      if(!response.ok) {
        const errors={401:'Sign-in is required. Founder authentication is not yet connected to this workspace.',403:'Access was denied. No evidence was requested from the protected runtime.',429:'The request limit was reached. Please try again later.'};
        throw new Error(errors[response.status]||'The authenticated evidence bridge is unavailable. No assessment was made.');
      }
      const result=await response.json(), a=result.assessment;
      if(!a || !Number.isFinite(a.evidence_strength) || a.evidence_strength<0 || a.evidence_strength>100 || !['UNASSESSED','INSUFFICIENT_EVIDENCE','EMERGING','SUPPORTED','CONFLICTED'].includes(a.state) || (a.state==='SUPPORTED' && a.evidence_strength<75))throw new Error('The bridge returned an invalid assessment. No supported conclusion is available.');
      if(!Array.isArray(result.sources) || (a.evidence_strength>0 && !result.sources.length))throw new Error('Evidence sources are missing. No assessment was accepted.');
      for(const key of ['observations','inferences','contrary_evidence','missing_evidence','next_watch'])if(!Array.isArray(a[key])||!a[key].every(v=>typeof v==='string'))throw new Error('The assessment is incomplete.');
      if(!result.authority || ['financial_execution','money_movement','trading','autonomous_purchase'].some(k=>result.authority[k]!==false))throw new Error('The response violated the authority boundary.');
      if(typeof result.answer!=='string')throw new Error('The assessment is incomplete.');
      const node=message(result.answer);
      for(const [key,label] of [['observations','Observed'],['inferences','Inference'],['contrary_evidence','Contrary evidence'],['missing_evidence','Missing evidence'],['next_watch','Next watch']]) {
        const p=document.createElement('p');p.textContent=label+': '+(a[key].join(' · ')||'None supplied');node.appendChild(p);
      }
      for(const source of result.sources){const p=document.createElement('p');p.textContent='Source: '+source.label+' · '+source.uri+' · checked '+source.checked_at;node.appendChild(p);}
      el('score').textContent=String(a.evidence_strength);el('meter').style.width=a.evidence_strength+'%';el('state').textContent=a.state;
      el('scoreText').textContent='Evidence strength, not probability of an outcome.';
      el('evidence').textContent=result.sources.length+' dated sources';el('contrary').textContent=a.contrary_evidence.join(' · ')||'None supplied';el('watch').textContent=a.next_watch.join(' · ');
    } catch(error) {reset();message(error.name==='TimeoutError'?'The bridge timed out. No assessment was made.':error.message);}
    finally {pending=false;button.disabled=false;prompt.focus();}
  }
  button.addEventListener('click',submit);
  prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit();}});
  document.querySelectorAll('[data-q]').forEach(b=>b.addEventListener('click',()=>{prompt.value=b.dataset.q;submit();}));
  reset();
})();
