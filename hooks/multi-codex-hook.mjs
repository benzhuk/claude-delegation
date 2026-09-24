#!/usr/bin/env node
// multi-codex-hook — the Codex half of hook delivery (spec 2026-09-14, D3).
//
// Until now a Codex session had to run `note-inbox --me <slug> --ack` by hand at the start of every
// turn, because Codex has no interrupt path and `notify` only fires at a turn END. Codex 0.154 has
// hooks, and they are strictly better: SessionStart, UserPromptSubmit, PostToolUse and Stop all reach
// the model through `hookSpecificOutput.additionalContext`, and `systemMessage` reaches BEN, in the
// transcript, without a character landing in the composer he types into.
//
// WIRING is not manual: `scripts/mirror-shared-skills.mjs` writes `$CODEX_HOME/hooks.json` and the
// matching `[hooks.state]` trust entries into every Codex home on every `chezmoi apply`. Hooks are
// SILENTLY SKIPPED until trusted, so the trust half is not optional.
//
// WHAT THE SPIKE SETTLED (D8, live on Netcup, codex-cli 0.154.0):
//   · a hook INHERITS the parent environment — unlike `notify`, which Codex `env_clear`s. So
//     `$NOTE_SLUG` and `$ORCA_TERMINAL_HANDLE` are both readable here, and the slug needs no new state.
//   · the payload carries `cwd`, and the process starts there.
//   · `session_id` is stable across turns; `SessionStart` fires again on every `exec resume`, so
//     everything this file does must be idempotent.
//
// RULES: never throw, never print anything but one JSON object, exit 0 always. A hook that fails is a
// session Ben has to debug.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HANDLE_RE, readBindings, isMainModule, toPosix, codexInboxRecord, registerInbox,
} from '../skills/multi/scripts/transport.mjs';
import { runNoteInbox } from '../skills/multi/scripts/note-inbox.mjs';
import { runHookEvent, writeJson, BUDGET_MS, POST_TOOL_BUDGET_MS } from './multi-hook-core.mjs';

// Native child metadata is the only positive child discriminator used here.  The hook input may
// inherit the parent's pane handle, so handles and slugs must never classify a child.  Keep the
// first-line probe deliberately small: transcript contents are private and unknown input stays on
// the working lead path.
export const SESSION_META_MAX_BYTES = 256 * 1024;
const SESSION_META_CHUNK_BYTES = 8 * 1024;
const CODEX_SESSION_ID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Return true only for an authentic, self-consistent native subagent session metadata record. */
export function isConfirmedCodexChild(input = {}, fsImpl = fs) {
  const transcriptPath = input?.transcript_path;
  const sessionId = input?.session_id;
  if (typeof transcriptPath !== 'string' || !transcriptPath || typeof sessionId !== 'string' || !sessionId) return false;

  let fd;
  try {
    fd = fsImpl.openSync(transcriptPath, 'r');
    let total = 0;
    const parts = [];
    let firstLine = null;
    while (total <= SESSION_META_MAX_BYTES) {
      const bytes = Buffer.alloc(Math.min(SESSION_META_CHUNK_BYTES, SESSION_META_MAX_BYTES + 1 - total));
      const read = fsImpl.readSync(fd, bytes, 0, bytes.length, null);
      if (!read) return false;
      const chunk = bytes.subarray(0, read);
      const newline = chunk.indexOf(0x0a);
      if (newline >= 0) {
        if (total + newline > SESSION_META_MAX_BYTES) return false;
        parts.push(chunk.subarray(0, newline));
        firstLine = Buffer.concat(parts).toString('utf8');
        break;
      }
      parts.push(chunk);
      total += read;
    }
    // A metadata line that does not fit is intentionally unknown, never a child guess.
    if (firstLine === null) return false;
    const meta = JSON.parse(firstLine);
    const payload = meta?.payload;
    const spawn = payload?.source?.subagent?.thread_spawn;
    const parent = spawn?.parent_thread_id;
    return meta?.type === 'session_meta'
      && payload?.id === sessionId
      && typeof parent === 'string'
      && CODEX_SESSION_ID_RE.test(parent)
      && parent !== sessionId
      && Number.isInteger(spawn?.depth)
      && spawn.depth >= 1;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fsImpl.closeSync(fd); } catch { /* unknown metadata keeps normal lead behavior */ }
    }
  }
}

/**
 * Which pane is this? `$NOTE_SLUG` is the session stating its own identity; the binding is the same
 * statement, made earlier and written down (`panes.json`, keyed by handle). Nothing else is consulted:
 * a title-derived guess would make one session read another's inbox, and Codex titles are conversation
 * summaries, not slugs.
 */
export function codexSlug(env = process.env, home = os.homedir(), fsImpl = fs) {
  if (env.NOTE_SLUG) return { slug: String(env.NOTE_SLUG), source: '$NOTE_SLUG' };
  const handle = env.ORCA_TERMINAL_HANDLE;
  if (!handle || !HANDLE_RE.test(String(handle))) return null;
  const bound = readBindings(toPosix(home), fsImpl)[String(handle)];
  return bound?.slug ? { slug: bound.slug, source: 'panes.json', handle: String(handle) } : null;
}

export function readStdin(stream = process.stdin) {
  return new Promise((resolve) => {
    let raw = '';
    stream.setEncoding('utf8');
    stream.on('data', (d) => { raw += d; });
    stream.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
    stream.on('error', () => resolve({}));
  });
}

/**
 * @param {object} input   the JSON Codex wrote to our stdin
 * @param {object} deps    { env, home, fsImpl, inbox, now } — injectable for tests
 * @returns {Promise<object|null>} the object to print, or null for silence
 */
export async function runCodexHook(input = {}, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  // This is before slug resolution: children can inherit a parent pane handle and must not register
  // or consume that lead's inbox. Missing, corrupt, mismatched, or oversized metadata stays lead-like.
  if (isConfirmedCodexChild(input, fsImpl)) return null;
  const env = deps.env ?? process.env;
  const home = toPosix(deps.home ?? os.homedir());
  const me = deps.slug ? { slug: deps.slug, source: 'deps' } : codexSlug(env, home, fsImpl);
  if (!me) return null; // not a peer session: no identity, nothing to read, nothing to say

  const event = String(input.hook_event_name ?? '');
  // Codex names the event on stdin and nowhere else, so no event means we could not parse the payload.
  // Treating that as UserPromptSubmit would read, ack and emit under the wrong label for an event we do
  // not handle at all, like PermissionRequest (review MINOR 5).
  if (!event) return null;

  const cwd = input.cwd ?? process.cwd();

  // D2 (spec 2026-09-17): register this session's inbox — the on-disk queue Codex itself watches.
  // `session_id` from this payload IS the thread id `codex queue --thread` accepts (spiked live on
  // 2026-09-17), so nothing new has to be plumbed through. Best-effort and silent: `registerInbox`
  // never throws, and a registration that fails costs one deferred nudge, never a note.
  registerInbox(
    home,
    me.slug,
    codexInboxRecord(env, { threadId: input.session_id, cwd, pid: deps.pid ?? process.ppid, home }),
    { fs: fsImpl, now: deps.now ?? Date.now() },
  );

  const run = deps.inbox ?? ((argv) => runNoteInbox(argv, { cwd, env, home }));
  // PostToolUse fires on every tool call: no repo scan, and therefore no git, on the hot path. The
  // Claude adapter has always done this; the Codex one was paying for it every call (review MINOR 8).
  const hot = event === 'PostToolUse' ? ['--no-repo'] : [];
  const me9 = ['--me', me.slug];

  const result = await runHookEvent({
    event,
    input,
    cwd,
    home,
    env,
    fsImpl,
    now: deps.now ?? Date.now(),
    // `--me` is what binds this handle to this slug, so every turn re-states the identity that makes
    // the pane reachable by `--to <slug>` however Codex has retitled it.
    inbox: (argv) => run([...me9, ...hot, ...argv]),
  });
  if (!result) return null;
  // The ack the caller runs AFTER the output is on the wire, never before it (review MAJOR 3).
  return { ...result, ack: (ids) => run([...me9, ...hot, '--ack-ids', ids.join(',')]) };
}

async function main() {
  const input = await readStdin();
  const event = String(input?.hook_event_name ?? '');
  let result = null;
  try {
    // Every event but Stop is bounded here; Stop is bounded by its handler timeout (60 s) instead, so
    // a slow inbox read cannot lose a delivery the model was about to be blocked on. It does not park
    // (2026-09-16 ruling). Before this the Codex adapter had no ceiling at all (review MINOR 8).
    const work = runCodexHook(input);
    result = event === 'Stop'
      ? await work
      : await withBudget(work, event === 'PostToolUse' ? POST_TOOL_BUDGET_MS : BUDGET_MS);
  } catch {
    result = null; // rule 1: a broken hook must never be a broken session
  }
  if (!result?.output) return 0;

  // Emit FIRST and wait for the write to reach the pipe, THEN ack exactly what was printed. Either half
  // failing costs a repeated note, never a lost one (review MAJOR 3, MAJOR 4).
  await writeJson(result.output);
  if (result.ackIds?.length && result.ack) {
    try { await result.ack(result.ackIds); } catch { /* delivered; it will simply repeat */ }
  }
  return 0;
}

function withBudget(work, ms) {
  let timer;
  return Promise.race([
    work,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); timer.unref?.(); }),
  ]).finally(() => clearTimeout(timer));
}

// Symlink-tolerant entry check: the mirror publishes this tree as a symlink on macOS and Linux, and a
// naive `url === argv[1]` comparison silently no-ops there.
if (isMainModule(import.meta.url)) {
  main()
    .catch(() => { /* never a non-zero exit, never a stack trace on stdout */ })
    .finally(() => {
      // The exit stays — a hook that lingers is a turn that will not end. What changed is WHEN we reach
      // it: `writeJson` resolves on the stdout callback and the ack is awaited after it, so the pipe has
      // taken the whole object by now. Exiting BEFORE the flush is what truncates a 1-2 KB Stop reason
      // on Windows (review MAJOR 4).
      process.exit(0);
    });
}

export const SELF = fileURLToPath(import.meta.url);
export const HOOK_DIR = path.dirname(SELF);
