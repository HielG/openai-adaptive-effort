import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const args=process.argv.slice(2),mode=process.env.FAKE_MODE;
if(args[0]==='app-server'){
  for await(const line of createInterface({input:process.stdin})){
    const req=JSON.parse(line);
    if(req.method==='initialize')console.log(JSON.stringify({id:req.id,result:{userAgent:'fixture'}}));
    if(req.method==='model/list'){
      if(mode==='hang')continue;
      if(mode==='bad-json'){console.log('not JSON');continue;}
      if(mode==='error'){console.log(JSON.stringify({id:req.id,error:{message:'synthetic error'}}));continue;}
      if(mode==='exit'){process.exit(2);}
      const cursor=req.params.cursor;
      const data=[{model:cursor?'second-model':'chosen-model',supportedReasoningEfforts:['low','medium','high','max'].map(reasoningEffort=>({reasoningEffort}))}];
      console.log(JSON.stringify({id:req.id,result:{data,nextCursor:mode==='paginate'&&!cursor?'next':mode==='repeat-cursor'?'same':null}}));
    }
  }
}else{
  let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
  if(process.env.CAPTURE_FILE)await writeFile(process.env.CAPTURE_FILE,JSON.stringify({args,prompt}));
  if(mode==='orphan-pipe'){
    const child=spawn(process.execPath,['-e','setTimeout(()=>{},3000)'],{stdio:['ignore','inherit','ignore'],windowsHide:true});child.unref();
    console.log(JSON.stringify({type:'fixture.child',pid:child.pid}));
  }else if(mode==='hang'){setInterval(()=>{},1000);}else if(mode==='bad-json'){console.log('not JSON');}else{
    console.log(JSON.stringify({type:'thread.started',thread_id:'12345678-1234-1234-1234-123456789abc'}));
    console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Synthetic OK'}}));
    console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:123,cached_input_tokens:50,output_tokens:10}}));
  }
}
