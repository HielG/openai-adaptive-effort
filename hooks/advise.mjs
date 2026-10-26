#!/usr/bin/env node
import { classify } from '../src/policy.mjs';

// No prompt persistence, network calls, configuration writes or effort overrides.
const suggestions={social:'a light supported effort',trivial:'a light supported effort',continue:'the previous effort',work:'the selected baseline',ideation:'a higher supported effort',planning:'a higher supported effort',review:'a higher supported effort',complex:'a higher supported effort'};
export function advise(event){
  if(!event||event.hook_event_name!=='UserPromptSubmit'||typeof event.prompt!=='string'||!event.prompt.trim()||event.agent_id||event.agentId||event.isMeta||event.is_meta)return null;
  const verdict=classify(event.prompt);
  return {systemMessage:`Adaptive Effort advisory: ${verdict.kind}; consider ${suggestions[verdict.kind]}. Current host effort is unchanged.`};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/hooks/advise.mjs')){
  let input='';let overflow=false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>{if(input.length+chunk.length>1024*1024){overflow=true;input='';}else if(!overflow)input+=chunk;});
  process.stdin.on('error',()=>{});
  process.stdin.on('end',()=>{try{if(!overflow){const output=advise(JSON.parse(input));if(output)process.stdout.write(JSON.stringify(output)+'\n');}}catch{/* fail open, without echoing submitted data */}});
}
