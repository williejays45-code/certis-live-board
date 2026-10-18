import {readFileSync, lstatSync} from 'node:fs';
import {resolve, isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const git = (root, args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
const problem = (code, path) => ({code, path});
const safePath = p => typeof p === 'string' && p.length > 0 && !p.includes('\\') && !isAbsolute(p) && !p.split('/').some(x => x === '..' || x === '');
function localFile(root, path) {
  if (!safePath(path)) throw new Error('UNSAFE_PATH');
  let current = root;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('SYMLINK_NOT_ALLOWED');
  }
  return current;
}
export function inspectText(path, text) {
  const results = [];
  const patterns = [
    ['PRIVATE_KEY_MATERIAL', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
    ['PROVIDER_KEY_MATERIAL', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
    ['GITHUB_TOKEN_MATERIAL', /\bgh[pousr]_[A-Za-z0-9_]{24,}/],
    ['OAUTH_SECRET_MATERIAL', /\bGOCSPX-[A-Za-z0-9_-]{20,}/],
  ];
  for (const [code, pattern] of patterns) if (pattern.test(text)) results.push(problem(code, path));
  return results;
}
export function inspectPath(path) {
  if (!safePath(path)) return [problem('UNSAFE_PATH', path)];
  if (/(^|\/)(?:__pycache__|\.pytest_cache|node_modules)(\/|$)|\.pyc$/.test(path)) return [problem('GENERATED_RESIDUE', path)];
  if (/(^|\/)\.env(?:\.|$)/.test(path) && !/\.env\.(?:example|sample|template)$/.test(path)) return [problem('PRIVATE_ENV_FILE', path)];
  if (/(^|\/)(?:id_rsa|id_ed25519)$|\.(?:p12|pfx)$/.test(path)) return [problem('PRIVATE_CREDENTIAL_FILE', path)];
  return [];
}
export function validatePolicy(root) {
  const policy = JSON.parse(readFileSync(localFile(root, 'maintenance/policy.json'), 'utf8'));
  if (policy.schema !== 'entrus.maintenance.v1' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(policy.repository)) throw new Error('INVALID_POLICY');
  if (!Array.isArray(policy.controls) || !Array.isArray(policy.suites) || !policy.suites.length) throw new Error('INVALID_POLICY');
  const expected = Array.from({length:19}, (_, i) => 'P'+String(i+1).padStart(2,'0'));
  if (JSON.stringify(policy.controls.map(x=>x.id).sort()) !== JSON.stringify(expected)) throw new Error('CONTROL_MAP_INCOMPLETE');
  const ids = new Set();
  for (const suite of policy.suites) {
    if (!suite.id || ids.has(suite.id) || !['node','vitest'].includes(suite.runner) || !Array.isArray(suite.files) || !suite.files.length) throw new Error('INVALID_SUITE');
    ids.add(suite.id);
    if (suite.cwd !== '.') localFile(root, suite.cwd);
    for (const path of suite.files) {
      if (!/\.test\.(?:mjs|ts|tsx)$/.test(path)) throw new Error('NOT_A_TEST_FILE');
      localFile(resolve(root, suite.cwd), path);
    }
  }
  for (const control of policy.controls) {
    if (!['regression_and_guidance','guidance_only'].includes(control.mode) || !Array.isArray(control.suite_ids) || control.suite_ids.some(id=>!ids.has(id))) throw new Error('INVALID_CONTROL_LINK');
    if (control.mode === 'regression_and_guidance' && !control.suite_ids.length) throw new Error('MISSING_REGRESSION_LINK');
    if (control.mode === 'guidance_only' && !control.limit) throw new Error('GUIDANCE_LIMIT_REQUIRED');
  }
  return policy;
}
export function validateAcceptances(rows) {
  if (!Array.isArray(rows)) throw new Error('INVALID_ACCEPTANCES');
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id) || !row.feature || !row.environment || !row.evidence_ref || !['reported','observed','independently_verified'].includes(row.evidence_level)) throw new Error('INVALID_ACCEPTANCE');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.recorded_on) || new Date(row.recorded_on).toISOString().slice(0,10)!==row.recorded_on) throw new Error('INVALID_ACCEPTANCE_DATE');
    if (!['PASS','CORRECTION','SUPERSEDED'].includes(row.status)) throw new Error('INVALID_ACCEPTANCE_STATUS');
    ids.add(row.id);
  }
  for (const row of rows) if (row.supersedes && (!ids.has(row.supersedes) || row.supersedes===row.id || !row.reason)) throw new Error('INVALID_SUPERSESSION');
  return rows;
}
function canonical(value) {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function preserveHistory(before, after) {
  validateAcceptances(before); validateAcceptances(after);
  const current = new Map(after.map(x=>[x.id,x]));
  return before.filter(row=>!current.has(row.id) || canonical(current.get(row.id))!==canonical(row)).map(row=>problem('HISTORICAL_ACCEPTANCE_REWRITTEN', row.id));
}
export function checkRepository(root, {base, staged=false}={}) {
  const policy = validatePolicy(root);
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY!==policy.repository) throw new Error('REPOSITORY_IDENTITY_MISMATCH');
  if (staged && base) throw new Error('AMBIGUOUS_DIFF_SCOPE');
  if (!staged && !/^[a-f0-9]{40}$/.test(base??'')) throw new Error('EXPLICIT_BASE_REQUIRED');
  if (base) git(root, ['rev-parse','--verify',base+'^{commit}']);
  const names=git(root, staged?['diff','--cached','--name-only','-z']:['diff','--name-only','-z',base,'HEAD']).split('\0').filter(Boolean);
  const errors=[];
  const contentAt=path=>{
    try {return git(root, ['show', staged?':'+path:'HEAD:'+path]);}
    catch {return null;} // A deletion has no new bytes; policy/tests still have to exist.
  };
  for (const path of names) {
    const content=contentAt(path);
    if (content===null) continue;
    errors.push(...inspectPath(path));
    if (!content.includes('\0')) errors.push(...inspectText(path,content));
  }
  const acceptancePath='maintenance/accepted-scopes.json';
  const current=JSON.parse(contentAt(acceptancePath) ?? readFileSync(localFile(root,acceptancePath),'utf8'));
  validateAcceptances(current);
  const oldRef=staged?'HEAD':base;
  if (git(root,['ls-tree','--name-only',oldRef,'--',acceptancePath]).trim()) {
    const previous=JSON.parse(git(root,['show',oldRef+':'+acceptancePath]));
    errors.push(...preserveHistory(previous,current));
  }
  return {status:errors.length?'FAIL':'PASS',repository:policy.repository,scope:staged?'staged':{base,head:git(root,['rev-parse','HEAD']).trim()},changed_files:names.length,checks:['control_mapping','regression_paths','changed_text_credentials','generated_residue','acceptance_history'],errors,limits:['Pattern scan is not a complete secret detector or binary archive inspection.','Policy validity does not prove application tests passed.','Historical acceptance is not current liveness.','Guidance-only controls require human and runtime verification.']};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);
    if (!(args.length===1&&args[0]==='--staged') && !(args.length===2&&args[0]==='--base')) throw new Error('USAGE: --staged OR --base COMMIT_SHA');
    const report=checkRepository(process.cwd(),{staged:args[0]==='--staged',base:args[0]==='--base'?args[1]:undefined});
    console.log(JSON.stringify(report,null,2)); process.exitCode=report.errors.length?1:0;
  } catch (error) {console.log(JSON.stringify({status:'FAIL',code:error.message?.match(/^[A-Z_]+$/)?.[0]??'MAINTENANCE_CHECK_FAILED'}));process.exitCode=1;}
}
