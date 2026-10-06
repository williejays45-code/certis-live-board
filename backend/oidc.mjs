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
      const tokens=await oidc.authorizationCodeGrant(client,url,{pkceCodeVerifier:transaction.verifier,expectedState:transaction.state,expectedNonce:transaction.nonce,idTokenExpected:true});
      return principalFromClaims(tokens.claims(),config.allowedEmail);
      // Access/refresh/ID tokens are never stored in the browser or session store.
    }
  };
}
