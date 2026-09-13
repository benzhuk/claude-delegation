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
} from './transport.mjs';
import { runNoteFlush, drainQuietly, parseFlushArgs, entryMatchesTarget, formatFlush } from './note-flush.mjs';
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
