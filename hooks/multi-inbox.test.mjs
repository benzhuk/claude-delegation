// multi-inbox — SessionStart registration only. Driven exactly like delegation-reminder.test.mjs
// drives its hook: the REAL hooks/multi-inbox.js as a child process, a fixture HOME/AGENTS_HOME,
// crafted stdin JSON, and assertions on the FILESYSTEM the hook produces — never stdout alone.
//
// This file is narrow on purpose (PB-C1 / package-build/P1): `skills/multi/scripts/hooks.test.mjs`
// already covers the full note-delivery surface (UserPromptSubmit/Stop/PostToolUse, D2's
// registration cases). What is missing there, and what the ladder's first live run actually turned
// on, is the specific SessionStart shape: (a) a pane with NOTE_SLUG set at launch registers, and
// (b) a pane with neither NOTE_SLUG nor ORCA_TERMINAL_HANDLE set writes nothing at all —
// `couldBeInAPane()` (multi-inbox.js:129-131) returning false, proved by the absence of any write,
// not by asserting the private function directly (it is not exported, and must not become exported
// just to test it).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import { inboxesPath, readInboxes } from '../skills/multi/scripts/transport.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOOK = path.join(REPO, 'hooks', 'multi-inbox.js');
const SESSION_ID = 'fixture-session-p1-0001';

/** A fixture HOME whose `.agents` is the AGENTS_HOME the child will use — never the real home. */
function fixtureHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'multi-inbox-home-'));
}

/** This session's messaging coordinates: without both, `claudeInboxRecord` refuses to build a
 * record and nothing is written, whatever the slug is (transport.mjs:1469). */
const SOCKET = '/tmp/cc-socks/p1-fixture-4242.sock';
const TOKEN = 'p1-fixture-token-must-never-be-printed';

/** Run the hook exactly as Claude Code does: JSON on stdin, the event name in argv, and a HOME that
 * points at the fixture. Every child goes through childEnv() — no bare process.env spread (suite
 * rule N2, enforced mechanically by skills/multi/scripts/hooks.test.mjs's own N2 test). */
function runSessionStart(home, over = {}) {
  const stdout = execFileSync(process.execPath, [HOOK, 'SessionStart'], {
    input: JSON.stringify({
      hook_event_name: 'SessionStart',
      cwd: home,
      session_id: SESSION_ID,
      source: 'startup',
    }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, ...over }),
  });
  return stdout;
}

test('(a) SessionStart with NOTE_SLUG set registers an entry addressable by that slug under the fixture home', () => {
  const home = fixtureHome();
  const stdout = runSessionStart(home, {
    NOTE_SLUG: 'p1-fixture-pane',
    ORCA_TERMINAL_HANDLE: '',
    CLAUDE_CODE_MESSAGING_SOCKET: SOCKET,
    CLAUDE_CODE_MESSAGING_TOKEN: TOKEN,
  });

  // Registration-only contract (C4, multi-inbox.js:206-209): SessionStart never emits anything.
  assert.equal(stdout.trim(), '', 'SessionStart registers only — no context, nothing on stdout');

  // Assert on what the real transport.registerInbox actually wrote, under the fixture home.
  const file = inboxesPath(home);
  assert.ok(fs.existsSync(file), `registerInbox must have written ${file}`);
  const inboxes = readInboxes(home);
  assert.ok(Object.prototype.hasOwnProperty.call(inboxes, 'p1-fixture-pane'), 'the slug must be addressable in the ledger');
  const rec = inboxes['p1-fixture-pane'];
  assert.equal(rec.kind, 'claude-socket');
  assert.equal(rec.socket, SOCKET);
  assert.equal(rec.sessionId, SESSION_ID, 'pinned to the session that registered it (C6)');
});

test('(b) SessionStart with neither NOTE_SLUG nor ORCA_TERMINAL_HANDLE writes nothing at all', () => {
  const home = fixtureHome();
  const stdout = runSessionStart(home, {
    NOTE_SLUG: '',
    ORCA_TERMINAL_HANDLE: '',
    CLAUDE_CODE_MESSAGING_SOCKET: SOCKET,
    CLAUDE_CODE_MESSAGING_TOKEN: TOKEN,
  });

  assert.equal(stdout.trim(), '', 'no pane identity: nothing printed either');

  // couldBeInAPane() is false, so main() returns before anything runs: no inboxes.json, no notes
  // directory, nothing at all under the fixture .agents — the absence of any write, not merely the
  // absence of stdout, is the mechanism under test here.
  const notesDir = path.join(home, '.agents', 'notes');
  assert.equal(fs.existsSync(notesDir), false, 'no notes directory may be created when there is no pane identity');
  assert.equal(fs.existsSync(inboxesPath(home)), false, 'inboxes.json must not exist at all');
});
