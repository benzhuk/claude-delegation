// node --test "skills/decisions/scripts/*.test.mjs"
// decisions-handback: the hand-back check (spec M3). Fixtures under fixtures/handback/ are
// synthetic, modelled on Notion's markdown export shape and the goals-mirror shape pinned in
// spec.md ("Contracts (pinned)" — the sha-line rule) — never copied from a real page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../../multi/scripts/test-child-env.mjs';
import {
  run, extractPageSha, shaMatch, computeToday, countNotesToday, agentsHome, killSwitchActive,
} from './decisions-handback.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = path.join(HERE, 'decisions-handback.mjs');
const FIXTURES = path.join(HERE, 'fixtures', 'handback');

const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const L = (...lines) => lines.join('\n');

function tmpdir(prefix = 'decisions-handback-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A stub `readFile` keyed by the exact path string a test passes as --decisions/--goals. */
function readFileStub(map) {
  return (p) => {
    if (!(p in map)) throw new Error(`ENOENT: no stub for ${p}`);
    return map[p];
  };
}

/** In-process run(), with fs/git stubbed and AGENTS_HOME pointed at a scratch dir by default. */
function runWith({
  argv = [], files = {}, head = 'aaaaaaa', env, execGit,
} = {}) {
  const out = [];
  const err = [];
  const home = tmpdir('decisions-handback-home-');
  const exitCode = run({
    argv,
    readFile: readFileStub(files),
    execGit: execGit || (() => { throw new Error('execGit should not be called when --head is given'); }),
    write: (s) => out.push(s),
    writeErr: (s) => err.push(s),
    env: env || { AGENTS_HOME: home },
  });
  return { exitCode, stdout: out.join(''), stderr: err.join(''), home };
}

const CLEAN_DECISIONS = fixture('decisions-clean.md');
const CLEAN_GOALS = fixture('goals-clean.md'); // "main at 889887a" inside the first callout

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: --config
// ─────────────────────────────────────────────────────────────────────────────

function repoWithProjectJson(json) {
  const root = tmpdir('decisions-handback-repo-');
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  if (json !== undefined) {
    fs.writeFileSync(path.join(root, '.agents', 'project.json'), json, 'utf8');
  }
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); // makes it a project root either way
  return root;
}

test('Test 6: --config prints decisions_url and goals_parent_page when set, one line per key', () => {
  const root = repoWithProjectJson(JSON.stringify({
    decisions_url: '3e1da11277a18174bccfea187d5c3972',
    goals_parent_page: '3e1da11277a1817db4c1f1038ccfdd5a',
  }));
  const { exitCode, stdout } = runWith({ argv: ['--config', '--repo', root] });
  assert.equal(exitCode, 0);
  assert.equal(stdout, L(
    'decisions_url\t3e1da11277a18174bccfea187d5c3972',
    'goals_parent_page\t3e1da11277a1817db4c1f1038ccfdd5a',
  ) + '\n');
});

test('Test 6: --config prints nothing for an unset key', () => {
  const root = repoWithProjectJson(JSON.stringify({ decisions_url: '3e1da11277a18174bccfea187d5c3972' }));
  const { exitCode, stdout } = runWith({ argv: ['--config', '--repo', root] });
  assert.equal(exitCode, 0);
  assert.equal(stdout, 'decisions_url\t3e1da11277a18174bccfea187d5c3972\n');
});

test('Test 6: --config with a missing project.json prints nothing and exits 0', () => {
  const root = repoWithProjectJson(undefined);
  const { exitCode, stdout } = runWith({ argv: ['--config', '--repo', root] });
  assert.equal(exitCode, 0);
  assert.equal(stdout, '');
});

test('Test 6: --config with an unreadable (unparseable) project.json prints BLIND on stderr and exits 3', () => {
  const root = repoWithProjectJson('{ not valid json');
  const { exitCode, stdout, stderr } = runWith({ argv: ['--config', '--repo', root] });
  assert.equal(exitCode, 3);
  assert.equal(stdout, '');
  assert.match(stderr, /BLIND/);
});

test('--config without --repo is blind, exit 3, never HANDBACK-prefixed stdout', () => {
  const { exitCode, stdout } = runWith({ argv: ['--config'] });
  assert.equal(exitCode, 3);
  assert.equal(stdout, '');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: clean fixture, and each single defect
// ─────────────────────────────────────────────────────────────────────────────

test('Test 4: a clean fixture exits 0 and prints "HANDBACK ok"', () => {
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /Decisions waiting: 1, notes logged today: 0, goals mirror at 889887a\n/);
  assert.match(stdout, /HANDBACK ok\n$/);
});

test('Test 4: a clean fixture with the exact head sha (not just a prefix) is also clean', () => {
  const { exitCode } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS },
  });
  assert.equal(exitCode, 0);
});

const singleDefects = [
  {
    name: 'a comment (COMMENTED) on the decisions page',
    files: { d: fixture('decisions-commented.md'), g: CLEAN_GOALS },
    expect: /COMMENTED\tSomething waiting\twhat about this\?/,
  },
  {
    name: 'a WARN (malformed default line) on the decisions page',
    files: { d: fixture('decisions-warn-default.md'), g: CLEAN_GOALS },
    expect: /WARN\tdefault line is not in the required shape/,
  },
  {
    name: 'a DUE item (deadline already passed)',
    files: { d: fixture('decisions-due.md'), g: CLEAN_GOALS },
    expect: /DUE\tSomething waiting\ta/,
  },
  {
    name: 'Done ticked while an item is still open',
    files: { d: fixture('decisions-done-mismatch-open.md'), g: CLEAN_GOALS },
    expect: /DONE\ttrue\t\(expected false with DECISIONS 1\)/,
  },
  {
    name: 'Done not the last line',
    files: { d: fixture('decisions-done-not-last.md'), g: CLEAN_GOALS },
    expect: /WARN\tDone is not the last line/,
  },
  {
    name: 'stale goals-mirror sha',
    files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS },
    head: 'ddddddd',
    expect: /WARN\tgoals mirror stale: page 889887a, head ddddddd/,
  },
  {
    name: 'an UNATTACHED note on the goals page, under a heading',
    files: { d: CLEAN_DECISIONS, g: fixture('goals-unattached-heading.md') },
    expect: /goals\tUNATTACHED\tline 5\tis this measure still the right one\?\t\(under Decisions have one home and are kept current\)/,
  },
  {
    name: 'an UNATTACHED note on the goals page, inside the mirror callout',
    files: { d: CLEAN_DECISIONS, g: fixture('goals-unattached-callout.md') },
    expect: /goals\tUNATTACHED\tline 3\ta note from the owner right inside the mirror callout\n/,
  },
  {
    name: 'a TICKED item',
    files: { d: fixture('decisions-ticked.md'), g: CLEAN_GOALS },
    expect: /TICKED\tSomething decided\ta/,
  },
  {
    name: 'Done absent (no Done line at all, with a real decision)',
    files: { d: fixture('decisions-done-absent.md'), g: CLEAN_GOALS },
    expect: /DONE\tabsent\t\(expected false with DECISIONS 1\)/,
  },
  {
    name: 'zero items with an unticked (false) Done line',
    files: { d: fixture('decisions-zero-items-unticked.md'), g: CLEAN_GOALS },
    expect: /DONE\tfalse\t\(expected true with DECISIONS 0\)/,
  },
  {
    name: 'the goals-mirror sha line is missing entirely',
    files: { d: CLEAN_DECISIONS, g: fixture('goals-missing-sha.md') },
    expect: /WARN\tgoals mirror missing sha line/,
  },
  {
    name: 'a "main at …" match outside the callout does not count as the sha line',
    files: { d: CLEAN_DECISIONS, g: fixture('goals-sha-outside-callout.md') },
    expect: /WARN\tgoals mirror missing sha line/,
  },
];

for (const defect of singleDefects) {
  test(`Test 4: single defect — ${defect.name} — exits 1 and names it`, () => {
    const { exitCode, stdout } = runWith({
      argv: [
        '--decisions', 'd', '--goals', 'g', '--repo', 'r',
        '--head', defect.head || '889887a', '--today', '9-22',
      ],
      files: defect.files,
    });
    assert.equal(exitCode, 1);
    assert.match(stdout, defect.expect);
    assert.match(stdout, /HANDBACK blocked\n$/);
    assert.doesNotMatch(stdout, /Decisions waiting:/, 'the waiting line only appears on a truly clean HANDBACK ok');
  });
}

test('Test 4: a zero-item page with "- [x] Done" last is clean', () => {
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: fixture('decisions-zero-items-done.md'), g: CLEAN_GOALS },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /Decisions waiting: 0, notes logged today: 0, goals mirror at 889887a/);
  assert.match(stdout, /HANDBACK ok\n$/);
});

test('Test 4: BLIND (unparseable decisions page) exits 3 and prints "HANDBACK blind"', () => {
  const { exitCode, stdout, stderr } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a'],
    files: { d: '', g: CLEAN_GOALS },
  });
  assert.equal(exitCode, 3);
  assert.match(stdout, /HANDBACK blind\n$/);
  assert.match(stderr, /decisions-handback:/);
});

test('Test 4: BLIND (unparseable goals page) exits 3 and prints "HANDBACK blind"', () => {
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a'],
    files: { d: CLEAN_DECISIONS, g: 'no titles, no callout, nothing the reader can parse' },
  });
  assert.equal(exitCode, 3);
  assert.match(stdout, /HANDBACK blind\n$/);
});

test('Test 4: kill-switch file makes a blocked result exit 0 and still print "HANDBACK blocked"', () => {
  const home = tmpdir('decisions-handback-home-');
  fs.writeFileSync(path.join(home, 'ws-off-decisions'), '', 'utf8');
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: fixture('decisions-commented.md'), g: CLEAN_GOALS },
    env: { AGENTS_HOME: home },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /HANDBACK blocked\n$/);
  assert.doesNotMatch(stdout, /Decisions waiting:/, 'the waiting line is tied to "HANDBACK ok", not to exit 0 alone');
});

test('Test 4: the master ws-off switch also forces a blocked result to exit 0', () => {
  const home = tmpdir('decisions-handback-home-');
  fs.writeFileSync(path.join(home, 'ws-off'), '', 'utf8');
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: fixture('decisions-commented.md'), g: CLEAN_GOALS },
    env: { AGENTS_HOME: home },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /HANDBACK blocked\n$/);
});

test('the kill switch never affects a BLIND result: still exits 3', () => {
  const home = tmpdir('decisions-handback-home-');
  fs.writeFileSync(path.join(home, 'ws-off-decisions'), '', 'utf8');
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a'],
    files: { d: '', g: CLEAN_GOALS },
    env: { AGENTS_HOME: home },
  });
  assert.equal(exitCode, 3);
  assert.match(stdout, /HANDBACK blind\n$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: --goals sha matching
// ─────────────────────────────────────────────────────────────────────────────

test('Test 2: matching sha (exact) — no WARN', () => {
  const { stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS },
  });
  assert.doesNotMatch(stdout, /WARN\tgoals mirror/);
});

test('Test 2: mismatched sha — exact WARN text', () => {
  const { stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', 'deadbee', '--today', '9-22'],
    files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS },
  });
  assert.match(stdout, /^WARN\tgoals mirror stale: page 889887a, head deadbee$/m);
});

test('Test 2: missing sha line — exact WARN text', () => {
  const { stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a'],
    files: { d: CLEAN_DECISIONS, g: fixture('goals-missing-sha.md') },
  });
  assert.match(stdout, /^WARN\tgoals mirror missing sha line$/m);
});

test('Test 2: two shas match when one is a prefix of the other (page sha shorter than head)', () => {
  const { stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887abcdef', '--today', '9-22'],
    files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS }, // page sha "889887a"
  });
  assert.doesNotMatch(stdout, /WARN\tgoals mirror/);
});

test('Test 2: two shas match when one is a prefix of the other (head shorter than page sha)', () => {
  const { stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '8898', '--today', '9-22'],
    files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS }, // page sha "889887a", head is a short prefix of it
  });
  assert.doesNotMatch(stdout, /WARN\tgoals mirror/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer attack brief points not covered above
// ─────────────────────────────────────────────────────────────────────────────

test('a REPLIED pair never blocks the hand-back', () => {
  const decisions = L(
    '<details>',
    '<summary>Answered</summary>',
    '\t- [ ] a',
    '\t- [ ] \\*\\* was this reversible?',
    '\tReply: 2026-09-22, yes.',
    '\tNo default: not needed here',
    '</details>',
    '- [ ] Done',
  );
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: decisions, g: CLEAN_GOALS },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /HANDBACK ok\n$/);
});

test('a REPLIED pair older than today is listed as ARCHIVE but does not block', () => {
  const { exitCode, stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: fixture('decisions-replied-old.md'), g: CLEAN_GOALS },
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /^ARCHIVE\tAnswered a while ago\tline 4\treplied 2026-09-10$/m);
  assert.match(stdout, /HANDBACK ok\n$/);
});

test('"notes logged today" counts only Your note bullets dated today (America/New_York, M-D)', () => {
  const { stdout } = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: fixture('decisions-notes-logged.md'), g: CLEAN_GOALS },
  });
  assert.match(stdout, /Decisions waiting: 1, notes logged today: 2, goals mirror at 889887a/);
});

test('the "Decisions waiting" line never appears on a blind or a blocked (non-kill-switch) result', () => {
  const blocked = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
    files: { d: fixture('decisions-commented.md'), g: CLEAN_GOALS },
  });
  assert.equal(blocked.exitCode, 1);
  assert.doesNotMatch(blocked.stdout, /Decisions waiting:/);

  const blind = runWith({
    argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a'],
    files: { d: '', g: CLEAN_GOALS },
  });
  assert.equal(blind.exitCode, 3);
  assert.doesNotMatch(blind.stdout, /Decisions waiting:/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit-level helpers
// ─────────────────────────────────────────────────────────────────────────────

test('extractPageSha: reads the sha from the first line inside the first <callout> block', () => {
  assert.equal(extractPageSha(CLEAN_GOALS), '889887a');
});

test('extractPageSha: a "main at …" match elsewhere on the page (outside the callout) never counts', () => {
  assert.equal(extractPageSha(fixture('goals-sha-outside-callout.md')), null);
});

test('extractPageSha: no callout at all is null, not a crash', () => {
  assert.equal(extractPageSha('# Heading {toggle="true"}\n\tjust prose'), null);
});

test('shaMatch: exact match, and prefix match both directions; mismatch is false', () => {
  assert.equal(shaMatch('889887a', '889887a'), true);
  assert.equal(shaMatch('889887a', '889887abcdef'), true);
  assert.equal(shaMatch('889887abcdef', '889887a'), true);
  assert.equal(shaMatch('889887a', 'deadbee'), false);
  assert.equal(shaMatch(null, '889887a'), false);
});

test('computeToday: --today override drives both md and ymd; a malformed override is blind', () => {
  const t = computeToday('9-5');
  assert.equal(t.md, '9-5');
  assert.match(t.ymd, /^\d{4}-09-05$/);
  assert.throws(() => computeToday('not-a-date'), /--today/);
});

test('countNotesToday: only exact-dated "- Your note, <M-D>:" bullets count, anchored at line start', () => {
  const text = L(
    '- Your note, 9-22: "a" — done.',
    '  - Your note, 9-22: "indented still counts" — done.',
    '- Your note, 9-21: "wrong day" — done.',
    'Your note, 9-22: "no leading dash, does not match" — done.',
  );
  assert.equal(countNotesToday(text, '9-22'), 2);
});

test('agentsHome / killSwitchActive: injected AGENTS_HOME, never the real ~/.agents', () => {
  const home = tmpdir('decisions-handback-home-');
  assert.equal(agentsHome({ AGENTS_HOME: home }), home);
  assert.equal(killSwitchActive({ AGENTS_HOME: home }), false);
  fs.writeFileSync(path.join(home, 'ws-off-decisions'), '', 'utf8');
  assert.equal(killSwitchActive({ AGENTS_HOME: home }), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Real-process CLI: file reads, real git head-sha lookup, and the kill switch end to end
// ─────────────────────────────────────────────────────────────────────────────

test('CLI: a real process, real files, --head override — exits 0 and prints HANDBACK ok', () => {
  const home = tmpdir('decisions-handback-home-');
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--decisions', path.join(FIXTURES, 'decisions-clean.md'),
    '--goals', path.join(FIXTURES, 'goals-clean.md'),
    '--repo', HERE,
    '--head', '889887a',
    '--today', '9-22',
  ], { encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: home }) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HANDBACK ok\n$/);
});

test('CLI: real process, a defect on the decisions page, plus the kill-switch file — exits 0, prints blocked', () => {
  const home = tmpdir('decisions-handback-home-');
  fs.writeFileSync(path.join(home, 'ws-off-decisions'), '', 'utf8');
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--decisions', path.join(FIXTURES, 'decisions-commented.md'),
    '--goals', path.join(FIXTURES, 'goals-clean.md'),
    '--repo', HERE,
    '--head', '889887a',
    '--today', '9-22',
  ], { encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: home }) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HANDBACK blocked\n$/);
});

test('CLI: real process, without --head, calls real git for the head sha (does not crash; exit is 0, 1, or 3)', () => {
  const home = tmpdir('decisions-handback-home-');
  const repoRoot = path.resolve(HERE, '..', '..', '..'); // the plugin repo root
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--decisions', path.join(FIXTURES, 'decisions-clean.md'),
    '--goals', path.join(FIXTURES, 'goals-clean.md'),
    '--repo', repoRoot,
    '--today', '9-22',
  ], { encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: home }) });
  assert.ok([0, 1, 3].includes(result.status), `unexpected exit code ${result.status}`);
  assert.match(result.stdout + result.stderr, /HANDBACK (ok|blocked|blind)|BLIND/);
});

test('NEVER exit 2: every case above stays inside {0, 1, 3}', () => {
  const cases = [
    runWith({ argv: [] }).exitCode, // no --decisions/--goals/--repo -> blind
    runWith({
      argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
      files: { d: CLEAN_DECISIONS, g: CLEAN_GOALS },
    }).exitCode, // clean -> 0
    runWith({
      argv: ['--decisions', 'd', '--goals', 'g', '--repo', 'r', '--head', '889887a', '--today', '9-22'],
      files: { d: fixture('decisions-commented.md'), g: CLEAN_GOALS },
    }).exitCode, // blocked -> 1
  ];
  for (const code of cases) assert.ok([0, 1, 3].includes(code), `unexpected exit code ${code}`);
});
