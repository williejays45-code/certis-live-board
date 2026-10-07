import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import * as oidc from 'openid-client';
import {authenticationWithClient} from './oidc.mjs';
import {ISSUER} from './security.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'synthetic-key',alg:'RS256',use:'sig'};
const json=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const config={origin:'https://certisintelligence.com',clientId:'synthetic-client',allowedEmail:'certisfounder@gmail.com'};
async function setup(overrides={}){
  const client=new oidc.Configuration({issuer:ISSUER,authorization_endpoint:ISSUER+'/authorize',token_endpoint:ISSUER+'/token',jwks_uri:ISSUER+'/jwks'},config.clientId,'synthetic-secret');
  const auth=authenticationWithClient(config,client),login=await auth.begin();
  const now=Math.floor(Date.now()/1000);
  const claims={iss:ISSUER,aud:config.clientId,sub:'synthetic-sub',iat:now,exp:now+300,nonce:login.transaction.nonce,email:'certisfounder@gmail.com',email_verified:true,...overrides};
  const input=json({alg:'RS256',kid:jwk.kid})+'.'+json(claims);
  let jwt=input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  let calls=0;
  client[oidc.customFetch]=async(url,options)=>{
    calls++;
    if(String(url)===ISSUER+'/jwks')return Response.json({keys:[jwk]});
    assert.equal(String(url),ISSUER+'/token');
    const body=new URLSearchParams(options.body);
    assert.equal(body.get('code_verifier'),login.transaction.verifier);
    assert.equal(body.get('redirect_uri'),config.origin+'/auth/callback');
    return Response.json({access_token:'synthetic-only',token_type:'Bearer',id_token:jwt});
  };
  const callback=new URL(config.origin+'/auth/callback?code=synthetic&state='+login.transaction.state);
  return {auth,login,callback,get calls(){return calls;},corrupt(){jwt=jwt.slice(0,-10)+'AAAAAAAAAA';}};
}
test('real OIDC library validates synthetic signed ID token with PKCE/nonce/state',async()=>{const h=await setup();const url=new URL(h.login.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),'openid email');assert.equal(await h.auth.complete(h.callback,h.login.transaction),'google:synthetic-sub');assert.ok(h.calls>=2);});
for(const [name,claims] of [['issuer',{iss:'https://evil.example'}],['audience',{aud:'wrong-client'}],['expiry',{exp:1}],['nonce',{nonce:'wrong'}],['email',{email:'other@example.com'}],['unverified email',{email_verified:false}]])test('reject wrong '+name,async()=>{const h=await setup(claims);await assert.rejects(()=>h.auth.complete(h.callback,h.login.transaction));});
test('reject state before token exchange',async()=>{const h=await setup();h.callback.searchParams.set('state','wrong');await assert.rejects(()=>h.auth.complete(h.callback,h.login.transaction));assert.equal(h.calls,0);});
test('reject forged signature',async()=>{const h=await setup();h.corrupt();await assert.rejects(()=>h.auth.complete(h.callback,h.login.transaction));});
