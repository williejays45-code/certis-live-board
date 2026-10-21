import test from 'node:test';
import assert from 'node:assert/strict';
import {stagingConfiguration} from './eue-staging-server.mjs';
const base={CERTIS_EUE_ENVIRONMENT:'NONPRODUCTION',CERTIS_EUE_ENABLED:'true',CERTIS_EUE_REDIS_SOCKET:'/private/eue-state/redis.sock'};
test('staging receiver stays on a fixed private port with separate Unix-socket storage',()=>{
  assert.deepEqual(stagingConfiguration({...base,HOST:'0.0.0.0',PORT:'443'}),{socket:base.CERTIS_EUE_REDIS_SOCKET,host:'127.0.0.1',port:8766,origin:'https://certisintelligence.com'});
});
test('production credentials and customer/public capabilities cannot enter the staging bootstrap',()=>{
  for(const key of ['CERTIS_AUTH_ENABLED','CERTIS_PUBLIC_EXPORT_ENABLED','CERTIS_ENGINE_REQUESTS_ENABLED','GOOGLE_CLIENT_SECRET','REDIS_URL','CERTIS_EXPORT_TOKEN_SHA256']){
    assert.throws(()=>stagingConfiguration({...base,[key]:'true'}));
  }
  assert.throws(()=>stagingConfiguration({...base,CERTIS_EUE_ENVIRONMENT:'PRODUCTION'}));
});
test('missing or unsafe durable socket bindings fail closed',()=>{
  for(const socket of [undefined,'redis://production','/private/../production/redis.sock','relative.sock'])assert.throws(()=>stagingConfiguration({...base,CERTIS_EUE_REDIS_SOCKET:socket}));
});
