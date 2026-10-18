import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {validatePolicy} from './check.mjs';

const root=process.cwd();
const policy=validatePolicy(root);
for (const suite of policy.suites) {
  const args=suite.runner==='node'
    ? ['--experimental-strip-types','--test',...suite.files]
    : [resolve(root,suite.cwd,'node_modules/vitest/vitest.mjs'),'run','--configLoader','native',...suite.files];
  const result=spawnSync(process.execPath,args,{cwd:resolve(root,suite.cwd),stdio:'inherit',env:{...process.env,CI:'true'}});
  if (result.error || result.status!==0) {
    console.error(JSON.stringify({status:'FAIL',suite:suite.id,code:result.error?'TEST_LAUNCH_FAILED':'CONTRACT_REGRESSION_FAILED'}));
    process.exit(result.status||1);
  }
}
console.log(JSON.stringify({status:'PASS',scope:'fixture-based regression suites only',suites:policy.suites.map(x=>x.id),production_acceptance:false}));
