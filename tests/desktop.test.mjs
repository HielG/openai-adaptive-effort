import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {createBridge} from '../desktop/bridge.mjs';
import {runTurn} from '../src/runner.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=path.join(root,'tests/fixtures/fake-codex.mjs');
const bridgeFile=path.join(root,'desktop/bridge.mjs');
const catalog=['terra','sol','astra'].map(family=>({model:`catalog-${family}`,defaultReasoningEffort:'medium',supportedReasoningEfforts:['low','medium','high'].map(reasoningEffort=>({reasoningEffort}))}));
const thread='12345678-1234-1234-1234-123456789abc';
async function area(t){const parent=path.join(root,'evidence/local-smoke/test-temp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(path.join(parent,'desktop space '));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
function setup(emit,execute){return createBridge({emit,resolve:async()=>({command:'unused',args:[]}),discover:async()=>catalog,run:opts=>runTurn(opts,{discover:async()=>catalog,execute:execute??(async(exe,o)=>{await o.onEvent({type:'thread.started',thread_id:thread});o.stdout.write('Hello 世界 <script>literal</script>\n');await o.onEvent({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:0,output_tokens:5}});return {code:0};})})});}
test('bridge lists all families and streams Unicode with exact effort, resume, frozen selections and reset',async t=>{
  const workspace=await area(t),events=[];const bridge=setup(e=>events.push(e));
  await bridge.handle({id:1,method:'models'});assert.deepEqual(events.at(-1).models.map(m=>m.family),['terra','sol','astra']);
  const options={workspace,model:'catalog-astra',baseline:'medium'};
  await bridge.handle({id:2,method:'send',params:{...options,prompt:'Hello 世界',manual:'high'}});
  assert.equal(events.find(e=>e.type==='status').effort,'high');assert.match(events.find(e=>e.type==='text').text,/世界 <script>/);
  const first=events.at(-1);assert.equal(first.outcome,'completed');assert.equal(first.decision.model,'catalog-astra');
  await bridge.handle({id:3,method:'send',params:{...options,prompt:'fix a typo'}});assert.equal(events.at(-1).decision.effort,'medium');assert.equal(events.at(-1).stateFile,first.stateFile);
  await bridge.handle({id:4,method:'send',params:{...options,model:'catalog-terra',prompt:'hello'}});assert.match(events.at(-1).message,/new chat/);
  await bridge.handle({id:5,method:'new'});assert.equal(events.at(-1).newChat,true);
  await bridge.handle({id:6,method:'send',params:{...options,model:'catalog-terra',prompt:'hello'}});assert.notEqual(events.at(-1).stateFile,first.stateFile);
  bridge.close();
});
test('duplicate sends/refresh/new refuse while busy; cancel is uncertain and never replayed',async t=>{
  const workspace=await area(t),events=[];let started,release;const ready=new Promise(r=>started=r);
  let calls=0;
  const bridge=setup(e=>events.push(e),async(exe,o)=>{calls++;await o.onEvent({type:'thread.started',thread_id:thread});started();await new Promise(r=>{release=r;o.signal.addEventListener('abort',r,{once:true});});return {code:0,cancelled:true};});
  await bridge.handle({id:1,method:'models'});
  const params={workspace,model:'catalog-sol',baseline:'medium',prompt:'synthetic'};
  const turn=bridge.handle({id:2,method:'send',params});await ready;
  for(const method of ['send','models','new']){await bridge.handle({id:3,method,params:method==='send'?params:{}});assert.match(events.at(-1).message,/already running/);}
  await bridge.handle({id:4,method:'cancel'});await turn;
  assert.equal(events.at(-1).outcome,'uncertain');assert.equal(calls,1);
  await bridge.handle({id:5,method:'send',params});assert.equal(calls,1);assert.equal(events.at(-1).uncertain,true);assert.match(events.at(-1).message,/uncertain/);bridge.close();
});
test('closing cancels model discovery without dispatching a turn',async()=>{
  let signal,entered;const ready=new Promise(r=>entered=r),events=[];
  const bridge=createBridge({emit:e=>events.push(e),resolve:async()=>({}),discover:async(exe,o)=>{signal=o.signal;entered();await new Promise(r=>signal.addEventListener('abort',r,{once:true}));throw new Error('cancelled');},run:()=>assert.fail('inference')});
  const loading=bridge.handle({id:1,method:'models'});await ready;bridge.close();await loading;assert.equal(signal.aborted,true);assert.equal(bridge.busy,false);assert.deepEqual(events,[]);
});
test('invalid models, effort, prompt and commands cannot execute',async t=>{
  const workspace=await area(t),events=[];let executions=0;const bridge=setup(e=>events.push(e),()=>{executions++;});
  await bridge.handle({id:1,method:'models'});
  const base={workspace,model:'catalog-sol',baseline:'medium',prompt:'hello'};
  for(const patch of [{model:'not-present-astra'},{manual:'ultra'},{baseline:'ultra'},{prompt:''}]){await bridge.handle({id:2,method:'send',params:{...base,...patch}});assert.equal(events.at(-1).type,'error');}
  await bridge.handle({id:3,method:'exec',params:{command:'not allowed'}});assert.equal(events.at(-1).type,'error');assert.equal(executions,0);bridge.close();
});
async function childBridge(t,mode=''){
  const child=spawn(process.execPath,[bridgeFile,fixture],{cwd:root,env:{...process.env,FAKE_MODE:mode},stdio:['pipe','pipe','pipe'],windowsHide:true});
  const events=[],waiters=[];const lines=createInterface({input:child.stdout});let diagnostics='';child.stderr.on('data',b=>diagnostics+=b);
  lines.on('line',line=>{const event=JSON.parse(line);events.push(event);for(const entry of [...waiters])if(entry.matches(event)){waiters.splice(waiters.indexOf(entry),1);clearTimeout(entry.timer);entry.resolve(event);}});
  const wait=matches=>{const existing=events.find(matches);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const entry={matches,resolve,timer:setTimeout(()=>reject(new Error('bridge wait timed out: '+diagnostics)),6000)};waiters.push(entry);});};
  const exited=new Promise(resolve=>child.on('exit',code=>resolve(code)));
  t.after(()=>{for(const e of waiters)clearTimeout(e.timer);lines.close();if(child.exitCode===null)child.kill();});
  return {child,events,wait,exited,send:command=>child.stdin.write(JSON.stringify(command)+'\n')};
}
test('real JSONL subprocess discovers catalog and runs Unicode in a workspace with spaces',async t=>{
  const workspace=await area(t),api=await childBridge(t,'desktop');
  api.send({id:1,method:'models'});const listed=await api.wait(e=>e.id===1);assert.equal(listed.models.length,3);
  api.send({id:2,method:'send',params:{workspace,model:'gpt-6-astra',baseline:'medium',prompt:'Hello 世界'}});
  const result=await api.wait(e=>e.id===2&&e.type==='result');assert.equal(result.outcome,'completed');assert.ok(api.events.some(e=>e.type==='text'&&e.text.includes('世界')));api.child.stdin.end();assert.equal(await api.exited,0);
});
test('EOF aborts an active real subprocess and preserves uncertain state',async t=>{
  const workspace=await area(t),api=await childBridge(t,'exec-hang');
  api.send({id:1,method:'models'});await api.wait(e=>e.id===1);
  api.send({id:2,method:'send',params:{workspace,model:'chosen-model',baseline:'medium',prompt:'synthetic'}});
  await api.wait(e=>e.type==='status'&&e.status==='running');api.child.stdin.end();assert.equal(await api.exited,0);
  const {readdir}=await import('node:fs/promises');const dir=path.join(workspace,'.adaptive-effort/desktop');const files=(await readdir(dir)).filter(n=>n.endsWith('.json'));assert.equal(files.length,1);
  const state=JSON.parse(await readFile(path.join(dir,files[0]),'utf8'));assert.equal(state.status,'uncertain');assert.equal(state.turns.length,1);
});
test('oversized or malformed JSON lines fail boundedly without inference',async t=>{
  const api=await childBridge(t);api.child.stdin.write('{bad json\n');assert.match((await api.wait(e=>e.id===0)).message,/Invalid JSON/);
  api.child.stdin.write('x'.repeat(2*1024*1024+1));api.child.stdin.end();assert.equal(await api.exited,0);assert.ok(api.events.some(e=>e.message?.includes('2 MiB')));
});

test('native Windows job ownership kills descendants with a live or already-exited launcher',{skip:process.platform!=='win32'},async t=>{
  const directory=await area(t),output=path.join(directory,'job smoke.exe');
  const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const compiled=spawnSync(compiler,['/nologo','/noconfig','/target:exe','/main:JobSmoke',`/out:${output}`,'/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',path.join(root,'desktop/App.cs'),path.join(root,'tests/fixtures/desktop-job-smoke.cs')],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  for(const mode of ['live','orphan']){
    const result=spawnSync(output,[process.execPath,path.join(root,'tests/fixtures/job-child.mjs'),mode],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.equal(result.status,0,result.stdout+result.stderr);assert.deepEqual(JSON.parse(result.stdout),{mode,launcherExited:true,descendantExited:true});
  }
});

test('catalog executable selection is startup-only, atomic and frozen after send',async t=>{
  const workspace=await area(t),events=[];let version=0;
  const bridge=createBridge({emit:e=>events.push(e),codex:'trusted-startup',resolve:async value=>{assert.equal(value,'trusted-startup');return {command:'safe-'+(++version),args:[]};},discover:async exe=>{if(exe.command==='safe-2')throw new Error('refresh failed');return catalog;},run:async options=>{assert.equal(options.executable.command,'safe-1');throw new Error('fixture pre-dispatch rejection');}});
  await bridge.handle({id:1,method:'models'});assert.equal(events.at(-1).type,'result');
  await bridge.handle({id:2,method:'models',params:{codex:'untrusted.exe'}});assert.match(events.at(-1).message,/Unknown command parameter/);assert.equal(version,1);
  await bridge.handle({id:3,method:'models'});assert.match(events.at(-1).message,/refresh failed/);
  await bridge.handle({id:4,method:'send',params:{workspace,model:'catalog-sol',baseline:'medium',prompt:'synthetic'}});assert.match(events.at(-1).message,/pre-dispatch/);
  await bridge.handle({id:5,method:'models'});assert.match(events.at(-1).message,/new chat/);
  for(const params of [null,[],{unknown:1}]){await bridge.handle({id:6,method:'models',params});assert.equal(events.at(-1).type,'error');}
  bridge.close();
});
