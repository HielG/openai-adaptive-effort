import {randomUUID} from 'node:crypto';
import {realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {resolveCodex,discoverModels} from '../src/process.mjs';
import {runTurn} from '../src/runner.mjs';
import {capabilities,summarize} from '../src/policy.mjs';
import {modelFamily} from '../src/display.mjs';
import {readState} from '../src/state.mjs';

export function createBridge({emit,resolve=resolveCodex,discover=discoverModels,run=runTurn,env=process.env,codex}={}) {
  let catalog=null,executable=null,session=null,busy=false,controller=null,closed=false;
  const send=value=>{if(!closed)emit(value);};
  const text=(value,name,max=4096)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`Invalid ${name}`);return value;};
  const idle=()=>{if(busy)throw new Error('A request is already running');};
  async function handle(command) {
    const id=command?.id;
    try {
      if(!Number.isSafeInteger(id)||id<1||typeof command.method!=='string')throw new Error('Invalid command');
      if(!command||Array.isArray(command)||Object.keys(command).some(k=>!['id','method','params'].includes(k)))throw new Error('Invalid command fields');
      const params=command.params===undefined?{}:command.params;
      if(!params||typeof params!=='object'||Array.isArray(params))throw new Error('Parameters must be an object');
      const allowed=command.method==='send'?['prompt','model','baseline','workspace','manual']:[];
      if(Object.keys(params).some(k=>!allowed.includes(k)))throw new Error('Unknown command parameter');
      if(command.method==='cancel') {controller?.abort();send({id,type:'result',cancelRequested:busy});return;}
      if(command.method==='new') {idle();session=null;send({id,type:'result',newChat:true});return;}
      if(command.method==='models') {
        idle();busy=true;controller=new AbortController();
        try {
          if(session)throw new Error('Start a new chat before refreshing models');
          const nextExecutable=await resolve(codex);
          if(controller.signal.aborted)throw new Error('Model discovery cancelled');
          const received=await discover(nextExecutable,{env,signal:controller.signal});
          const nextCatalog=received.map(m=>({...m,supported:capabilities(m)}));
          executable=nextExecutable;catalog=nextCatalog;
          send({id,type:'result',models:catalog.map(m=>({model:m.model,family:modelFamily(m.model),baseline:m.defaultReasoningEffort,supported:m.supported}))});
        }finally{busy=false;controller=null;}
        return;
      }
      if(command.method!=='send')throw new Error('Unknown command');
      idle();
      if(!catalog||!executable)throw new Error('Load models before sending');
      const prompt=text(params.prompt,'prompt',1024*1024);
      const model=text(params.model,'model');
      const baseline=text(params.baseline,'baseline');
      const matches=catalog.filter(m=>m.model===model);
      if(matches.length!==1||!matches[0].supported.includes(baseline))throw new Error('Choose an available model and supported baseline');
      if(params.manual!==undefined&&!matches[0].supported.includes(params.manual))throw new Error('Unsupported manual effort');
      busy=true;controller=new AbortController();
      try {
        const workspace=await realpath(text(params.workspace,'workspace'));
        if(session&&(session.workspace!==workspace||session.model!==model||session.baseline!==baseline))throw new Error('Start a new chat to change workspace, model, or baseline');
        session??={workspace,model,baseline,state:`.adaptive-effort/desktop/${randomUUID()}.json`};
        let diagnostics='';
        const result=await run({...session,prompt,manual:params.manual,executable,env,signal:controller.signal,
          stdout:{write:chunk=>send({id,type:'text',text:String(chunk)})},
          stderr:{write:chunk=>{diagnostics=(diagnostics+String(chunk)).slice(-4096);}},
          onStatus:status=>send({id,type:'status',model:status.model,effort:status.effort,status:status.status,kind:status.kind})});
        const state=await readState(result.stateFile);
        send({id,type:'result',outcome:result.outcome,decision:result.decision,usage:result.usage,report:summarize(state?.turns??[]),stateFile:result.stateFile,
          message:result.outcome==='completed'?'':result.exit?.cancelled?'Stopped. This chat is uncertain; inspect it before starting another request.':'This chat is uncertain. Inspect the session before continuing; the prompt was not retried.'});
      }finally{busy=false;controller=null;}
    }catch(error){
      let uncertain=false,stateFile;
      if(session){stateFile=path.join(session.workspace,session.state);try{const state=await readState(stateFile);uncertain=Boolean(state&&state.status!=='idle');}catch{uncertain=true;}}
      send({id:Number.isSafeInteger(id)?id:0,type:'error',message:String(error.message).slice(0,2048),uncertain,stateFile});
    }
  }
  return {handle,close(){closed=true;controller?.abort();},get busy(){return busy;}};
}

export async function serve(input=process.stdin,output=process.stdout,options={}) {
  const bridge=createBridge({...options,emit:event=>output.write(JSON.stringify(event)+'\n')});
  // Keep input bounded without readline's unbounded line buffering.
  let buffer='',overflow=false;
  input.setEncoding('utf8');
  input.on('data',chunk=>{
    if(overflow)return;
    buffer+=chunk;
    if(Buffer.byteLength(buffer,'utf8')>2*1024*1024){overflow=true;bridge.close();output.write(JSON.stringify({id:0,type:'error',message:'Desktop command exceeds 2 MiB'})+'\n');input.destroy();return;}
    let index;
    while((index=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
      if(!line.trim())continue;
      try{void bridge.handle(JSON.parse(line));}catch{output.write(JSON.stringify({id:0,type:'error',message:'Invalid JSON command'})+'\n');}
    }
  });
  input.on('end',()=>bridge.close());input.on('error',()=>bridge.close());
  output.on('error',()=>bridge.close());
  return bridge;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await serve(process.stdin,process.stdout,{codex:process.argv[2]});
