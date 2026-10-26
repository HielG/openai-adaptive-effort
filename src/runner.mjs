import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { route, capabilities, parseUsage, usageDelta } from './policy.mjs';
import { discoverModels, executeTurn, execArgs } from './process.mjs';
import { statePath, lockState, readState, atomicWrite, validThread } from './state.mjs';

export async function planTurn({prompt,model,baseline,manual,previous,policy,executable,env,discover=discoverModels}) {
  if(typeof model!=='string'||!model||model.startsWith('-'))throw new Error('Choose an explicit --model from the Codex catalog');
  const catalog=await discover(executable,{env});
  const matches=catalog.filter(m=>m.model===model);
  if(matches.length!==1)throw new Error('The chosen model is not uniquely present in the catalog; no substitute model will be selected');
  const supported=capabilities(matches[0]);
  if(!baseline)throw new Error('Choose an explicit --baseline for this runner session');
  return {model,supported,...route(prompt,{supported,baseline,previous,manual,policy})};
}

export async function runTurn(options,dependencies={}) {
  const {prompt,executable,env=process.env,stdout=process.stdout,stderr=process.stderr,timeoutMs=300000,policy}=options;
  const workspace=await realpath(options.workspace??process.cwd());
  const file=await statePath(workspace,options.state);
  const release=await lockState(file);
  let state,attempt;
  try{
    state=await readState(file);
    if(state?.status!=='idle'&&state)throw new Error('Previous execution is uncertain. Inspect its effects, then use recover; never blindly retry.');
    if(state&&state.workspace!==workspace)throw new Error('State belongs to another workspace');
    if(state&&options.model&&state.model!==options.model)throw new Error('Model is frozen for this session; choose a new state file to use another model');
    if(state&&options.baseline&&state.baseline!==options.baseline)throw new Error('Baseline is frozen for this session; choose a new state file to change it');
    const model=state?.model??options.model,baseline=state?.baseline??options.baseline;
    const decision=await planTurn({prompt,model,baseline,manual:options.manual,previous:state?.previous,policy,executable,env,discover:dependencies.discover});
    if(options.dryRun)return {stateFile:file,decision,args:execArgs({model,effort:decision.effort,threadId:state?.threadId}),dryRun:true};
    state??={version:1,workspace,model,baseline,threadId:null,previous:null,status:'idle',turns:[],createdAt:new Date().toISOString()};
    attempt={attemptId:randomUUID(),at:new Date().toISOString(),effort:decision.effort,baseline,kind:decision.kind,reason:decision.reason,mode:decision.mode,promptChars:prompt.length,usage:null,outcome:'uncertain'};
    state.status='running';state.ownerPid=process.pid;state.pendingAttempt=attempt;
    await atomicWrite(file,state);
    stderr.write(`Adaptive effort: ${decision.effort} (${decision.kind}; baseline ${baseline}; model ${model})\n`);
    let terminal=null,failed=false,invalid=false,started=false,terminalJson=null;
    const expectedThread=state.threadId;
    const onEvent=async event=>{
      if(event.type==='thread.started'){
        const id=event.thread_id;
        if(!validThread(id)||(expectedThread&&id!==expectedThread)||(state.threadId&&state.threadId!==id)){invalid=true;return;}
        started=true;state.threadId=id;await atomicWrite(file,state);
      }
      if(event.type==='turn.completed'){
        const encoded=JSON.stringify(event);
        if(terminal&&terminalJson!==encoded)invalid=true;
        terminal=event;terminalJson=encoded;
      }
      if(event.type==='turn.failed'||event.type==='error')failed=true;
    };
    const execute=dependencies.execute??executeTurn;
    const exit=await execute(executable,{args:execArgs({model,effort:decision.effort,threadId:expectedThread}),prompt,cwd:workspace,env,timeoutMs,onEvent,stdout,stderr});
    attempt.durationMs=Date.now()-Date.parse(attempt.at);
    attempt.exitCode=exit.code;attempt.timedOut=exit.timedOut;
    const success=exit.code===0&&!exit.signal&&!exit.timedOut&&!exit.startError&&!exit.protocolError&&!failed&&!invalid&&started&&terminal;
    const cumulative=success?parseUsage(terminal?.usage):null;
    attempt.usage=success?usageDelta(cumulative,expectedThread?state.cumulativeUsage??null:undefined):null;
    state.cumulativeUsage=cumulative;
    attempt.outcome=success?'completed':'uncertain';
    state.status=success?'idle':'uncertain';
    if(success)state.previous=decision.effort;
    state.turns.push(attempt);delete state.pendingAttempt;
    await atomicWrite(file,state);
    return {stateFile:file,threadId:state.threadId,decision,outcome:attempt.outcome,usage:attempt.usage,exit};
  }catch(error){
    if(state&&attempt&&state.pendingAttempt){
      state.status='uncertain';attempt.failure='Runner interrupted before a verified terminal result';state.turns.push(attempt);delete state.pendingAttempt;
      try{await atomicWrite(file,state);}catch{/* original failure remains authoritative; on-disk running state still blocks retry */}
    }
    throw error;
  }finally{await release();}
}
