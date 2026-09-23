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
import { inboxesPath, readInboxes, readBindings } from '../skills/multi/scripts/transport.mjs';

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

function runHook(home, event, input = {}, over = {}) {
  return execFileSync(process.execPath, [HOOK, event], {
    input: JSON.stringify({ hook_event_name: event, cwd: home, session_id: SESSION_ID, ...input }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, ...over }),
  });
}

function snapshotTree(root) {
  const entries = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      const relative = path.relative(root, file);
      if (entry.isDirectory()) visit(file);
      else entries.push([relative, fs.readFileSync(file).toString('base64')]);
    }
  };
  visit(root);
  return entries;
}

function seedPopulatedLeadState(home) {
  const notes = path.join(home, '.agents', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'inboxes.json'), JSON.stringify({
    version: 1,
    inboxes: {
      'lead-pane': {
        kind: 'claude-socket', at: 1, pid: 2, host: 'fixture-host', cwd: home,
        socket: SOCKET, token: TOKEN, sessionId: SESSION_ID,
      },
    },
  }), 'utf8');
  fs.writeFileSync(path.join(notes, '.cursor-lead-pane'), JSON.stringify({
    version: 1, slug: 'lead-pane', updatedAt: new Date().toISOString(), seen: { earlier: TODAY }, cold: {},
  }), 'utf8');
  fs.writeFileSync(path.join(notes, '.poll-lead-pane'), '123456', 'utf8');
  fs.writeFileSync(path.join(notes, 'panes.json'), JSON.stringify({
    term_fixture: { slug: 'lead-pane', at: 1 },
  }), 'utf8');
  mirrorNoteFor(home, 'child-populated-state-1', 'lead-pane');
  return notes;
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

// ─────────────────────────────────────────────────────────────────────────────
// F1/F6 (rename-build spec, Contract 2a/2d) — the pane gate moves to AFTER readInput(), and now also
// opens on a resolved session name; the SessionStart nudge fires only when NO slug resolves at all.
// ─────────────────────────────────────────────────────────────────────────────

/** A fixture sidecar at `<dirname(transcriptPath)>/<sessionId>/custom-title.json`, per D1/D2's layout
 * (the scout's own correction: the transcript lives in the project dir, one level ABOVE the sidecar's
 * own session-id subdir — not inside it). */
function writeSidecar(home, sessionId, customTitle) {
  const projectDir = path.join(home, 'fixture-project');
  const sidecarDir = path.join(projectDir, sessionId);
  fs.mkdirSync(sidecarDir, { recursive: true });
  fs.writeFileSync(path.join(sidecarDir, 'custom-title.json'), JSON.stringify({ customTitle }), 'utf8');
  return path.join(projectDir, `${sessionId}.jsonl`);
}

test('(c) F1: neither env var set, but a real sidecar resolves a session name — still registers', () => {
  const home = fixtureHome();
  const sessionId = 'fixture-session-p1-0002';
  const transcriptPath = writeSidecar(home, sessionId, 'My Renamed Session');
  const stdout = execFileSync(process.execPath, [HOOK, 'SessionStart'], {
    input: JSON.stringify({
      hook_event_name: 'SessionStart', cwd: home, session_id: sessionId,
      transcript_path: transcriptPath, source: 'startup',
    }),
    encoding: 'utf8',
    env: childEnv(home, {
      CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: '',
      CLAUDE_CODE_MESSAGING_SOCKET: SOCKET, CLAUDE_CODE_MESSAGING_TOKEN: TOKEN,
    }),
  });
  assert.equal(stdout.trim(), '', 'a named session registers silently, same as NOTE_SLUG would');
  const reg = readInboxes(home);
  assert.ok(Object.prototype.hasOwnProperty.call(reg, 'my-renamed-session'), 'the normalised slug must be addressable');
  assert.equal(reg['my-renamed-session'].sessionId, sessionId);
});

test('(d) D4/F6: SessionStart nudges a session that IS in the protocol (env var set) but resolves no slug at all', () => {
  const home = fixtureHome();
  const stdout = runSessionStart(home, {
    NOTE_SLUG: '',
    ORCA_TERMINAL_HANDLE: 'term_unboundp1',
    CLAUDE_CODE_MESSAGING_SOCKET: SOCKET,
    CLAUDE_CODE_MESSAGING_TOKEN: TOKEN,
  });
  const out = JSON.parse(stdout);
  assert.equal(out.suppressOutput, true);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(
    out.hookSpecificOutput.additionalContext,
    'This session has no name, so peer notes cannot reach it. Run /rename <slug> (lowercase, dashes) to register its inbox.',
  );
});

test('(e) D4: no nudge when the slug resolves through a binding alone (no NOTE_SLUG, no session name)', () => {
  const home = fixtureHome();
  fs.mkdirSync(path.join(home, '.agents', 'notes'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.agents', 'notes', 'panes.json'),
    JSON.stringify({ term_boundp1: { slug: 'bound-pane', at: Date.now() } }),
    'utf8',
  );
  const stdout = runSessionStart(home, {
    NOTE_SLUG: '',
    ORCA_TERMINAL_HANDLE: 'term_boundp1',
    CLAUDE_CODE_MESSAGING_SOCKET: SOCKET,
    CLAUDE_CODE_MESSAGING_TOKEN: TOKEN,
  });
  assert.equal(stdout.trim(), '', 'a resolved binding must not be treated as unnamed — no over-nudging');
  assert.equal(readInboxes(home)['bound-pane'].sessionId, SESSION_ID);
});

test('(f) D4/F6: a --fork-session resume (source=fork) gets the nudge too — hooks.json has no matcher to special-case it away', () => {
  const home = fixtureHome();
  const stdout = execFileSync(process.execPath, [HOOK, 'SessionStart'], {
    input: JSON.stringify({
      hook_event_name: 'SessionStart', cwd: home, session_id: 'forked-session-p1-0099', source: 'fork',
    }),
    encoding: 'utf8',
    env: childEnv(home, {
      CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_forkedp1',
      CLAUDE_CODE_MESSAGING_SOCKET: SOCKET, CLAUDE_CODE_MESSAGING_TOKEN: TOKEN,
    }),
  });
  const out = JSON.parse(stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /This session has no name/);
});

// ─────────────────────────────────────────────────────────────────────────────
// F3 (rename-build spec, Contract 2e) — the session's identity reaches UserPromptSubmit and Stop, not
// only PostToolUse. Required test, named per the brief.
// ─────────────────────────────────────────────────────────────────────────────

const nycParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).map((p) => [p.type, p.value]),
);
const TODAY = `${nycParts.year}-${nycParts.month}-${nycParts.day}`;
const STAMP = `${Number(nycParts.month)}.${Number(nycParts.day)}.${nycParts.year.slice(2)}`;
const CLOCK = `${nycParts.hour === '24' ? '00' : nycParts.hour}:${nycParts.minute}`;

function mirrorNoteFor(home, id, to, body = 'Please review PR 137') {
  const file = path.join(home, '.agents/notes', `${TODAY}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = `astra → ${to}, ${STAMP} ${CLOCK} NYC [${id}] ASK: ${body}.`;
  fs.writeFileSync(file, `# Peer-note ledger ${TODAY}\n\n${line}\n`, 'utf8');
  return file;
}

test('(g) F3: a session with a real sidecar and no NOTE_SLUG/binding receives a note via UserPromptSubmit', () => {
  const home = fixtureHome();
  const sessionId = 'fixture-session-p1-0003';
  const transcriptPath = writeSidecar(home, sessionId, 'astra-renamed');
  mirrorNoteFor(home, 'astra-fork-note-1', 'astra-renamed');
  const stdout = execFileSync(process.execPath, [HOOK, 'UserPromptSubmit'], {
    input: JSON.stringify({
      hook_event_name: 'UserPromptSubmit', cwd: home, session_id: sessionId, transcript_path: transcriptPath,
    }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: '' }),
  });
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /1 new peer note for astra-renamed/);
  assert.match(out.hookSpecificOutput.additionalContext, /\[astra-fork-note-1\]/);
});

test('(h) F3: the same renamed session also gets its note at Stop, not only UserPromptSubmit', () => {
  const home = fixtureHome();
  const sessionId = 'fixture-session-p1-0004';
  const transcriptPath = writeSidecar(home, sessionId, 'nucleus-renamed');
  mirrorNoteFor(home, 'astra-fork-note-2', 'nucleus-renamed');
  const stdout = execFileSync(process.execPath, [HOOK, 'Stop'], {
    input: JSON.stringify({
      hook_event_name: 'Stop', cwd: home, session_id: sessionId, transcript_path: transcriptPath,
    }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: '' }),
  });
  const out = JSON.parse(stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /\[astra-fork-note-2\]/);
});

// ─────────────────────────────────────────────────────────────────────────────
// F2 (rename-build spec, Contract 2c) — round-1 review MAJOR 2: `cheapSlug()`'s session-name rank had no
// test at all (deleting it wholesale still left the gate green), and its BLOCKER 1 corollary — a
// session-name slug must never be laundered into a `--me` binding — was likewise unpinned.
// ─────────────────────────────────────────────────────────────────────────────

test('(i) F2: a renamed session with no NOTE_SLUG and no binding receives a mid-turn note at PostToolUse', () => {
  const home = fixtureHome();
  const sessionId = 'fixture-session-p1-0005';
  const transcriptPath = writeSidecar(home, sessionId, 'f2-fixture-slug');
  mirrorNoteFor(home, 'f2-fixture-note-1', 'f2-fixture-slug');
  const stdout = execFileSync(process.execPath, [HOOK, 'PostToolUse'], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUse', cwd: home, session_id: sessionId, transcript_path: transcriptPath,
    }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: '' }),
  });
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /\[f2-fixture-note-1\]/);
});

test('(j) F2/BLOCKER 1: the session-name slug is first-hand, so PostToolUse writes no pane binding', () => {
  const home = fixtureHome();
  const sessionId = 'fixture-session-p1-0006';
  const transcriptPath = writeSidecar(home, sessionId, 'f2-fixture-bind');
  mirrorNoteFor(home, 'f2-fixture-note-2', 'f2-fixture-bind');
  const stdout = execFileSync(process.execPath, [HOOK, 'PostToolUse'], {
    input: JSON.stringify({
      hook_event_name: 'PostToolUse', cwd: home, session_id: sessionId, transcript_path: transcriptPath,
    }),
    encoding: 'utf8',
    env: childEnv(home, { CLAUDE_PLUGIN_ROOT: REPO, NOTE_SLUG: '', ORCA_TERMINAL_HANDLE: 'term_f2fixture' }),
  });
  const out = JSON.parse(stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /\[f2-fixture-note-2\]/, 'sanity: the note was still delivered');
  assert.deepEqual(
    readBindings(home), {},
    'a per-SESSION name must never become a permanent panes.json binding for the pane it happened to run in',
  );
});

test('(k) MINOR 6: a broken CLAUDE_PLUGIN_ROOT never tells a bound pane "this session has no name"', () => {
  const home = fixtureHome();
  fs.mkdirSync(path.join(home, '.agents', 'notes'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.agents', 'notes', 'panes.json'),
    JSON.stringify({ term_broken: { slug: 'bound-slug', at: Date.now() } }),
    'utf8',
  );
  // rank 3 (the binding) is unreachable when transport.mjs cannot be imported at all, so `slug` is
  // null for a reason that has nothing to do with the session's NAME — D4's line would be a lie.
  const stdout = runSessionStart(home, {
    CLAUDE_PLUGIN_ROOT: path.join(home, 'nowhere'),
    NOTE_SLUG: '',
    ORCA_TERMINAL_HANDLE: 'term_broken',
  });
  assert.equal(stdout.trim(), '', 'a broken plugin root is M1\'s message to deliver, not D4\'s');
});

test('(l) positive child agent_id preserves populated lead state across every delivery event', () => {
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']) {
    const home = fixtureHome();
    const notes = seedPopulatedLeadState(home);
    const before = snapshotTree(notes);
    const output = runHook(home, event, { agent_id: 'child-agent-42' }, {
      NOTE_SLUG: 'lead-pane', ORCA_TERMINAL_HANDLE: 'term_fixture',
      CLAUDE_CODE_MESSAGING_SOCKET: SOCKET, CLAUDE_CODE_MESSAGING_TOKEN: TOKEN,
    });
    assert.equal(output.trim(), '', `${event}: a child receives no lead context`);
    assert.deepEqual(snapshotTree(notes), before, `${event}: registry, cursor, stamp, binding, and inventory stay byte-for-byte unchanged`);
  }
});

test('(m) a positive child agent_id leaves absent lead state untouched, so the lead receives its pending note', () => {
  const home = fixtureHome();
  const notes = path.join(home, '.agents', 'notes');
  fs.mkdirSync(notes, { recursive: true });
  const guarded = [
    path.join(notes, 'inboxes.json'),
    path.join(notes, '.cursor-lead-pane'),
    path.join(notes, '.poll-lead-pane'),
    path.join(notes, 'panes.json'),
  ];
  mirrorNoteFor(home, 'child-must-not-consume-1', 'lead-pane');
  const before = new Map(guarded.map((file) => [file, fs.existsSync(file)]));

  const childOutput = runHook(home, 'PostToolUse', { agent_id: 'child-agent-42' }, {
    NOTE_SLUG: 'lead-pane', ORCA_TERMINAL_HANDLE: '',
  });
  assert.equal(childOutput.trim(), '', 'a child receives no lead context');
  for (const [file, exists] of before) {
    assert.equal(fs.existsSync(file), exists, `${path.basename(file)} must not change for a child`);
  }

  const leadOutput = runHook(home, 'UserPromptSubmit', {}, {
    NOTE_SLUG: 'lead-pane', ORCA_TERMINAL_HANDLE: '',
  });
  assert.match(leadOutput, /\[child-must-not-consume-1\]/, 'the lead still receives the pending note');
});
