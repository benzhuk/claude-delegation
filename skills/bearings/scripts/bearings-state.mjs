#!/usr/bin/env node
// Local, explicit completion receipts for the bearings skill. This is deliberately not a scheduler.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadProjectConfig } from '../../decisions/scripts/project-config.mjs';

const DAY = 24 * 60 * 60 * 1000;
const VERSION = 1;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const home = (env = process.env) => env.AGENTS_HOME || path.join(os.homedir(), '.agents');
const absent = (err) => err && (err.code === 'ENOENT' || err.code === 'ENOTDIR');
const canonicalPath = (file) => (fs.realpathSync.native || fs.realpathSync)(file);

function fileBytes(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return { kind: 'invalid' };
    return { kind: 'ok', bytes: fs.readFileSync(file), path: canonicalPath(file) };
  } catch (err) { return absent(err) ? { kind: 'missing' } : { kind: 'unreadable' }; }
}

function validPublication(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch { return false; }
}

// `realpath` needs a leaf that exists. For a new receipt, preserve the real
// existing ancestor so aliases through a symlink cannot bypass role checks.
function resolvedDestination(file) {
  const parts = [];
  let current = path.resolve(file);
  while (true) {
    try { return path.join(canonicalPath(current), ...parts.reverse()); }
    catch (err) {
      if (!absent(err)) throw err;
      const parent = path.dirname(current);
      if (parent === current) throw err;
      parts.push(path.basename(current));
      current = parent;
    }
  }
}

export function receiptLocation(projectRoot, env = process.env) {
  return path.join(home(env), 'ws', 'bearings', `${sha256(projectRoot)}.json`);
}

export function goalLocation(repo) {
  let loaded;
  try { loaded = loadProjectConfig(repo); } catch { return { kind: 'unknown' }; }
  if (!loaded.root) return { kind: 'unconfigured' };
  if (loaded.source === 'unreadable') return { kind: 'unknown' };
  let projectRoot;
  try { projectRoot = canonicalPath(loaded.root); } catch { return { kind: 'unknown' }; }
  const configured = loaded.config && loaded.config.goal_card;
  const candidate = configured && path.isAbsolute(configured) ? configured : path.join(projectRoot, configured || 'docs/goals/card.md');
  const goal = fileBytes(candidate);
  if (goal.kind === 'missing') return { kind: 'unconfigured', projectRoot, goalPath: candidate };
  if (goal.kind !== 'ok') return { kind: 'unknown', projectRoot, goalPath: candidate };
  return { kind: 'ok', projectRoot, goalPath: goal.path, goalDigest: sha256(goal.bytes) };
}

function disabled(env) {
  for (const name of ['ws-off', 'ws-off-goalcard', 'ws-off-bearings']) {
    try { fs.statSync(path.join(home(env), name)); return true; }
    catch (err) { if (!absent(err)) return true; }
  }
  return false;
}

function result(status, reason, extra = {}) { return { status, reason, ...extra }; }

export function check({ repo = process.cwd(), env = process.env, now = Date.now() } = {}) {
  if (disabled(env)) return result('disabled', 'bearings switch is active');
  const goal = goalLocation(repo);
  if (goal.kind === 'unconfigured') return result('unconfigured', 'current goal card is missing', goal);
  if (goal.kind !== 'ok') return result('unknown', 'project root or current goal card is unreadable', goal);
  const receiptFile = receiptLocation(goal.projectRoot, env);
  let raw;
  try { raw = fs.readFileSync(receiptFile, 'utf8'); }
  catch (err) { return absent(err) ? result('due', 'no completion receipt', { ...goal, receiptFile }) : result('unknown', 'completion receipt is unreadable', { ...goal, receiptFile }); }
  let receipt;
  try { receipt = JSON.parse(raw); } catch { return result('due', 'completion receipt is corrupt', { ...goal, receiptFile }); }
  if (!receipt || receipt.version !== VERSION || receipt.projectRoot !== goal.projectRoot || receipt.goalPath !== goal.goalPath || receipt.goalDigest !== goal.goalDigest) {
    return result('due', 'completion receipt does not match the current goal', { ...goal, receiptFile });
  }
  const completedAt = Date.parse(receipt.completedAt);
  if (!Number.isFinite(completedAt) || completedAt > now) return result('due', 'completion receipt has an invalid or future completion time', { ...goal, receiptFile });
  if (!validPublication(receipt.publication)) return result('due', 'completion receipt lacks a verified publication URL', { ...goal, receiptFile });
  for (const [field, digest] of [['reportPath', 'reportDigest'], ['leadResponsePath', 'leadResponseDigest']]) {
    if (typeof receipt[field] !== 'string' || typeof receipt[digest] !== 'string') return result('due', 'completion receipt lacks required evidence', { ...goal, receiptFile });
    const evidence = fileBytes(receipt[field]);
    if (evidence.kind !== 'ok' || sha256(evidence.bytes) !== receipt[digest]) return result('due', 'completion evidence is missing or has changed', { ...goal, receiptFile });
  }
  if (now - completedAt >= DAY) return result('due', 'the last completed assessment is at least 24 hours old', { ...goal, receiptFile, receipt });
  return result('current', 'a matching completed assessment is less than 24 hours old', { ...goal, receiptFile, receipt });
}

export function complete({ repo = process.cwd(), report, leadResponse, publication, env = process.env, now = Date.now() } = {}) {
  if (disabled(env)) throw new Error('bearings is disabled by a switch');
  const goal = goalLocation(repo);
  if (goal.kind !== 'ok') throw new Error(goal.kind === 'unconfigured' ? 'current goal card is missing' : 'project root or current goal card is unreadable');
  if (!validPublication(publication)) throw new Error('publication must be an http(s) URL');
  const reportFile = fileBytes(report);
  const responseFile = fileBytes(leadResponse);
  if (reportFile.kind !== 'ok' || responseFile.kind !== 'ok') throw new Error('report and lead response must be readable, nonempty regular files');
  const receipt = { version: VERSION, projectRoot: goal.projectRoot, goalPath: goal.goalPath, goalDigest: goal.goalDigest,
    completedAt: new Date(now).toISOString(), reportPath: reportFile.path, reportDigest: sha256(reportFile.bytes),
    leadResponsePath: responseFile.path, leadResponseDigest: sha256(responseFile.bytes), publication };
  const target = receiptLocation(goal.projectRoot, env);
  const resolvedTarget = resolvedDestination(target);
  if ([reportFile.path, responseFile.path, goal.goalPath].includes(resolvedTarget)) {
    throw new Error('completion receipt destination conflicts with required evidence or goal card');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try { fs.writeFileSync(temp, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temp, target); }
  finally { try { fs.unlinkSync(temp); } catch {} }
  return receipt;
}

function args(argv) { const out = {}; for (let i = 0; i < argv.length; i += 2) { if (!argv[i].startsWith('--')) throw new Error(`unexpected argument: ${argv[i]}`); out[argv[i].slice(2)] = argv[i + 1]; } return out; }
async function cli() {
  const [command, ...rest] = process.argv.slice(2); const a = args(rest);
  if (!command || !a.repo || (command === 'complete' && (!a.report || !a['lead-response'] || !a.publication))) throw new Error('usage: bearings-state.mjs check --repo <project-root> | complete --repo <project-root> --report <path> --lead-response <path> --publication <https-url>');
  const out = command === 'check' ? check({ repo: a.repo }) : command === 'complete' ? complete({ repo: a.repo, report: a.report, leadResponse: a['lead-response'], publication: a.publication }) : null;
  if (!out) throw new Error(`unknown command: ${command}`); process.stdout.write(`${JSON.stringify(out)}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch((err) => { process.stderr.write(`bearings-state: ${err.message}\n`); process.exitCode = 1; });
