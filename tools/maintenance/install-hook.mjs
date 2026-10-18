import {existsSync,lstatSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function installHooks(root) {
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const repositoryRoot=git(['rev-parse','--show-toplevel']);
  if(resolve(root)!==resolve(repositoryRoot))throw new Error('RUN_FROM_REPOSITORY_ROOT');
  let configured='';
  try{configured=git(['config','--get','core.hooksPath']);}catch(error){if(error.status!==1)throw error;}
  if(configured && configured!=='.githooks')throw new Error('EXISTING_HOOKS_PATH');
  const hook=resolve(root,'.githooks/pre-commit');
  if(!existsSync(hook) || lstatSync(hook).isSymbolicLink() || lstatSync(resolve(root,'.githooks')).isSymbolicLink())throw new Error('INVALID_MANAGED_HOOK');
  if(configured==='.githooks')return {status:'already_installed',scope:'this checkout only'};
  const existing=resolve(root,git(['rev-parse','--git-path','hooks/pre-commit']));
  if(existsSync(existing))throw new Error('EXISTING_PRE_COMMIT');
  chmodSync(hook,lstatSync(hook).mode|0o100);
  git(['config','--local','core.hooksPath','.githooks']);
  return {status:'installed',scope:'this checkout only'};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(installHooks(process.cwd())));}
  catch(error){console.error(JSON.stringify({status:'not_installed',code:error.message?.match(/^[A-Z_]+$/)?.[0]??'HOOK_INSTALL_FAILED'}));process.exitCode=1;}
}
