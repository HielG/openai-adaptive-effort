import {mkdir,copyFile,cp,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.platform!=='win32')throw new Error('The native desktop build currently targets Windows');
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
await access(compiler);
const output=path.join(root,'releases','desktop');
await mkdir(output,{recursive:true});
const executable=path.join(output,'Adaptive Effort.exe');
execFileSync(compiler,['/nologo','/noconfig','/target:winexe','/platform:anycpu','/optimize+',`/out:${executable}`,
  '/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',path.join(root,'desktop','App.cs')],{stdio:'inherit',windowsHide:true});
await mkdir(path.join(output,'desktop'),{recursive:true});
await copyFile(path.join(root,'desktop','bridge.mjs'),path.join(output,'desktop','bridge.mjs'));
await cp(path.join(root,'src'),path.join(output,'src'),{recursive:true});
await writeFile(path.join(output,'desktop.settings.json'),JSON.stringify({node:process.execPath,workspace:root},null,2)+'\n');
console.log(executable);
