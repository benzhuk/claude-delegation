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

import { HANDLE_RE, readBindings, isMainModule, toPosix } from '../skills/multi/scripts/transport.mjs';
import { runNoteInbox } from '../skills/multi/scripts/note-inbox.mjs';
import { runHookEvent } from './multi-hook-core.mjs';

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
  const env = deps.env ?? process.env;
  const home = toPosix(deps.home ?? os.homedir());
  const fsImpl = deps.fsImpl ?? fs;
  const me = deps.slug ? { slug: deps.slug, source: 'deps' } : codexSlug(env, home, fsImpl);
  if (!me) return null; // not a peer session: no identity, nothing to read, nothing to say

  const event = String(input.hook_event_name ?? '');
  const cwd = input.cwd ?? process.cwd();
  const run = deps.inbox ?? ((argv) => runNoteInbox(argv, { cwd, env, home }));

  return runHookEvent({
    event,
    input,
    cwd,
    home,
    env,
    fsImpl,
    now: deps.now ?? Date.now(),
    // `--me` is what binds this handle to this slug, so every turn re-states the identity that makes
    // the pane reachable by `--to <slug>` however Codex has retitled it.
    inbox: (argv) => run(['--me', me.slug, ...argv]),
  });
}

async function main() {
  const input = await readStdin();
  let output = null;
  try {
    output = await runCodexHook(input);
  } catch {
    output = null; // rule 1: a broken hook must never be a broken session
  }
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  return 0;
}

// Symlink-tolerant entry check: the mirror publishes this tree as a symlink on macOS and Linux, and a
// naive `url === argv[1]` comparison silently no-ops there.
if (isMainModule(import.meta.url)) {
  main()
    .catch(() => { /* never a non-zero exit, never a stack trace on stdout */ })
    .finally(() => { process.exit(0); });
}

export const SELF = fileURLToPath(import.meta.url);
export const HOOK_DIR = path.dirname(SELF);
