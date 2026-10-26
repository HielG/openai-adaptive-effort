import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, cp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { resolveCodex } from '../src/process.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(path.join(root,'evidence/local-smoke'),{recursive:true});
const area=await mkdtemp(path.join(root,'evidence/local-smoke/plugin-'));
const home=path.join(area,'home'),market=path.join(area,'marketplace'),plugin=path.join(market,'plugins/openai-adaptive-effort');
await mkdir(home);await mkdir(plugin,{recursive:true});await mkdir(path.join(market,'.agents/plugins'),{recursive:true});
for(const name of ['plugin.json','.codex-plugin','package.json','LICENSE','README.md','bin','src','hooks','skills'])await cp(path.join(root,name),path.join(plugin,name),{recursive:true});
const catalog=JSON.parse(await readFile(path.join(root,'.agents/plugins/marketplace.json'),'utf8'));
catalog.plugins[0].source.path='./plugins/openai-adaptive-effort';
await writeFile(path.join(market,'.agents/plugins/marketplace.json'),JSON.stringify(catalog,null,2));
const env={...process.env,CODEX_HOME:home};delete env.OPENAI_API_KEY;
const executable=await resolveCodex(process.argv[2]);
const results=[];
try{
  for(const args of [['plugin','marketplace','add',market,'--json'],['plugin','list','--available','--json']]){
    let stdout='',stderr='';
    const child=spawn(executable.command,[...executable.args,...args],{env,cwd:market,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>child.kill(),15000);
    child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
    results.push({args,stdout,stderr,exit});assert.equal(exit.code,0,stderr);
  }
  assert.ok(results[1].stdout.includes('openai-adaptive-effort'),'CLI discovers the local plugin');
  console.log('Real Codex marketplace discovery passed (isolated home; plugin not installed/trusted).');
}catch(error){results.push({failure:error.message});console.error(error.message);process.exitCode=1;}
finally{await writeFile(path.join(root,'evidence',`verify-${path.basename(area)}.json`),JSON.stringify({home,market,results},null,2));}
