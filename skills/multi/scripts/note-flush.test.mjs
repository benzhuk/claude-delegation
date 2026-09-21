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
  toPosix, outboxPath, readOutbox, writeOutboxEntry, flushLogPath, supersededIds, cursorPath,
  classifyPane, isSendable, hasShimmerLine,
  normalizeTitle, stripStatusTag, titleToSlug, titleMatchesSlug, titleSignalsPermission, resolvePane,
  claimOutboxEntry, reclaimStaleClaims, makeOrcaRunner,
  composerResidue, deadOutboxPath, deadOutboxDir, benInboxPath, DEFAULT_ORCA_TIMEOUT_MS,
  splitAtPrompt, locateId, composerShows,
  wakeAllKindsPath, noUnknownCheckPath, writeInbox, notesDir, appendLine,
} from './transport.mjs';
import {
  runNoteFlush, drainQuietly, parseFlushArgs, entryMatchesTarget, formatFlush,
  DEFAULT_MAX_MS, DEFAULT_PER_ENTRY_MS, DEFAULT_PHASE2_RESERVE_MS,
  DEFAULT_MAX_ATTEMPTS, DEFAULT_MAX_AGE_HOURS, UNKNOWN_RECIPIENT_DEADLETTER_MS,
  flushLastPath, readHeartbeat, buildFlushStatus, HEARTBEAT_STALE_MS,
} from './note-flush.mjs';
import { runNoteNotify, parseNotifyArgs, parseChain, slugFromCwd } from './note-notify.mjs';

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'note-flush-'))); }

/**
 * Typing is the LAST RESORT since 0.5.0 (spec 2026-09-17, D3): note-flush delivers to a recipient's own
 * inbox, and only reaches for the composer when `MULTI_ALLOW_TYPING=1` says it may. Every test below
 * that asserts a KEYSTROKE therefore opts in explicitly — which is also how this suite documents that a
 * plain drain types nothing.
 */
const TYPING = { MULTI_ALLOW_TYPING: '1' };


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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 0);
  assert.equal(orca.calls.length, 0);
  assert.equal(formatFlush(res), 'note-flush: outbox empty');
});

test('V5: an idle pane gets the queued wake-up typed, two-phase, and the entry is deleted', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 0);
  assert.equal(res.results[0].outcome, 'superseded');
  assert.equal(orca.sends().length, 0, 'a retired wake-up must never reach a pane');
  assert.ok(!fs.existsSync(outboxPath(home, 'astra-pr137-1')));
});

test('a recorded handle that is GONE falls back to the slug, and the log says so', async () => {
  const home = tmp();
  // The peer restarted: the handle note-send recorded no longer exists, but a pane titled `taxonomy`
  // is sitting right there. Resolving the dead handle would burn all 20 attempts against nothing.
  queue(home, { handle: 'term_dead' });
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 1);
  assert.match(res.results[0].detail, /^handle gone, resolved by slug; typed into term_aaa/);
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /handle gone, resolved by slug/);
});

test('a LIVE recorded handle is still used verbatim, whatever the pane is called now', async () => {
  const home = tmp();
  // Handle term_aaa is alive but its title no longer matches the entry's slug. The handle is exact:
  // that is the whole reason note-send records it.
  queue(home, { handle: 'term_aaa', to: 'astra', toSlug: 'astra' });
  const orca = mockOrca({ panes: [claudePane({ title: 'Continue' })], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 1);
  assert.doesNotMatch(res.results[0].detail, /handle gone/);
});

test('a dead handle whose slug resolves nowhere reports no-pane, saying it fell back', async () => {
  const home = tmp();
  queue(home, { handle: 'term_dead' });
  const orca = mockOrca({ panes: [claudePane({ title: 'someone-else' })] });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.results[0].outcome, 'no-pane');
  assert.match(res.results[0].detail, /handle gone, resolved by slug; no pane titled "taxonomy"/);
  assert.equal(readOutbox(home)[0].attempts, 1, 'still just one more attempt, not a lost entry');
});

/** A 0.4.0 marker: `until` well in the future, owned by a process that is demonstrably alive. */
function staleMarker(home, slug = 'taxonomy') {
  const file = path.join(home, '.agents/notes', `.listening-${slug}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    pid: process.pid, host: os.hostname(), slug, until: NOW + 10 * 60_000, asks: [],
  }), 'utf8');
  return file;
}

test('2026-09-16: a 0.4.0 listening marker is swept, even when the outbox is empty', async () => {
  const home = tmp();
  const marker = staleMarker(home);

  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });

  assert.equal(res.drained, 0);
  assert.equal(fs.existsSync(marker), false, 'nothing writes these now, so every one left is garbage');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /cleanup .*\.listening-taxonomy\.json/);
});

test('2026-09-16: a marker no longer stops the wake-up being typed', async () => {
  const home = tmp();
  queue(home);
  const marker = staleMarker(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });

  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });

  assert.equal(res.drained, 1, 'the marker is swept on the way in, not obeyed');
  assert.equal(fs.existsSync(marker), false);
});

test('2026-09-16: --dry-run reports on the outbox without deleting a marker', async () => {
  const home = tmp();
  const marker = staleMarker(home);
  await runNoteFlush(['--dry-run'], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.ok(fs.existsSync(marker), 'a dry run changes nothing on disk, this file included');
});

/** The recipient's own record of what note-inbox has already shown it. */
function markRead(home, slug, id, ymd = '2026-09-13') {
  const file = cursorPath(home, slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ version: 1, slug, updatedAt: new Date(NOW).toISOString(), seen: { [id]: ymd } })}
`, 'utf8');
  return file;
}

test('D9: a wake-up the recipient has already READ is retired unattempted', async () => {
  const home = tmp();
  queue(home);
  markRead(home, 'taxonomy', 'astra-pr137-1');

  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 0);
  assert.equal(res.results[0].outcome, 'retired');
  assert.equal(orca.sends().length, 0, 'typing it would be a pure duplicate wake-up');
  assert.ok(!fs.existsSync(outboxPath(home, 'astra-pr137-1')));
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /retired \[astra-pr137-1\] -> taxonomy — already read \(cursor\)/);
});

test('D9: ANOTHER pane having read the id changes nothing — the cursor is per recipient', async () => {
  const home = tmp();
  queue(home);
  markRead(home, 'nucleus', 'astra-pr137-1');
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 1);
  assert.equal(res.results[0].outcome, 'delivered');
});

test('D9: a read entry is retired even at max attempts — no BLOCKED line for Ben', async () => {
  const home = tmp();
  queue(home, { attempts: 20 });
  markRead(home, 'taxonomy', 'astra-pr137-1');
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [claudePane()] }), now: NOW });
  assert.equal(res.results[0].outcome, 'retired');
  assert.ok(!fs.existsSync(benInboxPath(home)), 'a note that was read is closed, not abandoned');
  assert.ok(!fs.existsSync(deadOutboxPath(home, 'astra-pr137-1')));
});

test('D9: --dry-run reports the retirement without deleting anything', async () => {
  const home = tmp();
  queue(home);
  markRead(home, 'taxonomy', 'astra-pr137-1');
  const res = await runNoteFlush(['--dry-run'], { home, orca: mockOrca({ panes: [claudePane()] }), now: NOW });
  assert.equal(res.results[0].outcome, 'retired');
  assert.equal(readOutbox(home).length, 1);
  assert.equal(fs.existsSync(flushLogPath(home)), false);
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
  const first = await runNoteFlush([], { home, orca: busy, now: NOW, env: TYPING });
  assert.equal(first.drained, 0);
  assert.equal(busy.sends().length, 0);

  const idle = mockOrca({
    panes: [codexPane()],
    reads: [readOf(['› ']), readOf(['› ']), readOf(['› … [astra-pr137-1] ASK: x']), readOf(['› … [astra-pr137-1] ASK: x'])],
  });
  const second = await runNoteFlush([], { home, orca: idle, now: NOW, env: TYPING });
  assert.equal(second.drained, 1);
  assert.equal(idle.enters().length, 1);
});

test('V5: --to filters the drain to one pane', async () => {
  const home = tmp();
  queue(home);
  queue(home, { id: 'astra-other-1', toSlug: 'nucleus', handle: 'term_zzz' });
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush(['--to', 'taxonomy'], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.results[0].outcome, 'no-pane');
  assert.equal(res.remaining, 1);
  assert.equal(readOutbox(home)[0].attempts, 1);
});

test('V5: a run with no orca at all is exit 0 and leaves everything queued', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ failList: true });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.exitCode, 0);
  assert.equal(res.results[0].outcome, 'no-orca');
  assert.equal(readOutbox(home).length, 1);
});

test('V5: a hopeless entry is given up on, and an ancient one expires — the ledger still has the note', async () => {
  const home = tmp();
  queue(home, { id: 'astra-tired-1', attempts: 20 });
  queue(home, { id: 'astra-ancient-1', createdAt: new Date(NOW - 72 * 3_600_000).toISOString() });
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush(['--max-ms', '0'], { home, orca, now: NOW, clock: () => 0, env: TYPING });
  assert.equal(res.attempted, 0);
  assert.equal(res.remaining, 1);
  assert.equal(orca.sends().length, 0);
});

test('--dry-run reports what it would retry and writes nothing', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush(['--dry-run'], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteNotify(['--to', 'astra', JSON.stringify(PAYLOAD)], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.slug, 'astra');
  assert.equal(res.drained, 1);
  assert.equal(res.event, 'agent-turn-complete');
  assert.ok(fs.existsSync(outboxPath(home, 'astra-other-1')), 'another pane is not drained by this turn end');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /notify event=agent-turn-complete slug=astra/);
});

test('V4: with no --to and a cleared environment, the unique Codex pane in the payload cwd is used', async () => {
  const home = tmp();
  const orca = mockOrca({ panes: [codexPane({ worktreePath: '/repo' }), claudePane({ worktreePath: '/other' })] });
  const res = await runNoteNotify([JSON.stringify(PAYLOAD)], { home, orca, now: NOW, env: TYPING });
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
    { home, orca: mockOrca({ panes: [codexPane()] }), now: NOW, env: TYPING, spawnImpl },
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
  const res = await runNoteNotify(['--to', 'astra', '--chain', 'nope.exe'], { home, orca, now: NOW, env: TYPING, spawnImpl });
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
  const res = await runNoteNotify([], { home, orca: mockOrca({ panes: [] }), now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 0);
  assert.equal(orca.sends().length, 0, 'a claimed wake-up must never be typed twice');
});

test('M2: a delivered entry cannot be resurrected by a stale reader', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush(['--per-entry-ms', '60', '--phase2-reserve-ms', '0'], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush(['--max-ms', '120', '--per-entry-ms', '50', '--phase2-reserve-ms', '0'], { home, orca, now: NOW, env: TYPING });
  assert.ok(res.attempted < 4, 'attempted ' + res.attempted + ' of 4 — the budget was not enforced');
  assert.equal(res.drained, 0);
});

test('H4: note-notify stays inside its budget when slug resolution hangs', async () => {
  const home = tmp();
  const orca = async () => new Promise(() => {});
  const started = Date.now();
  const res = await runNoteNotify(['--max-ms', '150'], { home, orca, now: NOW, env: { ...TYPING, ORCA_TERMINAL_HANDLE: 'term_bbb' } });
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
  const res = await runNoteFlush(['--max-ms', '3000'], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush(['--per-entry-ms', '900', '--phase2-reserve-ms', '300'], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(readOutbox(home).length, 0);
  // A second drain has nothing to do — the id is never typed again.
  const again = await runNoteFlush([], { home, orca: slowReadOrca({ panes: [claudePane()] }), now: NOW });
  assert.equal(again.attempted, 0);
});

test('incident (5): gave-up files a BLOCKED line for Ben and keeps the entry in outbox/dead/', async () => {
  const home = tmp();
  queue(home, { attempts: 20, lastError: 'no answer from orca within 6979 ms' });
  const orca = slowReadOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush(['--max-ms', '5000', '--per-entry-ms', '400', '--phase2-reserve-ms', '100'], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.results[0].outcome, 'timed-out');
  // The old message printed the whole-drain remainder (`within 6979 ms`) while the real bound was the
  // per-entry one — which made the live log actively misleading during the incident.
  assert.match(res.results[0].detail, /within 300 ms/);
});

test('a pass that could never type logs one summary line, not one per entry', async () => {
  const home = tmp();
  for (let i = 0; i < 4; i++) queue(home, { id: 'astra-many' + i + '-1' });
  const orca = slowReadOrca({ panes: [claudePane()] });
  const res = await runNoteFlush(['--max-ms', '3000'], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
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

test('F1: ZERO tolerance — the short words a human types are never submitted', () => {
  // The reviewer's probe against 2d7ab85: a residue of three characters or fewer was tolerated, so
  // `ok`, `y`, `no`, `yes`, `hmm`, `...` all rode along with our envelope when Enter was pressed.
  for (const typed of ['ok', 'y', 'no', 'yes', 'hmm', 'k', '?']) {
    const read = readOf(COMPOSER([ENVELOPE, typed]));
    const { foreign } = composerResidue(read, [ENVELOPE]);
    assert.ok(foreign, `"${typed}" was tolerated and would have been submitted`);
    assert.ok(foreign.toLowerCase().includes(typed.toLowerCase()), `${typed} missing from residue ${foreign}`);
  }
});

test('F1: a human word typed BEFORE our envelope is caught too', () => {
  const read = readOf(COMPOSER(['wait', ENVELOPE]));
  assert.match(composerResidue(read, [ENVELOPE]).foreign, /wait/);
});

test('F1: cursor glyphs and box chrome are still not text worth protecting', () => {
  // The length threshold existed to absorb these; they belong in CHROME_RE instead, so the tolerance
  // could go to zero without a deferral on every redraw.
  const read = readOf(COMPOSER([ENVELOPE + ' ▌']));
  assert.equal(composerResidue(read, [ENVELOPE]).foreign, null);
});

test('F1: an exact stack of envelopes is still completed, wrapping and all', () => {
  const other = 'astra → taxonomy, 9.13.26 13:50 NYC [astra-pr138-1] FYI: And another one.';
  const read = readOf(COMPOSER([other.slice(0, 30), other.slice(30), ENVELOPE.slice(0, 44), ENVELOPE.slice(44)]));
  assert.equal(composerResidue(read, [ENVELOPE, other]).foreign, null);
});

test('F1: a human word between two envelopes is caught', () => {
  const other = 'astra → taxonomy, 9.13.26 13:50 NYC [astra-pr138-1] FYI: And another one.';
  const read = readOf(COMPOSER([other, 'no', ENVELOPE]));
  assert.match(composerResidue(read, [ENVELOPE, other]).foreign, /no/);
});

test('F1: end to end — one human word means the drain refuses and requeues', async () => {
  const home = tmp();
  queue(home);
  const orca = slowReadOrca({
    panes: [claudePane()],
    reads: [readOf(['? for shortcuts']), readOf([...HISTORY(ENVELOPE), ...COMPOSER([ENVELOPE, 'ok'])])],
  });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 0);
  assert.equal(orca.enters().length, 0, "Ben's 'ok' must never be submitted");
  assert.equal(readOutbox(home).length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// N1 (spec 2026-09-20): ACK and FYI never wake anyone — an entry queued before the change is retired
// ─────────────────────────────────────────────────────────────────────────────

const ACK_ENVELOPE = 'astra → taxonomy, 9.13.26 13:50 NYC [astra-pr137-2 re astra-pr137-1] ACK: Taking it now. Needs: none';

test('N1: an ACK/FYI outbox entry queued before the change is retired unattempted', async () => {
  const home = tmp();
  queue(home, { envelope: ACK_ENVELOPE, classification: 'permission' });
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 0);
  assert.equal(res.results[0].outcome, 'retired-quiet-kind');
  assert.equal(orca.sends().length, 0);
  assert.ok(!fs.existsSync(outboxPath(home, 'astra-pr137-1')));
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /retired-quiet-kind \[astra-pr137-1\]/);
});

test('N1: the wake-all-kinds kill switch keeps ACK/FYI in the ordinary flow', async () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(wakeAllKindsPath(home)), { recursive: true });
  fs.writeFileSync(wakeAllKindsPath(home), '');
  queue(home, { envelope: ACK_ENVELOPE });
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  // Proven by reaching a real attempt (an orca call happened at all) and NOT the quiet-kind retirement —
  // whether the two-phase type-and-Enter sequence itself completes is the same environment-dependent
  // concern several baseline tests already have, unrelated to N1.
  assert.notEqual(res.results[0]?.outcome, 'retired-quiet-kind');
  assert.ok(orca.calls.length > 0, 'with the kill switch, an ACK is attempted like any other kind');
});

// ─────────────────────────────────────────────────────────────────────────────
// N2 (spec 2026-09-20): an ASK/BLOCKED to a slug still unknown 10 minutes later is dead-lettered early
// ─────────────────────────────────────────────────────────────────────────────

const UNKNOWN_ASK_ENVELOPE = 'taxonomy → fable, 9.20.26 10:00 NYC [taxonomy-fable-ping-1] ASK: Does C14 still hold? Needs: decision by 16:00';
/** The mirror file `now` (NOW, Sept 13 2026) falls inside the flusher's 3-day lookback window. */
const NOW_YMD = '2026-09-13';

/**
 * classification `not-resolved` is what note-send records when the pane never resolved at all.
 *
 * review BLOCKER 1: production ALWAYS writes the note's own envelope line to the machine-wide mirror
 * BEFORE the entry is ever queued (note-send's ledger-first ordering) — a fixture that omits it tests a
 * state production never reaches, which is exactly how the original N2 flush tests shipped green against
 * a check that could never fire for real. `seedMirror: false` opts a test out when it needs to see the
 * unpolluted "nobody has ever heard of this slug" state instead (there is no such state in production;
 * it is only useful for isolating the OLD, broken behaviour in a regression test).
 */
function unknownAskEntry(home, over = {}) {
  const { seedMirror = true, envelope = UNKNOWN_ASK_ENVELOPE, ...rest } = over;
  if (seedMirror) {
    appendLine(toPosix(path.posix.join(notesDir(home), `${NOW_YMD}.md`)), envelope);
  }
  return writeOutboxEntry(home, {
    id: 'taxonomy-fable-ping-1', from: 'taxonomy', to: 'fable', toSlug: 'fable', handle: null,
    agentIdentity: null,
    envelope,
    classification: 'not-resolved',
    ledgers: ['/repo/docs/ledger/2026-09-20.md'], packetPath: null,
    createdAt: new Date(NOW - 11 * 60_000).toISOString(),
    ...rest,
  });
}

test('N2: an ASK to a slug still unknown 10 minutes later is dead-lettered, well before the ordinary give-up', async () => {
  const home = tmp();
  unknownAskEntry(home);
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.equal(res.results[0].outcome, 'unknown-recipient');
  assert.ok(fs.existsSync(deadOutboxPath(home, 'taxonomy-fable-ping-1')));
  assert.equal(readOutbox(home).length, 0);
  const inbox = fs.readFileSync(benInboxPath(home), 'utf8');
  assert.match(inbox, /BLOCKED:/);
  assert.match(inbox, /"fable"/);
  assert.match(inbox, /still unknown/);
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /unknown-recipient \[taxonomy-fable-ping-1\]/);
});

test('N2: the ordinary give-up needs far more than the 10-minute unknown-recipient window', () => {
  // Reported per the build spec: the ordinary limits are 20 attempts (DEFAULT_MAX_ATTEMPTS) or about
  // 48 hours (DEFAULT_MAX_AGE_HOURS) — whichever comes first. 10 minutes is neither.
  assert.equal(DEFAULT_MAX_ATTEMPTS, 20);
  assert.equal(DEFAULT_MAX_AGE_HOURS, 48);
  assert.ok(DEFAULT_MAX_AGE_HOURS * 3_600_000 > UNKNOWN_RECIPIENT_DEADLETTER_MS * 100);
});

test('N2: an ASK less than 10 minutes old is not dead-lettered yet, even if unknown', async () => {
  const home = tmp();
  unknownAskEntry(home, { createdAt: new Date(NOW - 60_000).toISOString() });
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.notEqual(res.results.find((r) => r.id === 'taxonomy-fable-ping-1')?.outcome, 'unknown-recipient');
  assert.equal(readOutbox(home).length, 1);
});

test('N2: a slug that has since registered an inbox is no longer unknown', async () => {
  const home = tmp();
  unknownAskEntry(home);
  writeInbox(home, 'fable', { kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: 't1' }, { now: NOW });
  const res = await runNoteFlush([], {
    home, orca: mockOrca({ panes: [] }), now: NOW,
    deliverToInbox: async () => ({ delivered: false, reason: 'inbox-error', detail: 'stub' }),
  });
  assert.notEqual(res.results.find((r) => r.id === 'taxonomy-fable-ping-1')?.outcome, 'unknown-recipient');
});

test('N2: a queued entry whose pane DID resolve is never treated as unknown-recipient', async () => {
  const home = tmp();
  // classification is not `not-resolved` here — a pane WAS found, just not sendable — so this is not
  // the case N2 is about, whatever the ledger mirror says.
  unknownAskEntry(home, { classification: 'permission', handle: 'term_aaa' });
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.notEqual(res.results[0]?.outcome, 'unknown-recipient');
});

test('N2: the no-unknown-check kill switch skips the early dead-letter', async () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(noUnknownCheckPath(home)), { recursive: true });
  fs.writeFileSync(noUnknownCheckPath(home), '');
  unknownAskEntry(home);
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.notEqual(res.results[0]?.outcome, 'unknown-recipient');
  assert.equal(readOutbox(home).length, 1, 'still queued, following the ordinary path');
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix round 1 (review 2026-09-20): BLOCKER 1 / MAJOR 3 / MINOR 4/5/9
// ─────────────────────────────────────────────────────────────────────────────

test('review BLOCKER 1: dead-lettered even though the note\'s OWN envelope line is in the mirror', async () => {
  // The headline bug: `recentMirrorTexts` sees exactly what note-send already wrote for this entry
  // BEFORE it was ever queued — a state every real unknown-recipient entry is in, and the one the
  // original fixture (no mirror file at all) never exercised.
  const home = tmp();
  unknownAskEntry(home);
  const mirror = fs.readFileSync(path.posix.join(notesDir(home), `${NOW_YMD}.md`), 'utf8');
  assert.match(mirror, /taxonomy → fable,.*\[taxonomy-fable-ping-1\]/, 'fixture sanity: the self-line really is there');
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.equal(res.results[0].outcome, 'unknown-recipient', 'the note\'s own undelivered line must not make "fable" look known');
});

test('review MAJOR 3: a --no-type entry (classification not-checked) is also eligible for the early dead-letter', async () => {
  const home = tmp();
  unknownAskEntry(home, { classification: 'not-checked (--no-type)' });
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.equal(res.results[0]?.outcome, 'unknown-recipient');
});

test('review MINOR 9: with MULTI_ALLOW_TYPING=1, the early dead-letter is skipped so typing gets a chance', async () => {
  const home = tmp();
  unknownAskEntry(home);
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW, env: TYPING });
  assert.notEqual(res.results[0]?.outcome, 'unknown-recipient');
});

test('review MINOR 4: a claim lost to another drainer is never dead-lettered or reported twice', async () => {
  const home = tmp();
  unknownAskEntry(home);
  let renameAttempts = 0;
  const fsImpl = {
    ...fs,
    renameSync(src, dest) {
      if (String(src).includes('taxonomy-fable-ping-1') && String(dest).endsWith('.claim')) {
        renameAttempts += 1;
        throw new Error('ENOENT: no such file (claimed by another drainer)');
      }
      return fs.renameSync(src, dest);
    },
  };
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW, fsImpl });
  assert.equal(renameAttempts, 1, 'the claim really was attempted and really did fail');
  assert.equal(res.results[0]?.outcome, 'claimed-elsewhere');
  assert.ok(!fs.existsSync(deadOutboxPath(home, 'taxonomy-fable-ping-1')), 'a lost claim must not dead-letter');
  assert.ok(!fs.existsSync(benInboxPath(home)), 'a lost claim must not report to ben either');
});

test('review MINOR 5: several stuck notes to the same wrong slug produce ONE ben-inbox line, not one each', async () => {
  const home = tmp();
  unknownAskEntry(home, { id: 'taxonomy-fable-ping-1' });
  unknownAskEntry(home, {
    id: 'taxonomy-fable-ping-2',
    envelope: 'taxonomy → fable, 9.20.26 10:05 NYC [taxonomy-fable-ping-2] ASK: And this too? Needs: decision by 16:00',
  });
  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.equal(res.results.filter((r) => r.outcome === 'unknown-recipient').length, 2, 'both are still dead-lettered individually');
  const inbox = fs.readFileSync(benInboxPath(home), 'utf8');
  const blockedLines = inbox.split('\n').filter((l) => l.includes('BLOCKED:') && l.includes('"fable"'));
  assert.equal(blockedLines.length, 1, `expected one aggregated line, got:\n${inbox}`);
  assert.match(blockedLines[0], /taxonomy sent 2 notes/);
  assert.match(blockedLines[0], /\[taxonomy-fable-ping-1\]/);
  assert.match(blockedLines[0], /\[taxonomy-fable-ping-2\]/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Build spec 0921-F: the heartbeat (~/.agents/notes/flush-last.json) and `note-flush --status`.
// ─────────────────────────────────────────────────────────────────────────────

test('F1: an empty outbox pass still writes a heartbeat, all zero', async () => {
  const home = tmp();
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW });
  assert.equal(res.drained, 0);
  const hb = JSON.parse(fs.readFileSync(flushLastPath(home), 'utf8'));
  assert.equal(hb.queued, 0);
  assert.equal(hb.delivered, 0);
  assert.equal(hb.deferred, 0);
  assert.equal(hb.retired, 0);
  assert.equal(hb.dead_lettered, 0);
  assert.equal(hb.errors, 0);
  assert.equal(hb.last_error, null);
  assert.equal(hb.host, os.hostname());
  assert.equal(hb.pid, process.pid);
  assert.equal(typeof hb.ms, 'number');
  assert.equal(hb.at, new Date(NOW).toISOString());
  assert.equal('mode' in hb, false, 'a bare CLI-shaped call cannot tell a timer run from a manual one');
});

test('F1: a pass that delivers writes correct counts', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 1);
  const hb = JSON.parse(fs.readFileSync(flushLastPath(home), 'utf8'));
  assert.equal(hb.queued, 1);
  assert.equal(hb.delivered, 1);
  assert.equal(hb.deferred, 0);
  assert.equal(hb.retired, 0);
  assert.equal(hb.dead_lettered, 0);
  assert.equal(hb.errors, 0);
  assert.equal(hb.last_error, null);
});

test('F1: retired and dead-lettered outcomes are tallied separately from delivered/deferred', async () => {
  const home = tmp();
  queue(home, { id: 'astra-tired-1', attempts: 20 }); // gave-up -> dead_lettered
  queue(home, { id: 'astra-ancient-1', createdAt: new Date(NOW - 72 * 3_600_000).toISOString() }); // expired -> retired
  const orca = mockOrca({ panes: [claudePane()] });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.results.length, 2);
  const hb = JSON.parse(fs.readFileSync(flushLastPath(home), 'utf8'));
  assert.equal(hb.queued, 2);
  assert.equal(hb.retired, 1, 'the expired entry');
  assert.equal(hb.dead_lettered, 1, 'the gave-up entry');
  assert.equal(hb.delivered, 0);
});

test('F1: a delivery that throws still writes a heartbeat with an error, never the raw message', async () => {
  const home = tmp();
  queue(home);
  // Registered so the pass takes the inbox path (no typing), and its own error carries the socket path -
  // exactly the shape `errorDetail` in inbox-claude.mjs produces for a real connect failure.
  writeInbox(home, 'taxonomy', { kind: 'claude-socket', socket: '/tmp/marker-sock.sock', token: 'tok', sessionId: 's1' }, { now: NOW });
  const res = await runNoteFlush([], {
    home, now: NOW, env: {}, orca: mockOrca({ panes: [] }),
    deliverToInbox: async () => { throw new Error('boom: connect ENOENT /tmp/marker-sock.sock'); },
  });
  assert.equal(res.results[0].outcome, 'inbox-error');
  const hb = JSON.parse(fs.readFileSync(flushLastPath(home), 'utf8'));
  assert.ok(hb.errors >= 1);
  assert.equal(hb.last_error, 'inbox-error', 'only the outcome label is recorded — the real message could carry the socket path');
  assert.equal(String(hb.last_error).includes('marker-sock'), false);
});

test('F1: a pass that throws before producing a result still writes a heartbeat, using deps.home', async () => {
  const home = tmp();
  await assert.rejects(
    runNoteFlush(['--bogus-flag'], { home, now: NOW }),
    (e) => e instanceof NoteError && /unknown flag/.test(e.message),
  );
  const hb = JSON.parse(fs.readFileSync(flushLastPath(home), 'utf8'));
  assert.equal(hb.errors, 1);
  assert.match(hb.last_error, /unknown flag --bogus-flag/);
  assert.equal(hb.queued, 0);
  assert.equal(hb.delivered, 0);
  assert.equal(hb.deferred, 0);
  assert.equal(hb.retired, 0);
  assert.equal(hb.dead_lettered, 0);
});

test('F2: an unwritable heartbeat path leaves the pass result identical to a working one', async () => {
  const runOnce = async (fsImplOverride) => {
    const home = tmp();
    queue(home);
    const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
    return runNoteFlush([], { home, orca, now: NOW, env: TYPING, fsImpl: fsImplOverride });
  };
  const good = await runOnce(fs);
  const brokenFs = {
    ...fs,
    renameSync(src, dest) {
      if (String(dest).endsWith('flush-last.json')) throw new Error('EACCES: cannot rename heartbeat');
      return fs.renameSync(src, dest);
    },
  };
  const bad = await runOnce(brokenFs);
  assert.equal(bad.ok, good.ok);
  assert.equal(bad.exitCode, good.exitCode);
  assert.equal(bad.drained, good.drained);
  assert.equal(bad.attempted, good.attempted);
  assert.equal(bad.remaining, good.remaining);
  assert.equal(bad.dryRun, good.dryRun);
  assert.deepEqual(bad.results, good.results);
  assert.equal(fs.existsSync(flushLastPath(bad.home)), false, 'the failed rename must leave no heartbeat file');
  assert.deepEqual(
    fs.readdirSync(notesDir(bad.home)).filter((n) => n.includes('.tmp')),
    [],
    'a failed heartbeat write must not leave a stray tmp file either',
  );
});

test('F1/F2: a dry run writes no heartbeat, matching its "touch nothing" contract', async () => {
  const home = tmp();
  queue(home);
  await runNoteFlush(['--dry-run'], { home, orca: mockOrca({ panes: [claudePane()] }), now: NOW });
  assert.equal(fs.existsSync(flushLastPath(home)), false);
});

test('F1: the heartbeat never contains note text or a registered inbox address', async () => {
  const home = tmp();
  const MARKER = 'zzMARKERzz42';
  const envelope = `astra → taxonomy, 9.13.26 13:45 NYC [astra-pr137-1] ASK: ${MARKER} please review. Needs: review by 15:00`;
  queue(home, { envelope });
  writeInbox(home, 'taxonomy', { kind: 'claude-socket', socket: `/tmp/${MARKER}.sock`, token: MARKER, sessionId: MARKER }, { now: NOW });
  await runNoteFlush([], { home, now: NOW, env: {}, orca: mockOrca({ panes: [] }) });
  const raw = fs.readFileSync(flushLastPath(home), 'utf8');
  assert.equal(raw.includes(MARKER), false, `heartbeat leaked: ${raw}`);
});

test('F1: drainQuietly (the piggyback path) tags the heartbeat mode, once it has something to report', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  await drainQuietly({ home, orca, now: NOW, env: TYPING }, {});
  const hb = JSON.parse(fs.readFileSync(flushLastPath(home), 'utf8'));
  assert.equal(hb.mode, 'piggyback');
  assert.equal(hb.queued, 1);
});

/**
 * SPEC CONFLICT (see the build report): F1 wants a heartbeat on every pass, piggyback included. But
 * note-send's own piggyback drain runs before it knows whether it will record anything, and one of its
 * tests (note-send.test.mjs H3, out of this territory) asserts NO file at all appears under
 * `~/.agents/notes` when a send records nothing. Creating the directory to hold a heartbeat for an empty
 * outbox would break that. Resolved conservatively: an empty piggyback pass writes nothing.
 */
test('F1: an empty piggyback pass writes no heartbeat, and creates no directory - the note-send H3 contract', async () => {
  const home = tmp();
  await drainQuietly({ home, orca: mockOrca({ panes: [] }), now: NOW }, {});
  assert.equal(fs.existsSync(path.join(home, '.agents/notes')), false);
});

test('F1: a bare (non-piggyback) empty pass still writes a heartbeat - that is the --status audience', async () => {
  const home = tmp();
  await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.equal(fs.existsSync(flushLastPath(home)), true);
});

test('F3: --status reports missing when the flusher has never run', () => {
  const home = tmp();
  const status = buildFlushStatus([], { home });
  assert.equal(status.exitCode, 1);
  assert.equal(status.line, 'flusher has never run on this machine (no flush-last.json)');
  assert.deepEqual(status.json, { missing: true, unreadable: false, age_s: null, timer_age_s: null, stale: true });
});

// Review round 1, finding 2+3: a file that IS there but corrupt/unreadable is a different problem than
// "never run", and must still say so and exit 1 (never "never run") - and either way `--status --json`
// on a missing/unreadable heartbeat must carry `stale: true`, not leave a consumer reading `.stale` as
// `undefined` (falsy, i.e. "healthy").
test('F3: --status reports a corrupt heartbeat as unreadable, not as never-run', () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(flushLastPath(home)), { recursive: true });
  fs.writeFileSync(flushLastPath(home), 'not json{{{', 'utf8');
  const status = buildFlushStatus([], { home });
  assert.equal(status.exitCode, 1);
  assert.equal(status.line, 'flush-last.json is there but unreadable or not valid JSON: the flusher cannot be checked');
  assert.deepEqual(status.json, { missing: false, unreadable: true, age_s: null, timer_age_s: null, stale: true });
});

test('F3: --status reports fresh when inside the stale window', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane()], reads: DELIVERY_READS() });
  await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  const status = buildFlushStatus([], { home, now: NOW + 42_000 });
  assert.equal(status.exitCode, 0);
  assert.equal(status.line, `flusher last ran 42s ago on ${os.hostname()}: queued 1, delivered 1, deferred 0, errors 0`);
  assert.equal(status.json.stale, false);
  assert.equal(status.json.age_s, 42);
});

test('F3: --status reports STALE past the 5-minute window, and exits 1', async () => {
  const home = tmp();
  await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW }); // empty outbox, still a heartbeat
  const status = buildFlushStatus([], { home, now: NOW + HEARTBEAT_STALE_MS + 60_000 });
  assert.equal(status.exitCode, 1);
  assert.match(status.line, /^flusher last ran 360s ago on .+: queued 0, delivered 0, deferred 0, errors 0\. STALE: the one-minute timer is not running$/);
  assert.equal(status.json.stale, true);
});

// Review round 1, BLOCKER masking probe: a dead one-minute timer must not hide behind a busy machine.
// Six piggyback passes (each with something to report, so each writes), zero timer passes: staleness has
// to be judged on `timer_at` (never set here) rather than the repeatedly-refreshed `at`.
test('F1/F3: six piggyback passes with zero timer passes still read STALE - the masking probe', async () => {
  const home = tmp();
  queue(home); // one wake-up, recipient never gets a pane below - it just sits queued, undelivered
  const orca = mockOrca({ panes: [] });
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await drainQuietly({ home, orca, now: NOW + i * 4 * 60_000 }, {});
  }
  const hb = JSON.parse(fs.readFileSync(flushLastPath(home), 'utf8'));
  assert.equal(hb.mode, 'piggyback');
  assert.equal('timer_at' in hb, false, 'no timer pass has ever run, so no timer_at to fall back on');
  const status = buildFlushStatus([], { home, now: NOW + 6 * 4 * 60_000 });
  assert.equal(status.exitCode, 1);
  assert.match(status.line, /STALE: the one-minute timer is not running$/);
  assert.equal(status.json.stale, true);
  assert.equal(status.json.timer_age_s, null);
});

test('F3: --status --json includes the raw heartbeat plus age_s and stale', async () => {
  const home = tmp();
  await runNoteFlush([], { home, orca: mockOrca({ panes: [] }), now: NOW });
  const status = buildFlushStatus(['--json'], { home, now: NOW + 5_000 });
  assert.equal(status.json.queued, 0);
  assert.equal(status.json.age_s, 5);
  assert.equal(status.json.stale, false);
  assert.equal(typeof status.json.host, 'string');
  assert.equal(typeof status.json.at, 'string');
});
