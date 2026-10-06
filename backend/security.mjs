import {createHash, randomBytes} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
export const ISSUER='https://accounts.google.com';
export const SESSION_COOKIE='__Host-certis-session';
export const LOGIN_COOKIE='__Host-certis-login';
export function cookie(name,value,seconds){return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;}
export function readCookie(request,name){
  const parts=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  if(parts.length!==1)return null;
  const value=parts[0].slice(name.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
export function configuration(env){
  const enabled=env.CERTIS_AUTH_ENABLED==='true';
  const origin=env.CERTIS_PUBLIC_ORIGIN||'https://certisintelligence.com';
  if(origin!=='https://certisintelligence.com')throw Error('INVALID_PUBLIC_ORIGIN');
  if(!enabled)return {enabled:false,origin};
  if(!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.REDIS_URL || !env.CERTIS_ALLOWED_EMAIL)throw Error('AUTH_CONFIGURATION_INCOMPLETE');
  if(!/^rediss?:\/\//.test(env.REDIS_URL))throw Error('INVALID_STORE_URL');
  if(env.CERTIS_ALLOWED_EMAIL.toLowerCase()!=='certisfounder@gmail.com')throw Error('UNAPPROVED_ACCOUNT');
  return {enabled:true,origin,clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET,redisUrl:env.REDIS_URL,allowedEmail:env.CERTIS_ALLOWED_EMAIL.toLowerCase()};
}

// Session IDs are random bearer values; Redis keys contain only their hashes.
// TTL is absolute, not extended on read. Logout deletes the server record.
export class SecurityStore {
  constructor(redis,{now=Date.now}={}){this.redis=redis;this.now=now;}
  key(kind,id){return `certis:bridge:v1:${kind}:${hash(id)}`;}
  async transaction(value){
    const id=token();const saved=await this.redis.set(this.key('login',id),JSON.stringify({...value,expiresAt:this.now()+300000}),{EX:300,NX:true});if(saved!=='OK')throw Error('STORE_WRITE_FAILED');return id;
  }
  async consumeTransaction(id){
    if(!id)return null;
    const raw=await this.redis.getDel(this.key('login',id));
    if(!raw)return null;const value=JSON.parse(raw);return value.expiresAt>this.now()?value:null;
  }
  async issue(principalId){
    const id=token();const saved=await this.redis.set(this.key('session',id),JSON.stringify({principalId,expiresAt:this.now()+3600000}),{EX:3600,NX:true});if(saved!=='OK')throw Error('STORE_WRITE_FAILED');return id;
  }
  async session(id){
    if(!id)return null;
    const raw=await this.redis.get(this.key('session',id));if(!raw)return null;
    const value=JSON.parse(raw);
    if(typeof value.principalId!=='string'||!value.principalId.startsWith('google:')||!Number.isFinite(value.expiresAt)||value.expiresAt<=this.now())return null;
    // Website access never enrolls or grants protected founder authority.
    return {principalId:value.principalId,roles:[]};
  }
  async revoke(id){if(id)await this.redis.del(this.key('session',id));}
  async limit(scope,limit=30){
    const key=this.key('rate',scope+':'+Math.floor(this.now()/60000));
    const script="local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end; return n";
    const count=await this.redis.eval(script,{keys:[key],arguments:[]});
    return Number.isInteger(count)&&count<=limit;
  }
}

export function principalFromClaims(claims,allowedEmail){
  if(!claims || claims.iss!==ISSUER || claims.email_verified!==true || typeof claims.email!=='string'||claims.email.toLowerCase()!==allowedEmail || typeof claims.sub!=='string'||!claims.sub||claims.sub.length>200)throw Error('ACCOUNT_DENIED');
  return 'google:'+claims.sub;
}
