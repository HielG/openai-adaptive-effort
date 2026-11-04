import {mkdir,mkdtemp,cp,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.platform!=='win32')throw new Error('Native UI checks require Windows');
const area=await mkdtemp(path.join(root,'evidence','desktop-ui-check-'));
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const results=[];
for(const mode of ['chat','cancel','missing-node']){
  const dir=path.join(area,mode);await mkdir(dir);
  await cp(path.join(root,'releases/desktop/desktop'),path.join(dir,'desktop'),{recursive:true});
  await cp(path.join(root,'releases/desktop/src'),path.join(dir,'src'),{recursive:true});
  await writeFile(path.join(dir,'desktop.settings.json'),JSON.stringify({node:mode==='missing-node'?path.join(dir,'missing-node.exe'):process.execPath,workspace:dir,codex:path.join(root,'tests/fixtures/fake-codex.mjs')}));
  const exe=path.join(dir,'UI Check.exe');
  const build=spawnSync(compiler,['/nologo','/noconfig','/target:exe','/main:UiSmoke',`/out:${exe}`,'/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',path.join(root,'desktop/App.cs'),path.join(root,'tests/fixtures/desktop-ui-smoke.cs')],{encoding:'utf8',windowsHide:true,timeout:10000});
  await writeFile(path.join(dir,'build.log'),build.stdout+build.stderr);
  if(build.status!==0)throw new Error(`UI harness build failed: ${dir}`);
  const pidFile=path.join(dir,'owned-pids.txt');await writeFile(pidFile,'');
  const result=spawnSync(exe,[mode],{encoding:'utf8',windowsHide:true,timeout:35000,env:{...process.env,FAKE_MODE:mode==='cancel'?'desktop-hang-tree':'desktop',CAPTURE_PID:pidFile,CAPTURE_FILE:path.join(dir,'prompt-capture.json')}});
  await writeFile(path.join(dir,'result.json'),JSON.stringify({exitCode:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr},null,2));
  results.push({mode,exitCode:result.status,stdout:result.stdout,stderr:result.stderr});
  console.log(JSON.stringify(results.at(-1)));
  if(result.status!==0){process.exitCode=1;break;}
}
await writeFile(path.join(area,'summary.json'),JSON.stringify({area,results},null,2));
console.log(area);
