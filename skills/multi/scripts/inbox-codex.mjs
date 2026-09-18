#!/usr/bin/env node
// inbox-codex — put one note into a Codex session's own on-disk queue (spec 2026-09-17, D5).
//
// Codex has no socket and no interrupt path, but it has something better for this purpose: a queue.
// `codex queue --thread <id> --message <text>` issues one `thread/queue/add` against an app-server it
// spins up in-process and writes a row into `queue_1.sqlite` under `CODEX_HOME`. The running TUI
// watches that store and, when it next goes idle, starts the oldest queued item as a real turn.
//
// That makes the busy case a FEATURE rather than a race: a note queued at a working Codex session sits
// in SQLite until the session is genuinely idle, so there is no window in which anybody's keystrokes
// and ours can collide. Spiked live on Netcup twice on 2026-09-17, including with
// `ben half-typed this into codex and did not press enter` left in the composer — the queued note ran
// as its own turn and that line was still sitting there afterwards, untouched.
//
// WHAT IT NEEDS (all three, or nothing happens):
//   · the SAME `CODEX_HOME` as the target session — the queue is a store inside it, so a different home
//     is a different queue and a silent no-op. It is passed in the CHILD's environment only.
//   · the thread id, which is the hook payload's `session_id` (verified: accepted verbatim).
//   · a thread with at least one persisted turn. A session that has not run one yet answers
//     `no rollout found for thread id …` — the note stays queued and we log `codex-no-thread`.
//
// Idleness is NOT required: a busy thread queues and autostarts later, which is exactly what we want.
//
// USAGE (debugging only; note-flush calls the function)
//   inbox-codex --to <slug> --text "<line>" [--timeout-ms 20000] [--home <dir>] [--codex <cmd>] [--json]

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NoteError } from './envelope.mjs';
import { readInboxes, removeInbox, findOnPath, isMainModule, toPosix, appendFlushLog } from './transport.mjs';

const execFileAsync = promisify(execFile);

/**
 * `codex queue` starts its own in-process app-server and opens a SQLite store, so it is not instant —
 * on Netcup the spike took a little over a second. 20 s is generous and still bounded, and the drain's
 * own per-entry budget bounds it again from outside.
 */
export const DEFAULT_QUEUE_TIMEOUT_MS = 20_000;

/** Where a `codex` lives when PATH does not know about it, tried in this order after PATH. */
export const CODEX_FALLBACKS = [
  { rel: '.local/bin/codex', why: '~/.local/bin/codex' },
  { rel: '.local/share/fnm/aliases/default/bin/codex', why: 'fnm default alias' },
  { rel: '.bun/bin/codex', why: '~/.bun/bin/codex' },
];
/** Absolute paths outside $HOME worth a look — Homebrew on both architectures. */
export const CODEX_ABSOLUTE_FALLBACKS = ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'];

/**
 * Resolve the `codex` CLI the way the shims do: PATH first, then the known install locations. The
 * reason is the same one `resolveOrcaCommand` has: a hook or a systemd timer runs in a NON-LOGIN shell
 * with no fnm and no `~/.local/bin` on PATH, where a bare `codex` is `spawn codex ENOENT` and a peer
 * note silently never arrives.
 *
 * Returns what it tried, so a failure can say where we looked.
 */
export function resolveCodexCommand(explicit, env = process.env, deps = {}) {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const platform = deps.platform ?? process.platform;
  const home = toPosix(deps.home ?? os.homedir());
  const tried = [];

  if (explicit) return { exe: String(explicit), source: '--codex', tried };
  if (env.CODEX_CLI) return { exe: String(env.CODEX_CLI), source: '$CODEX_CLI', tried };

  tried.push('codex on PATH');
  if (findOnPath('codex', env, { existsSync, platform })) return { exe: 'codex', source: 'PATH', tried };

  for (const f of CODEX_FALLBACKS) {
    const candidate = path.posix.join(home, f.rel);
    tried.push(candidate);
    if (existsSync(candidate)) return { exe: candidate, source: f.why, tried };
  }
  for (const candidate of CODEX_ABSOLUTE_FALLBACKS) {
    tried.push(candidate);
    if (existsSync(candidate)) return { exe: candidate, source: candidate, tried };
  }
  return { exe: 'codex', source: 'not found', tried };
}

/** The exact error `codex queue` gives for a thread with no persisted turn yet. */
export const NO_THREAD_RE = /no rollout found for thread id/i;

/**
 * Queue `text` at one registered `codex-queue` inbox.
 *
 * Resolves — never rejects — with:
 *   · `{ ok: true, delivered: true, reason: 'delivered' }`
 *   · `{ ok: false, reason: 'codex-no-thread' }`   the thread has no turn yet; leave it queued
 *   · `{ ok: false, reason: 'codex-error', detail }`  any other non-zero exit, first stderr line only
 *   · `{ ok: false, reason: 'codex-timeout', detail }`
 *
 * `delivered` means the row is in the queue store, which is what wakes the session. Nothing here is
 * ever retried in a loop: a duplicate row would be a duplicate TURN in the recipient's session.
 */
export async function queueToCodexInbox(record, text, opts = {}) {
  const env = opts.env ?? process.env;
  const timeout = Number(opts.timeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS);
  const resolved = resolveCodexCommand(opts.codex, env, opts);
  const run = opts.execFile ?? execFileAsync;
  const args = ['queue', '--thread', String(record.threadId), '--message', String(text)];
  try {
    // argv array, never a shell string, so a `$` or a quote in the substance is inert. CODEX_HOME goes
    // into the CHILD's environment only — this process's own env is never mutated, because a flusher
    // that changed its own CODEX_HOME would poison every later entry in the same drain.
    const { stdout } = await run(resolved.exe, args, {
      env: codexChildEnv(env, record.codexHome),
      timeout, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, delivered: true, reason: 'delivered', detail: firstLine(stdout) };
  } catch (err) {
    if (err?.killed === true) {
      return { ok: false, delivered: false, reason: 'codex-timeout', detail: `codex queue timed out after ${timeout} ms and was killed` };
    }
    // C10: node's execFile error message is `Command failed: <exe> queue --thread <id> --message <the
    // whole envelope>`, so falling back to it puts the NOTE BODY in flush.log and in `--json`, in a file
    // whose retention is nobody's job. When both streams are empty we say only that it exited.
    const detail = firstLine(err?.stderr) || firstLine(err?.stdout)
      || (err?.message ? `codex queue exited ${err.code ?? '?'}` : '') || 'codex queue failed';
    if (NO_THREAD_RE.test(String(err?.stderr ?? '')) || NO_THREAD_RE.test(String(err?.stdout ?? '')) || NO_THREAD_RE.test(detail)) {
      return { ok: false, delivered: false, reason: 'codex-no-thread', detail };
    }
    if (err?.code === 'ENOENT') {
      return {
        ok: false, delivered: false, reason: 'codex-error',
        detail: `no codex CLI found. Looked at: ${resolved.tried.join(', ')}`,
      };
    }
    return { ok: false, delivered: false, reason: 'codex-error', detail };
  }
}

/**
 * The child's environment: ours, plus the target's CODEX_HOME, MINUS this session's inbox credential
 * (review S3).
 *
 * note-flush runs as a piggyback inside a Claude Code session in the normal case, so `env` carries
 * `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN` - the credential that lets any
 * holder start a turn in THIS session. `codex queue` needs neither, and what it does need it is given
 * explicitly. Handing another vendor's CLI a secret it never asked for, which then writes rollouts,
 * logs and crash reports inside a CODEX_HOME, is a leak waiting for somebody to paste a bug report.
 */
export function codexChildEnv(env, codexHome) {
  const child = { ...env, CODEX_HOME: String(codexHome) };
  delete child.CLAUDE_CODE_MESSAGING_SOCKET;
  delete child.CLAUDE_CODE_MESSAGING_TOKEN;
  return child;
}

/** First line, trimmed and bounded — flush.log is a scan target, and a CLI error can be a paragraph. */
function firstLine(value) {
  return String(value ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 200) ?? '';
}

/**
 * Queue at the inbox registered for `slug`.
 *
 * @returns {Promise<{ok: boolean, delivered: boolean, reason: string, detail?: string, kind?: string}>}
 */
export async function deliverToSlug(home, slug, text, opts = {}) {
  const fsImpl = opts.fsImpl ?? fs;
  const record = (opts.inboxes ?? readInboxes(home, fsImpl))[String(slug)];
  if (!record) return { ok: false, delivered: false, reason: 'no-inbox', detail: `nothing registered for ${slug}` };
  if (record.kind !== 'codex-queue') {
    return { ok: false, delivered: false, reason: 'codex-error', detail: `${slug} is registered as ${record.kind}, not codex-queue` };
  }
  // C7: a CODEX_HOME recorded on another machine names a queue store that is not this one. Refuse and
  // drop it rather than writing a row into whatever happens to live at that path here.
  const host = opts.hostname ?? os.hostname();
  if (record.host && record.host !== host) {
    removeInbox(home, slug, { fs: fsImpl });
    if (opts.inboxes) delete opts.inboxes[String(slug)];
    return {
      ok: false, delivered: false, reason: 'no-inbox',
      detail: `${slug} is registered on "${record.host}", not "${host}" - registration dropped`,
    };
  }
  const verdict = await queueToCodexInbox(record, text, opts);
  return { ...verdict, kind: 'codex-queue' };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const STRING_FLAGS = new Set(['to', 'text', 'timeout-ms', 'home', 'codex']);
const BOOL_FLAGS = new Set(['json', 'help']);

export function parseInboxArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new NoteError(1, `unexpected argument "${a}"`);
    const name = a.slice(2);
    if (BOOL_FLAGS.has(name)) { out[name] = true; continue; }
    if (!STRING_FLAGS.has(name)) throw new NoteError(1, `unknown flag --${name}`);
    const value = argv[++i];
    if (value === undefined) throw new NoteError(1, `--${name} needs a value`);
    out[name] = value;
  }
  return out;
}

const USAGE = `inbox-codex — queue one line at a Codex session, which turns on it when it next goes idle.

  inbox-codex --to <slug> --text "<line>" [--timeout-ms 20000] [--home <dir>] [--codex <cmd>] [--json]

The thread id and CODEX_HOME come from ~/.agents/notes/inboxes.json, which that session's own hook
wrote. note-flush calls this code in-process; the CLI is for debugging.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) { process.stdout.write(USAGE); return 0; }
  const args = parseInboxArgs(argv);
  const home = toPosix(args.home ?? os.homedir());
  if (!args.to || !args.text) { process.stdout.write(USAGE); return 1; }
  const result = await deliverToSlug(home, args.to, args.text, {
    codex: args.codex,
    ...(args['timeout-ms'] === undefined ? {} : { timeoutMs: Number(args['timeout-ms']) }),
  });
  process.stdout.write(args.json ? `${JSON.stringify(result)}\n` : `inbox-codex: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}\n`);
  appendFlushLog(home, `${new Date().toISOString()} inbox-codex ${args.to} ${result.reason}`);
  return result.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exitCode = await main();
