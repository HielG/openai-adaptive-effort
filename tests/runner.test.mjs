import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm,symlink,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTurn,planTurn } from '../src/runner.mjs';
import { readState,statePath,atomicWrite,lockState,recoverState } from '../src/state.mjs';
import { execArgs } from '../src/process.mjs';
const id='12345678-1234-1234-1234-123456789abc';
const catalog=[{model:'chosen-model',supportedReasoningEfforts:['low','medium','high','max'].map(reasoningEffort=>({reasoningEffort}))}];
const discover=async()=>catalog;
const sink={write(){}};
const opts=workspace=>({workspace,model:'chosen-model',baseline:'medium',prompt:'review this',executable:{command:'unused',args:[]},stdout:sink,stderr:sink});
const emit=async(options,usage={input_tokens:100,cached_input_tokens:50,output_tokens:10})=>{await options.onEvent({type:'thread.started',thread_id:id});await options.onEvent({type:'turn.completed',usage});return {code:0,signal:null,timedOut:false,startError:null,protocolError:null};};
async function temp(t){const root=fileURLToPath(new URL('../evidence/local-smoke/test-temp/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(path.join(root,'adaptive-effort-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('new/resume/continuation/manual/baseline behavior preserves one thread and literal input',async t=>{
  const workspace=await temp(t),seen=[];
  const execute=async(exe,o)=>{seen.push(o);return emit(o);};
  const a=await runTurn(opts(workspace),{discover,execute});assert.equal(a.decision.effort,'max');
  const b=await runTurn({...opts(workspace),prompt:'yes'},{discover,execute});assert.equal(b.decision.effort,'max');
  const c=await runTurn({...opts(workspace),prompt:'fix the bug'},{discover,execute});assert.equal(c.decision.effort,'medium');
  const d=await runTurn({...opts(workspace),prompt:'review this',manual:'low'},{discover,execute});assert.equal(d.decision.effort,'low');
  assert.equal(seen[0].args[1],'--json');assert.deepEqual(seen[1].args.slice(0,2),['exec','resume']);assert.equal(seen[1].args.at(-2),id);
  for(const request of seen){assert.ok(request.args.includes('sandbox_mode="read-only"'));assert.ok(request.args.includes('approval_policy="never"'));assert.ok(!request.args.some(a=>a.includes('bypass')));}
  const state=await readState(d.stateFile);assert.equal(state.baseline,'medium');assert.equal(state.threadId,id);assert.equal(state.turns.length,4);
  assert.ok(!(await readFile(d.stateFile,'utf8')).includes('review this'));
});
test('unknown model, unsupported baseline/manual and a catalog error prevent execution',async t=>{
  const workspace=await temp(t);let calls=0;const execute=async()=>{calls++;};
  for(const patch of [{model:'missing'},{baseline:'ultra'},{manual:'ultra'}])await assert.rejects(runTurn({...opts(workspace),...patch},{discover,execute}));
  await assert.rejects(runTurn(opts(workspace),{discover:async()=>{throw new Error('catalog failed');},execute}));assert.equal(calls,0);
});
test('catalog defaults do not silently choose a model or baseline',async()=>{
  await assert.rejects(planTurn({prompt:'hi',model:'chosen-model',executable:{},discover}));
  await assert.rejects(planTurn({prompt:'hi',baseline:'medium',executable:{},discover}));
});
test('dry-run produces no state file or inference',async t=>{
  const workspace=await temp(t);
  const result=await runTurn({...opts(workspace),dryRun:true},{discover,execute:()=>assert.fail('inference')});
  assert.equal(result.decision.effort,'max');assert.equal(await readState(result.stateFile),null);
});
test('model, baseline and workspace are frozen across resume',async t=>{
  const workspace=await temp(t);const a=await runTurn(opts(workspace),{discover,execute:async(exe,o)=>emit(o)});
  await assert.rejects(runTurn({...opts(workspace),model:'another'},{discover}));await assert.rejects(runTurn({...opts(workspace),baseline:'high'},{discover}));
  const state=await readState(a.stateFile);state.workspace=workspace+'different';await atomicWrite(a.stateFile,state);
  await assert.rejects(runTurn(opts(workspace),{discover}),/another workspace/);
});
for(const fault of ['missing-terminal','failed','timeout','nonzero','wrong-id','conflicting-terminal','malformed-protocol'])test(`uncertain ${fault} blocks blind replay`,async t=>{
  const workspace=await temp(t);
  const execute=async(exe,o)=>{
    await o.onEvent({type:'thread.started',thread_id:fault==='wrong-id'?'not-a-thread':id});
    if(fault!=='missing-terminal')await o.onEvent({type:'turn.completed',usage:{input_tokens:100,output_tokens:10}});
    if(fault==='failed')await o.onEvent({type:'turn.failed'});
    if(fault==='conflicting-terminal')await o.onEvent({type:'turn.completed',usage:{input_tokens:101,output_tokens:10}});
    return {code:fault==='nonzero'?1:0,signal:null,timedOut:fault==='timeout',protocolError:fault==='malformed-protocol'?'bad':null};
  };
  const result=await runTurn(opts(workspace),{discover,execute});assert.equal(result.outcome,'uncertain');
  await assert.rejects(runTurn(opts(workspace),{discover,execute}),/uncertain/);
  assert.equal((await readState(result.stateFile)).turns.length,1);
});
test('duplicate identical terminal events are counted once; missing usage stays null',async t=>{
  const workspace=await temp(t);
  const execute=async(exe,o)=>{await o.onEvent({type:'thread.started',thread_id:id});await o.onEvent({type:'turn.completed'});await o.onEvent({type:'turn.completed'});return {code:0};};
  const result=await runTurn(opts(workspace),{discover,execute});assert.equal(result.outcome,'completed');assert.equal(result.usage,null);assert.equal((await readState(result.stateFile)).turns.length,1);
});
test('synchronous throws and rejected execution preserve uncertainty and captured thread',async t=>{
  const workspace=await temp(t);
  await assert.rejects(runTurn(opts(workspace),{discover,execute:async(exe,o)=>{await o.onEvent({type:'thread.started',thread_id:id});throw new Error('failure');}}));
  const state=await readState(await statePath(workspace));assert.equal(state.threadId,id);assert.equal(state.status,'uncertain');assert.equal(state.turns.length,1);
});
test('concurrent sessions with same state are refused before executing twice',async t=>{
  const workspace=await temp(t);let unblock,started;
  const ready=new Promise(r=>started=r),blocked=new Promise(r=>unblock=r);
  const a=runTurn(opts(workspace),{discover,execute:async(exe,o)=>{started();await blocked;return emit(o);}});
  await ready;await assert.rejects(runTurn(opts(workspace),{discover}),/locked/);unblock();assert.equal((await a).outcome,'completed');
});
test('invalid state is not silently reset',async t=>{
  const workspace=await temp(t),file=await statePath(workspace);await writeFile(file,'{"broken":');
  await assert.rejects(runTurn(opts(workspace),{discover}));assert.equal(await readFile(file,'utf8'),'{"broken":');
});
test('state path traversal is rejected',async t=>{
  const workspace=await temp(t);await assert.rejects(statePath(workspace,'../escape.json'));
});
test('symlink parent escape is rejected when OS link privileges are available',async t=>{
  const workspace=await temp(t);
  const other=await temp(t);
  try{await symlink(other,path.join(workspace,'linked'),'junction');}catch(e){if(['EPERM','ENOTSUP'].includes(e.code)){t.skip('OS does not permit link creation');return;}throw e;}
  await assert.rejects(statePath(workspace,'linked/state.json'),/outside/);
});
test('explicit recovery does not retry and refuses a live owner',async t=>{
  const workspace=await temp(t);const result=await runTurn(opts(workspace),{discover,execute:async(exe,o)=>{await o.onEvent({type:'thread.started',thread_id:id});return {code:1};}});
  await assert.rejects(recoverState(result.stateFile));await assert.rejects(recoverState(result.stateFile,{acknowledge:true}),/still running/);
  const state=await readState(result.stateFile);delete state.ownerPid;await atomicWrite(result.stateFile,state);
  const recovered=await recoverState(result.stateFile,{acknowledge:true});assert.equal(recovered.status,'idle');assert.equal(recovered.turns.length,1);
});
test('recovery without a captured ID refuses',async t=>{
  const workspace=await temp(t);const result=await runTurn(opts(workspace),{discover,execute:async()=>({code:1})});
  const state=await readState(result.stateFile);delete state.ownerPid;await atomicWrite(result.stateFile,state);
  await assert.rejects(recoverState(result.stateFile,{acknowledge:true}),/No thread ID/);
});
test('execution args force safe settings identically for new/resumed turns',()=>{
  for(const threadId of [null,id]){const args=execArgs({model:'literal-model',effort:'high',threadId});assert.ok(args.includes('sandbox_mode="read-only"'));assert.ok(args.includes('approval_policy="never"'));assert.equal(args.at(-1),'-');}
});
test('resumed accounting uses cumulative differences and unknown boundaries recover conservatively',async t=>{
  const workspace=await temp(t);let count=0;
  const execute=async(exe,o)=>emit(o,{input_tokens:++count*100,cached_input_tokens:count*25,output_tokens:count*10});
  const a=await runTurn(opts(workspace),{discover,execute});
  const b=await runTurn(opts(workspace),{discover,execute});
  assert.deepEqual(a.usage,b.usage);assert.equal(b.usage.input_tokens,100);
  const state=await readState(b.stateFile);delete state.cumulativeUsage;await atomicWrite(b.stateFile,state);
  const c=await runTurn(opts(workspace),{discover,execute});assert.equal(c.usage.input_tokens,null);
  const d=await runTurn(opts(workspace),{discover,execute});assert.equal(d.usage.input_tokens,100);
});
test('hard-crash recovery retains pending history and invalidates the usage boundary',async t=>{
  const workspace=await temp(t);const a=await runTurn(opts(workspace),{discover,execute:async(exe,o)=>emit(o)});
  const state=await readState(a.stateFile);state.status='running';delete state.ownerPid;state.pendingAttempt={attemptId:'interrupted',effort:'high',outcome:'uncertain',usage:null};await atomicWrite(a.stateFile,state);
  const recovered=await recoverState(a.stateFile,{acknowledge:true});assert.equal(recovered.turns.length,2);assert.equal(recovered.turns[1].attemptId,'interrupted');assert.equal(recovered.cumulativeUsage,null);assert.equal(recovered.pendingAttempt,undefined);
});
test('concurrent recovery cannot both remove a stale session lock',async t=>{
  const workspace=await temp(t);const a=await runTurn(opts(workspace),{discover,execute:async(exe,o)=>emit(o)});
  const state=await readState(a.stateFile);state.status='uncertain';delete state.ownerPid;await atomicWrite(a.stateFile,state);
  await writeFile(a.stateFile+'.lock',JSON.stringify({pid:2147483647}));
  const results=await Promise.allSettled([recoverState(a.stateFile,{acknowledge:true}),recoverState(a.stateFile,{acknowledge:true})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await readState(a.stateFile)).status,'idle');
});
