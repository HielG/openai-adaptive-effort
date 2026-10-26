import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Read-only protocol probe. An explicit executable/JS entry point avoids a shell.
const entry = process.argv[2];
if (!entry) throw new Error('Pass the installed Codex executable or bin/codex.js path');
const command = entry.endsWith('.js') ? process.execPath : entry;
const prefix = entry.endsWith('.js') ? [entry] : [];
const isolated = process.argv.includes('--isolated');
const env = { ...process.env };
if (isolated) {
  env.CODEX_HOME = path.resolve('evidence/local-smoke/probe-home');
  await mkdir(env.CODEX_HOME, { recursive: true });
  delete env.OPENAI_API_KEY;
}
const child = spawn(command, [...prefix, 'app-server'], { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
const messages = [];
child.stderr.on('data', b => { stderr += b; });
const lines = createInterface({ input: child.stdout });
const send = obj => child.stdin.write(JSON.stringify(obj) + '\n');
const timer = setTimeout(() => { child.kill(); }, 15000);
let result;
lines.on('line', line => {
  try {
    const message = JSON.parse(line);
    messages.push(message);
    if (message.id === 1 && message.result) {
      send({ method: 'initialized', params: {} });
      send({ id: 2, method: 'model/list', params: { limit: 100, includeHidden: false } });
    }
    if (message.id === 2) { result = message; child.stdin.end(); }
  } catch { /* non-JSON line recorded in stderr only */ }
});
send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'adaptive_effort_probe', version: '0.1.0' }, capabilities: {} } });
const exit = await new Promise(resolve => { child.once('error', e => resolve({error:e.message})); child.once('close', (code,signal) => resolve({code,signal})); });
clearTimeout(timer);
await mkdir('evidence', { recursive: true });
const evidenceFile = isolated ? 'evidence/codex-capability-probe-isolated.json' : 'evidence/codex-capability-probe.json';
await writeFile(evidenceFile, JSON.stringify({ command, prefix, isolated, messages, stderr, exit }, null, 2));
if (!result?.result?.data) { console.error('Probe failed; see evidence/codex-capability-probe.json'); process.exitCode = 1; }
else console.log(JSON.stringify({ exit, models: result.result.data.map(m => ({model:m.model,default:m.defaultReasoningEffort,supported:m.supportedReasoningEfforts})) }, null, 2));
