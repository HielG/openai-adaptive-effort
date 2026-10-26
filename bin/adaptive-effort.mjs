#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, resolvePolicy, summarize } from '../src/policy.mjs';
import { resolveCodex, discoverModels } from '../src/process.mjs';
import { runTurn } from '../src/runner.mjs';
import { readState, statePath, recoverState } from '../src/state.mjs';

const help=`Adaptive Effort for OpenAI / Codex

Commands: classify | models | plan | run | report | recover
Options:
  --model NAME          Explicit model for a new runner session
  --baseline LEVEL      Explicit baseline for a new runner session
  --effort LEVEL        Manual override for this turn; baseline stays unchanged
  --workspace DIR       Working directory (default: current directory)
  --state FILE          State inside workspace (default: .adaptive-effort/session.json)
  --prompt-file FILE    Read prompt from a UTF-8 file; otherwise read stdin
  --policy FILE         Explicit JSON classifier configuration
  --codex FILE          Official Codex executable or bin/codex.js
  --timeout-ms N        Turn deadline (default: 300000)
  --dry-run             Plan a run without inference or session-state changes
  --acknowledge-uncertain  Recover captured session without replaying its prompt

This runner applies real per-invocation effort overrides in its own Codex thread.
The desktop plugin hook is advisory; it does not change the active chat's effort.
No global config, model-switch, unsafe sandbox, or hook-trust bypass is performed.
`;
const flags=new Set(['dry-run','acknowledge-uncertain','help']);
const values=new Set(['model','baseline','effort','workspace','state','prompt-file','policy','codex','timeout-ms']);
export function parseArgs(args){
  const command=args[0]??'help';const opts={};
  for(let i=1;i<args.length;i++){
    if(!args[i].startsWith('--'))throw new Error('Unexpected argument; supply prompt through stdin or --prompt-file');
    const key=args[i].slice(2);
    if(Object.hasOwn(opts,key))throw new Error(`Duplicate option: --${key}`);
    if(flags.has(key))opts[key]=true;
    else if(values.has(key)&&args[i+1]&&!args[i+1].startsWith('--'))opts[key]=args[++i];
    else throw new Error(`Unknown option or missing value: --${key}`);
  }
  return {command,opts};
}
async function input(file){
  const chunks=[];let bytes=0;
  for await(const chunk of file?createReadStream(file,{highWaterMark:16384}):process.stdin){
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;
    if(bytes>1024*1024)throw new Error('Prompt exceeds 1 MiB');chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function main(args=process.argv.slice(2)){
  const {command,opts}=parseArgs(args);
  if(['help','--help','-h'].includes(command)||opts.help){process.stdout.write(help);return;}
  if(!['classify','models','plan','run','report','recover'].includes(command))throw new Error('Unknown command; use --help');
  const workspace=path.resolve(opts.workspace??process.cwd());
  if(command==='report'||command==='recover'){
    const file=await statePath(workspace,opts.state);
    const state=command==='recover'?await recoverState(file,{acknowledge:opts['acknowledge-uncertain']}):await readState(file);
    if(!state)throw new Error('No runner session exists at this state path');
    console.log(JSON.stringify({model:state.model,baseline:state.baseline,threadId:state.threadId,status:state.status,...summarize(state.turns)},null,2));return;
  }
  const policy=resolvePolicy(opts.policy?JSON.parse(await readFile(opts.policy,'utf8')):{});
  if(command==='classify'){console.log(JSON.stringify(classify(await input(opts['prompt-file']),policy),null,2));return;}
  const executable=await resolveCodex(opts.codex);
  if(command==='models'){
    const models=await discoverModels(executable);
    console.log(JSON.stringify({note:'Capability catalog, not proof of account entitlement or paid inference.',models:models.map(m=>({model:m.model,default:m.defaultReasoningEffort,supported:m.supportedReasoningEfforts}))},null,2));return;
  }
  const prompt=await input(opts['prompt-file']);
  if(!prompt.trim())throw new Error('A nonempty prompt is required for plan/run');
  const timeoutMs=opts['timeout-ms']===undefined?300000:Number(opts['timeout-ms']);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>86400000)throw new Error('Invalid timeout');
  const common={prompt,model:opts.model,baseline:opts.baseline,manual:opts.effort,workspace,state:opts.state,policy,executable,timeoutMs};
  const result=await runTurn({...common,dryRun:command==='plan'||opts['dry-run']});
  console.error(JSON.stringify(result,null,2));
  if(result.outcome==='uncertain')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(`Adaptive Effort: ${error.message}`);process.exitCode=1;});
}
