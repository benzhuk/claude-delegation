// node --test skills/multi/scripts/
// No network, no orca, no git binary: every external dependency is injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ENVELOPE_RE, MAX_LINE, NoteError,
  buildEnvelope, parseEnvelope, terminate,
  validateDetails, validateKindNeeds, assertFieldSafe, assertLowercase,
  highestCounter, nextCounter,
  normalizeTitle, titleMatchesSlug, resolvePane,
  classifyPane, composerShows,
  mainCheckout, toPosix, crossHostDetails,
  timeParts, parseArgs, resolveOrcaCommand,
  ledgerPath, notesMirrorPath, appendLine, writePacket, packetTemplate,
  runNoteSend,
} from './note-send.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

const BASE = {
  from: 'taxonomy', to: 'nucleus', date: '9.13.26', time: '10:05', tz: 'NYC',
  id: 'taxonomy-pr132-review-1', kind: 'ASK', body: 'Please review my PR #132',
};

function build(over = {}) { return buildEnvelope({ ...BASE, ...over }); }

function throwsWith(fn, exitCode, re) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof NoteError, `expected NoteError, got ${err}`);
    assert.equal(err.exitCode, exitCode, `exit code: ${err.message}`);
    if (re) assert.match(err.message, re);
    return err;
  }
  assert.fail('expected a throw');
}

async function rejectsWith(promise, exitCode, re) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof NoteError, `expected NoteError, got ${err}`);
    assert.equal(err.exitCode, exitCode, `exit code: ${err.message}`);
    if (re) assert.match(err.message, re);
    return err;
  }
  assert.fail('expected a rejection');
}

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'note-send-'))); }

const idlePane = (over = {}) => ({
  handle: 'term_aaa', title: 'nucleus', connected: true, writable: true, orphaned: false,
  agentIdentity: 'claude', agentWait: null, lastOutputAt: 1_000_000,
  preview: '⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
  worktreePath: '/repo', executionHostId: 'local', ...over,
});
const readOf = (lines, status = 'running') => ({ handle: 'term_aaa', status, tail: lines });
const NOW = 1_000_000 + 5_000; // 5 s after lastOutputAt

// ─────────────────────────────────────────────────────────────────────────────
// Envelope: the pinned example
// ─────────────────────────────────────────────────────────────────────────────

test('builds the contract example line', () => {
  const line = build({ goal: 'faster wall clock, better batch orchestration', details: 'docs/notes/taxonomy-pr132-review-1.md', needs: 'review', by: '15:00' });
  assert.equal(
    line,
    'taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: Please review my PR #132. Goal: faster wall clock, better batch orchestration. Details: docs/notes/taxonomy-pr132-review-1.md Needs: review by 15:00',
  );
  const g = parseEnvelope(line);
  assert.equal(g.details, 'docs/notes/taxonomy-pr132-review-1.md');
  assert.equal(g.by, '15:00');
  assert.equal(g.kind, 'ASK');
  assert.equal(g.goal, 'faster wall clock, better batch orchestration.');
});

test('H3: parsing envelope.md\'s own example strips the stray trailing period from Details', () => {
  const literal = 'taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: Please review my PR #132. Goal: faster wall clock, better batch orchestration. Details: docs/notes/taxonomy-pr132-review-1.md. Needs: review by 15:00';
  const g = parseEnvelope(literal);
  assert.equal(g.details, 'docs/notes/taxonomy-pr132-review-1.md');
});

test('terminate() closes substance and Goal but never Details or by', () => {
  assert.equal(terminate('done'), 'done.');
  assert.equal(terminate('done.'), 'done.');
  assert.equal(terminate('done?'), 'done?');
  const line = build({ kind: 'RESULT', body: 'done', needs: 'none' });
  assert.match(line, /RESULT: done\. Needs: none$/);
});

test('every built line matches the pinned regex', () => {
  for (const over of [
    {},
    { kind: 'FYI', body: 'Batch finished, 413 films' },
    { kind: 'ACK', body: 'Taking it now', needs: 'none' },
    { kind: 'BLOCKED', body: 'Cannot run the suite; node_modules missing', goal: 'unblock the gate' },
    { kind: 'RESULT', body: 'Reviewed', details: 'docs/notes/taxonomy-pr132-review-2.md', needs: 'none' },
    { re: 'nucleus-pr132-review-1' },
    { supersedes: 'taxonomy-pr132-review-1', id: 'taxonomy-pr132-review-4' },
  ]) {
    const line = build(over);
    assert.ok(ENVELOPE_RE.test(line), `no match: ${line}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// H2 — Details paths
// ─────────────────────────────────────────────────────────────────────────────

test('H2: a path with a space is rejected, not silently swallowed', () => {
  throwsWith(() => validateDetails('docs/notes/ping 5.md'), 1, /must not contain spaces/);
  throwsWith(() => build({ details: 'docs/notes/ping 5.md' }), 1, /spaces/);
});

test('H2: Ben\'s Windows path anchor is rejected with a reason, not a silent no-match', () => {
  throwsWith(() => validateDetails('C:\\Users\\benzh\\Code\\Zhuk Projects\\docs\\notes\\x.md'), 1, /spaces|backslashes|drive letter/);
  throwsWith(() => validateDetails('C:/Users/benzh/Code/x.md'), 1, /drive letter/);
  throwsWith(() => validateDetails('docs\\notes\\x.md'), 1, /backslashes/);
});

test('H3: Details must not end with a period', () => {
  throwsWith(() => validateDetails('docs/notes/x.md.'), 1, /must not end with a period/);
});

test('Details accepts a cross-host <host>: prefix', () => {
  assert.equal(validateDetails('netcup:/home/ben/code/x/docs/notes/a-1.md'), 'netcup:/home/ben/code/x/docs/notes/a-1.md');
});

// ─────────────────────────────────────────────────────────────────────────────
// H4 / M4 — ids
// ─────────────────────────────────────────────────────────────────────────────

test('H4: an id must carry the sender prefix', () => {
  throwsWith(() => build({ id: 'pr132-review-1' }), 1, /must start with the sender slug "taxonomy-"/);
});

test('M4: uppercase is rejected with the lowercase form shown', () => {
  throwsWith(() => assertLowercase('topic', 'PR132-review'), 1, /use "pr132-review"/);
  throwsWith(() => build({ id: 'taxonomy-PR132-review-1' }), 1, /taxonomy-pr132-review-1/);
  throwsWith(() => build({ from: 'Taxonomy', id: 'Taxonomy-pr132-review-1' }), 1, /lowercase/);
});

test('an id without a counter is rejected', () => {
  throwsWith(() => build({ id: 'taxonomy-pr132-review' }), 1, /<slug>-<counter>/);
});

test('M5: supersedes and re live inside the brackets', () => {
  const line = build({ id: 'taxonomy-pr132-review-4', supersedes: 'taxonomy-pr132-review-2' });
  assert.match(line, /\[taxonomy-pr132-review-4 supersedes taxonomy-pr132-review-2\]/);
  const g = parseEnvelope(line);
  assert.equal(g.sup, 'taxonomy-pr132-review-2');

  const reply = buildEnvelope({ ...BASE, from: 'nucleus', to: 'taxonomy', id: 'nucleus-pr132-review-1', re: 'taxonomy-pr132-review-1', kind: 'ACK', body: 'Taking it', needs: 'none' });
  assert.equal(parseEnvelope(reply).re, 'taxonomy-pr132-review-1');
});

// ─────────────────────────────────────────────────────────────────────────────
// M3 — kind/needs pairing
// ─────────────────────────────────────────────────────────────────────────────

test('M3: only ASK may carry decision/review/ack', () => {
  for (const kind of ['ACK', 'RESULT', 'BLOCKED', 'FYI']) {
    for (const needs of ['decision', 'review', 'ack']) {
      throwsWith(() => validateKindNeeds(kind, needs), 1, /ASK-only/);
    }
    validateKindNeeds(kind, 'none');
    validateKindNeeds(kind, undefined);
  }
  for (const needs of ['decision', 'review', 'ack', 'none']) validateKindNeeds('ASK', needs);
});

test('M3: the red-team\'s exact counter-example is rejected', () => {
  throwsWith(() => build({ kind: 'FYI', body: 'fyi only', needs: 'decision', by: '15:00' }), 1, /ASK-only/);
});

test('an unknown kind or need is rejected', () => {
  throwsWith(() => validateKindNeeds('PING', undefined), 1, /--kind must be one of/);
  throwsWith(() => validateKindNeeds('ASK', 'maybe'), 1, /--needs must be one of/);
});

test('--by without --needs is rejected', () => {
  throwsWith(() => build({ by: '15:00' }), 1, /--by requires --needs/);
});

// ─────────────────────────────────────────────────────────────────────────────
// H1 / M6 / M7 — one line, no shell payload
// ─────────────────────────────────────────────────────────────────────────────

test('H1: newlines, carriage returns and tabs are rejected in every field', () => {
  for (const bad of ['a\nb', 'a\rb', 'a\tb']) {
    throwsWith(() => assertFieldSafe('text', bad), 1, /one physical line/);
    throwsWith(() => build({ body: bad }), 1, /one physical line/);
    throwsWith(() => build({ goal: bad }), 1, /one physical line/);
  }
});

test('H1: the 500-char cap is enforced with an actionable message', () => {
  const err = throwsWith(() => build({ body: 'x'.repeat(600) }), 1, /over the 500 cap/);
  assert.match(err.message, /detail packet/);
  const justUnder = build({ body: 'x'.repeat(MAX_LINE - 80) });
  assert.ok(justUnder.length <= MAX_LINE);
});

test('reserved words inside a field are rejected', () => {
  throwsWith(() => build({ body: 'see this Details: /etc/passwd now' }), 1, /reserved word "Details:"/);
  throwsWith(() => build({ goal: 'a Needs: b' }), 1, /reserved word "Needs:"/);
});

test('M6: backticks and $( are rejected so a note can never execute', () => {
  throwsWith(() => build({ body: 'run `whoami` please' }), 1, /never be able to execute/);
  throwsWith(() => build({ body: 'run $(whoami) please' }), 1, /never be able to execute/);
});

test('M7: quotes and bare $ survive — argv transport makes them inert', () => {
  const line = build({ body: 'the "batch" flag costs $5 & breaks' });
  assert.match(line, /the "batch" flag costs \$5 & breaks\./);
  assert.ok(ENVELOPE_RE.test(line));
});

// ─────────────────────────────────────────────────────────────────────────────
// Id derivation from the ledgers
// ─────────────────────────────────────────────────────────────────────────────

test('the next counter is one past the highest already in the ledgers', () => {
  const ledgers = [
    'taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: a.\n' +
    'taxonomy → nucleus, 9.13.26 11:05 NYC [taxonomy-pr132-review-3] FYI: b.\n',
    'nucleus → taxonomy, 9.13.26 12:00 NYC [nucleus-pr132-review-9] ACK: c. Needs: none\n',
  ];
  assert.equal(highestCounter(ledgers, 'taxonomy-pr132-review'), 3);
  assert.equal(nextCounter(ledgers, 'taxonomy-pr132-review'), 4);
  assert.equal(nextCounter(ledgers, 'taxonomy-other-topic'), 1);
  assert.equal(nextCounter([], 'taxonomy-x'), 1);
});

test('a counter mentioned as a parent id still reserves that number', () => {
  const ledger = ['nucleus → taxonomy, 9.13.26 12:00 NYC [nucleus-x-1 re taxonomy-pr132-review-7] ACK: c. Needs: none\n'];
  assert.equal(nextCounter(ledger, 'taxonomy-pr132-review'), 8);
});

test('a longer prefix is not matched by a shorter one', () => {
  const ledger = ['a → b, 9.13.26 10:00 NYC [taxonomy-pr132-review-extra-5] FYI: x.\n'];
  assert.equal(highestCounter(ledger, 'taxonomy-pr132-review'), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Pane resolution
// ─────────────────────────────────────────────────────────────────────────────

test('L3: leading status glyphs and inner whitespace are stripped before matching', () => {
  assert.equal(normalizeTitle('✳ Nightrush project setup'), 'nightrush project setup');
  assert.equal(normalizeTitle('◐  accounts '), 'accounts');
  assert.ok(titleMatchesSlug('◑ nucleus', 'nucleus'));
  assert.ok(titleMatchesSlug('✳ Nightrush project setup', 'nightrush-project-setup'));
  assert.ok(!titleMatchesSlug('nightrush-app', 'nucleus'));
});

test('H9: an ambiguous title is exit 2 with every candidate listed, never a guess', () => {
  const panes = [
    { handle: 'term_1', title: 'nightrush-app' },
    { handle: 'term_2', title: 'nightrush-app' },
    { handle: 'term_3', title: 'nucleus' },
  ];
  const err = throwsWith(() => resolvePane(panes, 'nightrush-app'), 2, /matches 2 panes/);
  assert.match(err.message, /term_1/);
  assert.match(err.message, /term_2/);
  assert.ok(!err.message.includes('term_3'));
  assert.equal(resolvePane(panes, 'nucleus').handle, 'term_3');
});

test('H9: a raw handle resolves directly; a missing one is exit 2 with the panes that exist', () => {
  const panes = [{ handle: 'term_3', title: 'nucleus' }];
  assert.equal(resolvePane(panes, 'term_3').handle, 'term_3');
  throwsWith(() => resolvePane(panes, 'term_missing'), 2, /no pane with handle/);
  throwsWith(() => resolvePane(panes, 'astra'), 2, /no pane titled "astra"/);
  throwsWith(() => resolvePane([], 'astra'), 2, /no pane titled/);
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyPane
// ─────────────────────────────────────────────────────────────────────────────

test('classify: an idle Claude pane', () => {
  assert.equal(classifyPane(idlePane(), readOf(['> ', '? for shortcuts']), { now: NOW }), 'agent-idle');
});

test('classify: a working pane', () => {
  const read = readOf(['● Bash(git status)', '✻ Crunching… (esc to interrupt · 12.3k tokens)']);
  assert.equal(classifyPane(idlePane(), read, { now: NOW }), 'agent-working');
});

test('classify: agentWait alone is enough for permission', () => {
  const pane = idlePane({ agentWait: { reason: 'agent-approval-prompt' } });
  assert.equal(classifyPane(pane, readOf(['? for shortcuts']), { now: NOW }), 'permission');
});

test('classify: Claude Code permission selector text in the live tail', () => {
  const read = readOf([
    'Bash command', '  rm -rf build/', 'Do you want to proceed?',
    '❯ 1. Yes', "  2. Yes, and don't ask again this session", '  3. No, and tell Claude what to do differently',
  ]);
  assert.equal(classifyPane(idlePane(), read, { now: NOW }), 'permission');
});

test('classify: Orca/Codex approval wording in the live tail', () => {
  for (const marker of ['Allow once', 'Allow always', 'run this command?', 'Do you trust this folder?', 'permission required']) {
    assert.equal(classifyPane(idlePane(), readOf([marker]), { now: NOW }), 'permission', marker);
  }
});

test('classify: stale permission text older than the live window does not block forever', () => {
  const old = Array.from({ length: 60 }, (_, i) => `scrollback line ${i}`);
  old[2] = 'Do you want to proceed?';
  const read = readOf([...old, '? for shortcuts']);
  assert.equal(classifyPane(idlePane(), read, { now: NOW }), 'agent-idle');
});

test('classify: permission text still on screen wins over an old lastOutputAt', () => {
  const pane = idlePane({ lastOutputAt: NOW - 3 * 60 * 60 * 1000 });
  assert.equal(classifyPane(pane, readOf(['Do you want to proceed?', '❯ 1. Yes']), { now: NOW }), 'permission');
});

test('classify: a pane with no agent is a shell — never typed into (M6)', () => {
  const pane = idlePane({ agentIdentity: undefined, title: 'MINGW64:/c/Users/benzh/Code/Zhuk Projects', preview: '$ ' });
  assert.equal(classifyPane(pane, readOf(['benzh@Ben-Desktop MINGW64 ~/Code/Zhuk Projects', '$']), { now: NOW }), 'shell');
});

test('classify: M2 hibernated — old output and no composer on screen', () => {
  const pane = idlePane({ lastOutputAt: NOW - 45 * 60 * 1000, preview: 'some finished output' });
  assert.equal(classifyPane(pane, readOf(['some finished output']), { now: NOW }), 'hibernated');
});

test('classify: an old but composer-showing pane is still idle', () => {
  const pane = idlePane({ lastOutputAt: NOW - 45 * 60 * 1000 });
  assert.equal(classifyPane(pane, readOf(['? for shortcuts']), { now: NOW }), 'agent-idle');
});

test('classify: unreadable, disconnected, unwritable, orphaned or exited is unknown', () => {
  assert.equal(classifyPane(null, null, { now: NOW }), 'unknown');
  assert.equal(classifyPane(undefined, readOf([]), { now: NOW }), 'unknown');
  assert.equal(classifyPane(idlePane({ connected: false }), readOf(['? for shortcuts']), { now: NOW }), 'unknown');
  assert.equal(classifyPane(idlePane({ writable: false }), readOf(['? for shortcuts']), { now: NOW }), 'unknown');
  assert.equal(classifyPane(idlePane({ orphaned: true }), readOf(['? for shortcuts']), { now: NOW }), 'unknown');
  assert.equal(classifyPane(idlePane(), readOf(['? for shortcuts'], 'exited'), { now: NOW }), 'unknown');
});

test('classify: an agent pane with no recognisable markers is unknown, not assumed idle', () => {
  assert.equal(classifyPane(idlePane({ preview: '' }), readOf(['just some text']), { now: NOW }), 'unknown');
});

test('composerShows survives terminal wrapping of the typed line', () => {
  assert.ok(composerShows(readOf(['> taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr1', '  32-review-1] ASK: hi.']), 'taxonomy-pr132-review-1'));
  assert.ok(!composerShows(readOf(['> nothing typed']), 'taxonomy-pr132-review-1'));
  assert.ok(!composerShows(null, 'taxonomy-pr132-review-1'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Repo resolution
// ─────────────────────────────────────────────────────────────────────────────

test('H6: a worktree resolves to the main checkout', () => {
  const git = () => 'C:/Users/benzh/Code/bto_nucleus/.git\n';
  assert.equal(mainCheckout('C:/Users/benzh/orca/worktrees/wt-7', git), 'C:/Users/benzh/Code/bto_nucleus');
});

test('H6: a plain checkout resolves to itself, and backslashes are normalised (L1)', () => {
  const git = () => '.git\n';
  assert.equal(mainCheckout('C:\\Users\\benzh\\Code\\Zhuk Projects', git), 'C:/Users/benzh/Code/Zhuk Projects');
});

test('a non-repo directory falls back to itself instead of throwing', () => {
  const git = () => { throw new Error('fatal: not a git repository'); };
  assert.equal(mainCheckout('/tmp/whatever', git), '/tmp/whatever');
  assert.equal(mainCheckout('', git), null);
});

test('H9: an empty worktreePath means --recipient-repo is required', async () => {
  const orca = mockOrca({ panes: [idlePane({ worktreePath: '' })] });
  await rejectsWith(
    runNoteSend(['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 't', '--text', 'hi'],
      { orca, home: tmp(), git: () => '.git', now: NOW }),
    1, /no worktreePath \(floating pane\).*--recipient-repo/s,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock orca
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} cfg - { panes, shows: [terminal…] consumed in order, reads: [terminal…], fail }
 */
function mockOrca(cfg) {
  const calls = [];
  const shows = cfg.shows ? [...cfg.shows] : null;
  const reads = cfg.reads ? [...cfg.reads] : null;
  const run = async (args) => {
    calls.push(args);
    const verb = args[1];
    if (verb === 'list') return { terminals: cfg.panes ?? [] };
    if (verb === 'show') return { terminal: shows && shows.length ? shows.shift() : (cfg.panes ?? [])[0] };
    if (verb === 'read') return { terminal: reads && reads.length ? reads.shift() : readOf(['? for shortcuts']) };
    if (verb === 'wait') return { ok: true };
    if (verb === 'send') {
      if (cfg.failSend) throw new NoteError(4, 'orca terminal send failed: pty_not_writable');
      return { ok: true };
    }
    throw new Error(`unexpected orca call ${args.join(' ')}`);
  };
  run.calls = calls;
  return run;
}

const ARGS_OK = (over = []) => [
  '--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films', ...over,
];

// ─────────────────────────────────────────────────────────────────────────────
// Delivery
// ─────────────────────────────────────────────────────────────────────────────

test('happy path: ledger is written first, then text without Enter, then Enter', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: [
    readOf(['? for shortcuts']),                                   // classify #1
    readOf(['> taxonomy → nucleus … [taxonomy-ping-1] FYI: x']),   // post-text verify
    readOf(['> taxonomy → nucleus … [taxonomy-ping-1] FYI: x']),   // re-classify
  ] });
  const res = await runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW });

  assert.equal(res.delivered, true);
  assert.equal(res.classification, 'agent-idle');
  assert.equal(res.id, 'taxonomy-ping-1');

  const sends = orca.calls.filter((c) => c[1] === 'send');
  assert.equal(sends.length, 2);
  assert.ok(sends[0].includes('--text'));
  assert.ok(!sends[0].includes('--enter'), 'phase 1 must NOT press Enter');
  assert.ok(sends[1].includes('--enter'));
  assert.equal(sends[0][sends[0].indexOf('--text') + 1], res.envelope);

  const ledger = fs.readFileSync(ledgerPath(repo, timeParts(new Date(NOW)).ymd), 'utf8');
  assert.ok(ledger.includes(res.envelope));
  assert.ok(fs.existsSync(notesMirrorPath(home, timeParts(new Date(NOW)).ymd)), '~/.agents/notes mirror (H6)');
});

test('C1: a state change between the two phases aborts before Enter', async () => {
  const repo = tmp(); const home = tmp();
  const pane = idlePane({ worktreePath: repo });
  const orca = mockOrca({
    panes: [pane],
    shows: [pane, { ...pane, agentWait: { reason: 'agent-approval-prompt' } }],
    reads: [
      readOf(['? for shortcuts']),
      readOf(['> taxonomy → nucleus … [taxonomy-ping-1] FYI: x']),
      readOf(['Do you want to proceed?', '❯ 1. Yes']),
    ],
  });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW }), 3, /aborted before Enter/);
  assert.match(err.message, /agent-idle" → "permission/);
  assert.equal(orca.calls.filter((c) => c[1] === 'send' && c.includes('--enter')).length, 0, 'Enter must never be sent');
  assert.ok(fs.readFileSync(ledgerPath(repo, timeParts(new Date(NOW)).ymd), 'utf8').includes('[taxonomy-ping-1]'),
    'the ledger keeps the record even when delivery aborts');
});

test('C1: the typed line not appearing in the composer also aborts before Enter', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: [
    readOf(['? for shortcuts']), readOf(['? for shortcuts']), readOf(['? for shortcuts']),
  ] });
  await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /not visible in the composer/);
  assert.equal(orca.calls.filter((c) => c.includes('--enter')).length, 0);
});

test('a permission pane defers with exit 3 and nothing typed', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentWait: { reason: 'agent-approval-prompt' } });
  const orca = mockOrca({ panes: [pane] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW, sleep: async () => {} }),
    3, /permission\/approval prompt/,
  );
  assert.match(err.message, /you own the retry/i);
  assert.equal(orca.calls.filter((c) => c[1] === 'send').length, 0);
});

test('a shell pane is never typed into', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: undefined, title: 'nucleus' });
  const orca = mockOrca({ panes: [pane], reads: [readOf(['$'])] });
  await rejectsWith(runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /would EXECUTE/);
  assert.equal(orca.calls.filter((c) => c[1] === 'send').length, 0);
});

test('M1: a Codex pane mid-turn is deferred, never typed into', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  const working = readOf(['✻ thinking… (esc to interrupt)']);
  const orca = mockOrca({ panes: [pane], reads: [working, working] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW }),
    3, /Codex mid-turn queuing is unproven/,
  );
  assert.match(err.message, /not idle/);
  assert.equal(orca.calls.filter((c) => c[1] === 'send').length, 0);
});

test('M1: a Codex pane that is idle receives the note', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  const orca = mockOrca({ panes: [pane], reads: [
    readOf(['⏎ send']), readOf(['[taxonomy-ping-1]']), readOf(['[taxonomy-ping-1]']),
  ] });
  const res = await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW });
  assert.equal(res.delivered, true);
});

test('an orca CLI failure surfaces as exit 4 with the CLI message', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], failSend: true, reads: [readOf(['? for shortcuts'])] });
  await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 4, /pty_not_writable/);
});

// ─────────────────────────────────────────────────────────────────────────────
// H8 — cross-host
// ─────────────────────────────────────────────────────────────────────────────

test('H8: --recipient-repo on a cross-host pane is exit 5', async () => {
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'netcup' })] });
  await rejectsWith(
    runNoteSend(ARGS_OK(['--recipient-repo', tmp(), '--sender-repo', tmp()]), { orca, home: tmp(), git: () => '.git', now: NOW }),
    5, /cross-host note keeps its packet in the SENDER's repo/,
  );
});

test('H8: a cross-host note without --sender-repo is exit 5', async () => {
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'netcup' })] });
  await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }),
    5, /needs --sender-repo/,
  );
});

test('H8: a cross-host note writes its ledger into the sender repo', async () => {
  const sender = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'netcup', worktreePath: '/remote/repo' })], reads: [
    readOf(['? for shortcuts']), readOf(['[taxonomy-ping-1]']), readOf(['[taxonomy-ping-1]']),
  ] });
  const res = await runNoteSend(ARGS_OK(['--sender-repo', sender]), { orca, home, git: () => '.git', now: NOW });
  assert.equal(res.delivered, true);
  assert.ok(res.ledgers.some((l) => l.startsWith(sender)), 'ledger lands in the sender repo');
});

test('H8: Details on a cross-host note becomes <host>:<absolute posix path>', () => {
  assert.equal(
    crossHostDetails('/home/ben/code/bto_nucleus', 'docs/notes/taxonomy-ping-1.md', 'ben-desktop'),
    'ben-desktop:/home/ben/code/bto_nucleus/docs/notes/taxonomy-ping-1.md',
  );
});

test('CONTRACT GAP: a Windows absolute path cannot be expressed cross-host, and says so', () => {
  throwsWith(
    () => crossHostDetails('C:/Users/benzh/Code/bto_nucleus', 'docs/notes/a-1.md', 'ben-desktop'),
    5, /no drive letters/,
  );
  throwsWith(
    () => crossHostDetails('/home/ben/Zhuk Projects', 'docs/notes/a-1.md', 'netcup'),
    5, /no spaces/,
  );
});

test('same-host panes are not treated as cross-host', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo, executionHostId: 'local' })], reads: [
    readOf(['? for shortcuts']), readOf(['[taxonomy-ping-1]']), readOf(['[taxonomy-ping-1]']),
  ] });
  const res = await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW });
  assert.ok(res.ledgers[0].startsWith(repo));
});

// ─────────────────────────────────────────────────────────────────────────────
// H10 — the reserved recipient
// ─────────────────────────────────────────────────────────────────────────────

test('H10: --to ben records and notifies without resolving any pane', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'ben', '--kind', 'ASK', '--topic', 'deploy-gate', '--text',
      'Prod deploy needs your call; the peer note cannot authorise it', '--needs', 'decision', '--sender-repo', repo],
    { orca, home, git: () => '.git', now: NOW },
  );
  assert.equal(res.delivered, false);
  assert.equal(res.notified, true);
  assert.equal(res.exitCode, 0);
  assert.equal(orca.calls.length, 0, 'no orca call is made for ben');
  assert.match(res.envelope, /taxonomy → ben, .* \[taxonomy-deploy-gate-1\] ASK: .* Needs: decision$/);
  assert.ok(fs.readFileSync(res.ledgers[0], 'utf8').includes('[taxonomy-deploy-gate-1]'));
});

// ─────────────────────────────────────────────────────────────────────────────
// --dry-run
// ─────────────────────────────────────────────────────────────────────────────

test('--dry-run touches neither orca nor the filesystem', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(ARGS_OK(['--recipient-repo', repo, '--dry-run']), { orca, home, git: () => '.git', now: NOW });
  assert.equal(res.dryRun, true);
  assert.equal(orca.calls.length, 0);
  assert.ok(res.plan.length >= 4);
  assert.ok(!fs.existsSync(path.join(repo, 'docs')));
  assert.ok(!fs.existsSync(path.join(home, '.agents')));
});

test('--dry-run without --recipient-repo says why it cannot plan', async () => {
  await rejectsWith(
    runNoteSend(ARGS_OK(['--dry-run']), { orca: mockOrca({ panes: [] }), home: tmp(), git: () => '.git', now: NOW }),
    1, /--dry-run without --recipient-repo/,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Files, args, misc
// ─────────────────────────────────────────────────────────────────────────────

test('appendLine creates the day file with a header, then appends bare lines', () => {
  const dir = tmp();
  const file = ledgerPath(dir, '2026-09-13');
  appendLine(file, 'line one');
  appendLine(file, 'line two');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^# Peer-note ledger 2026-09-13\n\nline one\nline two\n$/);
});

test('writePacket never clobbers a packet the recipient may have annotated (L5)', () => {
  const dir = tmp();
  const file = path.join(dir, 'docs/notes/x-1.md');
  assert.equal(writePacket(file, 'first').written, true);
  assert.equal(writePacket(file, 'second').written, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'first');
});

test('L5: the packet template carries a Received / acted section', () => {
  const t = packetTemplate({ id: 'a-1', title: 't', from: 'a', to: 'b', date: '9.13.26', time: '10:00', tz: 'NYC', body: 'x' });
  assert.match(t, /## Received \/ acted/);
  assert.match(t, /supersedes: none/);
});

test('times are rendered in Ben\'s zone whatever the box clock says', () => {
  // 2026-09-13 03:05 UTC is 2026-09-12 23:05 in New York
  const p = timeParts(new Date(Date.UTC(2026, 8, 13, 3, 5)));
  assert.equal(p.date, '9.12.26');
  assert.equal(p.time, '23:05');
  assert.equal(p.ymd, '2026-09-12');
});

test('argument parsing rejects unknown flags and missing values', () => {
  assert.deepEqual(parseArgs(['--from', 'a', '--dry-run']), { from: 'a', 'dry-run': true });
  throwsWith(() => parseArgs(['--nope', 'x']), 1, /unknown flag/);
  throwsWith(() => parseArgs(['--from']), 1, /needs a value/);
  throwsWith(() => parseArgs(['bare']), 1, /unexpected argument/);
});

test('a bad envelope is rejected before orca is touched at all', async () => {
  const orca = mockOrca({ panes: [idlePane()] });
  const deps = { orca, home: tmp(), git: () => '.git', now: NOW };
  await rejectsWith(runNoteSend(ARGS_OK(['--to', 'Nucleus']), deps), 1, /use "nucleus"/);
  await rejectsWith(runNoteSend(ARGS_OK(['--needs', 'decision']), deps), 1, /ASK-only/);
  await rejectsWith(runNoteSend(ARGS_OK(['--details', 'docs/notes/a b.md']), deps), 1, /spaces/);
  await rejectsWith(runNoteSend(ARGS_OK(['--text', 'run `whoami`']), deps), 1, /execute/);
  assert.equal(orca.calls.length, 0, 'no orca call for a note that cannot be built');
});

test('missing required arguments are named', async () => {
  await rejectsWith(runNoteSend(['--from', 'a'], { orca: mockOrca({}), home: tmp() }), 1, /--to is required/);
});

test('every envelope printed in references/examples.md parses', () => {
  const file = new URL('../references/examples.md', import.meta.url);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n').filter((l) => /^[a-z0-9-]+ → [a-z0-9-]+, \d/.test(l.trim()));
  assert.ok(lines.length >= 8, `expected at least 8 example envelopes, found ${lines.length}`);
  for (const line of lines) {
    const g = parseEnvelope(line.trim());
    assert.ok(g, `does not match the pinned regex:\n${line}`);
    assert.ok(line.trim().length <= MAX_LINE, `over the ${MAX_LINE} cap:\n${line}`);
    assert.ok(g.id.startsWith(`${g.from}-`), `id is not sender-prefixed:\n${line}`);
    if (g.kind !== 'ASK' && g.needs) assert.equal(g.needs, 'none', `non-ASK with a real need:\n${line}`);
    if (g.details) assert.doesNotThrow(() => validateDetails(g.details), `bad Details path:\n${line}`);
  }
});

test('every envelope in the pinned envelope.md parses too', () => {
  const file = new URL('../references/envelope.md', import.meta.url);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n').filter((l) => /^[a-z0-9-]+ → [a-z0-9-]+, \d/.test(l.trim()));
  assert.ok(lines.length >= 1);
  for (const line of lines) assert.ok(parseEnvelope(line.trim()), `does not match:\n${line}`);
});

test('the orca command resolves --orca > $ORCA_CLI > orca', () => {
  assert.deepEqual(resolveOrcaCommand('node C:/x/index.js', {}), { exe: 'node', base: ['C:/x/index.js'] });
  assert.deepEqual(resolveOrcaCommand(undefined, { ORCA_CLI: '/usr/local/bin/orca-native-fixed' }),
    { exe: '/usr/local/bin/orca-native-fixed', base: [] });
  assert.deepEqual(resolveOrcaCommand(undefined, {}), { exe: 'orca', base: [] });
});
