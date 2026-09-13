// node --test "skills/multi/scripts/*.test.mjs"
// Transport and I/O. No network, no orca, no git binary: every external dependency is injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  NoteError, MAX_LINE,
  normalizeTitle, titleMatchesSlug, resolvePane, isLocalPane,
  classifyPane, composerShows, LIVE_TAIL_LINES,
  mainCheckout, toPosix,
  ledgerPath, notesMirrorPath, packetPathFor, appendLine, writePacket,
  parseArgs, resolveOrcaCommand, timeParts,
  runNoteSend,
} from './note-send.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

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
const NOW = 1_000_000 + 5_000;

/** The live evidence for review C1: Claude Code randomises the spinner verb, so a mid-turn pane
 *  shows composer chrome and no working marker. */
const FALSE_IDLE_TAIL = readOf([
  '✢ Schlepping… (0s)',
  '❯',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
]);

/**
 * @param {object} cfg - { panes, shows: [] in order, reads: [] in order, failSend, failWait, failEnter }
 */
function mockOrca(cfg = {}) {
  const calls = [];
  const shows = cfg.shows ? [...cfg.shows] : null;
  const reads = cfg.reads ? [...cfg.reads] : null;
  let sendCount = 0;
  const run = async (args) => {
    calls.push(args);
    const verb = args[1];
    if (verb === 'list') return { terminals: cfg.panes ?? [] };
    if (verb === 'show') return { terminal: shows && shows.length ? shows.shift() : (cfg.panes ?? [])[0] };
    if (verb === 'read') return { terminal: reads && reads.length ? reads.shift() : readOf(['? for shortcuts']) };
    if (verb === 'wait') {
      if (cfg.failWait) throw new NoteError(4, 'orca terminal wait failed: unknown_condition');
      return { ok: true };
    }
    if (verb === 'send') {
      sendCount += 1;
      if (cfg.failSend) throw new NoteError(4, 'orca terminal send failed: pty_not_writable');
      if (cfg.failEnter && args.includes('--enter')) throw new NoteError(4, 'orca terminal send failed: terminal_handle_stale');
      return { ok: true };
    }
    throw new Error(`unexpected orca call ${args.join(' ')}`);
  };
  run.calls = calls;
  run.sends = () => calls.filter((c) => c[1] === 'send');
  run.enters = () => calls.filter((c) => c[1] === 'send' && c.includes('--enter'));
  return run;
}

const ARGS_OK = (over = []) => [
  '--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping',
  '--text', 'Batch finished, 413 films', ...over,
];

/** reads for a clean delivery: classify, baseline, post-text verify, re-classify */
const DELIVERY_READS = (id = 'taxonomy-ping-1') => [
  readOf(['? for shortcuts']),
  readOf(['? for shortcuts']),
  readOf([`> taxonomy → nucleus … [${id}] FYI: x`]),
  readOf([`> taxonomy → nucleus … [${id}] FYI: x`]),
];

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

test('M4: a mis-set ORCA_SENDER_HOST cannot flip local panes to cross-host', () => {
  assert.ok(isLocalPane({ executionHostId: 'local' }, 'ben-desktop'));
  assert.ok(isLocalPane({ executionHostId: 'local' }, ''));
  assert.ok(isLocalPane({}, 'whatever'));
  assert.ok(isLocalPane({ executionHostId: 'netcup' }, 'netcup'));
  assert.ok(!isLocalPane({ executionHostId: 'netcup' }, ''));
  assert.ok(!isLocalPane({ executionHostId: 'netcup' }, 'ben-desktop'));
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyPane
// ─────────────────────────────────────────────────────────────────────────────

test('classify: an idle Claude pane', () => {
  assert.equal(classifyPane(idlePane(), readOf(['> ', '? for shortcuts']), { now: NOW }), 'agent-idle');
});

test('classify: a working pane that names its spinner', () => {
  assert.equal(classifyPane(idlePane(), readOf(['✻ Crunching… (esc to interrupt · 12.3k tokens)']), { now: NOW }), 'agent-working');
});

test('C1: a mid-turn pane with a randomised spinner verb classifies agent-idle — known and load-bearing', () => {
  // This is the live-observed false idle. It is why the Codex gate uses `terminal wait --for tui-idle`
  // rather than this classification; asserting it here keeps the reason visible if the markers change.
  assert.equal(classifyPane(idlePane(), FALSE_IDLE_TAIL, { now: NOW }), 'agent-idle');
});

test('classify: agentWait alone is enough for permission', () => {
  assert.equal(classifyPane(idlePane({ agentWait: { reason: 'agent-approval-prompt' } }), readOf(['? for shortcuts']), { now: NOW }), 'permission');
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
  assert.equal(classifyPane(idlePane(), readOf([...old, '? for shortcuts']), { now: NOW }), 'agent-idle');
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
  assert.equal(classifyPane(idlePane({ lastOutputAt: NOW - 45 * 60 * 1000 }), readOf(['? for shortcuts']), { now: NOW }), 'agent-idle');
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

// ─────────────────────────────────────────────────────────────────────────────
// composerShows — review H1
// ─────────────────────────────────────────────────────────────────────────────

test('composerShows survives terminal wrapping of the typed line', () => {
  assert.ok(composerShows(readOf(['> taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr1', '  32-review-1] ASK: hi.']), 'taxonomy-pr132-review-1'));
  assert.ok(!composerShows(readOf(['> nothing typed']), 'taxonomy-pr132-review-1'));
  assert.ok(!composerShows(null, 'taxonomy-pr132-review-1'));
});

test('H1: an id sitting in old scrollback does NOT count as a composer match', () => {
  const scrollback = Array.from({ length: 60 }, (_, i) => `line ${i}`);
  scrollback[0] = '> taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-ping-1] FYI: an earlier send';
  assert.ok(!composerShows(readOf([...scrollback, '? for shortcuts']), 'taxonomy-ping-1'),
    'a match this far back is scrollback, not the composer');
  // the same id inside the live window still matches
  assert.ok(composerShows(readOf([...scrollback.slice(0, 40), '> … [taxonomy-ping-1] FYI: just typed']), 'taxonomy-ping-1'));
  assert.equal(LIVE_TAIL_LINES, 30);
});

test('H1: a note whose id is already on screen is refused before Enter', async () => {
  const repo = tmp();
  const orca = mockOrca({
    panes: [idlePane({ worktreePath: repo })],
    reads: [readOf(['? for shortcuts']), readOf(['> … [taxonomy-ping-1] FYI: already here'])],
  });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /already on screen/);
  assert.match(err.message, /refusing to press Enter/);
  assert.equal(orca.sends().length, 0, 'nothing is typed when the baseline is dirty');
});

// ─────────────────────────────────────────────────────────────────────────────
// Repo resolution
// ─────────────────────────────────────────────────────────────────────────────

test('H6: a worktree resolves to the main checkout', () => {
  assert.equal(mainCheckout('C:/Users/benzh/orca/worktrees/wt-7', () => 'C:/Users/benzh/Code/bto_nucleus/.git\n'), 'C:/Users/benzh/Code/bto_nucleus');
});

test('H6: a plain checkout resolves to itself, and backslashes are normalised (L1)', () => {
  assert.equal(mainCheckout('C:\\Users\\benzh\\Code\\Zhuk Projects', () => '.git\n'), 'C:/Users/benzh/Code/Zhuk Projects');
});

test('a non-repo directory falls back to itself instead of throwing', () => {
  const git = () => { throw new Error('fatal: not a git repository'); };
  assert.equal(mainCheckout('/tmp/whatever', git), '/tmp/whatever');
  assert.equal(mainCheckout('', git), null);
});

test('H9: an empty worktreePath means --recipient-repo is required', async () => {
  const orca = mockOrca({ panes: [idlePane({ worktreePath: '' })] });
  await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }),
    1, /no worktreePath \(floating pane\).*--recipient-repo/s,
  );
});

test('a recipient repo that does not exist locally is exit 1, not a phantom write', async () => {
  const orca = mockOrca({ panes: [idlePane({ worktreePath: '/definitely/not/here' })] });
  await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 1, /does not exist/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Delivery
// ─────────────────────────────────────────────────────────────────────────────

test('happy path: ledger first, then text without Enter, then Enter', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW });

  assert.equal(res.delivered, true);
  assert.equal(res.classification, 'agent-idle');
  assert.equal(res.id, 'taxonomy-ping-1');

  const sends = orca.sends();
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
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo });
  const orca = mockOrca({
    panes: [pane],
    shows: [pane, { ...pane, agentWait: { reason: 'agent-approval-prompt' } }],
    reads: [
      readOf(['? for shortcuts']),
      readOf(['? for shortcuts']),
      readOf(['> … [taxonomy-ping-1] FYI: x']),
      readOf(['Do you want to proceed?', '❯ 1. Yes']),
    ],
  });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /aborted before Enter/);
  assert.match(err.message, /agent-idle" → "permission/);
  assert.equal(orca.enters().length, 0, 'Enter must never be sent');
  assert.ok(fs.readFileSync(ledgerPath(repo, timeParts(new Date(NOW)).ymd), 'utf8').includes('[taxonomy-ping-1]'),
    'the ledger keeps the record even when delivery aborts');
  assert.deepEqual(err.ledgers.length, 2, 'M2: the failure carries the ledger paths');
});

test('C1: the typed line not appearing in the composer also aborts before Enter', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: [
    readOf(['? for shortcuts']), readOf(['? for shortcuts']), readOf(['? for shortcuts']), readOf(['? for shortcuts']),
  ] });
  await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /not visible in the composer/);
  assert.equal(orca.enters().length, 0);
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
  assert.equal(orca.sends().length, 0);
});

test('a shell pane is never typed into', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: undefined, title: 'nucleus' });
  const orca = mockOrca({ panes: [pane], reads: [readOf(['$'])] });
  await rejectsWith(runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /would EXECUTE/);
  assert.equal(orca.sends().length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// The Codex gate — review C1 / H3
// ─────────────────────────────────────────────────────────────────────────────

test('C1/H3: a Codex pane that FALSELY classifies idle still waits for tui-idle before anything is typed', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  // Classify, post-wait re-classify and the baseline all show the live false-idle tail: no working
  // marker, composer chrome present. Only after the text send does the id appear.
  const typed = readOf(['> … [taxonomy-ping-1] FYI: x', '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents']);
  const orca = mockOrca({ panes: [pane], reads: [FALSE_IDLE_TAIL, FALSE_IDLE_TAIL, FALSE_IDLE_TAIL, typed] });
  await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW });
  const waits = orca.calls.filter((c) => c[1] === 'wait');
  assert.equal(waits.length, 1, 'the tui-idle wait must run even when our classifier says idle');
  assert.ok(waits[0].includes('tui-idle'));
  // and it must run BEFORE the first send
  assert.ok(orca.calls.indexOf(waits[0]) < orca.calls.indexOf(orca.sends()[0]));
});

test('C1: a Codex pane fails CLOSED when terminal wait cannot run', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  const orca = mockOrca({ panes: [pane], failWait: true, reads: [FALSE_IDLE_TAIL] });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /tui-idle.*did not succeed/s);
  assert.match(err.message, /nothing was typed/);
  assert.equal(orca.sends().length, 0);
});

test('M1: a Codex pane with no wait budget is deferred, never typed into', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  const orca = mockOrca({ panes: [pane], reads: [readOf(['⏎ send'])] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW }),
    3, /needs a positive --wait-max/,
  );
  assert.match(err.message, /Codex mid-turn queuing is unproven/);
  assert.equal(orca.sends().length, 0);
  assert.equal(orca.calls.filter((c) => c[1] === 'wait').length, 0);
});

test('M1: a Codex pane that goes unsendable after the wait is deferred', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  const orca = mockOrca({
    panes: [pane],
    shows: [pane, { ...pane, agentWait: { reason: 'codex-interactive-prompt' } }],
    reads: [readOf(['⏎ send']), readOf(['Allow once'])],
  });
  await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 3, /permission\/approval prompt/);
  assert.equal(orca.sends().length, 0);
});

test('a Claude pane never calls terminal wait — it queues typed input mid-turn', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW });
  assert.equal(orca.calls.filter((c) => c[1] === 'wait').length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 — failures keep the record
// ─────────────────────────────────────────────────────────────────────────────

test('M2: a failed first send is exit 4 and says nothing was typed, with the ledger paths', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], failSend: true, reads: [readOf(['? for shortcuts']), readOf(['? for shortcuts'])] });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 4, /pty_not_writable/);
  assert.match(err.message, /nothing was typed/);
  assert.equal(err.ledgers.length, 2);
  assert.ok(err.envelope.includes('[taxonomy-ping-1]'));
});

test('M2: a failed Enter says the envelope is stranded in the composer', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], failEnter: true, reads: DELIVERY_READS() });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 4, /sitting UNSENT/);
  assert.match(err.message, /press Enter by hand/);
  assert.equal(err.ledgers.length, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// v3 cross-host
// ─────────────────────────────────────────────────────────────────────────────

test('v3: --recipient-repo on a non-local pane is exit 5 and names the ssh form', async () => {
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'netcup' })] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--recipient-repo', tmp()]), { orca, home: tmp(), git: () => '.git', now: NOW }),
    5, /--recipient-repo cannot reach it/,
  );
  assert.match(err.message, /ssh <host> note-send/);
});

test('v3: a non-local pane whose repo is not here is exit 5 pointing at ssh', async () => {
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'netcup', worktreePath: '/home/ben/code/bto_nucleus' })] });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW }), 5, /does not exist here/);
  assert.match(err.message, /Run note-send on that host/);
});

test('v3: run on the recipient host, the same note is an ordinary local send', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'local', worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW });
  assert.equal(res.delivered, true);
  assert.ok(res.ledgers[0].startsWith(repo), 'the ledger lands in the recipient repo');
});

// ─────────────────────────────────────────────────────────────────────────────
// v3 --packet-file / --force
// ─────────────────────────────────────────────────────────────────────────────

test('v3: --packet-file writes docs/notes/<id>.md before the ledger line', async () => {
  const repo = tmp(); const home = tmp();
  const src = path.join(tmp(), 'packet.md');
  fs.writeFileSync(src, '# taxonomy-ping-1 — the packet body\n');
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(['--packet-file', src]), { orca, home, git: () => '.git', now: NOW });
  assert.equal(res.packetPath, packetPathFor(repo, 'taxonomy-ping-1'));
  assert.equal(res.packetWritten, true);
  assert.match(fs.readFileSync(res.packetPath, 'utf8'), /the packet body/);
});

test('v3: --packet-file - reads the body from stdin (the ssh form)', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(['--packet-file', '-']), {
    orca, home: tmp(), git: () => '.git', now: NOW, stdin: '# from stdin\n\n## Ask\nreview it\n',
  });
  assert.match(fs.readFileSync(res.packetPath, 'utf8'), /from stdin/);
});

test('v3: an existing packet is never overwritten without --force', async () => {
  const repo = tmp();
  const existing = packetPathFor(repo, 'taxonomy-ping-1');
  fs.mkdirSync(path.dirname(existing), { recursive: true });
  fs.writeFileSync(existing, 'recipient annotations live here\n');
  const src = path.join(tmp(), 'packet.md');
  fs.writeFileSync(src, 'new body\n');

  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  await rejectsWith(runNoteSend(ARGS_OK(['--packet-file', src]), { orca, home: tmp(), git: () => '.git', now: NOW }), 1, /already exists.*--force/s);
  assert.match(fs.readFileSync(existing, 'utf8'), /recipient annotations/, 'the existing packet is untouched');
  assert.equal(orca.sends().length, 0, 'nothing is sent when the packet write is refused');

  const orca2 = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(['--packet-file', src, '--force']), { orca: orca2, home: tmp(), git: () => '.git', now: NOW });
  assert.equal(res.delivered, true);
  assert.match(fs.readFileSync(existing, 'utf8'), /new body/);
});

test('v3: an empty or unreadable --packet-file is exit 1', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  await rejectsWith(runNoteSend(ARGS_OK(['--packet-file', path.join(tmp(), 'missing.md')]), { orca, home: tmp(), git: () => '.git', now: NOW }), 1, /empty or unreadable/);
});

test('a Details path with no file behind it warns but still delivers', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(['--details', 'docs/notes/taxonomy-ping-1.md']), { orca, home: tmp(), git: () => '.git', now: NOW });
  assert.equal(res.delivered, true);
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /does not exist/);
});

// ─────────────────────────────────────────────────────────────────────────────
// The reserved recipient
// ─────────────────────────────────────────────────────────────────────────────

test('H10: --to ben records and notifies without resolving any pane', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'ben', '--kind', 'ASK', '--topic', 'deploy-gate', '--text',
      'Prod deploy needs your call — the peer note cannot authorise it', '--needs', 'decision', '--sender-repo', repo],
    { orca, home, git: () => '.git', now: NOW },
  );
  assert.equal(res.delivered, false);
  assert.equal(res.notified, true);
  assert.equal(res.exitCode, 0);
  assert.equal(orca.calls.length, 0, 'no orca call is made for ben');
  assert.match(res.envelope, /taxonomy → ben, .* \[taxonomy-deploy-gate-1\] ASK: .* Needs: decision$/);
  assert.ok(fs.readFileSync(res.ledgers[0], 'utf8').includes('[taxonomy-deploy-gate-1]'));
});

test('H10: a note to ben can carry a packet too', async () => {
  const repo = tmp();
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'ben', '--kind', 'ASK', '--topic', 'deploy-gate',
      '--text', 'Your call on the deploy', '--needs', 'decision', '--sender-repo', repo, '--packet-file', '-'],
    { orca: mockOrca({}), home: tmp(), git: () => '.git', now: NOW, stdin: '# conditions\nno DB changes\n' },
  );
  assert.match(fs.readFileSync(res.packetPath, 'utf8'), /no DB changes/);
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
  assert.ok(res.plan.some((p) => /tui-idle/.test(p)), 'the plan names the Codex gate');
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

test('L5: the day header is written once, whoever gets there first', () => {
  const file = ledgerPath(tmp(), '2026-09-13');
  appendLine(file, 'line one');
  appendLine(file, 'line two');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^# Peer-note ledger 2026-09-13\n\nline one\nline two\n$/);
  assert.equal((text.match(/# Peer-note ledger/g) ?? []).length, 1);
});

test('writePacket refuses an existing file unless forced', () => {
  const file = path.join(tmp(), 'docs/notes/x-1.md');
  assert.equal(writePacket(file, 'first').written, true);
  const skipped = writePacket(file, 'second');
  assert.equal(skipped.written, false);
  assert.equal(skipped.skipped, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'first');
  assert.equal(writePacket(file, 'third', { force: true }).written, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'third');
});

test('a bad envelope is rejected before orca is touched at all', async () => {
  const orca = mockOrca({ panes: [idlePane()] });
  const deps = { orca, home: tmp(), git: () => '.git', now: NOW };
  await rejectsWith(runNoteSend(ARGS_OK(['--to', 'Nucleus']), deps), 1, /use "nucleus"/);
  await rejectsWith(runNoteSend(ARGS_OK(['--needs', 'decision']), deps), 1, /ASK-only/);
  await rejectsWith(runNoteSend(ARGS_OK(['--details', 'docs/notes/a b.md']), deps), 1, /spaces/);
  await rejectsWith(runNoteSend(ARGS_OK(['--text', 'run `whoami`']), deps), 1, /execute/);
  await rejectsWith(runNoteSend(ARGS_OK(['--text', 'fixed; rm -rf build']), deps), 1, /execute/);
  assert.equal(orca.calls.length, 0, 'no orca call for a note that cannot be built');
});

test('L2: a non-numeric --wait-max or --n is exit 1, not a silent NaN', async () => {
  const deps = { orca: mockOrca({ panes: [idlePane()] }), home: tmp(), git: () => '.git', now: NOW };
  await rejectsWith(runNoteSend(ARGS_OK(['--wait-max', 'abc']), deps), 1, /--wait-max must be a whole number/);
  await rejectsWith(runNoteSend(ARGS_OK(['--n', 'abc']), deps), 1, /--n must be a positive integer/);
});

test('argument parsing rejects unknown flags and missing values', () => {
  assert.deepEqual(parseArgs(['--from', 'a', '--dry-run', '--force']), { from: 'a', 'dry-run': true, force: true });
  assert.deepEqual(parseArgs(['--packet-file', '-']), { 'packet-file': '-' });
  throwsWith(() => parseArgs(['--nope', 'x']), 1, /unknown flag/);
  throwsWith(() => parseArgs(['--from']), 1, /needs a value/);
  throwsWith(() => parseArgs(['bare']), 1, /unexpected argument/);
});

test('missing required arguments are named', async () => {
  await rejectsWith(runNoteSend(['--from', 'a'], { orca: mockOrca({}), home: tmp() }), 1, /--to is required/);
});

test('the orca command resolves --orca > $ORCA_CLI > orca', () => {
  assert.deepEqual(resolveOrcaCommand('node C:/x/index.js', {}), { exe: 'node', base: ['C:/x/index.js'] });
  assert.deepEqual(resolveOrcaCommand(undefined, { ORCA_CLI: '/usr/local/bin/orca-native-fixed' }),
    { exe: '/usr/local/bin/orca-native-fixed', base: [] });
  assert.deepEqual(resolveOrcaCommand(undefined, {}), { exe: 'orca', base: [] });
});

test('the envelope the sender types is the envelope the ledger records', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW });
  const typed = orca.sends()[0][orca.sends()[0].indexOf('--text') + 1];
  assert.equal(typed, res.envelope);
  assert.ok(typed.length <= MAX_LINE);
  for (const l of res.ledgers) assert.ok(fs.readFileSync(l, 'utf8').includes(typed));
});
