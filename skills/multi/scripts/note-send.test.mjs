// node --test "skills/multi/scripts/*.test.mjs"
// Transport and I/O. No network, no orca, no git binary: every external dependency is injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv, scratchHome } from './test-child-env.mjs';

import { parseEnvelope } from './envelope.mjs';
import { runNoteInbox } from './note-inbox.mjs';
// review MAJOR-4: importing `runNoteFlush` is allowed (only editing note-flush.mjs is out of
// territory) — it is what lets the R3 test exercise the REAL outbox retry rather than a stand-in.
import { runNoteFlush } from './note-flush.mjs';
import {
  NoteError, MAX_LINE,
  normalizeTitle, titleMatchesSlug, resolvePane, isLocalPane,
  classifyPane, composerShows, LIVE_TAIL_LINES,
  mainCheckout, toPosix,
  ledgerPath, notesMirrorPath, packetPathFor, appendLine, writePacket,
  parseArgs, resolveOrcaCommand, timeParts, isMainModule,
  findOnPath, orcaHint, ORCA_WINDOWS_FORK,
  runNoteSend, writeBinding, writeInbox, firstStderrLine, failureJson,
  wakeAllKindsPath, noUnknownCheckPath, withoutIds, undeliveredIds, outboxDir, deadOutboxDir, knownSlugs,
  MIRROR_HOSTS, resolveSenderHost, remoteAppendCommand,
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
/**
 * Typing is the LAST RESORT since 0.5.0 (spec 2026-09-17, D3): note-send posts into the recipient's own
 * inbox, and only reaches for a composer when `MULTI_ALLOW_TYPING=1` says it may. Every test below that
 * asserts a KEYSTROKE therefore opts in explicitly — which is also how this suite documents that a
 * default send types nothing at all.
 */
const TYPING = { MULTI_ALLOW_TYPING: '1' };

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

// N1 (2026-09-20): ACK and FYI are ledger-only — no pane resolution, no delivery. This suite's default
// fixture exercises pane resolution and delivery, so it uses ASK (unaffected by N1); the N1 behaviour
// itself has its own dedicated tests below.
const ARGS_OK = (over = []) => [
  '--from', 'taxonomy', '--to', 'nucleus', '--kind', 'ASK', '--topic', 'ping',
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

// ─────────────────────────────────────────────────────────────────────────────
// R7 — the two real pane-title shapes
// ─────────────────────────────────────────────────────────────────────────────

test('R7: Codex titles carry a " | <worktree>" suffix that must not defeat the match', () => {
  // These are the live Netcup titles that made `--to astra` exit 2.
  assert.equal(normalizeTitle('⠇ astra | bto-workflows'), 'astra');
  assert.equal(normalizeTitle('n-astra | bto_nucleus'), 'n-astra');
  assert.ok(titleMatchesSlug('⠇ astra | bto-workflows', 'astra'));
  assert.ok(titleMatchesSlug('n-astra | bto_nucleus', 'n-astra'));
  assert.ok(titleMatchesSlug('astra | bto-workflows', 'astra'), 'the spinner is optional');
});

test('R7: Claude titles are a glyph plus the name', () => {
  assert.equal(normalizeTitle('◑ taxonomy'), 'taxonomy');
  assert.equal(normalizeTitle('✳ nucleus'), 'nucleus');
  assert.ok(titleMatchesSlug('◑ taxonomy', 'taxonomy'));
  assert.ok(titleMatchesSlug('✳ nucleus', 'nucleus'));
});

test('R7: every spinner frame normalizes away', () => {
  // the full braille spinner cycle Orca uses, plus the block/star frames and a couple of strays
  for (const glyph of [
    '⠇', '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠏',
    '◐', '◑', '◒', '◓', '✳', '●', '✢', '·', '*',
  ]) {
    assert.equal(normalizeTitle(`${glyph} astra`), 'astra', `glyph ${glyph}`);
    assert.equal(normalizeTitle(`${glyph} astra | bto-workflows`), 'astra', `glyph ${glyph} with worktree`);
  }
});

test('R7: the worktree half never matches on its own, and matching stays exact', () => {
  assert.ok(!titleMatchesSlug('⠇ astra | bto-workflows', 'bto-workflows'));
  assert.ok(!titleMatchesSlug('⠇ astra | bto-workflows', 'astr'), 'no prefix match');
  assert.ok(!titleMatchesSlug('⠇ astra | bto-workflows', 'astra-bto-workflows'));
  assert.ok(!titleMatchesSlug('n-astra | bto_nucleus', 'astra'), 'n-astra is not astra');
});

test('R7: matching is case-insensitive on both sides', () => {
  assert.ok(titleMatchesSlug('⠇ ASTRA | bto-workflows', 'astra'));
  assert.ok(titleMatchesSlug('◑ Taxonomy', 'taxonomy'));
});

test('R7: shell and plain titles are unaffected', () => {
  assert.equal(normalizeTitle('MINGW64:/c/Users/benzh/Code/Zhuk Projects'), 'mingw64 c users benzh code zhuk projects');
  assert.equal(normalizeTitle('nightrush-app'), 'nightrush-app');
  assert.equal(normalizeTitle('benzh'), 'benzh');
  assert.equal(normalizeTitle(''), '');
  assert.equal(normalizeTitle(undefined), '');
});

test('R7: resolution works end to end on the live Netcup pane list, and exit 2 still shows raw titles', () => {
  const panes = [
    { handle: 'term_1', title: '⠇ astra | bto-workflows', agentIdentity: 'codex' },
    { handle: 'term_2', title: 'n-astra | bto_nucleus', agentIdentity: 'codex' },
    { handle: 'term_3', title: '◑ taxonomy', agentIdentity: 'claude' },
    { handle: 'term_4', title: '✳ nucleus', agentIdentity: 'claude' },
  ];
  assert.equal(resolvePane(panes, 'astra').handle, 'term_1');
  assert.equal(resolvePane(panes, 'n-astra').handle, 'term_2');
  assert.equal(resolvePane(panes, 'taxonomy').handle, 'term_3');
  assert.equal(resolvePane(panes, 'nucleus').handle, 'term_4');

  // the candidate list keeps the RAW titles — that is what made this diagnosable
  const err = throwsWith(() => resolvePane(panes, 'ghost'), 2, /no pane titled "ghost"/);
  assert.match(err.message, /⠇ astra \| bto-workflows/);
  assert.match(err.message, /n-astra \| bto_nucleus/);
});

test('R7: two panes reducing to the same slug is still exit 2, never a guess', () => {
  const panes = [
    { handle: 'term_1', title: '⠇ astra | bto-workflows' },
    { handle: 'term_2', title: '◐ astra | bto_nucleus' },
  ];
  const err = throwsWith(() => resolvePane(panes, 'astra'), 2, /matches 2 panes/);
  assert.match(err.message, /term_1/);
  assert.match(err.message, /term_2/);
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

test('H1: a composer holding our id AND foreign text is never submitted', async () => {
  const repo = tmp();
  // `FYI: already here` is not a well-formed envelope, so this is text nobody can account for — a
  // human's message, as far as we can tell. It is left alone.
  const orca = mockOrca({
    panes: [idlePane({ worktreePath: repo })],
    reads: [readOf(['? for shortcuts']), readOf(['─'.repeat(40), '❯ … [taxonomy-ping-1] FYI: already here', '─'.repeat(40)])],
  });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }),
    3, /composer but so is text that is not a note/,
  );
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

test('H6: a drive-lettered checkout composes a bare `.git` common-dir with no platform branch (L1)', () => {
  // Same drive-lettered/bare-`.git` shape as the test above, already forward-slashed so this one
  // isolates the composition fix itself from the backslash-normalisation step. No `process.platform`
  // check in this test: `mainCheckout`'s own string logic is what must make this pass on Linux too.
  assert.equal(mainCheckout('C:/Users/benzh/Code/Zhuk Projects', () => '.git\n'), 'C:/Users/benzh/Code/Zhuk Projects');
});

test('a non-repo directory falls back to itself instead of throwing', () => {
  const git = () => { throw new Error('fatal: not a git repository'); };
  assert.equal(mainCheckout('/tmp/whatever', git), '/tmp/whatever');
  assert.equal(mainCheckout('', git), null);
});

test('H9: an empty worktreePath means --recipient-repo is required', async () => {
  const orca = mockOrca({ panes: [idlePane({ worktreePath: '' })] });
  await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }),
    1, /no worktreePath \(floating pane\).*--recipient-repo/s,
  );
});

test('a recipient repo that does not exist locally is exit 1, not a phantom write', async () => {
  const orca = mockOrca({ panes: [idlePane({ worktreePath: '/definitely/not/here' })] });
  await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 1, /does not exist/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Delivery
// ─────────────────────────────────────────────────────────────────────────────

test('happy path: ledger first, then text without Enter, then Enter', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: TYPING });

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

test('D3: a send resolves through the BINDING when the pane title is no longer the slug', async () => {
  const repo = tmp(); const home = tmp();
  // The pane Ben restarted: Codex retitled it from `nucleus` to whatever the conversation is called.
  writeBinding(home, 'term_bbb', 'nucleus', { now: NOW });
  const pane = idlePane({ handle: 'term_bbb', title: 'Continue | bto-workflows', worktreePath: repo });
  const orca = mockOrca({ panes: [pane], reads: DELIVERY_READS() });

  const res = await runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: TYPING });
  assert.equal(res.delivered, true);
  assert.equal(res.handle, 'term_bbb');
  assert.equal(orca.enters().length, 1);
  assert.equal(res.to, 'nucleus', 'the ledger line is addressed to the slug, not the title');
});

test('D3: an exact TITLE still wins over a binding that points elsewhere', async () => {
  const repo = tmp(); const home = tmp();
  writeBinding(home, 'term_bbb', 'nucleus', { now: NOW });
  const titled = idlePane({ handle: 'term_aaa', title: 'nucleus', worktreePath: repo });
  const bound = idlePane({ handle: 'term_bbb', title: 'Continue', worktreePath: repo });
  const orca = mockOrca({ panes: [titled, bound], reads: DELIVERY_READS() });

  const res = await runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: TYPING });
  assert.equal(res.handle, 'term_aaa', 'a rename is the newest intent');
});

test('MAJOR 2: --to <handle> files the note under the BINDING, not the conversation title', async () => {
  const repo = tmp(); const home = tmp();
  // Both ambiguity errors tell people to re-send with a handle, and Codex titles are no longer slugs.
  // Deriving the recipient from `Continue | bto-workflows` files the line as addressed to `continue`,
  // which no note-inbox anywhere ever reads — delivered to the pane, invisible in the ledger.
  writeBinding(home, 'term_bbb', 'nucleus', { now: NOW });
  const pane = idlePane({ handle: 'term_bbb', title: 'Continue | bto-workflows', worktreePath: repo });
  const orca = mockOrca({ panes: [pane], reads: DELIVERY_READS() });

  const args = ['--from', 'taxonomy', '--to', 'term_bbb', '--kind', 'ASK', '--topic', 'ping', '--text', 'Batch finished, 413 films'];
  const res = await runNoteSend(args, { orca, home, git: () => '.git', now: NOW, env: TYPING });
  assert.match(res.envelope, /^taxonomy → nucleus, /, 'the ledger line must name a slug note-inbox reads');
  assert.equal(res.delivered, true);
  assert.equal(res.handle, 'term_bbb');
});

test('MAJOR 2: with no binding it still falls back to the title, as it always did', async () => {
  const repo = tmp(); const home = tmp();
  const pane = idlePane({ handle: 'term_bbb', title: 'nucleus', worktreePath: repo });
  const orca = mockOrca({ panes: [pane], reads: DELIVERY_READS() });
  const args = ['--from', 'taxonomy', '--to', 'term_bbb', '--kind', 'ASK', '--topic', 'ping', '--text', 'Batch finished, 413 films'];
  const res = await runNoteSend(args, { orca, home, git: () => '.git', now: NOW, env: TYPING });
  assert.match(res.envelope, /^taxonomy → nucleus, /);
});

test('D3/H9: two LIVE panes bound to one slug is exit 2 — recorded and queued, never guessed', async () => {
  const repo = tmp(); const home = tmp();
  writeBinding(home, 'term_bbb', 'nucleus', { now: NOW });
  writeBinding(home, 'term_ccc', 'nucleus', { now: NOW });
  const orca = mockOrca({ panes: [
    idlePane({ handle: 'term_bbb', title: 'Continue', worktreePath: repo }),
    idlePane({ handle: 'term_ccc', title: 'switch-to-astra-model', worktreePath: repo }),
  ] });

  const err = await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /bound to 2 live panes/,
  );
  assert.equal(err.queued, true, 'H3: a pane-name problem costs latency, not the note');
  assert.ok(err.ledgers.length > 0);
  assert.equal(orca.sends().length, 0);
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
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 3, /aborted before Enter/);
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
  await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 3, /not visible in the composer/);
  assert.equal(orca.enters().length, 0);
});

test('a permission pane defers with exit 3 and nothing typed', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentWait: { reason: 'agent-approval-prompt' } });
  const orca = mockOrca({ panes: [pane] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW, sleep: async () => {}, env: TYPING }),
    3, /permission\/approval prompt/,
  );
  assert.match(err.message, /queued\s+in the outbox/i);
  assert.match(err.message, /Do NOT re-send this id/);
  assert.equal(err.queued, true, 'V5: a deferral writes the wake-up to the outbox');
  assert.equal(orca.sends().length, 0);
});

test('a shell pane is never typed into', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: undefined, title: 'nucleus' });
  const orca = mockOrca({ panes: [pane], reads: [readOf(['$'])] });
  await rejectsWith(runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 3, /would EXECUTE/);
  assert.equal(orca.sends().length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// The Codex gate — review C1 / H3
// ─────────────────────────────────────────────────────────────────────────────

test('V6: a Codex pane is never waited on — `terminal wait --for tui-idle` NEVER resolves for one', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  const composer = readOf(['› ']);
  const typed = readOf(['› taxonomy → nucleus … [taxonomy-ping-1] FYI: x']);
  const orca = mockOrca({ panes: [pane], reads: [composer, composer, typed, typed] });
  const res = await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
  assert.equal(res.delivered, true);
  assert.equal(orca.calls.filter((c) => c[1] === 'wait').length, 0, 'the v3 tui-idle wait is gone (pilot: it times out on idle Codex panes)');
});

test('V6: a Codex pane mid-turn is deferred, not typed into — Codex does not queue input', async () => {
  const repo = tmp(); const home = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  const orca = mockOrca({ panes: [pane], reads: [readOf(['› ', '• Working (42s • esc to interrupt)'])] });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: TYPING }), 3, /does not queue typed input/);
  assert.equal(orca.sends().length, 0);
  assert.equal(err.queued, true);
  assert.ok(fs.existsSync(path.join(home, '.agents/notes/outbox/taxonomy-ping-1.json')));
});

test('V6: a Codex braille shimmer line reads as working, never as idle', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex' });
  // The shimmer the pilot found: output recency is meaningless, the FRAME is the evidence.
  const orca = mockOrca({ panes: [pane], reads: [readOf(['⣻⣻⣻⠿ Thinking', '› '])] });
  await rejectsWith(runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 3, /Codex pane mid-turn/);
  assert.equal(orca.sends().length, 0);
});

test('V6: a Codex pane at an approval prompt is deferred with the permission reason', async () => {
  const repo = tmp();
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex', agentWait: { reason: 'codex-interactive-prompt' } });
  const orca = mockOrca({ panes: [pane], reads: [readOf(['Allow once'])] });
  await rejectsWith(
    runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home: tmp(), git: () => '.git', now: NOW, sleep: async () => {}, env: TYPING }),
    3, /permission\/approval prompt/,
  );
  assert.equal(orca.sends().length, 0);
});

test('a Claude pane never calls terminal wait — it queues typed input mid-turn', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
  assert.equal(orca.calls.filter((c) => c[1] === 'wait').length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 — failures keep the record
// ─────────────────────────────────────────────────────────────────────────────

test('M2: a failed first send is exit 4 and says nothing was typed, with the ledger paths', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], failSend: true, reads: [readOf(['? for shortcuts']), readOf(['? for shortcuts'])] });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 4, /pty_not_writable/);
  assert.match(err.message, /nothing was typed/);
  assert.equal(err.ledgers.length, 2);
  assert.ok(err.envelope.includes('[taxonomy-ping-1]'));
});

test('M2: a failed Enter says the envelope is stranded in the composer', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], failEnter: true, reads: DELIVERY_READS() });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 4, /sitting UNSENT/);
  assert.match(err.message, /Clear the pane by hand/);
  assert.equal(err.ledgers.length, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// v3 cross-host
// ─────────────────────────────────────────────────────────────────────────────

test('v3: --recipient-repo on a non-local pane is exit 5 and names the ssh form', async () => {
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'netcup' })] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--recipient-repo', tmp()]), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }),
    5, /--recipient-repo cannot reach it/,
  );
  // R4: the suggested command must be the robust one — absolute path, single-quoted as one argument.
  assert.match(err.message, /ssh <host> '~\/\.local\/bin\/note-send .* --packet-file -'/);
});

test('v3: a non-local pane whose repo is not here is exit 5 pointing at ssh', async () => {
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'netcup', worktreePath: '/home/ben/code/bto_nucleus' })] });
  const err = await rejectsWith(runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 5, /does not exist here/);
  assert.match(err.message, /Run note-send on that host/);
  assert.match(err.message, /ssh <host> '~\/\.local\/bin\/note-send .* --packet-file -'/);
});

test('v3: run on the recipient host, the same note is an ordinary local send', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ executionHostId: 'local', worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
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
  const res = await runNoteSend(ARGS_OK(['--packet-file', src]), { orca, home, git: () => '.git', now: NOW, env: TYPING });
  assert.equal(res.packetPath, packetPathFor(repo, 'taxonomy-ping-1'));
  assert.equal(res.packetWritten, true);
  assert.match(fs.readFileSync(res.packetPath, 'utf8'), /the packet body/);
});

test('packet-file derives Details from the resolved id and the recipient inbox resolves that packet', async () => {
  const repo = tmp(); const home = tmp();
  const src = path.join(tmp(), 'packet.md');
  fs.writeFileSync(src, '# actual packet\n');
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const sent = await runNoteSend(ARGS_OK(['--packet-file', src]), { orca, home, git: () => '.git', now: NOW, env: TYPING });
  const parsed = parseEnvelope(sent.envelope);
  assert.equal(parsed.details, 'docs/notes/taxonomy-ping-1.md');
  const inbox = await runNoteInbox(['--me', 'nucleus', '--repo', repo], {
    home, cwd: repo, git: () => '.git', now: NOW, env: {},
  });
  assert.equal(inbox.count, 1);
  assert.equal(inbox.notes[0].details, parsed.details);
  assert.equal(inbox.notes[0].packetPath, sent.packetPath);
  assert.equal(inbox.notes[0].packetExists, true);
});

test('packet-file derives the same Details in dry-run and preserves an explicit Details reference', async () => {
  const repo = tmp(); const src = path.join(tmp(), 'packet.md');
  fs.writeFileSync(src, '# packet\n');
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const dry = await runNoteSend(ARGS_OK(['--packet-file', src, '--dry-run', '--recipient-repo', repo]), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
  assert.equal(parseEnvelope(dry.envelope).details, 'docs/notes/taxonomy-ping-1.md');
  const explicit = await runNoteSend(ARGS_OK(['--packet-file', src, '--details', 'docs/notes/separate.md']), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
  assert.equal(parseEnvelope(explicit.envelope).details, 'docs/notes/separate.md');
  assert.equal(explicit.packetPath, packetPathFor(repo, 'taxonomy-ping-1'));
});

test('v3: --packet-file - reads the body from stdin (the ssh form)', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(['--packet-file', '-']), {
    orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING, stdin: '# from stdin\n\n## Ask\nreview it\n',
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
  await rejectsWith(runNoteSend(ARGS_OK(['--packet-file', src]), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 1, /already exists.*--force/s);
  assert.match(fs.readFileSync(existing, 'utf8'), /recipient annotations/, 'the existing packet is untouched');
  assert.equal(orca.sends().length, 0, 'nothing is sent when the packet write is refused');

  const orca2 = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(['--packet-file', src, '--force']), { orca: orca2, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
  assert.equal(res.delivered, true);
  assert.match(fs.readFileSync(existing, 'utf8'), /new body/);
});

test('v3: an empty or unreadable --packet-file is exit 1', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  await rejectsWith(runNoteSend(ARGS_OK(['--packet-file', path.join(tmp(), 'missing.md')]), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING }), 1, /empty or unreadable/);
});

test('a Details path with no file behind it warns but still delivers', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(['--details', 'docs/notes/taxonomy-ping-1.md']), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
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
  const res = await runNoteSend(ARGS_OK(['--recipient-repo', repo, '--dry-run']), { orca, home, git: () => '.git', now: NOW, env: TYPING });
  assert.equal(res.dryRun, true);
  assert.equal(orca.calls.length, 0);
  assert.ok(res.plan.some((p) => /Codex idle only/.test(p)), 'the plan names the Codex gate');
  assert.ok(res.plan.some((p) => /outbox/.test(p)), 'the plan names the outbox fallback');
  assert.ok(!fs.existsSync(path.join(repo, 'docs')));
  assert.ok(!fs.existsSync(path.join(home, '.agents')));
});

test('--dry-run without --recipient-repo says why it cannot plan', async () => {
  await rejectsWith(
    runNoteSend(ARGS_OK(['--dry-run']), { orca: mockOrca({ panes: [] }), home: tmp(), git: () => '.git', now: NOW, env: TYPING }),
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
  await rejectsWith(runNoteSend(ARGS_OK(['--kind', 'FYI', '--needs', 'decision']), deps), 1, /ASK-only/);
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
  await rejectsWith(runNoteSend(['--from', 'a'], { orca: mockOrca({}), home: tmp(), env: TYPING }), 1, /--to is required/);
});

// ─────────────────────────────────────────────────────────────────────────────
// R5 — the script must run when it is reached through a symlink
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = fileURLToPath(new URL('./note-send.mjs', import.meta.url));

/** A directory symlink to this script's folder: a junction on Windows (no admin needed), else a symlink. */
function linkedScriptsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-send-link-'));
  const link = path.join(dir, 'scripts');
  try {
    fs.symlinkSync(path.dirname(SCRIPT), link, process.platform === 'win32' ? 'junction' : 'dir');
    return link;
  } catch {
    return null; // no symlink privilege: the caller skips
  }
}

/**
 * N2: a fixture HOME and the sealed messaging vars, through the one helper. This ran with no `env` at
 * all, so the child inherited Ben's real `~/.agents/notes` AND this session's inbox credential. Nothing
 * it runs today registers or posts - `--help`, a `--dry-run`, an exit-1 rejection - but the next test
 * anybody adds here would be a real send, reading the real registry and able to post into a live
 * session. The rule is the class, not today's luck.
 */
function runScript(script, args, home = scratchHome(fs, 'note-send-cli-')) {
  const options = { encoding: 'utf8', env: childEnv(home) };
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [script, ...args], options) };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('R5: isMainModule sees through a symlinked entry path', () => {
  const url = new URL('./note-send.mjs', import.meta.url).href;
  assert.equal(isMainModule(url, SCRIPT), true, 'the real path is main');
  assert.equal(isMainModule(url, undefined), false, 'no entry point means not main');
  assert.equal(isMainModule(url, path.join(path.dirname(SCRIPT), 'envelope.mjs')), false, 'a sibling module is not main');
  // a path that cannot be canonicalised still counts when it carries our basename
  assert.equal(isMainModule(url, path.join(os.tmpdir(), 'nope', 'note-send.mjs')), true);
});

test('R5: running the script THROUGH a symlink still produces output and exit codes', () => {
  const link = linkedScriptsDir();
  if (!link) return; // unprivileged environment; the unit test above still covers the guard
  const linked = path.join(link, 'note-send.mjs');

  const help = runScript(linked, ['--help']);
  assert.equal(help.code, 0);
  assert.ok(help.stdout.length > 200, `--help through a symlink printed ${help.stdout.length} bytes — a silent no-op is the bug this test exists for`);
  assert.match(help.stdout, /note-send --from/);

  const repo = tmp();
  const dry = runScript(linked, ['--dry-run', '--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI',
    '--topic', 'ping', '--text', 'through a symlink', '--recipient-repo', repo]);
  assert.equal(dry.code, 0);
  assert.match(dry.stdout, /taxonomy → nucleus, .* \[taxonomy-ping-1\] FYI: through a symlink\./);

  const bad = runScript(linked, ['--from', 'x', '--to', 'y', '--kind', 'FYI', '--topic', 't', '--text', 'a; rm -rf /']);
  assert.equal(bad.code, 1, 'a rejected note must still exit 1 through a symlink');
});

test('R5: --help prints usage and exits 0 on the direct path too', () => {
  const help = runScript(SCRIPT, ['--help']);
  assert.equal(help.code, 0);
  assert.ok(help.stdout.length > 200);
  const noArgs = runScript(SCRIPT, []);
  assert.equal(noArgs.code, 1, 'no arguments is usage + exit 1');
  assert.ok(noArgs.stdout.length > 200, 'even the no-argument path prints the usage');
});

// ─────────────────────────────────────────────────────────────────────────────
// R6 — orca CLI resolution
// ─────────────────────────────────────────────────────────────────────────────

const HOME = '/home/ben';
/** existsSync mock: only the listed absolute paths exist, separator-insensitive. */
const only = (...paths) => (p) => paths.includes(String(p).split(path.sep).join('/'));
/** Same, but case-insensitive — Windows' real existsSync is, and PATHEXT is conventionally uppercase. */
const onlyCI = (...paths) => {
  const set = paths.map((s) => s.toLowerCase());
  return (p) => set.includes(String(p).split(path.sep).join('/').toLowerCase());
};
const posixDeps = (exists) => ({ existsSync: exists, platform: 'linux', home: HOME });
const winDeps = (exists) => ({ existsSync: exists, platform: 'win32', home: 'C:/Users/benzh' });

test('R6: --orca beats everything, then $ORCA_CLI', () => {
  const deps = posixDeps(only(`${HOME}/.local/bin/orca`));
  const explicit = resolveOrcaCommand('node C:/x/index.js', { ORCA_CLI: '/nope' }, deps);
  assert.equal(explicit.exe, 'node');
  assert.deepEqual(explicit.base, ['C:/x/index.js']);
  assert.equal(explicit.source, '--orca');

  const fromEnv = resolveOrcaCommand(undefined, { ORCA_CLI: '/usr/local/bin/orca-native-fixed' }, deps);
  assert.equal(fromEnv.exe, '/usr/local/bin/orca-native-fixed');
  assert.deepEqual(fromEnv.base, []);
  assert.equal(fromEnv.source, '$ORCA_CLI');
});

test('R6: PATH wins over the ~/.local/bin fallbacks', () => {
  const deps = posixDeps(only('/usr/bin/orca', `${HOME}/.local/bin/orca-native-fixed`));
  const r = resolveOrcaCommand(undefined, { PATH: '/usr/bin:/bin' }, deps);
  assert.equal(r.exe, 'orca');
  assert.equal(r.source, 'PATH');
});

test('R6: the Netcup case — nothing on PATH, orca-native-fixed found in ~/.local/bin', () => {
  const deps = posixDeps(only(`${HOME}/.local/bin/orca-native-fixed`, `${HOME}/.local/bin/orca`));
  const r = resolveOrcaCommand(undefined, { PATH: '/usr/bin:/bin' }, deps);
  assert.equal(r.exe, `${HOME}/.local/bin/orca-native-fixed`, 'orca-native-fixed is tried before plain orca');
  assert.match(r.source, /Hetzner/);
});

test('R6: plain ~/.local/bin/orca is the next fallback', () => {
  const deps = posixDeps(only(`${HOME}/.local/bin/orca`));
  const r = resolveOrcaCommand(undefined, { PATH: '/usr/bin' }, deps);
  assert.equal(r.exe, `${HOME}/.local/bin/orca`);
});

test('R6: Windows falls back to the fork CLI through node', () => {
  const fork = 'C:/Users/benzh/.local/share/orca-fork-cli/out/cli/index.js';
  const r = resolveOrcaCommand(undefined, { PATH: 'C:/Windows', PATHEXT: '.EXE;.CMD' }, winDeps(onlyCI(fork)));
  assert.equal(r.exe, 'node');
  assert.deepEqual(r.base, [fork]);
  assert.equal(r.source, 'orca-fork-cli');
});

test('R6: the fork CLI is NOT used on POSIX', () => {
  const deps = posixDeps(only(`${HOME}/${ORCA_WINDOWS_FORK}`));
  const r = resolveOrcaCommand(undefined, { PATH: '/usr/bin' }, deps);
  assert.equal(r.source, 'not found');
});

test('R6: nothing found keeps the contract default and records where it looked', () => {
  const r = resolveOrcaCommand(undefined, { PATH: '/usr/bin' }, posixDeps(() => false));
  assert.equal(r.exe, 'orca', 'the default stays `orca`, so the spawn error is the CLI\'s own');
  assert.equal(r.source, 'not found');
  assert.deepEqual(r.tried, ['orca on PATH', `${HOME}/.local/bin/orca-native-fixed`, `${HOME}/.local/bin/orca`]);

  const hint = orcaHint(r);
  assert.match(hint, /no orca CLI found/);
  assert.match(hint, /orca-native-fixed/);
  assert.match(hint, /bash -lc/, 'the non-login shell fix is in the message');
  assert.match(hint, /--orca <cmd> or set ORCA_CLI/);
});

test('R6: a successful resolution names itself in the hint', () => {
  const r = resolveOrcaCommand('node /x/cli.js', {}, posixDeps(() => false));
  assert.match(orcaHint(r), /orca resolved from --orca: node \/x\/cli\.js/);
});

test('R6: an empty --orca or ORCA_CLI is exit 1, naming which one', () => {
  throwsWith(() => resolveOrcaCommand('   ', {}, posixDeps(() => false)), 1, /--orca resolved to an empty command/);
  throwsWith(() => resolveOrcaCommand(undefined, { ORCA_CLI: '  ' }, posixDeps(() => false)), 1, /\$ORCA_CLI/);
});

test('R6: findOnPath honours PATHEXT on Windows and a bare name on POSIX', () => {
  assert.equal(findOnPath('orca', { PATH: '/usr/bin:/bin' }, { existsSync: only('/bin/orca'), platform: 'linux' }),
    path.join('/bin', 'orca'));
  assert.equal(findOnPath('orca', { PATH: 'C:/a;C:/b', PATHEXT: '.EXE;.CMD' },
    { existsSync: onlyCI('C:/b/orca.cmd'), platform: 'win32' }).toLowerCase(), path.join('C:/b', 'orca.cmd').toLowerCase());
  assert.equal(findOnPath('orca', {}, { existsSync: () => false, platform: 'linux' }), null);
});

test('the envelope the sender types is the envelope the ledger records', async () => {
  const repo = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(), { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING });
  const typed = orca.sends()[0][orca.sends()[0].indexOf('--text') + 1];
  assert.equal(typed, res.envelope);
  assert.ok(typed.length <= MAX_LINE);
  for (const l of res.ledgers) assert.ok(fs.readFileSync(l, 'utf8').includes(typed));
});

test('AR: a note to a pane Orca titled "Action Required" is recorded and queued, never typed', async () => {
  const repo = tmp(); const home = tmp();
  // Live shape, 2026-09-13 15:55 NYC: a bracketed status tag BEFORE the slug, worktree suffix after.
  const pane = idlePane({ worktreePath: repo, agentIdentity: 'codex', title: '[ . ] Action Required | nucleus | bto-workflows' });
  const orca = mockOrca({ panes: [pane], reads: [readOf(['› '])] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--wait-max', '0']), { orca, home, git: () => '.git', now: NOW, sleep: async () => {}, env: TYPING }),
    3, /permission\/approval prompt/,
  );
  assert.equal(orca.sends().length, 0, 'nothing may be typed at a pane waiting on a human');
  assert.equal(err.queued, true);
  assert.ok(fs.existsSync(path.join(home, '.agents/notes/outbox/taxonomy-ping-1.json')));
  // The slug still resolved — the whole point. A decorated title used to be exit 2.
  assert.match(err.envelope, /taxonomy → nucleus,/);
});

// ─────────────────────────────────────────────────────────────────────────────
// H3 — a pane-NAME problem must never cost the note
// ─────────────────────────────────────────────────────────────────────────────

test('H3: a pane that does not resolve still gets the note into the ledger, then exits 2', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  // Defect 1 (2026-09-27): "no pane titled X, no inbox, no mirror, no --recipient-repo" is now the
  // exit-6 refusal below — --local-ok is exactly the bypass for a sender who knows this machine's
  // ledger is what the recipient reads, which is what this H3 fixture models.
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--local-ok']), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /no pane titled "nucleus"/,
  );
  // The whole point: exit 2 used to mean the note vanished.
  assert.ok(err.ledgers.length > 0, 'the note must be recorded even when the pane is not found');
  assert.equal(err.queued, true);
  const mirror = err.ledgers.find((l) => l.includes('/.agents/notes/'));
  assert.ok(mirror, `the mirror is what every note-inbox reads; got ${err.ledgers}`);
  assert.match(fs.readFileSync(mirror, 'utf8'), /\[taxonomy-ping-1\] ASK:/);
  assert.ok(fs.existsSync(path.join(home, '.agents/notes/outbox/taxonomy-ping-1.json')));
  assert.match(err.message, /The note IS recorded/);
  assert.match(err.message, /Do NOT re-send this id/);
  assert.equal(orca.sends().length, 0);
});

test('H3: an AMBIGUOUS pane is the same — recorded, queued, then exit 2 with the candidates', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({
    panes: [
      idlePane({ handle: 'term_one', title: 'nucleus', worktreePath: repo }),
      idlePane({ handle: 'term_two', title: '◑ nucleus', worktreePath: repo }),
    ],
  });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /matches 2 panes/,
  );
  assert.ok(err.ledgers.length > 0);
  assert.equal(err.queued, true);
  assert.match(err.message, /term_one/);
  assert.equal(orca.sends().length, 0);
});

test('H3: the ledger falls back to ORCA_WORKTREE_ID, and the warning says whose repo it is', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  // Defect 1 (2026-09-27): --local-ok bypasses the new exit-6 refusal so this stays an H3 regression.
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--json', '--local-ok']), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /no pane titled/,
  );
  assert.ok(err.ledgers.some((l) => l.startsWith(toPosix(repo))), `repo ledger missing from ${err.ledgers}`);
  assert.ok(err.warnings.some((w) => /did not resolve/.test(w)));
});

test('H3: a raw handle that resolves to nothing records NOTHING, and says why', async () => {
  const home = tmp();
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'term_gone']), { orca, home, git: () => '.git', now: NOW, env: TYPING }),
    2, /Nothing was recorded/,
  );
  // A handle names no slug, so a ledger line would be addressed to nobody and no note-inbox would see it.
  assert.match(err.message, /Re-send with --to <slug>/);
  assert.equal(fs.existsSync(path.join(home, '.agents/notes')), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Defect 1 (spec docs/specs/multi-cross-host-1/spec.md, 2026-09-27): a note with no local reader and
// no mirror target is refused (exit 6, no ledger line) rather than silently recorded and read by
// nobody. Supersedes H3 for exactly the "found no pane at all" case; ambiguous resolution, --to ben,
// --recipient-repo, a resolved mirror target and a registered inbox are all still H3/N1/N2 territory.
// ─────────────────────────────────────────────────────────────────────────────

test('Defect 1: typed path, no inbox, no mirror, no --recipient-repo, pane not found — exit 6, refusal JSON, NO ledger line', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.equal(err.to, 'nucleus');
  // Fix 2 (render-guard, pack/spec.md): the JSON hint must name a form that actually works — never
  // "--sender-host <this host>" (wrong for a local run: --sender-host names the machine the sender
  // came FROM, and only mirrors when note-send runs on another machine).
  assert.equal(
    err.hint,
    "run note-send on the recipient's machine over ssh: ssh <user@host> '~/.local/bin/note-send ... "
    + "--packet-file -' < packet.md; pass --local-ok if this machine's ledger is what the recipient reads",
  );
  assert.doesNotMatch(err.hint, /--sender-host <this host>/);
  assert.match(err.hint, /--packet-file -/);
  assert.match(err.message, /NO ledger line was written/);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes')), false, 'nothing under the mirror either');
  assert.equal(fs.existsSync(path.join(repo, 'docs')), false, 'nothing under the recipient repo either');
  const json = failureJson(err, err.exitCode);
  assert.deepEqual(
    { refused: json.refused, to: json.to, hint: json.hint },
    {
      refused: 'no-local-recipient',
      to: 'nucleus',
      hint: "run note-send on the recipient's machine over ssh: ssh <user@host> '~/.local/bin/note-send ... "
        + "--packet-file -' < packet.md; pass --local-ok if this machine's ledger is what the recipient reads",
    },
  );
  assert.doesNotMatch(json.hint, /--sender-host <this host>/);
  assert.match(json.hint, /--packet-file -/);
});

test('Defect 1: the quiet (ledger-only) path is refused too, before any pane lookup is attempted', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(
      ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
      { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
    ),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.equal(orca.calls.length, 0, 'the quiet path never resolves a pane even to refuse');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes')), false, 'no ledger, no outbox');
  assert.equal(fs.existsSync(path.join(repo, 'docs')), false, 'no repo ledger');
});

test('Defect 1: --no-type is refused too, before any pane lookup is attempted', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--no-type']), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.equal(orca.calls.length, 0, '--no-type already resolves no pane; the refusal changes nothing about that');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes')), false, 'no ledger, no outbox');
  assert.equal(fs.existsSync(path.join(repo, 'docs')), false, 'no repo ledger');
});

test('Defect 1: --local-ok bypasses the refusal on the quiet path too, resuming the old N1 exit-0 ledger-only behaviour', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films', '--local-ok'],
    { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.wake, 'none');
  assert.ok(fs.existsSync(res.ledgers[0]));
});

// review F5 (lead ruling): --dry-run must report the same refusal, not preview a success that would
// not actually happen — a preview describing the wrong world is worse than none.
test('Defect 1: --dry-run on the quiet path reports the exit-6 refusal too, not a success preview', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(
      ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films', '--dry-run'],
      { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
    ),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.equal(orca.calls.length, 0);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes')), false, 'a dry-run refusal writes nothing, same as a real one');
});

test('Defect 1: --dry-run + --local-ok still previews the ledger-only success, unaffected', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films', '--dry-run', '--local-ok'],
    { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.dryRun, true);
});

test('Defect 1: --to ben is exempt — still exit 0 notified, even with no inbox and no mirror target', async () => {
  const repo = tmp();
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'ben', '--kind', 'ASK', '--topic', 'deploy-gate',
      '--text', 'Prod deploy needs your call', '--needs', 'decision', '--sender-repo', repo],
    { orca: mockOrca({ panes: [] }), home: tmp(), git: () => '.git', now: NOW },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.notified, true);
});

test('Defect 1: --recipient-repo is exempt (the collector\'s cross-repo path) — still exits 2 old-H3, not 6', async () => {
  const repo = tmp(); const home = tmp();
  // A registered inbox for a DIFFERENT slug proves the exemption is about --recipient-repo, not about
  // "any inbox anywhere" accidentally suppressing the refusal for an unrelated recipient.
  writeInbox(home, 'someone-else-entirely', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't9' }, { now: NOW });
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--recipient-repo', repo]), { orca, home, git: () => '.git', now: NOW, env: {} }),
    2, /no pane titled "nucleus"/,
  );
  assert.ok(err.ledgers.length > 0, 'collect-status.mjs:162-168 always passes --recipient-repo, so it must still record');
  assert.equal(err.queued, true);
});

// review F3: the previous test's inbox-for-a-different-slug fixture also passes --recipient-repo,
// which exempts the send on its own — it does not, by itself, prove the refusal is scoped to `--to`.
// This test drops --recipient-repo so ONLY the foreign-slug inbox is in play.
test('Defect 1: an inbox registered for a DIFFERENT slug does not exempt --to - still exit 6, nothing written', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'someone-else-entirely', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't9' }, { now: NOW });
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(
      ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
      { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
    ),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.deepEqual(err.ledgers ?? [], []);
  assert.deepEqual(fs.readdirSync(path.join(home, '.agents', 'notes')).filter((f) => f !== 'inboxes.json'), [], 'no ledger, no outbox');
  assert.equal(fs.existsSync(path.join(repo, 'docs')), false);
});

// review F1: a record stamped with another machine's hostname means THIS machine has no inbox for
// that slug (C7) — it must not exempt the refusal either, or the note still lands only in the local
// ledger. Covers both the quiet path (FYI, exit 6 now) and the typed path (would otherwise take the
// foreign inboxRecord branch and exit 3).
test('Defect 1: an inbox registered on a DIFFERENT HOST does not exempt --to - still exit 6 (quiet path)', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/x', threadId: 't', host: 'another-box' }, { now: NOW });
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(
      ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
      { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
    ),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.deepEqual(err.ledgers ?? [], []);
});

test('Defect 1: an inbox registered on a DIFFERENT HOST does not exempt --to - still exit 6 (typed path, would otherwise exit 3)', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/x', threadId: 't', host: 'another-box' }, { now: NOW });
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    6,
  );
  assert.equal(err.refused, 'no-local-recipient');
  assert.deepEqual(err.ledgers ?? [], []);
});

test('Defect 1: a SAME-host registered inbox still exempts --to as before (no host field)', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/x', threadId: 't', cwd: repo }, { now: NOW });
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
    { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
  );
  assert.equal(res.exitCode, 0);
});

// review R2-2: every REAL registration is stamped with `host: os.hostname()` (transport.mjs:1517,
// :1539) — the no-host test above never exercises that stamp, so a mutation that treats any stamped
// record as foreign (`!localInboxRec.host`) survives it and would refuse every real registered peer.
test('Defect 1: a registered inbox stamped with THIS host (as every real registration is) still exempts --to', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/x', threadId: 't', cwd: repo, host: os.hostname() }, { now: NOW });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
  );
  assert.equal(res.exitCode, 0);
});

test('Defect 1: a --sender-host that resolves to a real mirror target is exempt — still exits 2 old-H3, not 6', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  const spawnMirror = async () => ({ ok: true });
  const err = await rejectsWith(
    runNoteSend(
      ARGS_OK(['--sender-host', 'zhuk-netcup']),
      { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` }, spawnMirror, hostname: 'test-host', localAddrs: [] },
    ),
    2, /no pane titled "nucleus"/,
  );
  assert.equal(err.mirrorLedger.ok, true, 'the mirror target itself is the exemption — it ran');
});

test('Defect 1: an ambiguous pane is never refused — a session DOES exist here, so it stays H3 exit 2', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({
    panes: [
      idlePane({ handle: 'term_one', title: 'nucleus', worktreePath: repo }),
      idlePane({ handle: 'term_two', title: '◑ nucleus', worktreePath: repo }),
    ],
  });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /matches 2 panes/,
  );
  assert.ok(err.ledgers.length > 0, 'ambiguous still records, exactly like before Defect 1');
  assert.notEqual(err.exitCode, 6);
});

// ─────────────────────────────────────────────────────────────────────────────
// N1 (spec 2026-09-20): ACK and FYI are ledger-only
// ─────────────────────────────────────────────────────────────────────────────

test('N1: FYI to a slug is ledger-only — no pane resolution, no outbox, exit 0', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping',
      '--text', 'Batch finished, 413 films', '--recipient-repo', repo],
    { orca, home, git: () => '.git', now: NOW, env: TYPING },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.delivered, false);
  assert.equal(res.wake, 'none');
  assert.equal(res.reason, 'ledger-only kind');
  assert.equal(orca.calls.length, 0, 'a ledger-only kind never resolves a pane');
  assert.match(fs.readFileSync(res.ledgers[0], 'utf8'), /\[taxonomy-ping-1\] FYI:/);
  assert.equal(fs.existsSync(path.join(home, '.agents/notes/outbox/taxonomy-ping-1.json')), false, 'no outbox entry');
});

test('N1: even a registered inbox is never posted to for a ledger-only kind', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't1', cwd: repo }, { now: NOW });
  let posted = 0;
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, env: TYPING, deliverToInbox: async () => { posted += 1; return { delivered: true }; } },
  );
  assert.equal(posted, 0, 'N1 says "no inbox post" — a registered inbox changes nothing for a quiet kind');
  assert.equal(res.delivered, false);
  assert.equal(res.wake, 'none');
  assert.ok(res.ledgers[0].startsWith(repo), 'still lands in the registered recipient repo, just never posted');
});

test('N1: ACK to a slug is ledger-only too, and --dry-run says the same', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ['--from', 'nucleus', '--to', 'taxonomy', '--kind', 'ACK', '--re', 'taxonomy-pr132-review-1',
      '--topic', 'pr132-review', '--text', 'Taking it now', '--needs', 'none',
      '--recipient-repo', repo, '--dry-run'],
    { orca, home, git: () => '.git', now: NOW, env: TYPING },
  );
  assert.equal(res.dryRun, true);
  assert.equal(res.wake, 'none');
  assert.equal(res.reason, 'ledger-only kind');
  assert.equal(orca.calls.length, 0);
  assert.equal(fs.existsSync(path.join(repo, 'docs')), false, '--dry-run still writes nothing');
});

test('N1: ASK, RESULT and BLOCKED are unaffected — no ledger-only short-circuit', async () => {
  // Proven by reaching real pane resolution (an orca `terminal list` call), not by asserting the
  // two-phase type-and-Enter sequence succeeds — that half is the pre-existing, environment-dependent
  // `no-type` flag concern this baseline suite already has several failures for (see baseline notes),
  // unrelated to N1/N2.
  const repo = tmp();
  for (const kind of ['ASK', 'RESULT', 'BLOCKED']) {
    const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })] });
    let res = null;
    let err = null;
    try {
      res = await runNoteSend(
        ['--from', 'taxonomy', '--to', 'nucleus', '--kind', kind, '--topic', `ping-${kind.toLowerCase()}`,
          '--text', 'Batch finished, 413 films'],
        { orca, home: tmp(), git: () => '.git', now: NOW, env: TYPING },
      );
    } catch (e) { err = e; }
    assert.ok(orca.calls.some((c) => c[1] === 'list'), `${kind} must still resolve a pane`);
    const classification = res ? res.classification : err.classification;
    assert.notEqual(classification, 'ledger-only (quiet kind)', kind);
    assert.equal(res ? res.wake : err.wake, undefined, `${kind} must not carry the new N1 fields`);
  }
});

test('N1: a handle-addressed quiet note still resolves the pane to learn its slug, but never delivers', async () => {
  const repo = tmp(); const home = tmp();
  const pane = idlePane({ handle: 'term_bbb', title: 'nucleus', worktreePath: repo });
  const orca = mockOrca({ panes: [pane] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'term_bbb', '--kind', 'ACK', '--topic', 'ping', '--text', 'Taking it now', '--needs', 'none'],
    { orca, home, git: () => '.git', now: NOW, env: TYPING },
  );
  assert.match(res.envelope, /^taxonomy → nucleus, /, 'the pane had to be resolved to learn the slug');
  assert.equal(res.delivered, false);
  assert.equal(res.wake, 'none');
  assert.equal(orca.calls.some((c) => c[1] === 'list'), true);
  assert.equal(orca.sends().length, 0, 'never typed, whatever the pane state');
});

test('N1: --to ben is unchanged for every kind, including the ledger-only ones', async () => {
  const repo = tmp();
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'ben', '--kind', 'FYI', '--topic', 'ping',
      '--text', 'Batch finished, 413 films', '--sender-repo', repo],
    { orca: mockOrca({ panes: [] }), home: tmp(), git: () => '.git', now: NOW },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.notified, true);
  assert.equal(res.wake, undefined, 'the ben path is untouched by N1 — no new fields');
});

test('N1: the wake-all-kinds kill switch resumes pane resolution for ACK and FYI', async () => {
  const repo = tmp(); const home = tmp();
  fs.mkdirSync(path.dirname(wakeAllKindsPath(home)), { recursive: true });
  fs.writeFileSync(wakeAllKindsPath(home), '');
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  // The kill switch is proven by reaching pane resolution at all — without it, a ledger-only kind
  // never calls orca. Whether the two-phase type-and-Enter sequence itself then succeeds is the same
  // environment-dependent concern the baseline suite already isolates for ASK/RESULT/BLOCKED.
  await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'],
    { orca, home, git: () => '.git', now: NOW, env: TYPING },
  ).catch(() => {});
  assert.ok(orca.calls.some((c) => c[1] === 'list'), 'the kill switch resumes pane resolution instead of the N1 short-circuit');
});

// ─────────────────────────────────────────────────────────────────────────────
// N2 (spec 2026-09-20): an unknown recipient is loud
// ─────────────────────────────────────────────────────────────────────────────

test('N2: a slug nothing on this machine has heard of is UNKNOWN, with known slugs and a suggestion', async () => {
  const repo = tmp(); const home = tmp();
  const mirrorDir = path.join(home, '.agents/notes');
  fs.mkdirSync(mirrorDir, { recursive: true });
  const ymd = timeParts(new Date(NOW)).ymd;
  // "taxonomy-fable" is known (it sent a note recently); "fable" itself never appeared anywhere.
  fs.writeFileSync(path.join(mirrorDir, `${ymd}.md`), 'taxonomy-fable → nucleus, 9.20.26 10:00 NYC [taxonomy-fable-ping-1] FYI: hi.\n');
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  // Defect 1 (2026-09-27): --local-ok bypasses the new exit-6 refusal so this N2 case is still reached.
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'fable', '--local-ok']), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /UNKNOWN RECIPIENT "fable"/,
  );
  assert.match(err.message, /Known slugs on this machine:.*taxonomy-fable/);
  assert.match(err.message, /did you mean "taxonomy-fable"\?/);
  assert.match(err.message, /no pane titled "fable"/, 'the original reason is kept, just not first');
  assert.match(err.message, /The note IS recorded/);
  assert.match(err.message, /Do NOT re-send this id/);
  assert.equal(err.unknownRecipient, true);
  assert.ok(err.known.includes('taxonomy-fable'));
  assert.equal(err.suggestion, 'taxonomy-fable');
  assert.ok(err.ledgers.length > 0, 'still recorded');
  assert.equal(err.queued, true, 'still queued — the slug may register later');
});

test('N2: a slug seen in the ledger mirror recently is known, even with no live pane', async () => {
  const repo = tmp(); const home = tmp();
  const mirrorDir = path.join(home, '.agents/notes');
  fs.mkdirSync(mirrorDir, { recursive: true });
  const ymd = timeParts(new Date(NOW)).ymd;
  fs.writeFileSync(path.join(mirrorDir, `${ymd}.md`), 'nucleus → astra, 9.20.26 09:00 NYC [nucleus-x-1] FYI: hi.\n');
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  // Defect 1 (2026-09-27): --local-ok bypasses the new exit-6 refusal so this N2 case is still reached.
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'astra', '--local-ok']), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /no pane titled "astra"/,
  );
  assert.ok(!err.message.startsWith('UNKNOWN RECIPIENT'), `astra appeared in the mirror, so it is known: ${err.message}`);
  assert.equal(err.unknownRecipient, undefined);
});

test('N2: a binding makes a slug known even without a matching title', async () => {
  const repo = tmp(); const home = tmp();
  writeBinding(home, 'term_zzz', 'astra', { now: NOW });
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  // Defect 1 (2026-09-27): --local-ok bypasses the new exit-6 refusal so this N2 case is still reached.
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'astra', '--local-ok']), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /no pane titled "astra"/,
  );
  assert.ok(!err.message.startsWith('UNKNOWN RECIPIENT'));
  assert.equal(err.unknownRecipient, undefined);
});

test('N2: an ambiguous recipient is known by definition (its title DOES resolve) — no banner', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({
    panes: [
      idlePane({ handle: 'term_one', title: 'nucleus', worktreePath: repo }),
      idlePane({ handle: 'term_two', title: '◑ nucleus', worktreePath: repo }),
    ],
  });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /matches 2 panes/,
  );
  assert.ok(!err.message.startsWith('UNKNOWN RECIPIENT'));
});

test('N2: the no-unknown-check kill switch restores the plain not-found message', async () => {
  const repo = tmp(); const home = tmp();
  fs.mkdirSync(path.dirname(noUnknownCheckPath(home)), { recursive: true });
  fs.writeFileSync(noUnknownCheckPath(home), '');
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  // Defect 1 (2026-09-27): --local-ok bypasses the new exit-6 refusal so this N2 case is still reached.
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'fable', '--local-ok']), { orca, home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } }),
    2, /no pane titled "fable"/,
  );
  assert.ok(!err.message.startsWith('UNKNOWN RECIPIENT'));
  assert.equal(err.unknownRecipient, undefined);
});

test('N2: a raw handle that resolves to nothing is the handle case, never the unknown-recipient banner', async () => {
  const home = tmp();
  const orca = mockOrca({ panes: [] });
  const err = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'term_gone']), { orca, home, git: () => '.git', now: NOW, env: TYPING }),
    2, /Nothing was recorded/,
  );
  assert.equal(err.unknownRecipient, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix round 1 (review 2026-09-20): BLOCKER 1 / MAJOR 2 / MAJOR 3 / MINOR 4-9 / NIT 13-15
// ─────────────────────────────────────────────────────────────────────────────

test('review BLOCKER 1/MAJOR 2: withoutIds strips only the named ids, other lines untouched', () => {
  const texts = [
    'taxonomy → fable, 9.20.26 10:00 NYC [taxonomy-fable-ping-1] ASK: hi.\n'
    + 'nucleus → astra, 9.20.26 09:00 NYC [nucleus-x-1] FYI: hi.',
  ];
  const out = withoutIds(texts, new Set(['taxonomy-fable-ping-1']));
  assert.ok(!out[0].includes('taxonomy-fable-ping-1'), out[0]);
  assert.ok(out[0].includes('nucleus-x-1'), out[0]);
});

test('review BLOCKER 1/MAJOR 2: withoutIds is a no-op for an empty id set', () => {
  const texts = ['taxonomy → fable, 9.20.26 10:00 NYC [taxonomy-fable-ping-1] ASK: hi.'];
  assert.deepEqual(withoutIds(texts, new Set()), texts);
});

test('review BLOCKER 1: undeliveredIds reads both the live and the dead outbox directories', () => {
  const home = tmp();
  fs.mkdirSync(outboxDir(home), { recursive: true });
  fs.writeFileSync(path.join(outboxDir(home), 'a-b-1.json'), '{}');
  fs.mkdirSync(deadOutboxDir(home), { recursive: true });
  fs.writeFileSync(path.join(deadOutboxDir(home), 'c-d-2.json'), '{}');
  const ids = undeliveredIds(home);
  assert.ok(ids.has('a-b-1'));
  assert.ok(ids.has('c-d-2'));
});

test('review MAJOR 2: a SECOND send to the same still-unknown slug still gets the banner', async () => {
  // Root cause this closes: the FIRST send's own ledger line necessarily names "fable" as a recipient,
  // so without excluding undelivered ids, the second send would see it in the mirror and call "fable"
  // known — the loudness switching itself off exactly when a session repeats the mistake.
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ title: 'someone-else', worktreePath: repo })] });
  const env = { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` };
  // Defect 1 (2026-09-27): --local-ok bypasses the new exit-6 refusal so this N2 case is still reached.
  const first = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'fable', '--local-ok']), { orca, home, git: () => '.git', now: NOW, env }),
    2, /UNKNOWN RECIPIENT "fable"/,
  );
  assert.equal(first.unknownRecipient, true);
  const second = await rejectsWith(
    runNoteSend(ARGS_OK(['--to', 'fable', '--local-ok']), { orca, home, git: () => '.git', now: NOW, env }),
    2, /UNKNOWN RECIPIENT "fable"/,
  );
  assert.equal(second.unknownRecipient, true, 'the first send\'s own undelivered line must not make "fable" look known');
});

test('review MAJOR 3: --no-type to an unknown slug warns and flags unknown_recipient, but stays exit 0', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ARGS_OK(['--to', 'fable', '--no-type', '--recipient-repo', repo]),
    { orca, home, git: () => '.git', now: NOW, env: {} },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.queued, true);
  assert.equal(res.unknown_recipient, true);
  assert.ok(Array.isArray(res.known));
  assert.match(res.warnings.join('\n'), /not a recognized recipient/);
  assert.match(res.warnings.join('\n'), /--no-type never resolved a pane, so this is not the exit-2/);
  assert.equal(orca.calls.length, 0, '--no-type never resolves a pane, so no terminal list call either');
});

test('review MAJOR 3: --no-type to a KNOWN slug (registered inbox) gets no warning at all', async () => {
  const repo = tmp(); const home = tmp();
  writeInbox(home, 'nucleus', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't1' }, { now: NOW });
  const res = await runNoteSend(
    ARGS_OK(['--to', 'nucleus', '--no-type', '--recipient-repo', repo]),
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, env: {} },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.unknown_recipient, undefined);
  assert.equal((res.warnings ?? []).length, 0);
});

test('review MINOR 7: a quiet kind with no registered inbox says its ledger line went to the sender\'s repo', async () => {
  const repo = tmp(); const home = tmp();
  // Defect 1 (2026-09-27): --local-ok bypasses the new exit-6 refusal — a quiet kind with no local
  // inbox and no mirror is exactly the case it would otherwise refuse.
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films', '--local-ok'],
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, env: { ORCA_WORKTREE_ID: `id::${repo}::workspace:w` } },
  );
  assert.equal(res.exitCode, 0);
  assert.match(res.warnings.join('\n'), /ledger-only, so no pane was resolved/);
  assert.match(res.warnings.join('\n'), /not the recipient's/);
});

test('review MINOR 8: a quiet kind to an unknown slug warns but still creates no wake-up', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'fable', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films',
      '--recipient-repo', repo],
    { orca, home, git: () => '.git', now: NOW, env: {} },
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.wake, 'none', 'MINOR 8 is a warning only — N1 still creates no wake-up');
  assert.equal(res.unknown_recipient, true);
  assert.match(res.warnings.join('\n'), /not a recognized recipient/);
  assert.equal(orca.calls.length, 0, 'a quiet kind never resolves a pane, warning or not');
});

test('review MINOR 8: a quiet kind to a KNOWN slug gets no warning', async () => {
  const repo = tmp(); const home = tmp();
  writeBinding(home, 'term_zzz', 'nucleus', { now: NOW });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films',
      '--recipient-repo', repo],
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, env: {} },
  );
  assert.equal(res.unknown_recipient, undefined);
  assert.equal((res.warnings ?? []).length, 0);
});

test('review NIT14: --dry-run for a HANDLE-addressed quiet kind prints only the exit-0 plan, not exit-3', async () => {
  const repo = tmp(); const home = tmp();
  const pane = idlePane({ handle: 'term_bbb', title: 'nucleus', worktreePath: repo });
  const orca = mockOrca({ panes: [pane] });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'term_bbb', '--kind', 'ACK', '--topic', 'ping', '--text', 'Taking it now',
      '--needs', 'none', '--dry-run', '--recipient-repo', repo],
    { orca, home, git: () => '.git', now: NOW, env: TYPING },
  );
  assert.equal(res.dryRun, true);
  assert.ok(!res.plan.some((p) => /exit 3/.test(p)), `contradictory exit-3 plan line survived: ${JSON.stringify(res.plan)}`);
  assert.ok(res.plan.some((p) => /exit 0: delivered:false, wake:none/.test(p)));
  assert.equal(orca.calls.length, 0, '--dry-run never touches orca, quiet kind or not');
});

test('review NIT13: firstStderrLine keeps the banner unprefixed, everything else gets note-send:', () => {
  assert.equal(
    firstStderrLine('UNKNOWN RECIPIENT "fable"\nKnown slugs on this machine: a, b'),
    'UNKNOWN RECIPIENT "fable"',
  );
  assert.equal(firstStderrLine('no pane titled "fable"'), 'note-send: no pane titled "fable"');
});

test('review NIT15: knownSlugs ignores a pane with no agentIdentity (a plain shell)', () => {
  const terminals = [
    { title: 'MINGW64:/c/Users/benzh/code', agentIdentity: null },
    { title: 'nucleus', agentIdentity: 'claude' },
  ];
  assert.deepEqual(knownSlugs({ terminals }), ['nucleus']);
});

// ─────────────────────────────────────────────────────────────────────────────
// L1 — the cross-host ledger mirror (contracts R1-R3)
// ─────────────────────────────────────────────────────────────────────────────

const NETCUP = MIRROR_HOSTS.find((h) => h.name === 'zhuk-netcup');
const DESKTOP = MIRROR_HOSTS.find((h) => h.name === 'ben-desktop');

test('R1: the host table has the four frozen rows, verbatim', () => {
  assert.deepEqual(
    MIRROR_HOSTS.map((h) => h.name),
    ['zhuk-netcup', 'ben-desktop', 'zhuk-vps32', 'bens-m2-air'],
  );
  assert.equal(NETCUP.addr, '100.69.249.18');
  assert.equal(NETCUP.user, 'ben');
  assert.equal(DESKTOP.addr, '100.78.52.18');
  assert.equal(DESKTOP.user, 'benzh');
});

test('R1: --sender-host looks up by name; an unknown name is a usage error distinct from an unknown address', () => {
  assert.equal(resolveSenderHost({ 'sender-host': 'zhuk-netcup' }, {}).host.name, 'zhuk-netcup');
  assert.throws(
    () => resolveSenderHost({ 'sender-host': 'not-a-host' }, {}),
    (err) => err instanceof NoteError && err.exitCode === 1 && /not one of the known hosts/.test(err.message),
  );
});

test("R1: SSH_CONNECTION's first field wins over SSH_CLIENT, both looked up by addr", () => {
  const env = { SSH_CONNECTION: '100.69.249.18 1 2 3', SSH_CLIENT: '100.78.52.18 5 6 7' };
  assert.equal(resolveSenderHost({}, env).host.name, 'zhuk-netcup');
  assert.equal(resolveSenderHost({}, { SSH_CLIENT: '100.78.52.18 5 6 7' }).host.name, 'ben-desktop');
});

test('R1: no --sender-host and no SSH env at all resolves local — nothing changes', () => {
  const { host, sawAddress } = resolveSenderHost({}, {});
  assert.equal(host, null);
  assert.equal(sawAddress, false);
});

test('R1: an SSH env address that matches no row is "unknown", not "local"', () => {
  const { host, sawAddress } = resolveSenderHost({}, { SSH_CONNECTION: '10.0.0.9 1 2 3' });
  assert.equal(host, null);
  assert.equal(sawAddress, true);
});

test('R2: remoteAppendCommand picks the Windows shim form only for the Windows row', () => {
  assert.equal(remoteAppendCommand(NETCUP, '2026-09-27'), '~/.local/bin/note-send --append-ledger 2026-09-27');
  assert.equal(remoteAppendCommand(DESKTOP, '2026-09-27'), 'note-send --append-ledger 2026-09-27');
});

test('--dry-run reports the planned mirror — host name and the exact remote command — without spawning anything', async () => {
  const repo = tmp();
  const res = await runNoteSend(
    ARGS_OK(['--recipient-repo', repo, '--dry-run', '--sender-host', 'zhuk-netcup']),
    {
      orca: mockOrca({}), home: tmp(), git: () => '.git', now: NOW, hostname: 'test-host', localAddrs: [],
      spawnMirror: async () => { throw new Error('dry-run spawned'); },
    },
  );
  assert.equal(res.dryRun, true);
  assert.ok(
    res.plan.some((p) => p.includes('mirror the envelope to "zhuk-netcup"')
      && p.includes('ssh -o BatchMode=yes -o ConnectTimeout=3 ben@100.69.249.18 ~/.local/bin/note-send --append-ledger')),
    `plan did not name the mirror: ${JSON.stringify(res.plan)}`,
  );
  assert.equal(res.mirrorLedger, undefined, 'nothing was spawned, so there is no ok/error to report yet');
});

test('--sender-host given explicitly plans/runs the mirror to that mapped host', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const spawnCalls = [];
  const spawnMirror = async (cmd, args, opts) => { spawnCalls.push({ cmd, args, opts }); return { ok: true }; };
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.delivered, true);
  assert.deepEqual(res.mirrorLedger, { host: 'zhuk-netcup', ok: true });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].cmd, 'ssh');
  assert.deepEqual(spawnCalls[0].args, [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3', 'ben@100.69.249.18',
    `~/.local/bin/note-send --append-ledger ${timeParts(new Date(NOW)).ymd}`,
  ]);
  // R2/spec item 3: the mirrored line is byte-identical to the one the local ledger got, id included.
  assert.equal(spawnCalls[0].opts.input, `${res.envelope}\n`);
  assert.equal(spawnCalls[0].opts.timeoutMs, 5_000);
});

test('SSH_CONNECTION with a known address plans/runs the mirror to the mapped host', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const spawnMirror = async () => ({ ok: true });
  const res = await runNoteSend(
    ARGS_OK(),
    { orca, home, git: () => '.git', now: NOW, env: { ...TYPING, SSH_CONNECTION: '100.111.119.54 4 5 6' }, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.delivered, true);
  assert.deepEqual(res.mirrorLedger, { host: 'zhuk-vps32', ok: true });
});

test('R1: an unmapped SSH address means no mirror, logged loudly, delivery outcome unchanged', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  let spawnCalled = false;
  const spawnMirror = async () => { spawnCalled = true; return { ok: true }; };
  const res = await runNoteSend(
    ARGS_OK(),
    { orca, home, git: () => '.git', now: NOW, env: { ...TYPING, SSH_CONNECTION: '10.0.0.9 1 2 3' }, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.delivered, true, 'delivery outcome is unchanged by a mirror problem');
  assert.equal(res.exitCode, 0);
  assert.deepEqual(res.mirrorLedger, { host: null, ok: false, error: 'unknown-sender-address' });
  assert.equal(spawnCalled, false, 'never spawns for an address that maps to nothing');
});

test('R1: a plain local run (no --sender-host, no SSH env) gets no mirrorLedger key at all', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(ARGS_OK(), { orca, home, git: () => '.git', now: NOW, env: TYPING, hostname: 'test-host', localAddrs: [] });
  assert.equal(res.delivered, true);
  assert.ok(!('mirrorLedger' in res), `local run must stay silent: ${JSON.stringify(res)}`);
});

test('R1: a mapped sender host that IS this machine mirrors to nobody — mirrorLedger absent, not ok:false', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  let spawnCalled = false;
  const spawnMirror = async () => { spawnCalled = true; return { ok: true }; };
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror, hostname: 'zhuk-netcup.tailnet', localAddrs: [] },
  );
  assert.equal(res.delivered, true);
  assert.ok(!('mirrorLedger' in res));
  assert.equal(spawnCalled, false);
});

test('R1 (review MAJOR-3): a mapped sender host that is THIS machine by interface address, not by hostname label, still mirrors to nobody', async () => {
  // On a real Netcup box, os.hostname() is a cloud-provider id like "v2202608391056492408", never the
  // literal table name "zhuk-netcup" — matching only the hostname label would ssh this box to itself
  // and double-append the same line. Matching this machine's own tailnet addresses catches that case.
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  let spawnCalled = false;
  const spawnMirror = async () => { spawnCalled = true; return { ok: true }; };
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    {
      orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror,
      hostname: 'v2202608391056492408', localAddrs: ['100.69.249.18'],
    },
  );
  assert.equal(res.delivered, true);
  assert.ok(!('mirrorLedger' in res));
  assert.equal(spawnCalled, false);
});

test('--no-mirror skips the mirror unconditionally, whatever the sender host resolves to, and is silent about it', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  let spawnCalled = false;
  const spawnMirror = async () => { spawnCalled = true; return { ok: true }; };
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup', '--no-mirror']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.delivered, true);
  assert.ok(!('mirrorLedger' in res));
  assert.equal(spawnCalled, false);
});

test('--no-mirror also silences the otherwise-loud unknown-sender-address case', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const res = await runNoteSend(
    ARGS_OK(['--no-mirror']),
    { orca, home, git: () => '.git', now: NOW, env: { ...TYPING, SSH_CONNECTION: '10.0.0.9 1 2 3' }, hostname: 'test-host', localAddrs: [] },
  );
  assert.ok(!('mirrorLedger' in res));
});

test('a mirror failure (non-zero exit) leaves the exit code and delivery outcome unchanged', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const spawnMirror = async () => ({ ok: false, code: 127, stderr: 'bash: note-send: command not found\nsome more noise' });
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.delivered, true, 'a mirror failure never changes the delivery outcome');
  assert.equal(res.mirrorLedger.host, 'zhuk-netcup');
  assert.equal(res.mirrorLedger.ok, false);
  assert.match(res.mirrorLedger.error, /exit 127/);
  assert.match(res.mirrorLedger.error, /command not found/);
  assert.ok(!res.mirrorLedger.error.includes('some more noise'), 'only the FIRST stderr line');
  assert.ok(!res.mirrorLedger.error.includes(res.envelope.slice(0, 10)), "never the note's own text");
});

test('a mirror failure truncates a long stderr line to 120 chars', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const long = 'x'.repeat(500);
  const spawnMirror = async () => ({ ok: false, code: 1, stderr: long });
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.mirrorLedger.ok, false);
  assert.ok(res.mirrorLedger.error.length <= 130, res.mirrorLedger.error);
});

test('a mirror timeout kills the child and reports error: "timeout" — no retry', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  let calls = 0;
  const spawnMirror = async () => { calls += 1; return { ok: false, timedOut: true }; };
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.deepEqual(res.mirrorLedger, { host: 'zhuk-netcup', ok: false, error: 'timeout' });
  assert.equal(calls, 1, 'no retry, ever');
});

test('a spawn error (e.g. no ssh on PATH) degrades to the same ok:false shape, never throws', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  const spawnMirror = async () => { throw new Error('spawn ssh ENOENT'); };
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.delivered, true);
  assert.equal(res.mirrorLedger.ok, false);
  assert.match(res.mirrorLedger.error, /ENOENT/);
});

test('the mirror fires for --to ben too — no special case by recipient (contract R3)', async () => {
  const repo = tmp(); const home = tmp();
  const spawnMirror = async () => ({ ok: true });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'ben', '--kind', 'FYI', '--topic', 'ping', '--text', 'status',
      '--sender-repo', repo, '--sender-host', 'zhuk-netcup'],
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.notified, true);
  assert.deepEqual(res.mirrorLedger, { host: 'zhuk-netcup', ok: true });
});

test('the mirror fires for a ledger-only ACK/FYI too — no special case by kind (contract R3)', async () => {
  const repo = tmp(); const home = tmp();
  const spawnMirror = async () => ({ ok: true });
  const res = await runNoteSend(
    ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'status',
      '--recipient-repo', repo, '--sender-host', 'zhuk-netcup'],
    { orca: mockOrca({ panes: [] }), home, git: () => '.git', now: NOW, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.wake, 'none');
  assert.deepEqual(res.mirrorLedger, { host: 'zhuk-netcup', ok: true });
});

test('review MAJOR-2: a thrown NoteError past the ledger write still carries mirrorLedger, and failureJson keeps it', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })] });
  const spawnMirror = async () => ({ ok: false, code: 255, stderr: 'ssh: connect to host … Connection refused' });
  // The default no-inbox deferral (env: {}, no MULTI_ALLOW_TYPING) throws exit 3 AFTER the ledger write
  // and the mirror attempt both already ran — this is "normal" per the USAGE text, and it is the path
  // MAJOR-2 measured losing mirrorLedger entirely.
  const err = await rejectsWith(
    runNoteSend(
      ARGS_OK(['--sender-host', 'zhuk-netcup']),
      { orca, home, git: () => '.git', now: NOW, env: {}, spawnMirror, hostname: 'test-host', localAddrs: [] },
    ),
    3,
  );
  assert.ok(err.mirrorLedger, 'the thrown NoteError itself must carry mirrorLedger');
  assert.equal(err.mirrorLedger.ok, false);
  assert.equal(err.mirrorLedger.host, 'zhuk-netcup');
  const json = failureJson(err, err.exitCode);
  assert.ok('mirrorLedger' in json, `failureJson dropped mirrorLedger: ${JSON.stringify(json)}`);
  assert.deepEqual(json.mirrorLedger, err.mirrorLedger);
});

test('review MAJOR-2: failureJson omits mirrorLedger entirely for a thrown error that never set it (plain local)', () => {
  const err = new NoteError(1, 'boom');
  const json = failureJson(err, 1);
  assert.ok(!('mirrorLedger' in json), `local/no-mirror failure must stay silent: ${JSON.stringify(json)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// R2 — `note-send --append-ledger <day>`, the peer side of the mirror
// ─────────────────────────────────────────────────────────────────────────────

test("--append-ledger appends a valid envelope line to this machine's own notes mirror, nothing else", async () => {
  const home = tmp();
  const line = 'taxonomy → nucleus, 9.27.26 08:00 NYC [taxonomy-ping-1] FYI: status.';
  const res = await runNoteSend(['--append-ledger', '2026-09-27'], { home, stdin: `${line}\n` });
  assert.equal(res.ok, true);
  assert.equal(res.exitCode, 0);
  const file = notesMirrorPath(home, '2026-09-27');
  assert.equal(fs.readFileSync(file, 'utf8').trim().endsWith(line), true);
});

test('--append-ledger refuses a line that is not a parseable envelope; nothing is written', async () => {
  const home = tmp();
  await rejectsWith(
    runNoteSend(['--append-ledger', '2026-09-27'], { home, stdin: 'not an envelope at all\n' }),
    1,
  );
  assert.equal(fs.existsSync(notesMirrorPath(home, '2026-09-27')), false);
});

test('--append-ledger refuses a malformed day argument', async () => {
  const home = tmp();
  const line = 'taxonomy → nucleus, 9.27.26 08:00 NYC [taxonomy-ping-1] FYI: status.';
  await rejectsWith(
    runNoteSend(['--append-ledger', '27-09-2026'], { home, stdin: `${line}\n` }),
    1, /YYYY-MM-DD/,
  );
});

test('--append-ledger rejects an over-length stdin BEFORE parsing (MAX_LINE, reused)', async () => {
  const home = tmp();
  const over = `${'a'.repeat(MAX_LINE + 20)}\n`;
  await rejectsWith(
    runNoteSend(['--append-ledger', '2026-09-27'], { home, stdin: over }),
    1, /over the/,
  );
  assert.equal(fs.existsSync(notesMirrorPath(home, '2026-09-27')), false);
});

test('--append-ledger rejects a 701-char line with no trailing newline (review MINOR-1)', async () => {
  const home = tmp();
  // The earlier over-length check is on `raw` (`> MAX_LINE + 1`, the char cap plus the one newline), so
  // a 701-char body with NO trailing newline used to slip past it — `parseEnvelope`'s regex bounds no
  // length on its own.
  const head = 'taxonomy → nucleus, 9.27.26 08:00 NYC [taxonomy-ping-1] FYI: ';
  const over = head + 's'.repeat(MAX_LINE + 1 - head.length);
  assert.equal(over.length, MAX_LINE + 1);
  assert.ok(parseEnvelope(over), 'the probe must be a valid envelope, so only the length check can refuse it');
  await rejectsWith(
    runNoteSend(['--append-ledger', '2026-09-27'], { home, stdin: over }),
    1,
  );
  assert.equal(fs.existsSync(notesMirrorPath(home, '2026-09-27')), false);
});

test('--append-ledger rejects a line carrying a trailing CR (review MINOR-1)', async () => {
  const home = tmp();
  // Goal/by are `[^\t\n]`, so a CR (a line copied off Windows) parses as an envelope and would write a
  // stray `\r` into the ledger.
  const line = 'taxonomy → nucleus, 9.27.26 08:00 NYC [taxonomy-ping-1] FYI: status Goal: g\r';
  await rejectsWith(
    runNoteSend(['--append-ledger', '2026-09-27'], { home, stdin: `${line}\n` }),
    1,
  );
  assert.equal(fs.existsSync(notesMirrorPath(home, '2026-09-27')), false);
});

test('--append-ledger never calls the mirror dependency and writes no outbox entry — never re-mirrored, by construction', async () => {
  const home = tmp();
  const line = 'taxonomy → nucleus, 9.27.26 08:00 NYC [taxonomy-ping-1] FYI: status.';
  let spawnCalled = false;
  const res = await runNoteSend(
    ['--append-ledger', '2026-09-27'],
    { home, stdin: `${line}\n`, spawnMirror: async () => { spawnCalled = true; return { ok: true }; } },
  );
  assert.equal(res.ok, true);
  assert.equal(spawnCalled, false);
  assert.equal(fs.existsSync(outboxDir(home)), false, 'no outbox entry — --append-ledger creates no wake-up either');
});

// ─────────────────────────────────────────────────────────────────────────────
// The open question (section 4): the outbox/retry/drain path never reaches the mirror
// ─────────────────────────────────────────────────────────────────────────────

test('R3: the piggyback drain (deps.flush) is a separate call from the mirror — the drain path never reaches deps.spawnMirror', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })], reads: DELIVERY_READS() });
  // The stand-in for note-flush's own retry/drain code: `deps.flush` is the one place inside
  // `runNoteSend` a drain call is injected (the piggyback drain), and note-flush.mjs's own outbox
  // retry and `drainQuietly` never call `runNoteSend` in the first place (they call
  // `deliverToInbox`/`twoPhaseSend` directly, per the scout) — so proving THIS call never touches
  // `spawnMirror` covers R3's "the outbox or retry code path never calls the mirror dependency".
  let flushCalls = 0;
  const flush = async () => { flushCalls += 1; return { drained: 0 }; };
  let mirrorCalls = 0;
  const spawnMirror = async () => { mirrorCalls += 1; return { ok: true }; };
  const res = await runNoteSend(
    ARGS_OK(['--sender-host', 'zhuk-netcup']),
    { orca, home, git: () => '.git', now: NOW, env: TYPING, flush, spawnMirror, hostname: 'test-host', localAddrs: [] },
  );
  assert.equal(res.delivered, true);
  assert.equal(flushCalls, 1, 'the drain ran, through deps.flush');
  assert.equal(mirrorCalls, 1, 'the mirror ran exactly once, from the send itself — never from the drain');
});

test('R3 (review MAJOR-4): the real outbox retry, via note-flush.mjs\'s own runNoteFlush, never reaches the mirror dependency', async () => {
  const repo = tmp(); const home = tmp();
  const orca = mockOrca({ panes: [idlePane({ worktreePath: repo })] });
  let mirrorCalls = 0;
  const spawnMirror = async () => { mirrorCalls += 1; return { ok: true }; };
  // Step 1: a real deferred send — MULTI_ALLOW_TYPING unset, so this is the no-inbox path (exit 3,
  // queued in the outbox) — with a REMOTE sender host, so the mirror runs once from the send itself.
  const err = await rejectsWith(
    runNoteSend(
      ARGS_OK(['--sender-host', 'zhuk-netcup']),
      { orca, home, git: () => '.git', now: NOW, env: {}, spawnMirror, hostname: 'test-host', localAddrs: [] },
    ),
    3,
  );
  assert.equal(err.queued, true);
  assert.equal(mirrorCalls, 1, 'the mirror ran exactly once, from the send itself');
  assert.equal(fs.readdirSync(outboxDir(home)).length, 1, 'one outbox entry queued');

  // Step 2: the REAL retry — note-flush.mjs's own runNoteFlush, imported (not a stand-in), driving the
  // same outbox entry on the same home. note-flush.mjs never imports runNoteSend and has no concept of
  // `spawnMirror` in its own deps, so this is the independent proof that the retry path — whatever
  // branch it takes — cannot reach the mirror. An SSH_CONNECTION mapping to a REMOTE table host
  // (zhuk-vps32, never this machine: hostname/localAddrs are pinned below) is passed on purpose, so a
  // mirror bug reachable from note-flush would fire here if it existed, on every host the suite runs on.
  await runNoteFlush([], {
    home, orca, env: { SSH_CONNECTION: '100.111.119.54 1 2 3' }, spawnMirror, now: NOW,
    hostname: 'test-host', localAddrs: [],
  });
  assert.equal(mirrorCalls, 1, 'the retry never touches the mirror dependency — count is unchanged');
  const day = timeParts(new Date(NOW)).ymd;
  const mirrorFile = notesMirrorPath(home, day);
  const idLines = fs.readFileSync(mirrorFile, 'utf8').split('\n').filter((l) => l.includes(`[${err.id}]`));
  assert.equal(idLines.length, 1, 'exactly one line for this id — the retry never re-appends it');
});
