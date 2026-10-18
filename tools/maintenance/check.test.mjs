import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectText,inspectPath,preserveHistory,validateAcceptances,checkRepository} from './check.mjs';
import {installHooks} from './install-hook.mjs';

const accepted=()=>({id:'existing',feature:'fixture-owned report reopening',environment:'production',status:'PASS',recorded_on:'2026-10-07',evidence_level:'reported',release_identity:null,evidence_ref:'historical scoped receipt; exact release not bound'});
test('detects credential classes without returning any matched value',()=>{
  const key='sk-'+'a'.repeat(40);
  const result=inspectText('source.js',key);
  assert.equal(result[0].code,'PROVIDER_KEY_MATERIAL');
  assert.ok(!JSON.stringify(result).includes(key));
  for(const text of ['-----BEGIN '+'PRIVATE KEY-----','ghp_'+'b'.repeat(30),'GOCSPX-'+'c'.repeat(25)])assert.equal(inspectText('source.js',text).length,1);
});
test('public configuration and masked placeholders are not credential failures',()=>{
  assert.deepEqual(inspectText('config.js','AIza'+'x'.repeat(35)),[]);
  assert.deepEqual(inspectText('example.txt','OPENAI_API_KEY=REDACTED; process.env.GOOGLE_CLIENT_SECRET'),[]);
});
test('rejects private env and generated residue while allowing safe templates',()=>{
  for(const p of ['.env','a/.env.production','node_modules/x.js','.pytest_cache/file','a/__pycache__/x.pyc','../escape','a/../escape','/absolute','a\\file'])assert.equal(inspectPath(p).length,1,p);
  for(const p of ['.env.example','a/.env.sample','backend/model-explanation.test.mjs','release.zip'])assert.deepEqual(inspectPath(p),[]);
});
test('accepted history cannot be deleted or silently rewritten',()=>{
  const row=accepted();
  assert.equal(preserveHistory([row],[])[0].code,'HISTORICAL_ACCEPTANCE_REWRITTEN');
  assert.equal(preserveHistory([row],[{...row,status:'SUPERSEDED'}]).length,1);
});
test('new correction preserves the historical record and its evidence grade',()=>{
  const row=accepted(), correction={...row,id:'correction',status:'CORRECTION',supersedes:row.id,reason:'new contradictory evidence',evidence_ref:'new receipt'};
  assert.deepEqual(preserveHistory([row],[row,correction]),[]);
  assert.equal(row.evidence_level,'reported'); assert.equal(row.release_identity,null);
});
test('unknown date, duplicate ID and unsupported evidence cannot become acceptance',()=>{
  const row=accepted();
  for(const rows of [[row,row],[{...row,recorded_on:'2026-02-30'}],[{...row,evidence_level:'test_count_only'}],[{...row,supersedes:'absent',reason:'x'}]])assert.throws(()=>validateAcceptances(rows));
});

function fixture(fn) {
  const root=mkdtempSync(join(tmpdir(),'entrus-maintenance-'));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  const write=(path,content)=>{const p=join(root,path);mkdirSync(resolve(p,'..'),{recursive:true});writeFileSync(p,content);};
  try{
    git(['init','-q']);git(['config','user.name','Maintenance fixture']);git(['config','user.email','fixture@example.invalid']);
    write('sample.test.mjs','');
    const controls=Array.from({length:19},(_,i)=>({id:'P'+String(i+1).padStart(2,'0'),mode:'guidance_only',suite_ids:[],limit:'fixture guidance only'}));
    write('maintenance/policy.json',JSON.stringify({schema:'entrus.maintenance.v1',repository:process.env.GITHUB_REPOSITORY??'fixture/project',controls,suites:[{id:'sample',runner:'node',cwd:'.',files:['sample.test.mjs']}]}));
    write('maintenance/accepted-scopes.json',JSON.stringify([accepted()]));
    git(['add','.']);git(['commit','-qm','fixture baseline']);
    const base=git(['rev-parse','HEAD']).trim();
    fn({root,git,write,base});
  }finally{rmSync(root,{recursive:true,force:true});}
}
test('a real staged credential causes a nonzero CLI result without exposing it',()=>fixture(({root,git,write})=>{
  const key='sk-'+'q'.repeat(40);write('new.js',key);git(['add','new.js']);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./check.mjs',import.meta.url)),'--staged'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stdout,/PROVIDER_KEY_MATERIAL/);assert.ok(!result.stdout.includes(key));
}));
test('CI rejects a repository identity mismatch instead of trusting the policy label',()=>fixture(({root,base})=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./check.mjs',import.meta.url)),'--base',base],{cwd:root,encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'different/repository'}});
  assert.equal(result.status,1);assert.match(result.stdout,/REPOSITORY_IDENTITY_MISMATCH/);
}));
test('a changed receipt fails but an unchanged scoped pass and safe code pass',()=>fixture(({root,git,write,base})=>{
  write('safe.js','export const changed = true;');git(['add','.']);git(['commit','-qm','safe change']);
  assert.equal(checkRepository(root,{base}).status,'PASS');
  write('maintenance/accepted-scopes.json','[]');git(['add','.']);
  assert.equal(checkRepository(root,{staged:true}).errors[0].code,'HISTORICAL_ACCEPTANCE_REWRITTEN');
}));
test('missing regression path and ambiguous or absent diff scope fail closed',()=>fixture(({root,write,base})=>{
  assert.throws(()=>checkRepository(root,{}),/EXPLICIT_BASE_REQUIRED/);
  assert.throws(()=>checkRepository(root,{base,staged:true}),/AMBIGUOUS_DIFF_SCOPE/);
  const policy=JSON.parse(readFileSync(join(root,'maintenance/policy.json'),'utf8'));
  policy.suites[0].files=['absent.test.mjs'];
  write('maintenance/policy.json',JSON.stringify(policy));
  assert.throws(()=>checkRepository(root,{base}),/ENOENT/);
  policy.controls=[];
  write('maintenance/policy.json',JSON.stringify(policy));
  assert.throws(()=>checkRepository(root,{base}),/CONTROL_MAP_INCOMPLETE/);
}));
test('hook installation preserves existing configured hooks and default hooks',()=>fixture(({root,git,write})=>{
  write('.githooks/pre-commit','#!/bin/sh\nexit 0\n');
  git(['config','--local','core.hooksPath','existing-hooks']);
  assert.throws(()=>installHooks(root),/EXISTING_HOOKS_PATH/);
  assert.equal(git(['config','--local','--get','core.hooksPath']).trim(),'existing-hooks');
  git(['config','--local','--unset','core.hooksPath']);
  write('.git/hooks/pre-commit','#!/bin/sh\nexit 0\n');
  assert.throws(()=>installHooks(root),/EXISTING_PRE_COMMIT/);
}));
test('fresh repository hook installation is local and repeatable',()=>fixture(({root,git,write})=>{
  write('.githooks/pre-commit','#!/bin/sh\nexit 0\n');
  assert.equal(installHooks(root).status,'installed');
  assert.equal(git(['config','--local','--get','core.hooksPath']).trim(),'.githooks');
  assert.equal(installHooks(root).status,'already_installed');
}));
