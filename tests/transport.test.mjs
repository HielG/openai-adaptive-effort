import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { discoverModels,executeTurn,execArgs,resolveCodex } from '../src/process.mjs';
import { advise } from '../hooks/advise.mjs';
import { parseArgs } from '../bin/adaptive-effort.mjs';
const fixture=fileURLToPath(new URL('./fixtures/fake-codex.mjs',import.meta.url));
const executable={command:process.execPath,args:[fixture]},sink={write(){}};
test('real subprocess protocol discovers and paginates model capabilities',async()=>{
  const models=await discoverModels(executable,{env:{...process.env,FAKE_MODE:'paginate'}});assert.deepEqual(models.map(m=>m.model),['chosen-model','second-model']);
});
for(const mode of ['error','exit','bad-json','repeat-cursor','hang'])test(`catalog ${mode} fails boundedly`,async()=>{
  await assert.rejects(discoverModels(executable,{env:{...process.env,FAKE_MODE:mode},timeoutMs:300}));
});
test('spawn errors reject without a hang',async()=>assert.rejects(discoverModels({command:path.join(os.tmpdir(),'not-existing-codex.exe'),args:[]},{timeoutMs:300})));
test('literal multiline Unicode/shell syntax reaches child stdin without evaluation',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'adaptive transport '));t.after(()=>rm(dir,{recursive:true,force:true}));
  const capture=path.join(dir,'capture.json');const prompt='Hello 世界\n$(write-secret) `x`; & | "quotes"\n--dangerously-bypass-approvals-and-sandbox';
  const result=await executeTurn(executable,{args:execArgs({model:'chosen-model',effort:'low'}),prompt,cwd:dir,env:{...process.env,CAPTURE_FILE:capture},stdout:sink,stderr:sink,onEvent:async()=>{}});
  assert.equal(result.code,0);const seen=JSON.parse(await readFile(capture));assert.equal(seen.prompt,prompt);assert.ok(!seen.args.includes(prompt));assert.ok(!seen.args.some(a=>a.includes('bypass')));
});
test('malformed turn output is a protocol error',async()=>{
  const result=await executeTurn(executable,{args:['exec'],prompt:'synthetic',cwd:os.tmpdir(),env:{...process.env,FAKE_MODE:'bad-json'},stdout:sink,stderr:sink});assert.equal(result.protocolError,'Invalid JSONL from Codex');
});
test('hung turn is terminated and marked timed out',async()=>{
  const result=await executeTurn(executable,{args:['exec'],prompt:'synthetic',cwd:os.tmpdir(),env:{...process.env,FAKE_MODE:'hang'},timeoutMs:150,stdout:sink,stderr:sink});assert.equal(result.timedOut,true);
});
test('EOF or timeout bounds waiting for an exited launcher with a descendant',async t=>{
  let pid;const started=Date.now();
  try{
    const result=await executeTurn(executable,{args:['exec'],prompt:'synthetic',cwd:os.tmpdir(),env:{...process.env,FAKE_MODE:'orphan-pipe'},timeoutMs:400,stdout:sink,stderr:sink,onEvent:async e=>{if(e.type==='fixture.child')pid=e.pid;}});
    assert.ok(pid);assert.ok(result.timedOut||result.code===0);assert.ok(Date.now()-started<2000);
    if(!result.timedOut)t.diagnostic('This OS closed the inherited pipe at launcher exit; early EOF was bounded.');
  }finally{if(pid)try{process.kill(pid);}catch(e){if(e.code!=='ESRCH')throw e;}}
});
test('resolver accepts explicit JS paths with spaces, refuses shell scripts',async t=>{
  const resolved=await resolveCodex(fixture);assert.equal(resolved.command,process.execPath);assert.equal(resolved.args[0],fixture);
  const root=fileURLToPath(new URL('../evidence/local-smoke/test-temp/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(path.join(root,'resolver-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const script=path.join(dir,'codex.ps1');await writeFile(script,'# synthetic');await assert.rejects(resolveCodex(script),/shell script/);
});
test('hook emits only bounded advisory status and skips hidden/subagent inputs',()=>{
  const output=advise({hook_event_name:'UserPromptSubmit',prompt:'review SECRET-PROMPT'});assert.ok(output.systemMessage.includes('unchanged'));assert.ok(!JSON.stringify(output).includes('SECRET-PROMPT'));
  assert.equal(advise({hook_event_name:'Stop',prompt:'review'}),null);assert.equal(advise({hook_event_name:'UserPromptSubmit',prompt:'review',agent_id:'child'}),null);assert.equal(advise({hook_event_name:'UserPromptSubmit',prompt:'review',isMeta:true}),null);
});
test('argument parser rejects unknown, duplicate, and injected flags',()=>{
  for(const args of [['run','--yolo'],['run','--model'],['run','--model','one','--model','two'],['run','hello']])assert.throws(()=>parseArgs(args));
  assert.equal(parseArgs(['run','--dry-run','--model','named']).opts.model,'named');
});
