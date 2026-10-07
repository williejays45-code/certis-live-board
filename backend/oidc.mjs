import {diagnosticFailure} from './auth-diagnostics.mjs';
import * as oidc from 'openid-client';
import {ISSUER,principalFromClaims} from './security.mjs';

export async function googleAuthentication(config){
  const client=await oidc.discovery(new URL(ISSUER),config.clientId,config.clientSecret,undefined,{timeout:10});
  return authenticationWithClient(config,client);
}

export function authenticationWithClient(config,client){
  oidc.enableNonRepudiationChecks(client);
  const redirectUri=config.origin+'/auth/callback';
  return {
    async begin(){
      const verifier=oidc.randomPKCECodeVerifier(),state=oidc.randomState(),nonce=oidc.randomNonce();
      const challenge=await oidc.calculatePKCECodeChallenge(verifier);
      const url=oidc.buildAuthorizationUrl(client,{redirect_uri:redirectUri,scope:'openid email',code_challenge:challenge,code_challenge_method:'S256',state,nonce,prompt:'select_account'});
      return {url:url.href,transaction:{verifier,state,nonce}};
    },
    async complete(url,transaction){
      // The library validates state, nonce, PKCE, issuer, audience, signature and expiry.
      let tokens;
      try { tokens=await oidc.authorizationCodeGrant(client,url,{pkceCodeVerifier:transaction.verifier,expectedState:transaction.state,expectedNonce:transaction.nonce,idTokenExpected:true}); }
      catch(error) { throw diagnosticFailure('exchange',error); }
      try { return principalFromClaims(tokens.claims(),config.allowedEmail); }
      catch(error) { throw diagnosticFailure('account',error); }
      // Access/refresh/ID tokens are never stored in the browser or session store.
    }
  };
}
