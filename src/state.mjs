import { open, mkdir, readFile, rename, unlink, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LADDER } from './policy.mjs';

export const validThread = id => typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const within = (root,file) => {const rel=path.relative(root,file);return !rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
export async function statePath(workspace,file='.adaptive-effort/session.json') {
  const root=await realpath(workspace);
  const target=path.resolve(root,file);
  if(!within(root,target)||target===root)throw new Error('State must be inside the workspace');
  let ancestor=path.dirname(target);
  for(;;){
    try{if(!within(root,await realpath(ancestor)))throw new Error('State parent resolves outside the workspace');break;}
    catch(e){if(e.code!=='ENOENT')throw e;ancestor=path.dirname(ancestor);}
  }
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  const parent=await realpath(path.dirname(target));
  if(!within(root,parent))throw new Error('State parent resolves outside the workspace');
  try{if((await lstat(target)).isSymbolicLink())throw new Error('State must not be a symlink');}catch(e){if(e.code!=='ENOENT')throw e;}
  return path.join(parent,path.basename(target));
}
export async function atomicWrite(file,value) {
  const temp=file+'.'+randomUUID()+'.tmp';let handle;
  try{
    handle=await open(temp,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(temp,file);
  }finally{await handle?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function readState(file) {
  let text;try{text=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(text.length>16*1024*1024)throw new Error('State exceeds limit; archive history before continuing');
  let state;try{state=JSON.parse(text);}catch{throw new Error('Invalid state JSON; refusing to reset session history');}
  if(!state||state.version!==1||!['idle','running','uncertain'].includes(state.status)||typeof state.model!=='string'||typeof state.workspace!=='string'||!LADDER.includes(state.baseline)||!Array.isArray(state.turns)||!(state.threadId===null||validThread(state.threadId))||!(state.previous===null||LADDER.includes(state.previous)))throw new Error('Invalid state schema; refusing to reset session history');
  for(const turn of state.turns){
    if(!turn||!LADDER.includes(turn.effort)||!['completed','uncertain'].includes(turn.outcome)||typeof turn.attemptId!=='string')throw new Error('Invalid turn history');
    if(turn.usage!==null&&(!turn.usage||typeof turn.usage!=='object'))throw new Error('Invalid usage history');
  }
  return state;
}
export async function lockState(file) {
  const lock=file+'.lock';let handle;
  try{handle=await open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error('Session is locked. Another run may be active; do not retry or remove the lock until its owner is stopped.');throw e;}
  try{await handle.writeFile(JSON.stringify({pid:process.pid,created:new Date().toISOString()}));}catch(e){await handle.close();await unlink(lock);throw e;}
  return async()=>{await handle.close();await unlink(lock);};
}
function alive(pid) {
  if(!Number.isSafeInteger(pid)||pid<1)throw new Error('Invalid lock owner');
  try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw new Error('Cannot verify whether the session owner is stopped');}
}
export async function recoverState(file,{acknowledge=false}={}) {
  if(!acknowledge)throw new Error('Recovery requires --acknowledge-uncertain; it does not retry the interrupted prompt');
  const guard=file+'.recovery.lock';let guardHandle;
  try{guardHandle=await open(guard,'wx',0o600);await guardHandle.writeFile(JSON.stringify({pid:process.pid,created:new Date().toISOString()}));}
  catch(e){await guardHandle?.close();if(e.code==='EEXIST')throw new Error('Recovery is already locked. If its owner crashed, verify all owners stopped before manually removing the recovery guard.');throw e;}
  try{
  try{
    const lock=JSON.parse(await readFile(file+'.lock','utf8'));
    if(alive(lock.pid))throw new Error('Session owner is still running');
    await unlink(file+'.lock');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const release=await lockState(file);
  try{
    const state=await readState(file);
    if(!state||state.status==='idle')throw new Error('No uncertain session needs recovery');
    if(state.ownerPid&&alive(state.ownerPid))throw new Error('Session owner is still running');
    if(!validThread(state.threadId))throw new Error('No thread ID was captured. Inspect Codex history manually; use a new state file only after resolving possible effects.');
    if(state.pendingAttempt){
      const pending=state.pendingAttempt;
      if(typeof pending.attemptId!=='string'||!LADDER.includes(pending.effort))throw new Error('Invalid pending attempt; inspect history manually');
      if(!state.turns.some(t=>t.attemptId===pending.attemptId))state.turns.push({...pending,outcome:'uncertain',usage:null,failure:'Recovered after interrupted runner; terminal result unknown'});
      delete state.pendingAttempt;
    }
    state.cumulativeUsage=null;delete state.ownerPid;
    state.status='idle';state.recoveredAt=new Date().toISOString();state.recoveryNote='User acknowledged uncertainty; next request resumes the captured thread without automatic replay.';
    await atomicWrite(file,state);return state;
  }finally{await release();}
  }finally{await guardHandle.close();await unlink(guard);}
}
