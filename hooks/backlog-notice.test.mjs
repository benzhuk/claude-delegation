// backlog-notice — driven exactly as the harness drives it: the real hook as a child process, one
// crafted stdin payload per event, and what is asserted is the bytes Claude Code would receive.
// A handful of pure-function cases (home resolution, the switch-copy pin) import the hook directly —
// Node's CJS/ESM interop resolves its `module.exports` object literal to named imports.
//
// A1 (round-3 red-team addendum) replaced the original C3 cheap-exit wording: a directory's mtime
// never moves when an existing *.record.md is edited in place (only on create/rename/delete), so the
// gate is keyed on the sentinel's stored `printedAt`, plus — PostToolUse only — the newest FILE mtime
// and file count. Tests below fake elapsed time by rewriting the sentinel's stored `printedAt`
// directly (the same technique `hooks/delegation-reminder.test.mjs` uses via `fs.utimesSync` on its
// own state files): the hook itself always reads the real clock, exactly like every other hook here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import { switchedOff } from '../scripts/project-config.mjs';
import {
  agentsHome, activeSwitch, switchPresent, sentinelPathFor, readSentinel, writeSentinel,
} from './backlog-notice.js';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOOK = path.join(REPO, 'hooks', 'backlog-notice.js');
const SESSION_ID = 'fixture-session-0001';

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A fixture HOME whose `.agents` is the AGENTS_HOME the child will use. */
function fixtureHome() {
  const home = tmpdir('backlog-home-');
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  return home;
}

/** A fixture project root with an empty `docs/work` — the hook never has to create it. */
function fixtureProject() {
  const root = tmpdir('backlog-proj-');
  fs.mkdirSync(path.join(root, 'docs', 'work'), { recursive: true });
  return root;
}

const agentsOf = (home) => path.join(home, '.agents');

function recordText({ work, status = 'runnable', owner = 'none' }) {
  return [
    `Work: ${work}`,
    'Scope: docs/fixture.md@abc123',
    `Owner: ${owner}`,
    `Status: ${status}`,
    'Authority: fixture record, anything goes',
    'Artifact: none',
    'Evidence: none',
    'Next: pull it',
    'Opened: 2026-09-21T00:00:00Z',
    '',
    'Fixture record for hooks/backlog-notice.test.mjs.',
    '',
  ].join('\n');
}

function writeRecord(cwd, opts) {
  const file = path.join(cwd, 'docs', 'work', `${opts.work}.record.md`);
  fs.writeFileSync(file, recordText(opts), 'utf8');
  return file;
}

/** Like writeRecord, but the filename is independent of Work: — needed to fixture two
 * different records that deliberately share the same Work: id (duplicate-work-id). */
function writeRecordNamed(cwd, filename, opts) {
  const file = path.join(cwd, 'docs', 'work', `${filename}.record.md`);
  fs.writeFileSync(file, recordText(opts), 'utf8');
  return file;
}

/** Full control over the header lines — needed for edge cases recordText's template
 * cannot express, e.g. an `Owner:` line with nothing at all after the colon. */
function writeRawRecord(cwd, filename, headerLines, body = 'Fixture record for hooks/backlog-notice.test.mjs.') {
  const file = path.join(cwd, 'docs', 'work', `${filename}.record.md`);
  fs.writeFileSync(file, [...headerLines, '', body, ''].join('\n'), 'utf8');
  return file;
}

/**
 * A fixture plugin root whose scripts/work-record.mjs re-exports the REAL parser's
 * STATUSES/listRecords but replaces checkRecordSet with one that throws. Running the hook
 * against this root proves parser.checkRecordSet(entries) is called INSIDE main()'s existing
 * try: if it were called after the try/catch, this would crash the process instead of being
 * caught by the "could not load the parser" fail-open path.
 */
function fixturePluginRootWithThrowingCheckRecordSet() {
  const root = tmpdir('backlog-throwing-parser-');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const realParserUrl = pathToFileURL(path.join(REPO, 'scripts', 'work-record.mjs')).href;
  fs.writeFileSync(
    path.join(root, 'scripts', 'work-record.mjs'),
    [
      `export { STATUSES, listRecords } from ${JSON.stringify(realParserUrl)};`,
      'export function checkRecordSet() {',
      "  throw new Error('boom-from-checkRecordSet');",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  return root;
}

function writeMalformedRecord(cwd, name) {
  const file = path.join(cwd, 'docs', 'work', `${name}.record.md`);
  // No Status: line at all — parseRecord returns fields.status === undefined, which classify()
  // treats as malformed (skipped, counted on stderr only).
  fs.writeFileSync(
    file,
    ['Work: wr-bad', 'Scope: docs/fixture.md@abc123', 'Owner: none', '', 'Missing every other field.', ''].join('\n'),
    'utf8',
  );
  return file;
}

/**
 * Run the hook exactly as Claude Code does: JSON on stdin, the event name in argv, a fixture home.
 */
function runHook(event, home, cwd, { input = {}, over = {} } = {}) {
  const res = spawnSync(process.execPath, [HOOK, event], {
    input: JSON.stringify({ hook_event_name: event, cwd, session_id: SESSION_ID, ...input }),
    encoding: 'utf8',
    env: childEnv(home, { AGENTS_HOME: agentsOf(home), CLAUDE_PLUGIN_ROOT: REPO, ...over }),
  });
  const stdout = res.stdout || '';
  return {
    status: res.status,
    stdout,
    stderr: res.stderr || '',
    json: stdout.trim() ? JSON.parse(stdout) : null,
  };
}

test('T2/C3: zero records prints nothing, and writes no sentinel', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  const out = runHook('UserPromptSubmit', home, cwd);
  assert.equal(out.status, 0);
  assert.equal(out.json, null);
  assert.equal(fs.existsSync(sentinelPathFor(agentsOf(home), SESSION_ID)), false);
});

test('T2/C3: one runnable unowned prints the C3 line on UserPromptSubmit', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-fixture', status: 'runnable' });
  const out = runHook('UserPromptSubmit', home, cwd);
  assert.equal(out.status, 0);
  assert.ok(out.json, 'a line must print');
  assert.equal(out.json.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const line = out.json.hookSpecificOutput.additionalContext;
  assert.match(line, /^work: 1 runnable and unowned \(wr-2026-09-21-fixture\), 0 delivered and unreviewed \(\), 0 rejected awaiting a fix round \(\)\. Pull one or say why not\.$/);
  assert.equal(out.json.systemMessage, undefined);
  assert.equal(fs.existsSync(sentinelPathFor(agentsOf(home), SESSION_ID)), true, 'a printed line writes the sentinel');
});

test('T2/C3: Stop prints systemMessage only, never a decision', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-stop', status: 'runnable' });
  const out = runHook('Stop', home, cwd);
  assert.equal(out.status, 0);
  assert.ok(out.json);
  assert.match(out.json.systemMessage, /^work: 1 runnable and unowned \(wr-2026-09-21-stop\)/);
  assert.equal(out.json.decision, undefined);
  assert.equal(out.json.hookSpecificOutput, undefined);
});

test('T2/C3: two events inside 120s print once', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-twice', status: 'runnable' });
  const first = runHook('UserPromptSubmit', home, cwd);
  assert.ok(first.json, 'first call prints');
  const second = runHook('UserPromptSubmit', home, cwd);
  assert.equal(second.json, null, 'second call inside the window is silent');
});

test('T2/C3: ws-off and ws-off-backlog both silence the hook', () => {
  for (const switchFile of ['ws-off', 'ws-off-backlog']) {
    const home = fixtureHome();
    const cwd = fixtureProject();
    writeRecord(cwd, { work: 'wr-2026-09-21-switch', status: 'runnable' });
    fs.writeFileSync(path.join(agentsOf(home), switchFile), '');
    const out = runHook('UserPromptSubmit', home, cwd);
    assert.equal(out.status, 0);
    assert.equal(out.json, null, `${switchFile} must silence the hook`);
    assert.equal(fs.existsSync(sentinelPathFor(agentsOf(home), SESSION_ID)), false, `${switchFile} must write no state`);
  }
});

test('T2/C3: a malformed record is skipped and counted on stderr only', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeMalformedRecord(cwd, 'wr-bad');
  writeRecord(cwd, { work: 'wr-2026-09-21-good', status: 'runnable' });
  const out = runHook('UserPromptSubmit', home, cwd);
  assert.ok(out.json);
  assert.match(out.json.hookSpecificOutput.additionalContext, /^work: 1 runnable and unowned \(wr-2026-09-21-good\)/);
  assert.match(out.stderr, /malformed/i);
});

test('T2/C3: explicit home beats AGENTS_HOME', () => {
  assert.equal(agentsHome('/explicit/home', { AGENTS_HOME: '/env/home' }), '/explicit/home');
  assert.equal(agentsHome(undefined, { AGENTS_HOME: '/env/home' }), '/env/home');
  assert.equal(agentsHome(undefined, {}), path.join(os.homedir(), '.agents'));
});

test('T2/C3: the switch copy (agentsHome/switchPresent/activeSwitch) matches project-config.mjs switchedOff', () => {
  const savedHome = process.env.AGENTS_HOME;
  try {
    const cases = [
      ['none', []],
      ['ws-off', ['ws-off']],
      ['ws-off-backlog', ['ws-off-backlog']],
      ['both', ['ws-off', 'ws-off-backlog']],
    ];
    for (const [label, files] of cases) {
      const home = fixtureHome();
      const agents = agentsOf(home);
      for (const f of files) fs.writeFileSync(path.join(agents, f), '');
      process.env.AGENTS_HOME = agents;
      const expected = switchedOff('backlog');
      const actual = Boolean(activeSwitch(agents));
      assert.equal(actual, expected, label);
    }
  } finally {
    if (savedHome === undefined) delete process.env.AGENTS_HOME;
    else process.env.AGENTS_HOME = savedHome;
  }
});

test('T2/C3: switchPresent fails toward "present" on a non-ENOENT stat error', () => {
  // Same MINOR-2 shape as hooks/delegation-reminder.js: existsSync-style absence is only ENOENT/ENOTDIR.
  assert.equal(switchPresent(path.join(tmpdir('backlog-nope-'), 'missing')), false);
});

test('A1: an in-place Status edit inside the 120s window prints nothing; past it, prints again', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  const file = writeRecord(cwd, { work: 'wr-2026-09-21-edit', status: 'runnable' });

  const first = runHook('UserPromptSubmit', home, cwd);
  assert.ok(first.json, 'baseline print');

  // Edit the record IN PLACE: same file, same count, only its own mtime and content change. A
  // directory-mtime gate would never see this; that is exactly what A1 replaced.
  fs.writeFileSync(file, recordText({ work: 'wr-2026-09-21-edit', status: 'rejected' }), 'utf8');

  const withinWindow = runHook('UserPromptSubmit', home, cwd);
  assert.equal(withinWindow.json, null, 'still inside the 120s window: silent regardless of the edit');

  // Fake the clock: back-date the sentinel's stored printedAt past the 120s sentinel window. The hook
  // itself never reads anything but the real clock; this rewrites the one piece of state it trusts.
  const sentinelPath = sentinelPathFor(agentsOf(home), SESSION_ID);
  const stale = readSentinel(sentinelPath);
  assert.ok(stale, 'the baseline print must have written a sentinel');
  writeSentinel(sentinelPath, { now: Date.now() - 130_000, newestMtimeMs: stale.newestMtimeMs, fileCount: stale.fileCount });

  const pastWindow = runHook('UserPromptSubmit', home, cwd);
  assert.ok(pastWindow.json, 'past the window, the edited record produces a new line');
  assert.match(pastWindow.json.hookSpecificOutput.additionalContext, /1 rejected awaiting a fix round \(wr-2026-09-21-edit\)/);
});

test('A1: PostToolUse stays silent past the window when nothing changed; other events do not', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-hot', status: 'runnable' });

  const baseline = runHook('PostToolUse', home, cwd);
  assert.ok(baseline.json, 'baseline print');

  const sentinelPath = sentinelPathFor(agentsOf(home), SESSION_ID);
  const stale = readSentinel(sentinelPath);
  writeSentinel(sentinelPath, { now: Date.now() - 130_000, newestMtimeMs: stale.newestMtimeMs, fileCount: stale.fileCount });

  const postToolPastWindow = runHook('PostToolUse', home, cwd);
  assert.equal(postToolPastWindow.json, null, 'PostToolUse: unchanged file+count past the window still suppresses');

  const promptPastWindow = runHook('UserPromptSubmit', home, cwd);
  assert.ok(promptPastWindow.json, 'UserPromptSubmit has no second gate: past the window it reprints regardless');
});

// Round-2 review, MAJOR 2 — the second gate's OPEN direction was untested (mutating it to `if (true)`
// passed 11/11). Both tests below are appended verbatim from the review's pointed-to file.

test('A1/hot path: with no records the parser is never imported (a broken plugin root stays silent)', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  const out = runHook('PostToolUse', home, cwd, { over: { CLAUDE_PLUGIN_ROOT: tmpdir('backlog-noplugin-') } });
  assert.equal(out.status, 0);
  assert.equal(out.json, null);
  assert.equal(out.stderr, '', 'the parser must not load when docs/work holds no records');
});

test('A1: PostToolUse past the window reprints after an IN-PLACE edit (the second gate opens)', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  const file = writeRecord(cwd, { work: 'wr-2026-09-21-inplace', status: 'runnable' });
  assert.ok(runHook('PostToolUse', home, cwd).json, 'baseline print');

  // Same file, same count: only this file's own mtime moves. The second gate must OPEN.
  fs.writeFileSync(file, recordText({ work: 'wr-2026-09-21-inplace', status: 'rejected' }), 'utf8');
  const later = new Date(Date.now() + 5_000);
  fs.utimesSync(file, later, later);

  const sentinelPath = sentinelPathFor(agentsOf(home), SESSION_ID);
  const stale = readSentinel(sentinelPath);
  writeSentinel(sentinelPath, { now: Date.now() - 130_000, newestMtimeMs: stale.newestMtimeMs, fileCount: stale.fileCount });

  const out = runHook('PostToolUse', home, cwd);
  assert.ok(out.json, 'PostToolUse must reprint after an in-place edit past the window');
  assert.match(out.json.hookSpecificOutput.additionalContext, /1 rejected awaiting a fix round \(wr-2026-09-21-inplace\)/);
});

// MAJOR 1 residual, orchestrator ruling (round 2): the sentinel's scan fields (newestMtimeMs,
// fileCount) are recorded on every PostToolUse evaluation that gets past the 120s gate, printed or
// not — so an all-owned ledger (nothing ever prints, so `writeSentinel`'s printedAt path never
// fires) is parsed once and then stat-only for as long as nothing changes.
test('MAJOR 1 residual: PostToolUse on an all-owned ledger imports the parser only on the first call', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-owned', status: 'owned' });

  const first = runHook('PostToolUse', home, cwd);
  assert.equal(first.json, null, 'an all-owned ledger prints nothing');
  assert.equal(first.stderr, '', 'no malformed records, no import error');

  // Break the plugin root: if the second call still needed to import the parser, this surfaces as a
  // stderr line. It must not — the first call's scan should make this one stat-only via the second
  // gate, never reaching the import at all.
  const second = runHook('PostToolUse', home, cwd, { over: { CLAUDE_PLUGIN_ROOT: tmpdir('backlog-noplugin2-') } });
  assert.equal(second.json, null);
  assert.equal(second.stderr, '', 'the parser must not be imported on the second call');
});

// L-C6: record vocabulary follow-ups (runnable-with-owner folds into malformed;
// checkRecordSet's duplicate-work-id gets its own, independent stderr line).

test('L-C6: a runnable record with a non-none Owner: is malformed, not runnable', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-good', status: 'runnable', owner: 'none' });
  writeRecord(cwd, { work: 'wr-2026-09-21-owned-runnable', status: 'runnable', owner: 't2' });
  const out = runHook('UserPromptSubmit', home, cwd);
  assert.ok(out.json, 'the one genuinely runnable record still prints');
  const line = out.json.hookSpecificOutput.additionalContext;
  assert.match(line, /^work: 1 runnable and unowned \(wr-2026-09-21-good\)/);
  assert.ok(!line.includes('wr-2026-09-21-owned-runnable'), 'the runnable-with-owner record must not appear in the runnable bucket');
  assert.match(out.stderr, /backlog-notice: skipped 1 malformed record\(s\)/);
});

test('L-C6: parser.checkRecordSet(entries) runs inside main()\'s existing try, so a throwing export still fails open', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-any', status: 'runnable' });
  const throwingRoot = fixturePluginRootWithThrowingCheckRecordSet();
  const out = runHook('UserPromptSubmit', home, cwd, { over: { CLAUDE_PLUGIN_ROOT: throwingRoot } });
  assert.equal(out.status, 0, 'the hook process must still exit 0');
  assert.equal(out.json, null, 'a parser failure prints no output line');
  assert.match(out.stderr, /backlog-notice: could not load the parser/);
  assert.match(out.stderr, /boom-from-checkRecordSet/, 'the existing fail-open catch must be the one that caught checkRecordSet\'s throw');
});

test('L-C6: two records sharing a Work: id print a second, independent stderr line and both keep their own bucket', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecordNamed(cwd, 'dup-a', { work: 'wr-2026-09-21-dup', status: 'runnable', owner: 'none' });
  writeRecordNamed(cwd, 'dup-b', { work: 'wr-2026-09-21-dup', status: 'delivered', owner: 'none' });
  const out = runHook('UserPromptSubmit', home, cwd);
  assert.ok(out.json);
  const line = out.json.hookSpecificOutput.additionalContext;
  assert.match(line, /1 runnable and unowned \(wr-2026-09-21-dup\)/, 'the duplicated record still lands in runnable per its own Status:');
  assert.match(line, /1 delivered and unreviewed \(wr-2026-09-21-dup\)/, 'and the other copy still lands in delivered per ITS own Status:');
  assert.match(out.stderr, /^backlog-notice: duplicate work id\(s\): wr-2026-09-21-dup\n?$/m);
  assert.ok(!/malformed/i.test(out.stderr), 'no malformed records exist here: the malformed line must not fire');
});

test('L-C6: the malformed line and the duplicate line are independently triggerable — both, only one, or neither', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();

  // Neither: one clean, unique, genuinely runnable record.
  writeRecordNamed(cwd, 'clean', { work: 'wr-2026-09-21-clean', status: 'runnable', owner: 'none' });
  const neither = runHook('UserPromptSubmit', home, cwd);
  assert.equal(neither.stderr, '', 'a clean ledger prints nothing on stderr');

  // Only malformed: add a runnable-with-owner record (no duplicate work ids anywhere yet).
  const home2 = fixtureHome();
  const cwd2 = fixtureProject();
  writeRecordNamed(cwd2, 'clean2', { work: 'wr-2026-09-21-clean2', status: 'runnable', owner: 'none' });
  writeRecordNamed(cwd2, 'bad-owner', { work: 'wr-2026-09-21-bad-owner', status: 'runnable', owner: 't3' });
  const onlyMalformed = runHook('UserPromptSubmit', home2, cwd2);
  assert.match(onlyMalformed.stderr, /malformed/i);
  assert.ok(!/duplicate work id/i.test(onlyMalformed.stderr));

  // Only duplicate: two well-formed records that happen to share a Work: id.
  const home3 = fixtureHome();
  const cwd3 = fixtureProject();
  writeRecordNamed(cwd3, 'dup3-a', { work: 'wr-2026-09-21-onlydup', status: 'runnable', owner: 'none' });
  writeRecordNamed(cwd3, 'dup3-b', { work: 'wr-2026-09-21-onlydup', status: 'runnable', owner: 'none' });
  const onlyDuplicate = runHook('UserPromptSubmit', home3, cwd3);
  assert.match(onlyDuplicate.stderr, /duplicate work id\(s\): wr-2026-09-21-onlydup/);
  assert.ok(!/malformed/i.test(onlyDuplicate.stderr));

  // Both: a runnable-with-owner record AND a duplicated work id, together.
  const home4 = fixtureHome();
  const cwd4 = fixtureProject();
  writeRecordNamed(cwd4, 'both-owner', { work: 'wr-2026-09-21-both-owner', status: 'runnable', owner: 't4' });
  writeRecordNamed(cwd4, 'both-dup-a', { work: 'wr-2026-09-21-both-dup', status: 'runnable', owner: 'none' });
  writeRecordNamed(cwd4, 'both-dup-b', { work: 'wr-2026-09-21-both-dup', status: 'delivered', owner: 'none' });
  const both = runHook('UserPromptSubmit', home4, cwd4);
  assert.match(both.stderr, /malformed/i);
  assert.match(both.stderr, /duplicate work id\(s\): wr-2026-09-21-both-dup/);
});

// Round-2 review MINOR 1: a whitespace-only (or tab-only) Owner: line used to parse to ""
// (not undefined, not "none"), firing runnable-with-owner and silently dropping an unowned
// runnable record out of the notice — exactly the failure this hook exists to prevent.
// Fixed at both call sites (scripts/work-record.mjs and hooks/backlog-notice.js) to also
// exclude the empty string.

test('L-C6 MINOR fix: a whitespace-only or tab-only Owner: does not hide a runnable record from the notice', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRecord(cwd, { work: 'wr-2026-09-21-ws-owner', status: 'runnable', owner: '   ' });
  writeRecord(cwd, { work: 'wr-2026-09-21-tab-owner', status: 'runnable', owner: '\t' });
  const out = runHook('UserPromptSubmit', home, cwd);
  assert.ok(out.json, 'both records are genuinely runnable and must still print');
  const line = out.json.hookSpecificOutput.additionalContext;
  assert.match(line, /^work: 2 runnable and unowned/);
  assert.ok(line.includes('wr-2026-09-21-ws-owner'), 'the whitespace-only-owner record must not be dropped');
  assert.ok(line.includes('wr-2026-09-21-tab-owner'), 'the tab-only-owner record must not be dropped');
  assert.equal(out.stderr, '', 'neither record is malformed, so stderr must be empty');
});

test('L-C6 MINOR fix: an Owner: line with no value at all still parses to undefined and never fires the finding', () => {
  const home = fixtureHome();
  const cwd = fixtureProject();
  writeRawRecord(cwd, 'no-owner-value', [
    'Work: wr-2026-09-21-no-owner-value',
    'Scope: docs/fixture.md@abc123',
    'Owner:',
    'Status: runnable',
    'Authority: fixture record, anything goes',
    'Artifact: none',
    'Evidence: none',
    'Next: pull it',
    'Opened: 2026-09-21T00:00:00Z',
  ]);
  const out = runHook('UserPromptSubmit', home, cwd);
  assert.ok(out.json);
  assert.match(out.json.hookSpecificOutput.additionalContext, /^work: 1 runnable and unowned \(wr-2026-09-21-no-owner-value\)/);
  assert.equal(out.stderr, '', 'a record with no Owner: value at all was never malformed, before or after the fix');
});
