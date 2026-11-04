import {spawn} from 'node:child_process';
process.stdin.once('data',()=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});child.unref();
  console.log(child.pid);
  if(process.argv[2]==='orphan')setTimeout(()=>process.exit(0),50);
  else setInterval(()=>{},1000);
});
