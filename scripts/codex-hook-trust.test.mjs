// node --test "scripts/*.test.mjs"
// The Codex hook trust recipe, pinned to REAL values.
//
// The four hashes below were written by the Codex 0.154.0 TUI itself on Netcup, 2026-09-14, into a
// scratch CODEX_HOME whose hooks.json is reproduced verbatim in FIXTURE_* here ("Trust all and
// continue", then `cat config.toml`). They are the only check that our reimplementation of
// `hook_hash()` is right: get it wrong and every hook is silently skipped on every machine, with no
// error anywhere — which is exactly the failure mode this file exists to prevent.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  hookEventLabel, normalizeTimeout, canonicalJson, codexHookHash, trustKey, tomlBasicString,
  upsertHooksState, buildHooksJson, trustEntriesFor, nodeCommand, codexHomes, CODEX_EVENTS,
  mergeHooksJson, trustEntriesForPlacements, HOOK_MARKER,
} from './codex-hook-trust.mjs';

const FIXTURE_HOOKS_JSON = '/home/ben/tmp/hooktrust/home/hooks.json';
const FIXTURE_SCRIPT = '/home/ben/tmp/hooktrust/multi-codex-hook.mjs';
/** The commands in that fixture carried the event name as an argument; the hash covers the string. */
const fixtureCommand = (event) => `node ${FIXTURE_SCRIPT} ${event}`;

const REAL = [
  { event: 'PostToolUse', timeout: 30, hash: 'sha256:88f082d788c54d2e5cde03433d904155b38693f6624b40c994ca43b12bff6dd0' },
  { event: 'SessionStart', timeout: 30, hash: 'sha256:2f7a86594657d3e70a5df01286a75da3bc767de1c6bc95d93e5b6a30a4fca739' },
  { event: 'UserPromptSubmit', timeout: 30, hash: 'sha256:a5ef9a9923d289c746405ec61eb789be1a2c679bd8ffa698bf854c00c61fcd79' },
  { event: 'Stop', timeout: 1020, hash: 'sha256:e73bf488d4b74c09aabb35ca2903ec6ecf9742d67d5e72b85c680ffcf2622859' },
];

test('FIXTURE: our hash equals what the Codex TUI wrote, for all four events', () => {
  for (const { event, timeout, hash } of REAL) {
    assert.equal(codexHookHash({ command: fixtureCommand(event), timeout }, event, null), hash, event);
  }
});

test('FIXTURE: the trust keys match the TUI, snake_case label and all', () => {
  assert.equal(trustKey(FIXTURE_HOOKS_JSON, 'PostToolUse'), `${FIXTURE_HOOKS_JSON}:post_tool_use:0:0`);
  assert.equal(trustKey(FIXTURE_HOOKS_JSON, 'SessionStart'), `${FIXTURE_HOOKS_JSON}:session_start:0:0`);
  assert.equal(trustKey(FIXTURE_HOOKS_JSON, 'UserPromptSubmit'), `${FIXTURE_HOOKS_JSON}:user_prompt_submit:0:0`);
  assert.equal(trustKey(FIXTURE_HOOKS_JSON, 'Stop'), `${FIXTURE_HOOKS_JSON}:stop:0:0`);
  assert.equal(trustKey(FIXTURE_HOOKS_JSON, 'Stop', 1, 2), `${FIXTURE_HOOKS_JSON}:stop:1:2`);
});

test('the hashed identity is key-sorted, compact, and carries async even when false', () => {
  const json = canonicalJson({ event_name: 'stop', hooks: [{ type: 'command', command: 'x', timeout: 1, async: false }] });
  assert.equal(json, '{"event_name":"stop","hooks":[{"async":false,"command":"x","timeout":1,"type":"command"}]}');
});

test('a missing timeout is Codex\'s 600 s default, and a floor of one second applies', () => {
  assert.equal(normalizeTimeout(undefined), 600);
  assert.equal(normalizeTimeout('nonsense'), 600);
  assert.equal(normalizeTimeout(0), 1);
  assert.equal(normalizeTimeout(-5), 1);
  assert.equal(normalizeTimeout(30.9), 30);
  // …and the hash follows it: an absent timeout must hash as 600, not as absent.
  assert.equal(
    codexHookHash({ command: 'x' }, 'Stop'),
    codexHookHash({ command: 'x', timeout: 600 }, 'Stop'),
  );
});

test('a matcher changes the hash, and null is not the same as an empty string', () => {
  const h = (matcher) => codexHookHash({ command: 'x', timeout: 30 }, 'PostToolUse', matcher);
  assert.notEqual(h(null), h('*'));
  assert.notEqual(h(''), h(null));
  assert.equal(h(null), h(undefined), 'absent and null are the same thing: TOML has no null');
});

test('hookEventLabel handles every event we install', () => {
  assert.deepEqual(CODEX_EVENTS.map((e) => hookEventLabel(e.event)),
    ['session_start', 'user_prompt_submit', 'post_tool_use', 'stop']);
});

// ─────────────────────────────────────────────────────────────────────────────
// hooks.json
// ─────────────────────────────────────────────────────────────────────────────

test('the installed hooks.json wires four events, with Stop given the long-poll budget', () => {
  const json = buildHooksJson('/x/hooks/multi-codex-hook.mjs');
  assert.deepEqual(Object.keys(json.hooks), ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']);
  assert.equal(json.hooks.Stop[0].hooks[0].timeout, 1020);
  assert.equal(json.hooks.Stop[0].hooks[0].command, `${process.execPath} /x/hooks/multi-codex-hook.mjs`);
  assert.equal(json.hooks.SessionStart[0].hooks[0].timeout, 30);
  assert.equal(json.hooks.Stop[0].matcher, undefined, 'no matcher: the hash treats absent and null alike');
});

test('the node binary is absolute, and a path with a space is quoted', () => {
  assert.equal(nodeCommand('/x/h.mjs', '/usr/bin/node'), '/usr/bin/node /x/h.mjs');
  assert.equal(nodeCommand('/x/my hooks/h.mjs', '/usr/bin/node'), '/usr/bin/node "/x/my hooks/h.mjs"');
  assert.equal(nodeCommand('/x/h.mjs', 'C:\Program Files\node.exe'), '"C:\Program Files\node.exe" /x/h.mjs');
  // A bare `node` would be resolved from PATH, and a non-login ssh shell on the boxes has none.
  assert.match(nodeCommand('/x/h.mjs'), /^\S*node(\.exe)?\s/);
  assert.ok(path.isAbsolute(nodeCommand('/x/h.mjs').split(' ')[0].replace(/"/g, '')));

  const entries = trustEntriesFor('/home/x/hooks.json', '/x/my hooks/h.mjs', undefined, '/usr/bin/node');
  const expected = codexHookHash({ command: '/usr/bin/node "/x/my hooks/h.mjs"', timeout: 1020 }, 'Stop', null);
  assert.equal(entries['/home/x/hooks.json:stop:0:0'], expected);
});

test('trustEntriesFor covers every handler in the file it names', () => {
  const entries = trustEntriesFor(FIXTURE_HOOKS_JSON, '/x/h.mjs');
  assert.deepEqual(Object.keys(entries).sort(), [
    `${FIXTURE_HOOKS_JSON}:post_tool_use:0:0`,
    `${FIXTURE_HOOKS_JSON}:session_start:0:0`,
    `${FIXTURE_HOOKS_JSON}:stop:0:0`,
    `${FIXTURE_HOOKS_JSON}:user_prompt_submit:0:0`,
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Merging into a file somebody else owns
// ─────────────────────────────────────────────────────────────────────────────

/** What Orca writes into every managed Codex home. Deleting this would break its agent integration. */
const ORCA_HOOKS = {
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: 'C:\Users\benzh\.orca\agent-hooks\codex-hook.cmd', timeout: 10 }] }],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'C:\Users\benzh\.orca\agent-hooks\codex-hook.cmd', timeout: 10 }] }],
    PreToolUse: [{ hooks: [{ type: 'command', command: 'C:\Users\benzh\.orca\agent-hooks\codex-hook.cmd', timeout: 10 }] }],
    PermissionRequest: [{ hooks: [{ type: 'command', command: 'C:\Users\benzh\.orca\agent-hooks\codex-hook.cmd', timeout: 10 }] }],
  },
};

test("MERGE: Orca's handlers survive, keep their index, and ours is appended", () => {
  const { json, changed, placements } = mergeHooksJson(ORCA_HOOKS, '/x/hooks/multi-codex-hook.mjs');
  assert.equal(changed, true);
  // Orca's four events are all still there, its handler still first in each.
  assert.equal(json.hooks.PreToolUse.length, 1, 'an event we do not touch is untouched');
  assert.equal(json.hooks.PermissionRequest[0].hooks[0].command, ORCA_HOOKS.hooks.PermissionRequest[0].hooks[0].command);
  assert.equal(json.hooks.SessionStart[0].hooks[0].command, ORCA_HOOKS.hooks.SessionStart[0].hooks[0].command);
  assert.equal(json.hooks.SessionStart.length, 2, 'ours is a second group, so Orca keeps group index 0');
  assert.ok(json.hooks.SessionStart[1].hooks[0].command.includes(HOOK_MARKER));
  // …and the trust keys follow the indices our handler actually landed on.
  const byEvent = Object.fromEntries(placements.map((p) => [p.event, `${p.groupIndex}:${p.handlerIndex}`]));
  assert.deepEqual(byEvent, { SessionStart: '1:0', UserPromptSubmit: '1:0', PostToolUse: '0:0', Stop: '0:0' });
});

test('MERGE is idempotent: running it twice changes nothing the second time', () => {
  const first = mergeHooksJson(ORCA_HOOKS, '/x/hooks/multi-codex-hook.mjs');
  const second = mergeHooksJson(first.json, '/x/hooks/multi-codex-hook.mjs');
  assert.equal(second.changed, false);
  assert.deepEqual(second.json, first.json);
});

test('MERGE updates our own handler in place when the plugin path or timeout changes', () => {
  const first = mergeHooksJson(ORCA_HOOKS, '/old/hooks/multi-codex-hook.mjs');
  const second = mergeHooksJson(first.json, '/new/hooks/multi-codex-hook.mjs');
  assert.equal(second.changed, true);
  assert.equal(second.json.hooks.Stop.length, 1, 'no second copy of ours');
  assert.equal(second.json.hooks.Stop[0].hooks[0].command, `${process.execPath} /new/hooks/multi-codex-hook.mjs`);
  assert.equal(second.json.hooks.SessionStart.length, 2, "and Orca's is still there");
});

test('MERGE into an empty home produces exactly the four events, at index 0', () => {
  const { json, placements } = mergeHooksJson({}, '/x/h/multi-codex-hook.mjs');
  assert.deepEqual(Object.keys(json.hooks), ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']);
  assert.ok(placements.every((p) => p.groupIndex === 0 && p.handlerIndex === 0));
});

test('MERGE keeps unknown top-level keys in the file', () => {
  const { json } = mergeHooksJson({ version: 3, hooks: {} }, '/x/h/multi-codex-hook.mjs');
  assert.equal(json.version, 3);
});

test('placement trust keys use the real indices, not 0:0', () => {
  const { placements } = mergeHooksJson(ORCA_HOOKS, '/x/h/multi-codex-hook.mjs');
  const entries = trustEntriesForPlacements('/home/h/hooks.json', placements);
  assert.ok(entries['/home/h/hooks.json:session_start:1:0'], 'ours sits in group 1 for SessionStart');
  assert.ok(entries['/home/h/hooks.json:stop:0:0']);
  assert.equal(entries['/home/h/hooks.json:session_start:0:0'], undefined, "Orca's handler is not ours to trust");
});

// ─────────────────────────────────────────────────────────────────────────────
// The config.toml edit
// ─────────────────────────────────────────────────────────────────────────────

const EXISTING = `model = "gpt-6-astra"
notify = ["node", "/home/ben/.agents/skills/multi/scripts/note-notify.mjs", "--to", "astra"]

[projects."/home/ben/Code/app"]
trust_level = "trusted"
`;

test('upsert adds a trust section without touching anything already there', () => {
  const { text, changed, added } = upsertHooksState(EXISTING, { 'k1:stop:0:0': 'sha256:aaa' });
  assert.equal(changed, true);
  assert.deepEqual(added, ['k1:stop:0:0']);
  assert.ok(text.startsWith(EXISTING), 'every existing line survives, in order');
  assert.match(text, /\[hooks\.state\."k1:stop:0:0"\]\ntrusted_hash = "sha256:aaa"/);
  assert.match(text, /notify = \["node"/, 'the notify line stays — it is how Codex drains the outbox today');
});

test('upsert is idempotent: an unchanged hash rewrites nothing at all', () => {
  const once = upsertHooksState(EXISTING, { 'k1:stop:0:0': 'sha256:aaa' }).text;
  const again = upsertHooksState(once, { 'k1:stop:0:0': 'sha256:aaa' });
  assert.equal(again.changed, false);
  assert.equal(again.text, once, 'byte for byte, so the file mtime does not move on a no-op apply');
});

test('a changed hash replaces the value in place, never appending a second section', () => {
  const once = upsertHooksState(EXISTING, { 'k1:stop:0:0': 'sha256:aaa' }).text;
  const res = upsertHooksState(once, { 'k1:stop:0:0': 'sha256:bbb' });
  assert.deepEqual(res.updated, ['k1:stop:0:0']);
  assert.equal(res.text.match(/\[hooks\.state\."k1:stop:0:0"\]/g).length, 1);
  assert.match(res.text, /trusted_hash = "sha256:bbb"/);
  assert.ok(!res.text.includes('sha256:aaa'));
});

test('a section that exists with no trusted_hash gets one, rather than a duplicate table', () => {
  const toml = `[hooks.state."k1:stop:0:0"]\nenabled = true\n`;
  const res = upsertHooksState(toml, { 'k1:stop:0:0': 'sha256:ccc' });
  assert.equal(res.text.match(/\[hooks\.state\."k1:stop:0:0"\]/g).length, 1);
  assert.match(res.text, /trusted_hash = "sha256:ccc"/);
  assert.match(res.text, /enabled = true/, 'and whatever else was in the section survives');
});

test('a Windows key is escaped so the file stays valid TOML', () => {
  const key = 'C:\\Users\\benzh\\.codex\\hooks.json:stop:0:0';
  assert.equal(tomlBasicString(key), '"C:\\\\Users\\\\benzh\\\\.codex\\\\hooks.json:stop:0:0"');
  const res = upsertHooksState('', { [key]: 'sha256:ddd' });
  assert.match(res.text, /\[hooks\.state\."C:\\\\Users/);
  // …and finding it again must work, or every apply would append another copy.
  const again = upsertHooksState(res.text, { [key]: 'sha256:ddd' });
  assert.equal(again.changed, false);
});

test('upsert into an empty file produces a valid, self-contained section', () => {
  const res = upsertHooksState('', { 'k:stop:0:0': 'sha256:eee' });
  assert.equal(res.text, '[hooks.state."k:stop:0:0"]\ntrusted_hash = "sha256:eee"\n');
});

// ─────────────────────────────────────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────────────────────────────────────

test('codexHomes finds ~/.codex plus every Orca-managed account home, per platform', () => {
  // `path.join` is native, so this builds the root the same way the module does and the assertion
  // reads the same on Windows and on the boxes.
  const root = path.join('/home/ben', '.config', 'orca', 'codex-accounts');
  const fsImpl = {
    readdirSync: (dir) => {
      if (dir === root) return ['acct-a', 'acct-b', 'stray-file'];
      throw new Error('ENOENT');
    },
    statSync: (p) => ({ isDirectory: () => !String(p).includes('stray-file') }),
  };
  const homes = codexHomes({ home: '/home/ben', platform: 'linux', fsImpl, env: {} });
  assert.deepEqual(homes, [
    path.join('/home/ben', '.codex'),
    path.join(root, 'acct-a', 'home'),
    path.join(root, 'acct-b', 'home'),
  ]);
});

test('codexHomes never returns a duplicate when CODEX_HOME is already ~/.codex', () => {
  const fsImpl = { readdirSync: () => { throw new Error('ENOENT'); }, statSync: () => ({ isDirectory: () => false }) };
  const homes = codexHomes({ home: '/home/ben', platform: 'linux', fsImpl, env: { CODEX_HOME: path.join('/home/ben', '.codex') } });
  assert.deepEqual(homes, [path.join('/home/ben', '.codex')]);
});

