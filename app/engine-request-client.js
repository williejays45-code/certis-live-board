(() => {
  const failure=(status,code)=>Object.assign(new Error(code),{status});
  const read=async response=>{const text=await response.text();if(text.length>65536)throw failure(502,'INVALID_ENGINE_RESPONSE');return JSON.parse(text);};
  const stamp=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s));
  async function query(question,progress=()=>{}){
    const start=Date.now();
    const response=await fetch('/api/certis/query?engine_request=1',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,mode:'public',requested_at:new Date(start).toISOString()}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw failure(response.status,'ENGINE_REQUEST_FAILED');
    const receipt=await read(response);
    if(response.status===200&&receipt.status==='not_connected')return {result:receipt.result};
    if(response.status!==202||!['pending','running'].includes(receipt.status)||!/^[a-f0-9]{48}$/.test(receipt.request_id||'')||!stamp(receipt.requested_at)||!stamp(receipt.expires_at)||Date.parse(receipt.expires_at)>start+215000||Date.parse(receipt.expires_at)<=start)throw failure(502,'INVALID_ENGINE_RECEIPT');
    progress('Request received. Waiting for the protected engine on its next two-minute refresh. Keep this page open; this can take up to four minutes.');
    for(let tries=0;tries<71;tries++){
      if(Date.now()>=Date.parse(receipt.expires_at))throw failure(410,'ENGINE_REQUEST_EXPIRED');
      await new Promise(resolve=>setTimeout(resolve,3000));
      const polled=await fetch('/api/certis/query?engine_request=1&request_id='+receipt.request_id,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!polled.ok)throw failure(polled.status,'ENGINE_REQUEST_FAILED');
      const value=await read(polled);
      if(value.request_id!==receipt.request_id||value.requested_at!==receipt.requested_at||value.expires_at!==receipt.expires_at||!['pending','running','complete'].includes(value.status))throw failure(502,'ENGINE_REQUEST_MISMATCH');
      if(value.status==='complete'){
        if(!stamp(value.completed_at)||Date.parse(value.completed_at)<Date.parse(receipt.requested_at)||Date.parse(value.completed_at)>Date.now()+5000||!value.result?.engine||!value.result.engine.checks?.every(c=>stamp(c.evaluated_at)&&Date.parse(c.evaluated_at)>=Date.parse(receipt.requested_at)))throw failure(502,'ENGINE_ATTRIBUTION_FAILED');
        return {result:value.result,request_id:receipt.request_id,completed_at:value.completed_at};
      }
      if(value.status==='running')progress('The protected engine is checking the public evidence for this request…');
    }
    throw failure(410,'ENGINE_REQUEST_EXPIRED');
  }
  window.CertisEngineRequests=Object.freeze({query});
})();
