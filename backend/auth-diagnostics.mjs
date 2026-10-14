const exchangeCodes = new Map([
  ['OAUTH_JWT_TIMESTAMP_CHECK_FAILED','TOKEN_TIME_REJECTED'],
  ['OAUTH_JWT_CLAIM_COMPARISON_FAILED','TOKEN_CLAIMS_REJECTED'],
  ['OAUTH_KEY_SELECTION_FAILED','TOKEN_KEY_REJECTED'],
  ['OAUTH_AUTHORIZATION_RESPONSE_ERROR','GOOGLE_AUTHORIZATION_REJECTED'],
  ['OAUTH_INVALID_RESPONSE','OAUTH_RESPONSE_INVALID'],
  ['OAUTH_RESPONSE_IS_NOT_JSON','OAUTH_RESPONSE_FORMAT_REJECTED'],
  ['OAUTH_RESPONSE_IS_NOT_CONFORM','OAUTH_RESPONSE_FORMAT_REJECTED'],
]);
const marked = new WeakMap();
export function diagnosticFailure(stage, error) {
  let category = stage === 'account' ? 'ACCOUNT_CLAIMS_REJECTED' : 'EXCHANGE_OR_VALIDATION_FAILED';
  if (stage !== 'account') {
    try {
      if (error?.code === 'OAUTH_RESPONSE_BODY_ERROR') {
        category = error.error === 'invalid_client' ? 'GOOGLE_CLIENT_REJECTED'
          : error.error === 'invalid_grant' ? 'GOOGLE_GRANT_REJECTED'
          : 'GOOGLE_TOKEN_REQUEST_REJECTED';
      } else category = exchangeCodes.get(error?.code) || category;
    } catch { /* Unreadable errors retain the fixed fallback. */ }
  }
  const failure = new Error('SIGN_IN_REJECTED');
  marked.set(failure, category);
  return failure;
}
export function diagnosticLine(error) {
  return 'CERTIS_SIGN_IN_FAILURE ' + (marked.get(error) || 'UNCLASSIFIED');
}
