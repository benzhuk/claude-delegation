#!/usr/bin/env node
// Opt-in native Claude regression gate.  It intentionally is not part of run-tests.mjs.
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const tempFixture = 'C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923';
function fail(message) { throw new Error(message); }
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1] ?? fail(`missing ${name} value`); }
const claude = arg('--claude');
if (!claude || !isAbsolute(claude)) fail('usage: node scripts/native-continuation-smoke.mjs --claude <absolute-executable> [--output <new-output-directory>]');
await access(claude, constants.X_OK);
const supplied = arg('--output');
const output = supplied ? resolve(supplied) : await mkdtemp(join(tmpdir(), 'native-continuation-smoke-'));
if (supplied) { try { if ((await readdir(output)).length) fail('--output must be new or empty'); } catch (e) { if (e.code === 'ENOENT') await mkdir(output, { recursive: true }); else throw e; } }

async function run(file) {
  const source = join(tempFixture, file);
  await access(source, constants.R_OK);
  const env = { ...process.env, PATH: `${dirname(claude)};${process.env.PATH ?? ''}` };
  const child = spawn(process.execPath, [source, 'accounted'], { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
  const [code, signal] = await new Promise(done => child.on('close', (c, s) => done([c, s])));
  let summary; try { summary = JSON.parse(stdout); } catch { fail(`${file}: no JSON summary`); }
  const events = summary.events ?? [], stream = summary.stream ?? [];
  const has = event => events.some(x => x.event === event);
  const block = events.some(x => x.event === 'Stop' && x.output?.decision === 'block');
  const contextVisible = events.some(x => /Continuation epoch [^ ]+\. Host: claude; session: [^.]+\./.test(x.output?.hookSpecificOutput?.additionalContext ?? ''));
  const ack = stream.some(x => x.type === 'control_response' && x.response?.subtype === 'success');
  const result = { file, child: { code, signal }, calls: summary.calls?.length ?? 0, hooks: events.map(x => x.event), hasPostToolUse: has('PostToolUse'), hasStop: has('Stop'), block, contextVisible, interruptAcknowledged: ack, replacementDisarmed: (summary.states ?? []).some(x => x.current?.phase === 'unbound') };
  if (code !== 0 || signal || !result.hasPostToolUse || !result.hasStop || !result.contextVisible) fail(`${file}: missing required native evidence`);
  return result;
}
try {
  const accounted = await run('review-adapter-native.mjs');
  const interrupt = await run('review-adapter-interrupt-replacement.mjs');
  if (accounted.block) fail('accounted silence regression: Stop blocked');
  if (!interrupt.block || !interrupt.interruptAcknowledged || !interrupt.replacementDisarmed) fail('interrupt/replacement regression');
  const report = { verdict: 'PASS', claude: basename(claude), scenarios: { accounted, interrupt }, limits: ['The corrected independent fixtures remain the local endpoint drivers.', 'This is an explicit developer gate and never runs in the sealed suite.'] };
  await writeFile(join(output, 'summary.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({ output, ...report }) + '\n');
} catch (error) {
  await writeFile(join(output, 'summary.json'), JSON.stringify({ verdict: 'FAIL', error: String(error.message) }, null, 2));
  process.stderr.write(`native-continuation-smoke: ${error.message}\n`); process.exitCode = 1;
}
