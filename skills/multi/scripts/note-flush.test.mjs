// node --test "skills/multi/scripts/*.test.mjs"
// note-flush (spec V5) and note-notify (spec V4). A mocked orca runner throughout: no real pane is
// ever touched, and no test may type anything anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NoteError } from './envelope.mjs';
import {
  toPosix, outboxPath, readOutbox, writeOutboxEntry, flushLogPath, supersededIds,
  classifyPane, isSendable, hasShimmerLine,
  normalizeTitle, stripStatusTag, titleToSlug, titleMatchesSlug, titleSignalsPermission, resolvePane,
  claimOutboxEntry, reclaimStaleClaims, makeOrcaRunner,
  composerResidue, deadOutboxPath, benInboxPath, DEFAULT_ORCA_TIMEOUT_MS,
  splitAtPrompt, locateId, composerShows,
} from './transport.mjs';
import {
  runNoteFlush, drainQuietly, parseFlushArgs, entryMatchesTarget, formatFlush,
  DEFAULT_MAX_MS, DEFAULT_PER_ENTRY_MS, DEFAULT_PHASE2_RESERVE_MS,
} from './note-flush.mjs';
import { runNoteNotify, parseNotifyArgs, parseChain, slugFromCwd } from './note-notify.mjs';

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'note-flush-'))); }

const NOW = Date.UTC(2026, 8, 13, 18, 0);
const ENVELOPE = 'astra → taxonomy, 9.13.26 13:45 NYC [astra-pr137-1] ASK: Please review PR 137. Needs: review by 15:00';

const claudePane = (over = {}) => ({
  handle: 'term_aaa', title: 'taxonomy', connected: true, writable: true, orphaned: false,
  agentIdentity: 'claude', agentWait: null, lastOutputAt: NOW - 1000,
  preview: '⏵⏵ bypass permissions on (shift+tab to cycle)', worktreePath: '/repo',
  executionHostId: 'local', ...over,
});
const codexPane = (over = {}) => claudePane({ handle: 'term_bbb', title: 'astra | bto-workflows', agentIdentity: 'codex', ...over });
const readOf = (lines, status = 'running') => ({ handle: 'term_aaa', status, tail: lines });

/** Mirrors the shape note-send's tests use, so the two suites exercise the same transport code. */
function mockOrca(cfg = {}) {
  const calls = [];
  const reads = cfg.reads ? [...cfg.reads] : null;
  const shows = cfg.shows ? [...cfg.shows] : null;
  const run = async (args) => {
    calls.push(args);
    const verb = args[1];
    if (verb === 'list') {
      if (cfg.failList) throw new NoteError(4, 'orca terminal list failed: runtime_unreachable');
      return { terminals: cfg.panes ?? [] };
    }
    if (verb === 'show') {
      // The real CLI has no "active terminal" unless a pane has UI focus (verified on Windows).
      if (!args.includes('--terminal')) throw new NoteError(4, 'orca terminal show failed: no_active_terminal');
      return { terminal: shows && shows.length ? shows.shift() : (cfg.panes ?? [])[0] };
    }
    if (verb === 'read') return { terminal: reads && reads.length ? reads.shift() : readOf(['? for shortcuts']) };
    if (verb === 'send') {
      if (cfg.failSend) throw new NoteError(4, 'orca terminal send failed: pty_not_writable');
      return { ok: true };
    }
    throw new Error(`unexpected orca call ${args.join(' ')}`);
  };
  run.calls = calls;
  run.sends = () => calls.filter((c) => c[1] === 'send');
  run.enters = () => calls.filter((c) => c[1] === 'send' && c.includes('--enter'));
  return run;
}

function queue(home, over = {}) {
  return writeOutboxEntry(home, {
    id: 'astra-pr137-1', from: 'astra', to: 'taxonomy', toSlug: 'taxonomy', handle: 'term_aaa',
    agentIdentity: 'claude', envelope: ENVELOPE, classification: 'permission',
    ledgers: ['/repo/docs/ledger/2026-09-13.md'], packetPath: null, createdAt: new Date(NOW - 60_000).toISOString(),
    ...over,
  });
}

/** The reads a clean two-phase delivery consumes: baseline, post-text verify, re-classify. */
const DELIVERY_READS = (id = 'astra-pr137-1') => [
  readOf(['? for shortcuts']),          // classify
  readOf(['? for shortcuts']),          // baseline
  readOf([`> … [${id}] ASK: x`]),       // after the text send
  readOf([`> … [${id}] ASK: x`]),       // the re-classify read
];

// ─────────────────────────────────────────────────────────────────────────────
// note-flush
// ─────────────────────────────────────────────────────────────────────────────

test('an empty outbox is a silent no-op that never touches orca', async () => {
  const home = tmp();
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(orca.calls.length, 0);
  assert.equal(formatFlush(res), 'note-flush: outbox empty');
});

test('V5: an idle pane gets the queued wake-up typed, two-phase, and the entry is deleted', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 1);
  assert.equal(res.remaining, 0);
  assert.equal(orca.sends().length, 2, 'text first, Enter second — never one combined send');
  assert.equal(orca.enters().length, 1);
  assert.ok(!fs.existsSync(outboxPath(home, 'astra-pr137-1')));
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /delivered \[astra-pr137-1\] -> taxonomy/);
});

test('V5: a pane still at a permission prompt is left queued, with the attempt counted', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane({ agentWait: { reason: 'agent-approval-prompt' } })] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(res.remaining, 1);
  assert.equal(orca.sends().length, 0);
  const [entry] = readOutbox(home);
  assert.equal(entry.attempts, 1);
  assert.equal(entry.lastOutcome, 'deferred');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /deferred \[astra-pr137-1\]/);
});

test('V5: a superseded id is dropped, never typed', async () => {
  const home = tmp();
  queue(home);
  const ledger = path.join(home, '.agents/notes/2026-09-13.md');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, `${ENVELOPE}\nastra → taxonomy, 9.13.26 14:00 NYC [astra-pr137-2 supersedes astra-pr137-1] ASK: Scrap that.\n`);

  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(res.results[0].outcome, 'superseded');
  assert.equal(orca.sends().length, 0, 'a retired wake-up must never reach a pane');
  assert.ok(!fs.existsSync(outboxPath(home, 'astra-pr137-1')));
});

test('supersededIds reads the bracket form, in either position', () => {
  const ids = supersededIds([
    'x → y, 9.13.26 10:00 NYC [a-t-2 supersedes a-t-1] FYI: one.',
    'x → y, 9.13.26 10:00 NYC [a-t-4 re a-t-3 supersedes a-t-3] FYI: two.',
  ]);
  assert.deepEqual([...ids].sort(), ['a-t-1', 'a-t-3']);
});

test('V5: a Codex pane mid-turn keeps its wake-up queued; the same pane idle gets it', async () => {
  const home = tmp();
  queue(home, { toSlug: 'astra', handle: 'term_bbb', agentIdentity: 'codex' });
  const busy = mockOrca({ panes: [codexPane()], reads: [readOf(['• Working (42s • esc to interrupt)', '› '])] });
  const first = await runNoteFlush([], { home, orca: busy, now: NOW });
  assert.equal(first.drained, 0);
  assert.equal(busy.sends().length, 0);

  const idle = mockOrca({
    panes: [codexPane()],
    reads: [readOf(['› ']), readOf(['› ']), readOf(['› … [astra-pr137-1] ASK: x']), readOf(['› … [astra-pr137-1] ASK: x'])],
  });
  const second = await runNoteFlush([], { home, orca: idle, now: NOW });
  assert.equal(second.drained, 1);
  assert.equal(idle.enters().length, 1);
});

test('V5: --to filters the drain to one pane', async () => {
  const home = tmp();
  queue(home);
  queue(home, { id: 'astra-other-1', toSlug: 'nucleus', handle: 'term_zzz' });
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush(['--to', 'taxonomy'], { home, orca, now: NOW });
  assert.equal(res.drained, 1);
  assert.ok(fs.existsSync(outboxPath(home, 'astra-other-1')), 'another pane\'s entry is untouched');
});

test('entryMatchesTarget accepts the slug, the raw --to value or the handle', () => {
  const e = { to: 'term_aaa', toSlug: 'taxonomy', handle: 'term_aaa' };
  assert.equal(entryMatchesTarget(e, 'taxonomy'), true);
  assert.equal(entryMatchesTarget(e, 'TERM_AAA'), true);
  assert.equal(entryMatchesTarget(e, 'nucleus'), false);
  assert.equal(entryMatchesTarget(e, undefined), true);
});

test('V5: an entry whose pane is gone is counted, logged and kept — never crashed on', async () => {
  const home = tmp();
  queue(home, { handle: null });
  const orca = mockOrca({ panes: [] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.results[0].outcome, 'no-pane');
  assert.equal(res.remaining, 1);
  assert.equal(readOutbox(home)[0].attempts, 1);
});

test('V5: a run with no orca at all is exit 0 and leaves everything queued', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ failList: true });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.exitCode, 0);
  assert.equal(res.results[0].outcome, 'no-orca');
  assert.equal(readOutbox(home).length, 1);
});

test('V5: a hopeless entry is given up on, and an ancient one expires — the ledger still has the note', async () => {
  const home = tmp();
  queue(home, { id: 'astra-tired-1', attempts: 20 });
  queue(home, { id: 'astra-ancient-1', createdAt: new Date(NOW - 72 * 3_600_000).toISOString() });
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  const outcomes = Object.fromEntries(res.results.map((r) => [r.id, r.outcome]));
  assert.equal(outcomes['astra-tired-1'], 'gave-up');
  assert.equal(outcomes['astra-ancient-1'], 'expired');
  assert.equal(readOutbox(home).length, 0);
  assert.equal(orca.sends().length, 0);
});

test('V5: --max-ms 0 attempts nothing and leaves the queue intact', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush(['--max-ms', '0'], { home, orca, now: NOW, clock: () => 0 });
  assert.equal(res.attempted, 0);
  assert.equal(res.remaining, 1);
  assert.equal(orca.sends().length, 0);
});

test('--dry-run reports what it would retry and writes nothing', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush(['--dry-run'], { home, orca, now: NOW });
  assert.equal(res.results[0].outcome, 'would-retry');
  assert.equal(orca.calls.length, 0);
  assert.ok(!fs.existsSync(flushLogPath(home)));
  assert.equal(readOutbox(home)[0].attempts, 0);
});

test('drainQuietly swallows everything — a broken drain never takes down its caller', async () => {
  const res = await drainQuietly({ home: tmp(), orca: mockOrca({ failList: true }) }, { maxMs: 10 });
  assert.equal(res.drained, 0);
  const bad = await drainQuietly({ home: tmp(), fsImpl: { readdirSync() { throw new Error('boom'); } } }, {});
  assert.equal(bad.drained, 0);
});

test('flush argument parsing rejects unknown flags', () => {
  assert.throws(() => parseFlushArgs(['--nope']), (e) => e instanceof NoteError && e.exitCode === 1);
  assert.deepEqual(parseFlushArgs(['--to', 'astra', '--json']), { to: 'astra', json: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Codex classification — the pilot's findings, V6
// ─────────────────────────────────────────────────────────────────────────────

test('V6: a braille shimmer line is a working Codex pane, but scrollback braille is not', () => {
  assert.equal(hasShimmerLine(readOf(['⣷⣯⣟ Thinking', '› '])), true);
  assert.equal(hasShimmerLine(readOf(['⣷ old frame', ...Array(10).fill('plain output'), '› '])), false);
  assert.equal(hasShimmerLine(readOf(['a line mentioning ⠇ once, with plenty of other text in it'])), false);
});

test('V6: Codex idle is a composer line with no working evidence; Claude idle is unaffected', () => {
  assert.equal(classifyPane(codexPane(), readOf(['› ']), { now: NOW }), 'agent-idle');
  assert.equal(classifyPane(codexPane(), readOf(['esc to interrupt']), { now: NOW }), 'agent-working');
  assert.equal(classifyPane(codexPane(), readOf(['nothing recognisable']), { now: NOW }), 'unknown');
  // Codex never consults lastOutputAt — the TUI repaints a shimmer about once a second.
  assert.equal(classifyPane(codexPane({ lastOutputAt: 0 }), readOf(['› ']), { now: NOW }), 'agent-idle');
  assert.equal(classifyPane(claudePane({ lastOutputAt: 0, preview: '' }), readOf(['x']), { now: NOW }), 'hibernated');
});

test('V6: Claude sends mid-turn, Codex does not', () => {
  assert.equal(isSendable('agent-working', 'claude'), true);
  assert.equal(isSendable('agent-working', 'codex'), false);
  assert.equal(isSendable('agent-idle', 'codex'), true);
  assert.equal(isSendable('permission', 'claude'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// note-notify (spec V4)
// ─────────────────────────────────────────────────────────────────────────────

const PAYLOAD = {
  type: 'agent-turn-complete',
  'thread-id': 'b5f6c1c2-1111-2222-3333-444455556666',
  'turn-id': '12345',
  cwd: '/repo',
  client: 'codex-tui',
  'input-messages': ['Rename foo to bar'],
  'last-assistant-message': 'Rename complete',
};

test("V4: Codex's payload arrives as the final bare argument and is parsed, not choked on", () => {
  const args = parseNotifyArgs(['--to', 'astra', JSON.stringify(PAYLOAD)]);
  assert.equal(args.to, 'astra');
  assert.equal(args.payload.type, 'agent-turn-complete');
  assert.equal(args.payload['last-assistant-message'], 'Rename complete');
  // a future Codex appending a second argument must not break the wrapper
  const future = parseNotifyArgs([JSON.stringify(PAYLOAD), 'something-new']);
  assert.equal(future.payload.type, 'agent-turn-complete');
  assert.deepEqual(future.extra, ['something-new']);
});

test('V4: --to drives the drain, and the drain is scoped to that pane', async () => {
  const home = tmp();
  queue(home, { toSlug: 'astra', handle: 'term_bbb', agentIdentity: 'codex' });
  queue(home, { id: 'astra-other-1', toSlug: 'nucleus', handle: 'term_zzz' });
  const orca = mockOrca({
    panes: [codexPane()],
    reads: [readOf(['› ']), readOf(['› ']), readOf(['› … [astra-pr137-1] ASK: x']), readOf(['› … [astra-pr137-1] ASK: x'])],
  });
  const res = await runNoteNotify(['--to', 'astra', JSON.stringify(PAYLOAD)], { home, orca, now: NOW, env: {} });
  assert.equal(res.slug, 'astra');
  assert.equal(res.drained, 1);
  assert.equal(res.event, 'agent-turn-complete');
  assert.ok(fs.existsSync(outboxPath(home, 'astra-other-1')), 'another pane is not drained by this turn end');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /notify event=agent-turn-complete slug=astra/);
});

test('V4: with no --to and a cleared environment, the unique Codex pane in the payload cwd is used', async () => {
  const home = tmp();
  const orca = mockOrca({ panes: [codexPane({ worktreePath: '/repo' }), claudePane({ worktreePath: '/other' })] });
  const res = await runNoteNotify([JSON.stringify(PAYLOAD)], { home, orca, now: NOW, env: {} });
  assert.equal(res.slug, 'astra');
  assert.match(res.slugSource, /payload cwd/);
});

test('V4: two Codex panes in the same directory is not an answer — nobody is woken', () => {
  const panes = [codexPane({ title: 'astra' }), codexPane({ handle: 'term_ccc', title: 'n-astra' })];
  assert.equal(slugFromCwd(panes, '/repo'), null);
  assert.equal(slugFromCwd([codexPane({ title: 'astra' })], '/repo'), 'astra');
  assert.equal(slugFromCwd([claudePane({ title: 'taxonomy' })], '/repo'), null, 'a Claude pane is not a Codex turn end');
  assert.equal(slugFromCwd([codexPane({ title: 'astra' })], undefined), null);
});

test('V4: the previous notify target is chained FIRST, with the same payload, and never awaited', async () => {
  const home = tmp();
  const spawned = [];
  const spawnImpl = (cmd, args, opts) => { spawned.push({ cmd, args, opts }); return { unref() {} }; };
  const res = await runNoteNotify(
    ['--to', 'astra', '--chain', 'C:/tools/ding.exe --loud', JSON.stringify(PAYLOAD)],
    { home, orca: mockOrca({ panes: [codexPane()] }), now: NOW, env: {}, spawnImpl },
  );
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].cmd, 'C:/tools/ding.exe');
  assert.deepEqual(spawned[0].args, ['--loud', JSON.stringify(PAYLOAD)]);
  assert.equal(spawned[0].opts.detached, true);
  assert.equal(spawned[0].opts.stdio, 'ignore');
  assert.equal(res.chained.ok, true);
});

test('V4: a chain that cannot be spawned is recorded, and the drain still runs', async () => {
  const home = tmp();
  queue(home, { toSlug: 'astra', handle: 'term_bbb', agentIdentity: 'codex' });
  const spawnImpl = () => { throw new Error('ENOENT'); };
  const orca = mockOrca({
    panes: [codexPane()],
    reads: [readOf(['› ']), readOf(['› ']), readOf(['› … [astra-pr137-1] ASK: x']), readOf(['› … [astra-pr137-1] ASK: x'])],
  });
  const res = await runNoteNotify(['--to', 'astra', '--chain', 'nope.exe'], { home, orca, now: NOW, env: {}, spawnImpl });
  assert.equal(res.chained.ok, false);
  assert.equal(res.drained, 1, 'a broken chain must not stop the wake-up');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /chain=FAILED/);
});

test('parseChain takes a JSON argv array or a plain string', () => {
  assert.deepEqual(parseChain('["C:/a b/ding.exe","--loud"]'), ['C:/a b/ding.exe', '--loud']);
  assert.deepEqual(parseChain('ding --loud'), ['ding', '--loud']);
  assert.equal(parseChain(''), null);
  assert.equal(parseChain(undefined), null);
});

test('V4: an unresolvable slug still exits 0, logs, and drains nothing in particular', async () => {
  const home = tmp();
  const res = await runNoteNotify([], { home, orca: mockOrca({ panes: [] }), now: NOW, env: {} });
  assert.equal(res.exitCode, 0);
  assert.equal(res.slug, null);
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /slug=unknown/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Orca's "Action Required" title decoration (verified live 2026-09-13 15:55 NYC)
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_REQUIRED = '[ . ] Action Required | astra | bto-workflows';

test('AR: the slug still resolves out of an Action Required title', () => {
  assert.equal(stripStatusTag(ACTION_REQUIRED), 'astra | bto-workflows');
  assert.equal(normalizeTitle(ACTION_REQUIRED), 'astra');
  assert.equal(titleToSlug(ACTION_REQUIRED), 'astra');
  assert.equal(titleMatchesSlug(ACTION_REQUIRED, 'astra'), true);
  // and the shapes that already worked must keep working
  assert.equal(normalizeTitle('◑ taxonomy'), 'taxonomy');
  assert.equal(normalizeTitle('⠇ astra | bto-workflows'), 'astra');
  assert.equal(normalizeTitle('n-astra | bto_nucleus'), 'n-astra');
  assert.equal(normalizeTitle('MINGW64:/c/Users/benzh/Code'), 'mingw64 c users benzh code');
});

test('AR: --to astra resolves the decorated pane instead of exit 2', () => {
  const panes = [codexPane({ title: ACTION_REQUIRED }), claudePane({ title: 'taxonomy' })];
  assert.equal(resolvePane(panes, 'astra').handle, 'term_bbb');
  // the worktree half still never matches on its own
  assert.throws(() => resolvePane(panes, 'bto-workflows'), (e) => e instanceof NoteError && e.exitCode === 2);
});

test('AR: a decorated title classifies permission on both vendors, whatever the tail says', () => {
  assert.equal(classifyPane(codexPane({ title: ACTION_REQUIRED }), readOf(['› ']), { now: NOW }), 'permission');
  assert.equal(classifyPane(claudePane({ title: '[ . ] Action Required | taxonomy' }), readOf(['? for shortcuts']), { now: NOW }), 'permission');
  assert.equal(classifyPane(claudePane({ title: 'Action Required | taxonomy' }), readOf(['? for shortcuts']), { now: NOW }), 'permission');
  assert.equal(titleSignalsPermission('astra | bto-workflows'), false);
  assert.equal(titleSignalsPermission('◑ taxonomy'), false);
  assert.equal(isSendable('permission', 'codex'), false);
});

test('AR: a queued wake-up is never typed into a pane Orca titled Action Required', async () => {
  const home = tmp();
  queue(home, { toSlug: 'astra', handle: 'term_bbb', agentIdentity: 'codex' });
  const orca = mockOrca({ panes: [codexPane({ title: ACTION_REQUIRED })], reads: [readOf(['› '])] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(orca.sends().length, 0);
  assert.match(res.results[0].detail, /permission/);
  assert.equal(readOutbox(home).length, 1, 'the wake-up stays queued for when the human answers');
});

test('AR: the Claude agents-list overlay captures Enter, so the pane is not sendable', () => {
  // Verified live on the taxonomy pane: an overlay, not an approval — but our two-phase send would
  // press Enter into it and select a row.
  const overlay = readOf([
    '  general-purpose   running  1h25m',
    '  ↑/↓ to select · Enter to view · Esc to close',
  ]);
  assert.equal(classifyPane(claudePane({ preview: '' }), overlay, { now: NOW }), 'permission');
  assert.equal(classifyPane(codexPane({ preview: '' }), overlay, { now: NOW }), 'permission');
});

// ─────────────────────────────────────────────────────────────────────────────
// Review r2: M4 (resolver scope), M2 (outbox claim), H4 (enforced budgets)
// ─────────────────────────────────────────────────────────────────────────────

test('M4: a status tag is only eaten when it carries a KNOWN waiting label', () => {
  // Row 1 already worked; rows 2 and 3 were the regression the generalised strip introduced.
  assert.equal(titleToSlug('[ . ] Action Required | astra | bto-workflows'), 'astra');
  assert.equal(titleToSlug('[2] astra | bto-workflows'), 'astra', 'an unknown tag must never eat a segment');
  assert.equal(titleToSlug('Action Required | astra | bto-workflows'), 'astra', 'the label counts without a bracket');
  // and the decorated pane still must not answer to its worktree
  assert.equal(titleMatchesSlug('[2] astra | bto-workflows', 'bto-workflows'), false);
  assert.equal(titleMatchesSlug('[ . ] Action Required | astra | bto-workflows', 'bto-workflows'), false);
  // every previously correct answer is unchanged
  assert.equal(titleToSlug('◑ taxonomy'), 'taxonomy');
  assert.equal(titleToSlug('⠇ astra | bto-workflows'), 'astra');
  assert.equal(titleToSlug('n-astra | bto_nucleus'), 'n-astra');
  assert.equal(stripStatusTag('astra | bto-workflows'), 'astra | bto-workflows');
  // classification still fails closed on ANY bracket, which is the half that must stay broad
  assert.equal(titleSignalsPermission('[2] astra | bto-workflows'), true);
});

test('M4: an unknown-tag pane resolves to its slug, so the note is not dropped at exit 2', () => {
  const panes = [codexPane({ title: '[2] astra | bto-workflows' })];
  assert.equal(resolvePane(panes, 'astra').handle, 'term_bbb');
  assert.throws(() => resolvePane(panes, 'bto-workflows'), (e) => e instanceof NoteError && e.exitCode === 2);
});

test('M2: a claimed entry is invisible to a second flusher — no double-typing', async () => {
  const home = tmp();
  queue(home);
  // Simulate flusher A holding the claim while flusher B runs.
  const claim = claimOutboxEntry(home, 'astra-pr137-1');
  assert.ok(claim, 'the first claim must win');
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(orca.sends().length, 0, 'a claimed wake-up must never be typed twice');
});

test('M2: a delivered entry cannot be resurrected by a stale reader', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(readOutbox(home).length, 0);
  assert.equal(fs.existsSync(outboxPath(home, 'astra-pr137-1')), false);
  assert.equal(fs.existsSync(outboxPath(home, 'astra-pr137-1') + '.' + process.pid + '.claim'), false, 'the claim goes with the entry');
});

test('M2: a claim abandoned by a killed flusher is reclaimed, not lost forever', () => {
  const home = tmp();
  queue(home);
  const claim = claimOutboxEntry(home, 'astra-pr137-1', fs, 99999);
  assert.ok(claim);
  assert.equal(readOutbox(home).length, 0, 'while claimed it is invisible');

  // Too fresh: a live flusher is probably still working on it.
  assert.deepEqual(reclaimStaleClaims(home, { now: Date.now() }), []);
  // Old enough: it comes back.
  assert.deepEqual(reclaimStaleClaims(home, { now: Date.now() + 10 * 60 * 1000 }), ['astra-pr137-1']);
  assert.equal(readOutbox(home).length, 1);
});

test('M2: a reclaim never clobbers a newer entry for the same id', () => {
  const home = tmp();
  queue(home);
  claimOutboxEntry(home, 'astra-pr137-1', fs, 99999);
  queue(home, { attempts: 3 });                      // a newer write landed while the claim was held
  reclaimStaleClaims(home, { now: Date.now() + 10 * 60 * 1000 });
  const entries = readOutbox(home);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].attempts, 3, 'the live entry wins; the stale claim is discarded');
});

test('H4: the orca runner kills a hung subprocess and reports a timeout, not a hang', async () => {
  const killed = () => Promise.reject(Object.assign(new Error('timeout'), { killed: true }));
  const deps = { execFile: killed, existsSync: () => true, platform: 'linux', home: '/home/ben' };
  const runner = makeOrcaRunner('fake-orca', {}, deps);
  await assert.rejects(
    runner(['terminal', 'read']),
    (e) => e instanceof NoteError && e.exitCode === 4 && /timed out after \d+ ms and was killed/.test(e.message),
  );

  // The timeout is passed down to execFile, which is what actually does the killing.
  let opts = null;
  const spy = (exe, argv, o) => { opts = o; return Promise.resolve({ stdout: '{"ok":true,"result":{}}' }); };
  await makeOrcaRunner('fake-orca', { ORCA_TIMEOUT_MS: '1234' },
    { ...deps, execFile: spy })(['terminal', 'list']);
  assert.equal(opts.timeout, 1234);
  assert.equal(opts.killSignal, 'SIGKILL');
});

test('H4: one wedged pane cannot eat the whole drain — the per-entry budget is enforced', async () => {
  const home = tmp();
  queue(home, { id: 'astra-slow-1' });
  queue(home, { id: 'astra-fast-1', toSlug: 'nucleus', handle: 'term_zzz' });
  let list = 0;
  const orca = async (args) => {
    if (args[1] === 'list') { list += 1; return { terminals: [claudePane({ handle: 'term_aaa', title: 'taxonomy' })] }; }
    return new Promise(() => {});     // every show/read hangs forever
  };
  const started = Date.now();
  const res = await runNoteFlush(['--per-entry-ms', '60', '--phase2-reserve-ms', '0'], { home, orca, now: NOW });
  assert.ok(Date.now() - started < 2000, 'the drain must not wait on a wedged pane');
  assert.equal(list, 1);
  assert.ok(res.results.some((r) => r.outcome === 'timed-out'), JSON.stringify(res.results));
  assert.equal(readOutbox(home).length, 2, 'nothing is lost; both stay queued for the next drain');
});

test('H4: the whole drain still stops at --max-ms with entries left', async () => {
  const home = tmp();
  for (let i = 0; i < 4; i++) queue(home, { id: 'astra-many' + i + '-1' });
  const orca = async (args) => {
    if (args[1] === 'list') return { terminals: [claudePane()] };
    return new Promise(() => {});
  };
  const res = await runNoteFlush(['--max-ms', '120', '--per-entry-ms', '50', '--phase2-reserve-ms', '0'], { home, orca, now: NOW });
  assert.ok(res.attempted < 4, 'attempted ' + res.attempted + ' of 4 — the budget was not enforced');
  assert.equal(res.drained, 0);
});

test('H4: note-notify stays inside its budget when slug resolution hangs', async () => {
  const home = tmp();
  const orca = async () => new Promise(() => {});
  const started = Date.now();
  const res = await runNoteNotify(['--max-ms', '150'], { home, orca, now: NOW, env: { ORCA_TERMINAL_HANDLE: 'term_bbb' } });
  assert.ok(Date.now() - started < 2000, 'a Codex turn end must never leave a stuck process');
  assert.equal(res.exitCode, 0);
  assert.equal(res.slug, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Incident 2026-09-14: the flusher typed phase 1, its phase-2 read timed out, and the envelope sat in
// taxonomy's composer while later notes stacked on top — so taxonomy got a pile of stale notes at once.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Claude composer exactly as it renders on Netcup (verified 2026-09-14): a box rule, the `❯`
 * prompt carrying the first line, any wrapped continuation, a closing rule, then the hint lines that
 * live BELOW the box and are not composer content.
 */
const RULE = '─'.repeat(60);
const COMPOSER = (lines = []) => [
  RULE,
  `❯ ${lines[0] ?? ''}`,
  ...lines.slice(1),
  RULE,
  '  ⏵⏵ bypass permissions on · 3 shells',
  '  ● main',
  '  ◯ general-purpose  Tailing replay-smoke.log for movie 175',
];

/** An orca whose `read` calls take `readMs`, so a phase-2 timeout can be reproduced deterministically. */
function slowReadOrca(cfg = {}) {
  const calls = [];
  const reads = cfg.reads ? [...cfg.reads] : null;
  const wait = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
  const run = async (args) => {
    calls.push(args);
    const verb = args[1];
    if (verb === 'list') return { terminals: cfg.panes ?? [] };
    if (verb === 'show') return wait(cfg.showMs ?? 0, { terminal: (cfg.panes ?? [])[0] });
    if (verb === 'read') {
      const value = { terminal: reads && reads.length ? reads.shift() : readOf(['? for shortcuts']) };
      return wait(cfg.readMs ?? 0, value);
    }
    if (verb === 'send') return { ok: true };
    throw new Error(`unexpected orca call ${args.join(' ')}`);
  };
  run.calls = calls;
  run.sends = () => calls.filter((c) => c[1] === 'send');
  run.enters = () => calls.filter((c) => c[1] === 'send' && c.includes('--enter'));
  run.texts = () => calls.filter((c) => c[1] === 'send' && c.includes('--text'));
  return run;
}

test('incident (1): the defaults give a real delivery room to finish', () => {
  // The old numbers — 8 s per orca call, 6 s per entry — could not cover classify + type + verify +
  // Enter on a box that answers in 1–7 s. That is what stranded the text.
  assert.ok(DEFAULT_ORCA_TIMEOUT_MS >= 10_000, `orca timeout is ${DEFAULT_ORCA_TIMEOUT_MS} ms`);
  assert.ok(DEFAULT_PER_ENTRY_MS >= 30_000, `per-entry budget is ${DEFAULT_PER_ENTRY_MS} ms`);
  assert.ok(DEFAULT_MAX_MS > DEFAULT_PER_ENTRY_MS, 'a drain must fit at least one whole entry');
  assert.ok(DEFAULT_PHASE2_RESERVE_MS > 0);
});

test('incident (2): a budget too small to press Enter means NOTHING is typed', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({ panes: [claudePane()] });
  // Enough to look, nowhere near enough to finish: the old code typed anyway.
  // The shape note-send's inline piggyback has: a 3 s budget, nowhere near a delivery.
  const res = await runNoteFlush(['--max-ms', '3000'], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(orca.texts().length, 0, 'phase 1 must not run when phase 2 cannot follow');
  assert.equal(orca.enters().length, 0);
  assert.match(res.results[0].outcome, /insufficient budget/);
  assert.equal(readOutbox(home).length, 1, 'and the wake-up stays queued for a drain that has room');
});

test('incident (2): a slow read can no longer cut the delivery in half once typing has started', async () => {
  const home = tmp();
  queue(home);
  // Reads take 120 ms each; the per-entry budget only covers the LOOK. Phase 2 is deliberately unraced,
  // so the Enter still happens rather than the line being abandoned in the composer.
  const orca = slowReadOrca({
    panes: [claudePane()],
    readMs: 120,
    reads: [
      readOf(['? for shortcuts']),
      readOf(['? for shortcuts']),
      readOf(['> … [astra-pr137-1] ASK: x']),
      readOf(['> … [astra-pr137-1] ASK: x']),
    ],
  });
  const res = await runNoteFlush(['--per-entry-ms', '900', '--phase2-reserve-ms', '300'], { home, orca, now: NOW });
  assert.equal(res.drained, 1, JSON.stringify(res.results));
  assert.equal(orca.texts().length, 1);
  assert.equal(orca.enters().length, 1, 'the Enter that follows the text must always get its chance');
  assert.equal(readOutbox(home).length, 0);
});

test('incident (3): our own stranded line is completed, not refused forever', async () => {
  const home = tmp();
  queue(home);
  // The composer already holds exactly the envelope a previous attempt typed.
  const orca = slowReadOrca({ panes: [claudePane()], reads: [readOf(['? for shortcuts']), readOf(COMPOSER([ENVELOPE]))] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 1, JSON.stringify(res.results));
  assert.equal(orca.texts().length, 0, 'it must not be typed a second time');
  assert.equal(orca.enters().length, 1, 'pressing Enter is what completes the interrupted delivery');
  assert.match(res.results[0].detail, /completed an interrupted delivery/);
  assert.equal(readOutbox(home).length, 0);
});

test('incident (3): a composer holding a STACK of our notes is still completed', async () => {
  const home = tmp();
  queue(home);
  const other = 'astra → taxonomy, 9.13.26 13:50 NYC [astra-pr138-1] FYI: And another one.';
  const ledger = path.join(home, '.agents/notes/2026-09-13.md');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, `${ENVELOPE}\n${other}\n`);
  // Exactly the incident's end state: several stranded envelopes, wrapped across lines by the terminal.
  const wrapped = COMPOSER([other.slice(0, 40), other.slice(40), ENVELOPE.slice(0, 50), ENVELOPE.slice(50)]);
  const orca = slowReadOrca({ panes: [claudePane()], reads: [readOf(['? for shortcuts']), readOf(wrapped)] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 1, JSON.stringify(res.results));
  assert.equal(orca.enters().length, 1);
  assert.equal(orca.texts().length, 0);
});

test('incident (3): foreign text in the composer is still never submitted', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({
    panes: [claudePane()],
    reads: [readOf(['? for shortcuts']), readOf(COMPOSER([ENVELOPE, 'and here is something Ben was typing']))],
  });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(orca.enters().length, 0, 'a human half-typed message must never be submitted');
  assert.match(res.results[0].detail, /composer but so is text that is not a note/);
  assert.match(res.results[0].detail, /somethingBenwastyping/i, 'the residue names what it refused to submit');
  assert.equal(readOutbox(home).length, 1);
});

test('incident (3): composerResidue tolerates wrapping and ignores chrome', () => {
  const env = 'astra → taxonomy, 9.13.26 13:45 NYC [astra-x-1] FYI: Hello there.';
  const wrapped = readOf(COMPOSER(['astra → taxonomy, 9.13.26 13:45 NYC [astra-x-1] FYI: Hel', 'lo there.']));
  assert.equal(composerResidue(wrapped, [env]).foreign, null);
  const dirty = readOf(COMPOSER([env, 'rm -rf something']));
  assert.match(composerResidue(dirty, [env]).foreign, /rm-rfsomething/);
  // an envelope we have never seen is foreign too — we only complete deliveries we can account for
  assert.ok(composerResidue(readOf(COMPOSER([env])), []).foreign);
});

test('incident (4): a completed delivery is not retyped, and the entry is gone', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({ panes: [claudePane()], reads: [readOf(['? for shortcuts']), readOf(COMPOSER([ENVELOPE]))] });
  await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(readOutbox(home).length, 0);
  // A second drain has nothing to do — the id is never typed again.
  const again = await runNoteFlush([], { home, orca: slowReadOrca({ panes: [claudePane()] }), now: NOW });
  assert.equal(again.attempted, 0);
});

test('incident (5): gave-up files a BLOCKED line for Ben and keeps the entry in outbox/dead/', async () => {
  const home = tmp();
  queue(home, { attempts: 20, lastError: 'no answer from orca within 6979 ms' });
  const orca = slowReadOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.results[0].outcome, 'gave-up');

  const dead = deadOutboxPath(home, 'astra-pr137-1');
  assert.ok(fs.existsSync(dead), 'the evidence of an undelivered wake-up must survive');
  assert.equal(JSON.parse(fs.readFileSync(dead, 'utf8')).id, 'astra-pr137-1');
  assert.equal(readOutbox(home).length, 0, 'and it is not retried forever');

  const inbox = fs.readFileSync(benInboxPath(home), 'utf8');
  assert.match(inbox, /BLOCKED: \[astra-pr137-1\] was never typed into taxonomy after 20 attempts/);
  assert.match(inbox, /The note IS in the ledger/);
  assert.match(inbox, /no answer from orca within 6979 ms/);
});

test('the flush log reports the budget it actually applied, not the drain remainder', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({ panes: [claudePane()], showMs: 5_000 });
  const res = await runNoteFlush(['--max-ms', '5000', '--per-entry-ms', '400', '--phase2-reserve-ms', '100'], { home, orca, now: NOW });
  assert.equal(res.results[0].outcome, 'timed-out');
  // The old message printed the whole-drain remainder (`within 6979 ms`) while the real bound was the
  // per-entry one — which made the live log actively misleading during the incident.
  assert.match(res.results[0].detail, /within 300 ms/);
});

test('a pass that could never type logs one summary line, not one per entry', async () => {
  const home = tmp();
  for (let i = 0; i < 4; i++) queue(home, { id: 'astra-many' + i + '-1' });
  const orca = slowReadOrca({ panes: [claudePane()] });
  const res = await runNoteFlush(['--max-ms', '3000'], { home, orca, now: NOW });
  assert.equal(res.results.length, 4);
  assert.ok(res.results.every((r) => String(r.outcome).startsWith('skipped')));
  const logText = fs.readFileSync(flushLogPath(home), 'utf8').trim().split('\n');
  assert.equal(logText.length, 1, 'the piggyback runs constantly; four lines per send would bury the log');
  assert.match(logText[0], /budget-only-pass 4 entries left untouched/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Addendum 2026-09-14: "on screen" must mean the COMPOSER, not the transcript.
// taxonomy's composer was a bare ❯ while flush.log insisted the note was "already on screen" — the
// check was matching the id in the scrollback of a note that had been delivered and submitted.
// ─────────────────────────────────────────────────────────────────────────────

/** The transcript above the input box: a note that ARRIVED, wrapped by the terminal as it really is. */
const HISTORY = (env) => [
  '✻ Waiting for 1 background agent to finish',
  '  Ran 1 shell command',
  `💬 ${env.slice(0, 60)}`,
  `  ${env.slice(60)}`,
];

test('addendum (6): the tail splits at the last prompt marker, and hints below the box are not composer', () => {
  const split = splitAtPrompt(readOf([...HISTORY(ENVELOPE), ...COMPOSER(['half a thought'])]));
  assert.equal(split.found, true);
  assert.deepEqual(split.composer.map((l) => l.trim()).filter(Boolean), ['half a thought']);
  assert.ok(split.history.join(' ').includes('Waiting for 1 background agent'));
  // the agents list and the status line live BELOW the box and must never read as typed text
  assert.equal(split.composer.join(' ').includes('general-purpose'), false);
  assert.equal(split.composer.join(' ').includes('bypass permissions'), false);
});

test('addendum (6): an empty composer is empty — the live taxonomy screen', () => {
  // Exactly what `orca terminal read` returned for taxonomy at 2026-09-14: a bare ❯ between two rules,
  // with the note in the transcript above.
  const read = readOf([...HISTORY(ENVELOPE), ...COMPOSER([])]);
  const where = locateId(read, 'astra-pr137-1');
  assert.equal(where.found, true);
  assert.equal(where.inComposer, false, 'the composer is EMPTY; this is the whole bug');
  assert.equal(where.inHistory, true);
  assert.equal(composerShows(read, 'astra-pr137-1'), false);
});

test('addendum (7): an id in the transcript means DELIVERED — entry closed, nothing typed', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({ panes: [claudePane()], reads: [readOf(['? for shortcuts']), readOf([...HISTORY(ENVELOPE), ...COMPOSER([])])] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.results[0].outcome, 'confirmed-from-screen');
  assert.equal(res.drained, 1);
  assert.equal(orca.texts().length, 0, 'a note already in the transcript must never be retyped');
  assert.equal(orca.enters().length, 0, 'and Enter must not be pressed into an empty composer');
  assert.equal(readOutbox(home).length, 0, 'this is what stopped the outbox draining');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /confirmed-from-screen \[astra-pr137-1\]/);
});

test('addendum (8): an id in the composer is completed with Enter, not retyped', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({
    panes: [claudePane()],
    reads: [readOf(['? for shortcuts']), readOf([...HISTORY('astra → taxonomy, 9.13.26 09:00 NYC [astra-old-9] FYI: Something else.'), ...COMPOSER([ENVELOPE])])],
  });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.results[0].outcome, 'delivered');
  assert.match(res.results[0].detail, /completed an interrupted delivery/);
  assert.equal(orca.texts().length, 0);
  assert.equal(orca.enters().length, 1);
});

test('addendum (9): foreign text in the composer defers and quotes what it refused', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({
    panes: [claudePane()],
    reads: [readOf(['? for shortcuts']), readOf([...HISTORY(ENVELOPE), ...COMPOSER([ENVELOPE, 'ben was midway through this'])])],
  });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(orca.enters().length, 0);
  assert.match(res.results[0].detail, /benwasmidwaythroughthis/);
  assert.equal(readOutbox(home).length, 1);
});

test('addendum: the transcript is never mistaken for foreign text', () => {
  // The mirror image of the bug: scoping the residue check to the whole tail would call the entire
  // transcript "text that is not a note" and refuse every delivery forever.
  const read = readOf([...HISTORY(ENVELOPE), '  and a long line of ordinary agent output', ...COMPOSER([ENVELOPE])]);
  assert.equal(composerResidue(read, [ENVELOPE]).foreign, null);
});

test('addendum: no prompt marker at all defers rather than guessing', async () => {
  const home = tmp();
  queue(home);
  // A pane we cannot read the shape of: pressing Enter over unseen text is unsafe, and calling it
  // delivered would drop the wake-up silently. Defer, and let max-attempts make it a visible dead letter.
  const orca = slowReadOrca({ panes: [claudePane()], reads: [readOf(['? for shortcuts']), readOf([`some screen with ${ENVELOPE} in it`])] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  assert.equal(orca.enters().length, 0);
  assert.match(res.results[0].detail, /no prompt marker/);
});

test('addendum: a Codex composer splits on its own prompt', () => {
  const split = splitAtPrompt(readOf(['  earlier codex output', '› a thought in progress']));
  assert.equal(split.found, true);
  assert.deepEqual(split.composer.map((l) => l.trim()), ['a thought in progress']);
  assert.deepEqual(split.history.map((l) => l.trim()), ['earlier codex output']);
});
