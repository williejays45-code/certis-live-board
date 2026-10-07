import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticFailure,diagnosticLine} from './auth-diagnostics.mjs';
test('fixed categories distinguish provider rejection from local account rejection',()=>{
 assert.equal(diagnosticLine(diagnosticFailure('exchange',{code:'OAUTH_RESPONSE_BODY_ERROR',error:'invalid_client'})),'CERTIS_SIGN_IN_FAILURE GOOGLE_CLIENT_REJECTED');
 assert.equal(diagnosticLine(diagnosticFailure('exchange',{code:'OAUTH_RESPONSE_BODY_ERROR',error:'invalid_grant'})),'CERTIS_SIGN_IN_FAILURE GOOGLE_GRANT_REJECTED');
 assert.equal(diagnosticLine(diagnosticFailure('account',{})),'CERTIS_SIGN_IN_FAILURE ACCOUNT_CLAIMS_REJECTED');
});
test('untrusted errors and provider descriptions never become log output',()=>{
 const sensitive='synthetic-private-value';
 for(const e of [new Error(sensitive),{code:sensitive,error:sensitive,message:sensitive,stack:sensitive,cause:{token:sensitive}},{code:'OAUTH_RESPONSE_BODY_ERROR',error:sensitive,error_description:sensitive},null,undefined]){
  const failure=diagnosticFailure('exchange',e);
  assert.equal(diagnosticLine(failure).includes(sensitive),false);
  assert.equal(failure.cause,undefined);
 }
});
test('throwing properties and spoofed categories fail closed',()=>{
 const e={get code(){throw Error('synthetic-private-value')}};
 assert.equal(diagnosticLine(diagnosticFailure('exchange',e)),'CERTIS_SIGN_IN_FAILURE EXCHANGE_OR_VALIDATION_FAILED');
 assert.equal(diagnosticLine({category:'INJECTED'}),'CERTIS_SIGN_IN_FAILURE UNCLASSIFIED');
});
