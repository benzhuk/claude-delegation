#!/usr/bin/env node
// note-notify — Codex's wake-up (spec V4).
//
// Codex has no interrupt path. The pilot measured it: not one note typed at the `astra` pane landed
// after 10:13, because Codex was mid-turn for 50–210 minute stretches and does not queue typed input.
// What Codex DOES have is `notify`: a program it spawns when a turn ends — which is the one moment a
// Codex pane is provably idle. So this wrapper turns "turn ended" into "drain the outbox now".
//
// WIRING (machine-local `~/.codex/config.toml`, NOT chezmoi-managed):
//
//   notify = ["node", "/home/ben/.agents/skills/multi/scripts/note-notify.mjs", "--to", "astra"]
//
// On Windows:
//   notify = ["node", "C:/Users/benzh/.agents/skills/multi/scripts/note-notify.mjs", "--to", "astra",
//             "--chain", "C:/path/to/previous-notify.exe"]
//
// VERIFIED CONTRACT (openai/codex, read 2026-09-13 — sources in the T1 report):
//   · `notify` is an argv array in config.toml; Codex runs it and APPENDS the event JSON as ONE extra
//     final argument (codex-rs/hooks/src/legacy_notify.rs: `command.arg(notify_payload)`).
//   · The payload is `{"type":"agent-turn-complete","thread-id":…,"turn-id":…,"cwd":…,"client":…,
//     "input-messages":[…],"last-assistant-message":…}` — kebab-case, `client` omitted when unset.
//     `agent-turn-complete` is the only event the legacy notify hook emits.
//   · stdin, stdout AND stderr are all `Stdio::null()`, and Codex only `spawn()`s — it never waits and
//     never reads a result. So: nothing we print reaches anybody, and we cannot delay or influence
//     Codex. `~/.agents/notes/flush.log` is our ONLY diagnostic channel; every run writes one line.
//   · The child's environment is `env_clear()` + Codex's curated shell environment. A variable you set
//     in the pane (NOTE_SLUG, NOTE_NOTIFY_CHAIN, ORCA_TERMINAL_HANDLE) may NOT survive into this
//     process. That is why `--to` and `--chain` exist as flags on the config line: put them there.
//
// USAGE
//   note-notify [--to <slug>] [--chain <command>] [--max-ms 9000] [--orca <cmd>] [--json] [<payload-json>]
//
// BEHAVIOUR, in order
//   1. Chain first, detached: if `--chain` (or $NOTE_NOTIFY_CHAIN) names a previous notify target, spawn
//      it with the SAME final payload argument and do not wait. Ben's ding must not queue behind a drain.
//   2. Work out which pane this is: --to, else $NOTE_SLUG, else $ORCA_TERMINAL_HANDLE, else the unique
//      Codex pane whose worktreePath is the payload's `cwd`. Never guessed past that.
//   3. `note-flush --to <slug>` in-process, inside the remaining budget.
//   4. Exit 0, always, within ~10 s. A notify wrapper that throws or hangs is a wrapper Ben rips out.

import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';

import {
  toPosix, makeOrcaRunner, resolveSlug, titleToSlug, appendFlushLog, isMainModule, withDeadline,
} from './transport.mjs';
import { drainQuietly } from './note-flush.mjs';

/** Codex does not wait for us, but a process that never exits piles up one per turn. */
export const DEFAULT_MAX_MS = 9_000;
/** Leave room for the drain to finish and the log line to be written. */
const DRAIN_RESERVE_MS = 1_000;

const STRING_FLAGS = new Set(['to', 'chain', 'max-ms', 'orca']);
const BOOL_FLAGS = new Set(['json', 'help', 'no-chain', 'dry-run']);

/**
 * Our own flags, plus Codex's payload — which arrives as a bare trailing argument, not a flag. Anything
 * that is not a recognised flag and parses as a JSON object is the payload; anything else is ignored
 * rather than fatal, because a future Codex could append a second argument and this must not start
 * failing then.
 */
export function parseNotifyArgs(argv) {
  const out = { extra: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (BOOL_FLAGS.has(name)) { out[name] = true; continue; }
      if (STRING_FLAGS.has(name)) {
        const value = argv[++i];
        if (value === undefined) { out.extra.push(a); continue; }
        out[name] = value;
        continue;
      }
      out.extra.push(a);
      continue;
    }
    const parsed = tryJson(a);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) out.payload = parsed;
    else out.extra.push(a);
  }
  return out;
}

function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** A chain command may be a JSON argv array (exact) or a plain string (split on whitespace). */
export function parseChain(raw) {
  if (!raw) return null;
  const asJson = tryJson(raw);
  if (Array.isArray(asJson) && asJson.length > 0) return asJson.map(String);
  const parts = String(raw).trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

/**
 * Codex's payload carries no pane identity — only `cwd`. When the environment has been cleared and no
 * `--to` was configured, the unique Codex pane working in that directory is the answer. Two candidates
 * is not an answer: this returns null rather than waking the wrong session.
 */
export function slugFromCwd(terminals, cwd) {
  if (!cwd) return null;
  const want = toPosix(cwd).replace(/\/+$/, '').toLowerCase();
  const matches = (Array.isArray(terminals) ? terminals : []).filter((t) => {
    if (String(t.agentIdentity ?? '').toLowerCase() !== 'codex') return false;
    return toPosix(t.worktreePath ?? '').replace(/\/+$/, '').toLowerCase() === want;
  });
  return matches.length === 1 ? titleToSlug(matches[0].title) : null;
}

/**
 * @param {string[]} argv
 * @param {object} deps - { fsImpl, home, env, orca, now, spawnImpl, flush } — injectable for tests.
 */
export async function runNoteNotify(argv, deps = {}) {
  const args = parseNotifyArgs(argv);
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const home = toPosix(deps.home ?? os.homedir());
  const now = deps.now ?? Date.now();
  const clock = deps.clock ?? (() => Date.now());
  const spawnImpl = deps.spawnImpl ?? spawn;
  const dryRun = Boolean(args['dry-run']);
  const maxMs = args['max-ms'] !== undefined ? Number(args['max-ms']) : DEFAULT_MAX_MS;
  const started = clock();
  const payload = args.payload ?? null;
  const event = payload?.type ?? null;

  // ── 1. Chain first. Ben's Windows config chains a computer-use exe; that ding must fire immediately
  //       whether or not there is anything to flush, and whether or not the drain works at all.
  let chained = null;
  const chain = args['no-chain'] ? null : parseChain(args.chain ?? env.NOTE_NOTIFY_CHAIN);
  if (chain) {
    const chainArgs = [...chain.slice(1)];
    // Hand the chained program the same final argument Codex handed us, so an existing notify script
    // keeps working unchanged behind this wrapper.
    if (payload) chainArgs.push(JSON.stringify(payload));
    if (!dryRun) {
      try {
        const child = spawnImpl(chain[0], chainArgs, { detached: true, stdio: 'ignore', windowsHide: true });
        if (typeof child?.unref === 'function') child.unref();
        chained = { ok: true, command: chain[0] };
      } catch (err) {
        chained = { ok: false, command: chain[0], error: err?.message ?? String(err) };
      }
    } else {
      chained = { ok: true, command: chain[0], dryRun: true };
    }
  }

  // ── 2. Which pane is this?
  let slug = null;
  let slugSource = null;
  let orca = null;
  try {
    orca = deps.orca ?? makeOrcaRunner(args.orca, env);
  } catch { orca = null; }

  // H4: slug resolution can reach orca, so it gets its own slice of the budget. Without a bound here,
  // one hung `terminal show` would blow the "within ~10 s" promise before the drain even starts, and
  // leave one stuck node process per Codex turn end.
  const identifyBudget = Math.max(0, Math.min(maxMs / 3, maxMs - (clock() - started)));
  await withDeadline((async () => {
    try {
      // allowActiveTerminal: false — the focused pane is not necessarily the pane whose turn ended.
      const r = await resolveSlug({ explicit: args.to, env, home, fsImpl, orca, now, allowActiveTerminal: false });
      slug = r.slug;
      slugSource = r.source;
    } catch {
      if (orca && payload?.cwd) {
        const terminals = await orca(['terminal', 'list', '--json']).then((r) => r?.terminals).catch(() => null);
        slug = slugFromCwd(terminals, payload.cwd);
        if (slug) slugSource = 'payload cwd (unique Codex pane)';
      }
    }
  })(), identifyBudget, undefined);

  // ── 3. Drain, inside whatever budget is left.
  const budget = Math.max(0, maxMs - (clock() - started) - DRAIN_RESERVE_MS);
  const flush = deps.flush ?? drainQuietly;
  const drained = (!dryRun && budget > 0)
    ? await flush({ fsImpl, home, env, orca, now }, { to: slug ?? undefined, maxMs: budget, orca: args.orca })
    : { drained: 0, attempted: 0, remaining: 0, results: [] };

  const result = {
    ok: true, exitCode: 0, event, slug, slugSource, chained,
    drained: drained.drained ?? 0, attempted: drained.attempted ?? 0, remaining: drained.remaining ?? 0,
    elapsedMs: clock() - started, dryRun,
  };

  // stdout goes to /dev/null under Codex. This log line is the only way a broken wiring is ever seen.
  if (!dryRun) {
    appendFlushLog(
      home,
      `${new Date(now).toISOString()} notify event=${event ?? 'none'} slug=${slug ?? 'unknown'}`
      + `(${slugSource ?? 'unresolved'}) drained=${result.drained} remaining=${result.remaining}`
      + `${chain ? ` chain=${chained?.ok ? 'spawned' : `FAILED ${chained?.error}`}` : ''}`,
      fsImpl,
    );
  }
  return result;
}

const USAGE = `note-notify — Codex turn-end wake-up: drain the peer-note outbox, then chain the previous notify.

  notify = ["node", "~/.agents/skills/multi/scripts/note-notify.mjs", "--to", "<pane-slug>"]

  --to <slug>      this pane's slug. PUT IT HERE: Codex clears the environment before spawning notify,
                   so $NOTE_SLUG may not reach this process.
  --chain <cmd>    a previous notify target to spawn with the same payload (else $NOTE_NOTIFY_CHAIN).
  --max-ms <n>     total budget, default 9000.

Codex appends its event JSON as the final argument and discards our output; every run writes one line
to ~/.agents/notes/flush.log. Exit 0 always.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) { process.stdout.write(USAGE); return 0; }
  try {
    const result = await runNoteNotify(argv);
    if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    // Deliberately silent and successful: Codex discards our streams, and a non-zero exit from a notify
    // wrapper is a thing people debug for an hour. The flush.log line above is the signal.
  }
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main();
