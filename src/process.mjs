import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';

// The npm launcher is a parent process: terminate its owned child tree too.
async function stopTree(child) {
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return;
  if(process.platform==='win32'){
    await new Promise(resolve=>{
      const killer=spawn(path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});
      const timer=setTimeout(()=>{killer.kill();child.kill();resolve();},2000);
      const done=()=>{clearTimeout(timer);resolve();};killer.once('error',()=>{child.kill();done();});killer.once('close',code=>{if(code!==0)child.kill();done();});
    });
  }else{
    try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')child.kill('SIGKILL');}
  }
}

export async function resolveCodex(explicit, env = process.env) {
  if (explicit) {
    const file = await realpath(explicit);
    if (/\.m?js$/i.test(file)) return {command:process.execPath,args:[file]};
    if (/\.(cmd|bat|ps1)$/i.test(file)) throw new Error('Use a Codex executable or bin/codex.js, not a shell script');
    return {command:file,args:[]};
  }
  for (const dir of (env.PATH??env.Path??'').split(path.delimiter)) {
    if (!dir) continue;
    for (const name of process.platform==='win32'?['codex.exe','codex.cmd']:['codex']) {
      const candidate=path.join(dir,name);
      try {
        await access(candidate);
        if (name.endsWith('.cmd')) {
          const js=path.join(dir,'node_modules','@openai','codex','bin','codex.js');
          await access(js);
          return {command:process.execPath,args:[js]};
        }
        return {command:candidate,args:[]};
      } catch { /* try the next actual PATH entry */ }
    }
  }
  throw new Error('Codex was not found. Install the official CLI or pass --codex /path/to/codex');
}

export async function discoverModels(executable, {env=process.env,timeoutMs=15000}={}) {
  const child=spawn(executable.command,[...executable.args,'app-server'],{env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  let next=0,closed=false,stderr='';
  const pending=new Map();
  const lines=createInterface({input:child.stdout});
  const rejectAll=error=>{for(const {reject} of pending.values()) reject(error);pending.clear();};
  const timer=setTimeout(()=>{rejectAll(new Error('Model discovery timed out'));void stopTree(child);},timeoutMs);
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4096);});
  child.on('error',e=>rejectAll(new Error(`Codex could not start: ${e.message}`)));
  child.on('close',()=>{closed=true;rejectAll(new Error('Codex model discovery exited before its response'));});
  child.stdin.on('error',e=>rejectAll(new Error(`Model discovery input failed: ${e.message}`)));
  lines.on('line',line=>{
    if(line.length>4*1024*1024){rejectAll(new Error('Model response exceeds limit'));void stopTree(child);return;}
    let msg;try{msg=JSON.parse(line);}catch{rejectAll(new Error('Invalid JSON from model discovery'));void stopTree(child);return;}
    if(msg.method&&msg.id!==undefined){child.stdin.write(JSON.stringify({id:msg.id,error:{code:-32601,message:'Read-only model discovery does not handle server requests'}})+'\n');return;}
    const waiter=pending.get(msg.id);if(!waiter)return;pending.delete(msg.id);
    if(msg.error)waiter.reject(new Error(`Model discovery failed: ${String(msg.error.message??'protocol error')}`));else waiter.resolve(msg.result);
  });
  const request=(method,params)=>new Promise((resolve,reject)=>{
    if(closed)return reject(new Error('Model discovery is closed'));
    const id=++next;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');
  });
  try {
    await request('initialize',{clientInfo:{name:'openai_adaptive_effort',version:'0.1.0'},capabilities:{}});
    child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    const models=[];let cursor;const cursors=new Set();
    for(let page=0;page<20;page++){
      const data=await request('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{} )});
      if(!data||!Array.isArray(data.data))throw new Error('Malformed model/list response');
      models.push(...data.data);
      if(data.nextCursor==null)return models;
      if(typeof data.nextCursor!=='string'||!data.nextCursor||cursors.has(data.nextCursor))throw new Error('Invalid model pagination cursor');
      cursor=data.nextCursor;cursors.add(cursor);
    }
    throw new Error('Model discovery exceeded page limit');
  } catch(error){
    // Do not include stderr: platform diagnostics can contain local paths or secrets.
    throw error;
  } finally {
    clearTimeout(timer);lines.close();child.stdin.end();if(!closed)await stopTree(child);child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();
  }
}

export function execArgs({model,effort,threadId}) {
  const settings=['--json','-c',`model_reasoning_effort=${JSON.stringify(effort)}`,'-c','sandbox_mode="read-only"','-c','approval_policy="never"','--model',model,'--skip-git-repo-check'];
  return threadId?['exec','resume',...settings,threadId,'-']:['exec',...settings,'-'];
}

export async function executeTurn(executable,{args,prompt,cwd,env=process.env,timeoutMs=300000,onEvent=async()=>{},stdout=process.stdout,stderr=process.stderr}) {
  const child=spawn(executable.command,[...executable.args,...args],{cwd,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  let timedOut=false,startError=null,protocolError=null;
  let stopping;
  const terminate=()=>stopping??=stopTree(child);
  const lines=createInterface({input:child.stdout});
  const interrupt=()=>{
    timedOut=true;
    // EOF can be held by an orphaned descendant after its launcher exits.
    lines.close();child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();void terminate();
  };
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const timer=setTimeout(interrupt,timeoutMs);
  const closed=new Promise(resolve=>{
    child.once('error',e=>{startError=e;resolve({code:null,signal:null});});
    child.once('exit',(code,signal)=>resolve({code,signal}));
  });
  child.stderr.on('data',b=>stderr.write(b));
  child.stdin.on('error',e=>{startError??=e;});
  child.stdin.end(prompt);
  try{
    for await(const line of lines){
      if(timedOut)break;
      if(!line.trim())continue;
      if(line.length>4*1024*1024){protocolError='Codex event exceeds limit';void terminate();break;}
      let event;try{event=JSON.parse(line);}catch{protocolError='Invalid JSONL from Codex';void terminate();break;}
      await onEvent(event);
      if(event.type==='item.completed'&&event.item?.type==='agent_message'&&typeof event.item.text==='string')stdout.write(event.item.text+'\n');
      if(event.type==='error'||event.type==='turn.failed')stderr.write('Codex reported a failed turn; inspect its terminal diagnostics before continuing.\n');
    }
    const exit=await closed;
    return {...exit,timedOut,startError:startError?.message??null,protocolError};
  } finally {
    clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);await terminate();lines.close();child.stdout.destroy();child.stderr.destroy();child.stdin.destroy();
  }
}
