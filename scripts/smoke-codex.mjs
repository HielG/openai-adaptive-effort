import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolveCodex, discoverModels } from '../src/process.mjs';
import { runTurn } from '../src/runner.mjs';
import { summarize } from '../src/policy.mjs';

// No remote model service, auth file, user prompt, or paid inference is used.
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=path.join(root,'evidence');
await mkdir(path.join(evidence,'local-smoke'),{recursive:true});
const area=await mkdtemp(path.join(evidence,'local-smoke','cli-'));
const workspace=path.join(area,'workspace'),home=path.join(area,'codex-home');
await mkdir(workspace);await mkdir(home);
const requests=[],runs=[],contexts=[];
const result={kind:'installed Codex + synthetic local Responses provider',paidInference:false,area,requests,runs,contexts};
let server;
try{
  const executable=await resolveCodex(process.argv[2]);
  const env={...process.env,CODEX_HOME:home};delete env.OPENAI_API_KEY;
  server=http.createServer(async(req,res)=>{
    try{
      if(req.method!=='POST'||!req.url?.endsWith('/responses')){res.writeHead(404);res.end();return;}
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4*1024*1024)throw new Error('Oversized synthetic request');}
      const data=JSON.parse(body),n=requests.length+1;
      requests.push({path:req.url,model:data.model,effort:data.reasoning?.effort,stream:data.stream});
      const message={id:`msg_synthetic_${n}`,type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:`Synthetic response ${n}`,annotations:[]}]};
      const response={id:`resp_synthetic_${n}`,object:'response',created_at:Math.floor(Date.now()/1000),status:'completed',model:data.model,output:[message],usage:{input_tokens:n*100,input_tokens_details:{cached_tokens:n*25},output_tokens:n*10,output_tokens_details:{reasoning_tokens:0},total_tokens:n*110}};
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'close'});
      let seq=0;const send=(type,rest)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:seq++,...rest})}\n\n`);
      send('response.created',{response:{...response,status:'in_progress',output:[],usage:null}});
      send('response.output_item.added',{output_index:0,item:{...message,status:'in_progress',content:[]}});
      send('response.content_part.added',{item_id:message.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});
      send('response.output_text.delta',{item_id:message.id,output_index:0,content_index:0,delta:message.content[0].text});
      send('response.output_text.done',{item_id:message.id,output_index:0,content_index:0,text:message.content[0].text});
      send('response.content_part.done',{item_id:message.id,output_index:0,content_index:0,part:message.content[0]});
      send('response.output_item.done',{output_index:0,item:message});
      send('response.completed',{response});res.end();
    }catch(error){res.writeHead(500);res.end(JSON.stringify({error:{message:error.message}}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await writeFile(path.join(home,'config.toml'),`model_provider = "adaptive_smoke"\n[model_providers.adaptive_smoke]\nname = "Synthetic local provider"\nbase_url = "http://127.0.0.1:${port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n`);
  const models=await discoverModels(executable,{env});
  const model=models.find(m=>m.supportedReasoningEfforts?.some(e=>e.reasoningEffort==='low')&&m.supportedReasoningEfforts.some(e=>e.reasoningEffort==='medium')&&m.supportedReasoningEfforts.some(e=>e.reasoningEffort==='high'));
  assert.ok(model,'An installed catalog model supports the synthetic test levels');
  result.model=model.model;
  for(const [prompt,expected] of [['Hello','low'],['Review this synthetic design','high'],['Fix the synthetic typo','medium']]){
    let output='',diagnostics='';
    const run=await runTurn({workspace,model:model.model,baseline:'medium',prompt,policy:{trivialMaxChars:160,longChars:900,complexCues:3,socialEffort:'low',trivialEffort:'low',reviewEffort:'high',planningEffort:'high',ideationEffort:'high',complexEffort:'high'},executable,env,timeoutMs:20000,stdout:{write:b=>{output+=b;}},stderr:{write:b=>{diagnostics+=b;}}});
    runs.push({...run,output,diagnostics});
    assert.equal(run.outcome,'completed',diagnostics);
    assert.equal(run.decision.effort,expected);
    assert.equal(requests.at(-1)?.effort,expected,'Actual HTTP request reasoning.effort');
    assert.equal(requests.at(-1)?.model,model.model);
    assert.equal(run.threadId,runs[0].threadId,'Resume preserves exact thread');
  }
  assert.equal(requests.length,3,'Exactly one provider request per turn');
  assert.deepEqual(runs.map(r=>r.usage),[1,2,3].map(n=>({input_tokens:n*100,cached_input_tokens:n*25,output_tokens:n*10})), 'Runner usage must subtract CLI cumulative boundaries');
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name.endsWith('.jsonl'))for(const line of (await readFile(file,'utf8')).trim().split('\n')){const event=JSON.parse(line);if(event.type==='turn_context')contexts.push(event.payload);}}}
  await walk(path.join(home,'sessions'));
  assert.equal(contexts.length,3);
  for(const context of contexts){assert.equal(context.approval_policy,'never');assert.equal(context.sandbox_policy?.type,'read-only');}
  assert.deepEqual(contexts.map(c=>c.effort),['low','high','medium']);
  const state=JSON.parse(await readFile(runs.at(-1).stateFile,'utf8'));
  result.report=summarize(state.turns);result.passed=true;
}catch(error){result.passed=false;result.failure={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  const label=path.basename(area);
  await writeFile(path.join(evidence,`smoke-${label}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:result.passed,requests,runs:runs.length,evidence:`evidence/smoke-${label}.json`,failure:result.failure?.message},null,2));
}
