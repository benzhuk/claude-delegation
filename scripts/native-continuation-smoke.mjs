#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, appendFile, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTINUATION = join(PLUGIN_ROOT, 'scripts', 'continuation.mjs');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'multi-inbox.js');
const NORMALIZER = join(PLUGIN_ROOT, 'hooks', 'continuation-native.mjs');
const TIMEOUT_MS = 45_000;
const ALLOWED_ENV = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|PROCESSOR_ARCHITECTURE|PROCESSOR_IDENTIFIER|NUMBER_OF_PROCESSORS)$/i;

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--claude', '--output'].includes(argv[i]) || argv[i + 1] === undefined) fail(`unknown or incomplete option: ${argv[i] ?? '<none>'}`);
    const key = argv[i].slice(2); if (out[key]) fail(`duplicate option: ${argv[i]}`); out[key] = argv[i + 1];
  }
  if (!out.claude || !isAbsolute(out.claude)) fail('usage: node scripts/native-continuation-smoke.mjs --claude <absolute-executable> [--output <new-output-directory>]');
  return out;
}
function q(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }
function cleanEnv(extra = {}) { return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ALLOWED_ENV.test(key))), ...extra }; }
async function prepareOutput(value) {
  if (!value) return mkdtemp(join(tmpdir(), 'native-continuation-smoke-'));
  const output = resolve(value);
  try { if ((await readdir(output)).length) fail('--output must be new or empty'); }
  catch (error) { if (error.code === 'ENOENT') await mkdir(output, { recursive: true }); else throw error; }
  return output;
}
export async function runChild(executable, args, options, timeout = TIMEOUT_MS) {
  return new Promise((done, reject) => {
    const child = spawn(executable, args, { ...options, windowsHide: true, detached: process.platform !== 'win32' });
    let stdout = '', stderr = '', settled = false;
    child.stdout?.on('data', (chunk) => { stdout += chunk; options.onStdout?.(chunk, child); });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    let timer;
    async function terminateOwnedTree() {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        await new Promise((resolveKill) => {
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          const bound = setTimeout(() => { killer.kill(); resolveKill(); }, 3000); bound.unref?.();
          killer.once('error', () => { clearTimeout(bound); try { child.kill(); } catch {} resolveKill(); });
          killer.once('close', () => { clearTimeout(bound); resolveKill(); });
        });
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
      }
    }
    timer = setTimeout(async () => {
      if (settled) return;
      settled = true; await terminateOwnedTree(); reject(new Error(`child timeout after ${timeout}ms`));
    }, timeout); timer.unref?.();
    child.once('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once('close', (code, signal) => { if (!settled) { settled = true; clearTimeout(timer); done({ code, signal, stdout, stderr }); } });
    options.onSpawn?.(child);
  });
}
async function closeOwnedServer(server, sockets, timeout = 2000) {
  return new Promise((resolveClose) => {
    let complete = false;
    const finish = () => { if (!complete) { complete = true; clearTimeout(timer); resolveClose(); } };
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      for (const socket of sockets) socket.destroy();
      finish();
    }, timeout); timer.unref?.();
    server.close(finish); server.closeIdleConnections?.();
  });
}
function walkStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) walkStrings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) walkStrings(item, out);
  return out;
}
export { closeOwnedServer };
function visibleFacts(request) {
  const strings = walkStrings(request.messages ?? []); const joined = strings.join('\n');
  const context = /Continuation epoch ([A-Za-z0-9_-]+)\. Host: ([a-z]+); session: ([^.\s]+)\./.exec(joined);
  let bind = null, account = null;
  for (const text of strings) {
    if (!text.includes('continuationBind') && !text.includes('"status":"accounted"')) continue;
    try {
      const parsed = JSON.parse(text.trim());
      if (parsed?.continuationBind?.requestId && parsed?.revision) bind = { epoch: parsed.continuationBind.epoch, revision: parsed.revision };
      if (parsed?.status === 'accounted' && /^[0-9a-f]{64}$/.test(parsed?.revision)) account = { revision: parsed.revision };
    } catch {}
  }
  return { epoch: context?.[1] ?? null, host: context?.[2] ?? null, sessionId: context?.[3] ?? null, bind, account };
}
function assistantMessage(command, n) {
  const content = command ? [{ type: 'tool_use', id: `toolu_${n}`, name: 'Bash', input: { command } }] : [{ type: 'text', text: 'fixture done' }];
  return { id: `msg_${n}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5', content, stop_reason: command ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
}
function sendMessage(res, msg, stream) {
  if (!stream) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(msg)); return; }
  res.setHeader('content-type', 'text/event-stream'); const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', { type: 'message_start', message: { ...msg, content: [], stop_reason: null } });
  const tool = msg.content[0].type === 'tool_use';
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: tool ? { type: 'tool_use', id: msg.content[0].id, name: 'Bash', input: {} } : { type: 'text', text: '' } });
  send('content_block_delta', { type: 'content_block_delta', index: 0, delta: tool ? { type: 'input_json_delta', partial_json: JSON.stringify(msg.content[0].input) } : { type: 'text_delta', text: msg.content[0].text } });
  send('content_block_stop', { type: 'content_block_stop', index: 0 }); send('message_delta', { type: 'message_delta', delta: { stop_reason: msg.stop_reason, stop_sequence: null }, usage: { output_tokens: 1 } }); send('message_stop', { type: 'message_stop' }); res.end();
}
async function writeFixture(root) {
  const config = join(root, 'config'), home = join(root, 'home'), agents = join(root, 'agents'), repo = join(root, 'repo'), events = join(root, 'events.jsonl');
  for (const dir of [config, home, agents, join(repo, 'docs', 'work', 'evidence')]) await mkdir(dir, { recursive: true });
  await writeFile(events, ''); await writeFile(join(repo, 'authority.md'), 'authorized ongoing fixture scope\n'); await writeFile(join(repo, 'docs', 'work', 'evidence', 'proof.md'), 'VERDICT: APPROVE deadbeef\nproof\n');
  await writeFile(join(repo, 'docs', 'work', 'root.record.md'), ['Work: wr-2026-09-23-root', 'Scope: scripts/example.mjs@deadbeef', 'Owner: worker', 'Status: owned', 'Authority: authority.md', 'Artifact: integrate/example@deadbeef', 'Evidence: docs/work/evidence/proof.md', 'Next: continue useful work', 'Opened: 2026-09-23T00:00:00Z', 'Children: none', '', 'Observed: fixture'].join('\n'));
  const wrapper = join(root, 'hook-wrapper.mjs');
  await writeFile(wrapper, `import{spawn}from'node:child_process';import{appendFile,stat}from'node:fs/promises';import{normalizeClaudeContinuation}from${JSON.stringify(pathToFileURL(NORMALIZER).href)};let raw='';for await(const c of process.stdin)raw+=c;const j=JSON.parse(raw);const c=spawn(process.execPath,[${JSON.stringify(HOOK)}],{env:process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);c.stdin.end(raw);const code=await new Promise((r,k)=>{const t=setTimeout(()=>c.kill(),10000);c.on('error',e=>{clearTimeout(t);k(e)});c.on('close',x=>{clearTimeout(t);r(x)})});let parsed=null;try{parsed=JSON.parse(out)}catch{}await appendFile(${JSON.stringify(events)},JSON.stringify({event:j.hook_event_name,active:j.stop_hook_active===true,size:await stat(j.transcript_path).then(x=>x.size).catch(()=>null),normalized:normalizeClaudeContinuation(j),output:parsed,hookCode:code,hookStderr:Boolean(err)})+'\\n');if(j.hook_event_name==='Stop'&&parsed?.decision==='block')await new Promise(r=>setTimeout(r,750));process.stdout.write(out);`);
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(wrapper)}`; const settings = join(root, 'settings.json');
  await writeFile(settings, JSON.stringify({ hooks: Object.fromEntries(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop'].map((event) => [event, [{ hooks: [{ type: 'command', command }] }]])) }));
  return { config, home, agents, repo, events, settings };
}
async function readJsonLines(file) { try { return (await readFile(file, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse); } catch { return []; } }
async function readStates(agents) { const dir = join(agents, 'ws', 'continuation'), out = []; try { for (const name of await readdir(dir)) if (name.endsWith('.json')) out.push(JSON.parse(await readFile(join(dir, name), 'utf8'))); } catch {} return out; }

async function scenario(name, claude, output) {
  const root = join(output, name); await mkdir(root); const fixture = await writeFixture(root), sid = randomUUID(); let calls = 0, oldEpoch = null; const requestBytes = [], visible = [];
  const sockets = new Set(); const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk; let request = {}; try { request = JSON.parse(body); } catch {}
    if (!request.messages) { res.end('{}'); return; }
    calls += 1; requestBytes.push(Buffer.byteLength(body)); const facts = visibleFacts(request); visible.push({ call: calls, host: facts.host, epoch: Boolean(facts.epoch), session: Boolean(facts.sessionId), bindResult: Boolean(facts.bind), accountResult: Boolean(facts.account), accountRevision: facts.account?.revision ?? null }); if (facts.epoch && !oldEpoch) oldEpoch = facts.epoch;
    let command = null;
    if (!facts.epoch) command = 'echo fixture-bootstrap';
    else if (!facts.bind && calls <= 2) command = [q(process.execPath), q(CONTINUATION), 'bind', '--host', q(facts.host), '--session-id', q(facts.sessionId), '--expected-epoch', q(facts.epoch), '--repo', q(fixture.repo), '--root', 'wr-2026-09-23-root', '--authority-ref', 'authority.md'].join(' ');
    else if (name === 'accounted' && facts.bind && calls === 3) command = [q(process.execPath), q(CONTINUATION), 'account', '--host', q(facts.host), '--session-id', q(facts.sessionId), '--expected-epoch', q(facts.bind.epoch), '--expected-revision', q(facts.bind.revision), '--evidence-ref', 'docs/work/evidence/proof.md'].join(' ');
    else if (name === 'interrupt' && calls === 4) command = [q(process.execPath), q(CONTINUATION), 'bind', '--host', q(facts.host), '--session-id', q(facts.sessionId), '--expected-epoch', q(oldEpoch), '--repo', q(fixture.repo), '--root', 'wr-2026-09-23-root', '--authority-ref', 'authority.md'].join(' ');
    sendMessage(res, assistantMessage(command, calls), request.stream === true);
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  const env = cleanEnv({ CLAUDE_CONFIG_DIR: fixture.config, HOME: fixture.home, USERPROFILE: fixture.home, AGENTS_HOME: fixture.agents, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', ANTHROPIC_API_KEY: 'fixture-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}` });
  const base = ['-p', '--verbose', '--output-format', 'stream-json', '--include-hook-events', '--settings', fixture.settings, '--setting-sources', '', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', 'Bash', '--allowedTools', 'Bash', '--model', 'sonnet', '--session-id', sid]; let native, watcher;
  try {
    if (name !== 'interrupt') native = await runChild(claude, [...base, 'FIXTURE_ONGOING'], { cwd: fixture.repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    else {
      let child, pending = '', results = 0, interruptSent = false;
      native = await runChild(claude, [...base, '--input-format', 'stream-json'], { cwd: fixture.repo, env, stdio: ['pipe', 'pipe', 'pipe'], onSpawn(value) {
        child = value; child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'FIXTURE_ONGOING' }, session_id: sid, parent_tool_use_id: null }) + '\n');
        watcher = setInterval(async () => { if (interruptSent) return; if ((await readJsonLines(fixture.events)).some((event) => event.event === 'Stop' && event.output?.decision === 'block')) { interruptSent = true; child.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'fixture-interrupt', request: { subtype: 'interrupt' } }) + '\n'); } }, 25); watcher.unref?.();
      }, onStdout(chunk) {
        pending += chunk; for (;;) { const at = pending.indexOf('\n'); if (at < 0) break; const line = pending.slice(0, at); pending = pending.slice(at + 1); try { const row = JSON.parse(line); if (row.type === 'result') { results += 1; if (results === 1) child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'REPLACEMENT_FINITE_REQUEST' }, session_id: sid, parent_tool_use_id: null }) + '\n'); else child.stdin.end(); } } catch {} }
      } });
    }
  } finally { clearInterval(watcher); await closeOwnedServer(server, sockets); }
  const events = await readJsonLines(fixture.events), states = await readStates(fixture.agents), stream = native.stdout.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const stops = events.filter((event) => event.event === 'Stop'), blocks = stops.filter((event) => event.output?.decision === 'block');
  const accountRevision = visible.findLast((item) => item.accountResult)?.accountRevision ?? null; const current = states.length === 1 ? states[0].current : null;
  const result = { name, child: { code: native.code, signal: native.signal }, requests: calls, maxRequestBytes: Math.max(0, ...requestBytes), maxTranscriptBytes: Math.max(0, ...events.map((event) => event.size ?? 0)), visible, hooks: Object.fromEntries(['UserPromptSubmit', 'PostToolUse', 'Stop'].map((event) => [event, events.filter((row) => row.event === event).length])), blocks: blocks.length, refires: stops.filter((event) => event.active).length, interruptAcknowledged: stream.some((row) => row.type === 'control_response' && row.response?.subtype === 'success'), staleEpochObserved: stream.some((row) => row.type === 'user' && JSON.stringify(row.message?.content).includes('STALE_EPOCH')), finalPhase: current?.phase ?? null, accountRevision, stateAccountedRevision: current?.accountedRevision ?? null, bindingPresent: Boolean(current?.binding), attempted: current?.attempted ?? null };
  await writeFile(join(root, 'summary.json'), JSON.stringify({ ...result, stderr: native.stderr }, null, 2));
  if (native.code !== 0 || native.signal || result.hooks.PostToolUse < 1 || result.hooks.Stop < 1) fail(`${name}: native process/hook assertion failed`);
  if (name === 'unaccounted' && (result.blocks !== 1 || result.refires < 1 || result.maxTranscriptBytes <= 64 * 1024)) fail('unaccounted: expected one correction/refire and >64KiB default-prompt transcript');
  if (name === 'accounted' && (result.blocks !== 0 || result.requests < 4 || result.hooks.PostToolUse < 3 || !result.accountRevision || result.finalPhase !== 'active' || !result.bindingPresent || result.attempted !== false || result.stateAccountedRevision !== result.accountRevision)) fail('accounted: successful visible account and matching active unattempted state required');
  if (name === 'interrupt' && (!result.interruptAcknowledged || !result.staleEpochObserved || result.finalPhase !== 'unbound')) fail('interrupt: acknowledgement, STALE_EPOCH, or replacement disarm missing');
  return result;
}

export function assertScenario(name, native, result) {
  if (native.code !== 0 || native.signal || result.hooks.PostToolUse < 1 || result.hooks.Stop < 1) fail(`${name}: native process/hook assertion failed`);
  if (name === 'unaccounted' && (result.blocks !== 1 || result.refires < 1 || result.maxTranscriptBytes <= 64 * 1024)) fail('unaccounted: expected one correction/refire and >64KiB default-prompt transcript');
  if (name === 'accounted' && (result.blocks !== 0 || result.requests < 4 || result.hooks.PostToolUse < 3 || !result.accountRevision || result.finalPhase !== 'active' || !result.bindingPresent || result.attempted !== false || result.stateAccountedRevision !== result.accountRevision)) fail('accounted: successful visible account and matching active unattempted state required');
  if (name === 'interrupt' && (!result.interruptAcknowledged || !result.staleEpochObserved || result.finalPhase !== 'unbound')) fail('interrupt: acknowledgement, STALE_EPOCH, or replacement disarm missing');
}

async function main() {
  const args = parseArgs(process.argv.slice(2)); await access(args.claude, constants.X_OK); const output = await prepareOutput(args.output);
  const versionRun = await runChild(args.claude, ['--version'], { cwd: output, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }, 10_000); if (versionRun.code !== 0) fail(`claude --version failed: ${versionRun.stderr.trim()}`);
  try { const scenarios = {}; for (const name of ['unaccounted', 'accounted', 'interrupt']) scenarios[name] = await scenario(name, args.claude, output); const summary = { verdict: 'PASS', executable: resolve(args.claude), executableName: basename(args.claude), version: versionRun.stdout.trim(), output, scenarios, limits: ['Synthetic local provider responses prove native mechanics, not model judgment.', 'Codex and universal-host behavior are outside this opt-in Claude gate.'] }; await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2)); process.stdout.write(`${JSON.stringify(summary)}\n`); }
  catch (error) { await writeFile(join(output, 'summary.json'), JSON.stringify({ verdict: 'FAIL', executable: resolve(args.claude), version: versionRun.stdout.trim(), output, error: error.message }, null, 2)); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main().catch((error) => { process.stderr.write(`native-continuation-smoke: ${error.message}\n`); process.exitCode = 1; });
