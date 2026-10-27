// Server-only candidate transport. No redirects, retries, proxy inheritance,
// arbitrary headers, credentials, private addresses, or production registration.
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';

export function publicIPv4(address) {
  if (isIP(address)!==4) return false; // IPv6 deliberately unsupported for this candidate.
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||
    (a===100&&b>=64&&b<=127)||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168||
      (b===88&&c===99)||(b===2)))||(a===198&&(b===18||b===19||b===51))||
    (a===203&&b===0&&c===113));
}

export function sourceRequest(source, subject) {
  if (source==='treasury'&&subject==='treasury.notes') return new URL(
    'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?fields=record_date,security_desc,avg_interest_rate_amt&filter=security_desc:eq:Treasury%20Notes&sort=-record_date&page[size]=24');
  if (source==='bls'&&subject==='cpi.us.all_items.nsa') return new URL(
    'https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0');
  if (source==='sec'&&typeof subject==='string'&&/^cik\.[0-9]{10}$/.test(subject)) return new URL(
    'https://data.sec.gov/submissions/CIK'+subject.slice(4)+'.json');
  throw Error('SOURCE_TARGET');
}

// Dependency injection is for isolated contract tests. Production callers use
// the default DNS resolver and HTTPS implementation, never browser-supplied ones.
export function createSourceTransport({resolve=lookup,open=request}={}) {
  return async function readSource(source,subject,{userAgent='CERTIS-source-candidate/1'}={}) {
    const url=sourceRequest(source,subject);
    if (typeof userAgent!=='string'||!/^[\x20-\x7e]{10,160}$/.test(userAgent)) throw Error('SOURCE_AGENT');
    // SEC requires an operator-declared contact. Never invent one or log it.
    if (source==='sec'&&!/^[A-Za-z0-9 ._/-]+ [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(userAgent)) throw Error('SOURCE_CONTACT_REQUIRED');
    return new Promise((accept,reject)=>{
      let req,done=false;
      const timer=setTimeout(()=>finish(Error('SOURCE_TIMEOUT')),10000);
      const finish=(error,value)=>{
        if(done)return; done=true; clearTimeout(timer);
        if(error){req?.destroy();reject(error);}else accept(value);
      };
      // The validated IP is returned directly to the TLS socket lookup. There
      // is no independent second DNS resolution between checking and connecting.
      const pinnedLookup=(hostname,options,callback)=>{
        if(hostname!==url.hostname)return callback(Error('SOURCE_DNS_IDENTITY'));
        Promise.resolve().then(()=>resolve(hostname,{all:true,family:4,verbatim:true})).then(records=>{
          if(!Array.isArray(records)||!records.length||records.some(x=>x.family!==4||!publicIPv4(x.address)))throw Error('SOURCE_DNS_DENIED');
          const record=records[0];
          callback(null,options?.all?[record]:record.address,options?.all?undefined:4);
        }).catch(()=>callback(Error('SOURCE_DNS_DENIED')));
      };
      try {
        req=open(url,{method:'GET',agent:false,servername:url.hostname,
          rejectUnauthorized:true,family:4,lookup:pinnedLookup,
          headers:{Accept:'application/json','Accept-Encoding':'identity','User-Agent':userAgent}},res=>{
          if(res.statusCode!==200){res.destroy();return finish(Error('SOURCE_HTTP'));}
          if(!/^application\/json(?:\s*;|$)/i.test(res.headers['content-type']||'')||
            !['identity',undefined].includes(res.headers['content-encoding'])){
            res.destroy();return finish(Error('SOURCE_MEDIA'));
          }
          const chunks=[];let size=0;
          res.on('data',chunk=>{
            size+=chunk.length;
            if(size>2*1024*1024){res.destroy();finish(Error('SOURCE_TOO_LARGE'));}
            else chunks.push(chunk);
          });
          res.on('aborted',()=>finish(Error('SOURCE_TRUNCATED')));
          res.on('error',()=>finish(Error('SOURCE_TRANSPORT')));
          res.on('end',()=>{
            if(!res.complete)return finish(Error('SOURCE_TRUNCATED'));
            finish(null,Buffer.concat(chunks));
          });
        });
        req.on('error',()=>finish(Error('SOURCE_TRANSPORT')));
        req.end();
      }catch{finish(Error('SOURCE_TRANSPORT'));}
    });
  };
}
