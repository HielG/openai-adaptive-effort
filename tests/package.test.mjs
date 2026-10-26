import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const json=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
test('portable and compatibility manifests agree and reference existing local resources',async()=>{
  const manifest=await json('plugin.json'),compat=await json('.codex-plugin/plugin.json'),pkg=await json('package.json'),market=await json('.agents/plugins/marketplace.json');
  for(const other of [compat,pkg]){assert.equal(other.name,manifest.name);assert.equal(other.version,manifest.version);}
  assert.equal(market.plugins[0].name,manifest.name);assert.equal(market.plugins[0].source.path,'./');
  assert.equal(manifest.extensions['com.openai'].hooks,compat.hooks);assert.equal(manifest.extensions['com.openai'].requires_local_executor,true);
  for(const name of [compat.hooks,compat.skills,'skills/adaptive-effort/SKILL.md','LICENSE'])await access(path.join(root,name));
  const hook=await json(compat.hooks);assert.equal(hook.hooks.UserPromptSubmit[0].hooks[0].timeout,3);
  assert.equal((await readFile(path.join(root,'LICENSE'),'utf8')).includes('Copyright (c) 2026 Hiel Gagarin'),true);
});
test('actual hook process returns advisory JSON and fails open without prompt echo',()=>{
  const script=path.join(root,'hooks/advise.mjs');
  const invoke=input=>spawnSync(process.execPath,[script],{input,encoding:'utf8',timeout:2000,windowsHide:true,shell:false});
  const result=invoke(JSON.stringify({hook_event_name:'UserPromptSubmit',prompt:'review PRIVATE-SYNTHETIC'}));
  assert.equal(result.status,0);assert.ok(JSON.parse(result.stdout).systemMessage.includes('unchanged'));assert.ok(!result.stdout.includes('PRIVATE-SYNTHETIC'));
  for(const input of ['{bad json',JSON.stringify({hook_event_name:'Stop',prompt:'review'}),'x'.repeat(1024*1024+1)]){const result=invoke(input);assert.equal(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');}
});
test('CLI rejects oversized byte input before classification',()=>{
  const result=spawnSync(process.execPath,[path.join(root,'bin/adaptive-effort.mjs'),'classify'],{input:'界'.repeat(400000),encoding:'utf8',timeout:3000,windowsHide:true,shell:false});
  assert.equal(result.status,1);assert.match(result.stderr,/exceeds 1 MiB/);assert.equal(result.stdout,'');
});
