// Versioned EUE HMAC envelope. Identity and scope are server configuration.
import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {readFileSync,lstatSync} from 'node:fs';
export const FIXTURE='EUE-SYNTH-PARCEL-001';
export const canonical=value=>{
  const order=x=>Array.isArray(x)?x.map(order):x!==null&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,order(x[k])])):x;
  return JSON.stringify(order(value)).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
};
export function privateKey(path){
  if(typeof path!=='string'||!path)throw Error('PROTECTED_KEY_FILE_REQUIRED');
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||(process.platform!=='win32'&&(st.uid!==process.geteuid()||(st.mode&0o077))))throw Error('PRIVATE_KEY_PERMISSIONS_REQUIRED');
  const key=readFileSync(path);if(key.length<32||key.length>512)throw Error('INVALID_KEY_LENGTH');return key;
}
export function sign(body,{key,issuer,audience,now=Date.now,nonce=randomBytes(24).toString('hex')}){
  const timestamp=String(Math.floor(now()/1000)),purpose='READ_ONLY_REVIEW';
  const fields={issuer,audience,purpose,nonce,timestamp,request:body};
  const signature=createHmac('sha256',key).update(canonical(fields)).digest('hex');
  return {'X-EUE-Issuer':issuer,'X-EUE-Audience':audience,'X-EUE-Purpose':purpose,'X-EUE-Nonce':nonce,'X-EUE-Timestamp':timestamp,'X-EUE-Signature':signature};
}
export function verifier({key,issuer,audience,claimNonce,now=Date.now}){
  if(!Buffer.isBuffer(key)||key.length<32||typeof claimNonce!=='function'||!issuer||!audience)throw Error('INDEPENDENT_TRUST_AND_DURABLE_NONCE_REQUIRED');
  return async(headers,body)=>{
    try{
      const h=headers instanceof Headers?headers:new Headers(headers);
      const nonce=h.get('X-EUE-Nonce'),timestamp=h.get('X-EUE-Timestamp'),sig=h.get('X-EUE-Signature');
      if(h.get('X-EUE-Issuer')!==issuer||h.get('X-EUE-Audience')!==audience||h.get('X-EUE-Purpose')!=='READ_ONLY_REVIEW'||body?.fixture_id!==FIXTURE||!/^[-A-Za-z0-9_:]{1,128}$/.test(body?.request_id||'')||!/^[\x21-\x7e]{16,128}$/.test(nonce||'')||!/^\d{1,12}$/.test(timestamp||'')||!/^[a-f0-9]{64}$/.test(sig||'')||Math.abs(Math.floor(now()/1000)-Number(timestamp))>120)return false;
      const expected=sign(body,{key,issuer,audience,now:()=>Number(timestamp)*1000,nonce})['X-EUE-Signature'];
      if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(sig,'hex')))return false;
      return await claimNonce(issuer,nonce)===true;
    }catch{return false;}
  };
}
export async function readJson(request,max=16384){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('JSON_REQUIRED');
  const reader=request.body?.getReader();if(!reader)throw Error('BODY_REQUIRED');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('BODY_TOO_LARGE');}chunks.push(value);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
export const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
