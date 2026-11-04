import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {modelFamily,modelListing,indicatorEnabled,createIndicator} from '../src/display.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=path.join(root,'tests/fixtures/fake-codex.mjs');
const cli=path.join(root,'bin/adaptive-effort.mjs');
const models=[
  {model:'gpt-6.1-terra',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'},{reasoningEffort:'high'}]},
  {model:'gpt-6.1-sol',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'},{reasoningEffort:'high'},{reasoningEffort:'max'}]},
  {model:'gpt-6-astra',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high'},{reasoningEffort:'max'}]}
];

test('family discovery keeps exact IDs, effort ranges, and absent families',()=>{
  for(const [i,family] of ['terra','sol','astra'].entries()){
    assert.equal(modelFamily(models[i].model),family);
    assert.deepEqual(modelListing(models,family).models,[{model:models[i].model,family,default:models[i].defaultReasoningEffort,supported:models[i].supportedReasoningEfforts}]);
  }
  assert.equal(modelFamily('gpt-5.6-luna'),'other');assert.equal(modelFamily('astral'),'other');
  assert.deepEqual(modelListing(models.slice(0,2),'astra').models,[]);
  assert.equal(modelListing(models.slice(0,2)).families.astra,0);
  assert.throws(()=>modelListing(models,'auto'));
});

test('indicator auto respects TTY/dumb terminals; explicit mode validates',()=>{
  assert.equal(indicatorEnabled('auto',{isTTY:true},{}),true);
  assert.equal(indicatorEnabled('auto',{isTTY:false},{}),false);
  assert.equal(indicatorEnabled('auto',{isTTY:true},{TERM:'dumb'}),false);
  assert.equal(indicatorEnabled('off',{isTTY:true},{}),false);
  assert.equal(indicatorEnabled('on',{isTTY:false},{}),true);
  assert.throws(()=>indicatorEnabled('maybe'));
});

test('TTY badge clears before agent output and finishes on its own line',()=>{
  const writes=[];
  const stream={isTTY:true,columns:80,write:s=>writes.push(s)};
  const indicator=createIndicator({stream,enabled:true,env:{NO_COLOR:''}});
  const status={model:'gpt-6-astra',effort:'high'};
  indicator.update({...status,status:'starting'});indicator.update({...status,status:'running'});
  indicator.wrap({write:s=>writes.push(s)}).write('Agent answer\n');
  indicator.update({...status,status:'completed'});indicator.clear();
  assert.deepEqual(writes,['[Astra | HIGH | starting]','\r\x1b[2K','[Astra | HIGH | running]','\r\x1b[2K','Agent answer\n','[Astra | HIGH | completed]','\n']);
});

test('forced non-TTY output contains plain status lines only',()=>{
  let output='';const indicator=createIndicator({stream:{write:s=>output+=s},enabled:true});
  indicator.update({model:'gpt-6.1-sol',effort:'low',status:'running'});
  indicator.update({model:'gpt-6.1-sol',effort:'low',status:'uncertain'});
  assert.equal(output,'[Sol | LOW | running]\n[Sol | LOW | uncertain]\n');
  const off=createIndicator({stream:{write:()=>assert.fail('disabled badge wrote')},enabled:false});off.update({});off.clear();
});

test('badge sanitizes controls, fits narrow terminals, and tolerates a broken display',()=>{
  let output='';const indicator=createIndicator({stream:{isTTY:true,columns:20,write:s=>output+=s},enabled:true,env:{NO_COLOR:''}});
  indicator.update({model:'unknown\x1b\nmodel',effort:'high',status:'running'});
  assert.ok(!output.includes('\x1b'));assert.ok(!output.includes('\n'));assert.ok(output.length<=19);
  let answer='';const broken=createIndicator({stream:{isTTY:true,write(){throw new Error('display failed');}},enabled:true});
  assert.doesNotThrow(()=>{broken.update({model:'gpt-6-astra',effort:'high',status:'running'});broken.wrap({write:s=>answer+=s}).write('answer');});
  assert.equal(answer,'answer');
});

test('actual CLI family filter, compact run, dry-run and uncertain output',async t=>{
  const parent=path.join(root,'evidence/local-smoke/test-temp');await mkdir(parent,{recursive:true});
  const workspace=await mkdtemp(path.join(parent,'indicator-'));t.after(()=>rm(workspace,{recursive:true,force:true}));
  const invoke=(args,mode)=>spawnSync(process.execPath,[cli,...args,'--codex',fixture,'--workspace',workspace],{input:'hello',encoding:'utf8',timeout:6000,windowsHide:true,env:{...process.env,FAKE_MODE:mode||''}});
  const listed=invoke(['models','--family','astra'],'families');
  assert.equal(listed.status,0,listed.stderr);const listing=JSON.parse(listed.stdout);
  assert.deepEqual(listing.models.map(m=>m.model),['gpt-6-astra']);assert.equal(listing.families.terra,1);
  const empty=invoke(['models','--family','astra']);assert.equal(empty.status,0);assert.deepEqual(JSON.parse(empty.stdout).models,[]);
  const base=['run','--model','chosen-model','--baseline','medium','--indicator','on'];
  const success=invoke([...base,'--state','success.json']);assert.equal(success.status,0,success.stderr);
  assert.equal(success.stdout,'Synthetic OK\n');assert.match(success.stderr,/LOW \| starting/);assert.match(success.stderr,/LOW \| completed/);assert.ok(!success.stderr.includes('\x1b'));assert.ok(!success.stderr.includes('stateFile'));
  const dry=invoke([...base,'--dry-run','--state','dry.json']);assert.equal(dry.status,0,dry.stderr);assert.match(dry.stderr,/"dryRun": true/);assert.ok(!dry.stderr.includes('| starting'));
  const failed=invoke([...base,'--state','failed.json'],'exec-bad-json');assert.equal(failed.status,1);assert.match(failed.stderr,/LOW \| uncertain/);assert.ok(!failed.stderr.includes('| completed'));
  const invalid=invoke(['models','--family','auto']);assert.equal(invalid.status,1);assert.match(invalid.stderr,/--family/);
});
