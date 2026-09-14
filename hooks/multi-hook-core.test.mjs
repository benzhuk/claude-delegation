// node --test "hooks/*.test.mjs"
// The shared hook core: what a note looks like when it lands, and when a session is allowed to wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  toPosix, outstandingAsks, listeningPath, writeListening, readListening, removeListening, isListening,
} from '../skills/multi/scripts/transport.mjs';
import {
  summarise, humanLine, humanSummary, contextOutput, blockOutput, longPoll, runHookEvent,
  ledgerPulse, scannedDirs, longPollMaxMin, STOP_TIMEOUT_S, STOP_REASON, MID_TURN_NOTE,
} from './multi-hook-core.mjs';
import { codexSlug, runCodexHook } from './multi-codex-hook.mjs';

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'hook-core-'))); }

const NOW = Date.UTC(2026, 8, 14, 20, 10); // 16:10 NYC
const HOUR = 3_600_000;

const line = (from, to, id, kind, body, extra = '') =>
  `${from} → ${to}, 9.14.26 16:00 NYC [${id}] ${kind}: ${body}.${extra}`;

const noteOf = (l) => {
  const m = /\[([a-z0-9-]+-\d+)[^\]]*\] (\w+):/.exec(l);
  const [from, to] = l.split(' → ');
  return { id: m[1], from, to: to.split(',')[0], kind: m[2], line: l, details: null, packetExists: null, packetPath: null, ymd: '2026-09-14' };
};

const resultOf = (lines, slug = 'taxonomy', scanned = []) => ({
  slug, count: lines.length, notes: lines.map(noteOf), problems: [], scanned,
});

function mirror(home, lines, ymd = '2026-09-14') {
  const file = path.join(home, '.agents/notes', `${ymd}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [`# Peer-note ledger ${ymd}`, '', ...lines, ''].join('\n'), 'utf8');
  return toPosix(file);
}

// ─────────────────────────────────────────────────────────────────────────────
// outstandingAsks — the only reason a session may wait
// ─────────────────────────────────────────────────────────────────────────────

test('D2: my unanswered ASK is outstanding; my FYI and somebody else\'s ASK are not', () => {
  const texts = [[
    line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1', ' Needs: review by 17:00'),
    line('taxonomy', 'astra', 'taxonomy-pr1-9', 'FYI', 'Just so you know'),
    line('nucleus', 'astra', 'nucleus-pr1-1', 'ASK', 'Not mine', ' Needs: review by 17:00'),
  ].join('\n')];
  assert.deepEqual(outstandingAsks(texts, 'taxonomy', { now: NOW }).map((a) => a.id), ['taxonomy-pr1-1']);
});

test('D2: an ASK with Needs: none asks for nothing, so it is never outstanding', () => {
  const texts = [line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'No reply needed', ' Needs: none')];
  assert.deepEqual(outstandingAsks(texts, 'taxonomy', { now: NOW }), []);
});

test('D2: a RESULT or BLOCKED from the RECIPIENT closes it; a third party cannot', () => {
  const ask = line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1', ' Needs: review by 17:00');
  const byPeer = `astra → taxonomy, 9.14.26 16:05 NYC [astra-pr1-1 re taxonomy-pr1-1] RESULT: Two blockers.`;
  const byOther = `nucleus → taxonomy, 9.14.26 16:05 NYC [nucleus-pr1-1 re taxonomy-pr1-1] RESULT: I looked instead.`;
  assert.deepEqual(outstandingAsks([`${ask}\n${byPeer}`], 'taxonomy', { now: NOW }), []);
  assert.deepEqual(outstandingAsks([`${ask}\n${byOther}`], 'taxonomy', { now: NOW }).map((a) => a.id), ['taxonomy-pr1-1']);
  const blocked = `astra → taxonomy, 9.14.26 16:05 NYC [astra-pr1-2 re taxonomy-pr1-1] BLOCKED: No key on this box.`;
  assert.deepEqual(outstandingAsks([`${ask}\n${blocked}`], 'taxonomy', { now: NOW }), []);
});

test('D2: an ACK closes a Needs: ack, but NOT a Needs: review — that one is still owed', () => {
  const askAck = line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Confirm you got it', ' Needs: ack');
  const askReview = line('taxonomy', 'astra', 'taxonomy-pr1-2', 'ASK', 'Review it', ' Needs: review by 17:00');
  const ack1 = `astra → taxonomy, 9.14.26 16:05 NYC [astra-pr1-1 re taxonomy-pr1-1] ACK: Got it.`;
  const ack2 = `astra → taxonomy, 9.14.26 16:05 NYC [astra-pr1-2 re taxonomy-pr1-2] ACK: Taking it, ETA 45 min.`;
  const ids = outstandingAsks([`${askAck}\n${askReview}\n${ack1}\n${ack2}`], 'taxonomy', { now: NOW }).map((a) => a.id);
  assert.deepEqual(ids, ['taxonomy-pr1-2'], 'an ACK to a review request is "taking it", not the review');
});

test('D2: an ASK older than the window is not worth waiting for', () => {
  const texts = [line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Ancient', ' Needs: review by 17:00')];
  assert.deepEqual(outstandingAsks(texts, 'taxonomy', { now: NOW + 25 * HOUR }), []);
  assert.equal(outstandingAsks(texts, 'taxonomy', { now: NOW + 23 * HOUR }).length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// What Ben sees
// ─────────────────────────────────────────────────────────────────────────────

test('D1: the human line is one note, one line, with the gist', () => {
  const l = line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Please review PR 137, focus on the scheduler');
  assert.equal(humanLine(noteOf(l)), '📨 astra → taxonomy ASK: Please review PR 137, focus on the scheduler.');
});

test('D1: a long body is cut at 80 characters so it cannot bury the reply above it', () => {
  const body = 'x'.repeat(200);
  const out = humanLine(noteOf(line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', body)));
  assert.ok(out.length <= '📨 astra → taxonomy ASK: '.length + 80, out.length);
  assert.ok(out.endsWith('…'));
});

test('D1: three notes at most, then a count', () => {
  const notes = ['a', 'b', 'c', 'd', 'e'].map((x, i) => noteOf(line('astra', 'taxonomy', `astra-t-${i + 1}`, 'FYI', x)));
  const text = humanSummary(notes);
  assert.equal(text.split('\n').length, 4);
  assert.match(text, /\+2 more in the ledger$/);
  assert.equal(humanSummary([]), null, 'nothing to say means no systemMessage at all');
});

test('D1: every output carrying notes carries the human line too', () => {
  const result = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const ctx = contextOutput('UserPromptSubmit', result);
  assert.equal(ctx.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(ctx.hookSpecificOutput.additionalContext, /\[astra-pr1-1\]/);
  assert.match(ctx.systemMessage, /^📨 astra → taxonomy ASK: Review PR 1/);

  const stop = blockOutput(result, STOP_REASON);
  assert.equal(stop.decision, 'block');
  assert.match(stop.reason, /\[astra-pr1-1\]/);
  assert.match(stop.reason, /Handle these before you stop/);
  assert.match(stop.systemMessage, /^📨/);
});

test('summarise still carries the id, the packet state and the problems', () => {
  const result = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  result.notes[0].details = 'docs/notes/astra-pr1-1.md';
  result.notes[0].packetExists = false;
  result.problems = ['cursor not writable'];
  const text = summarise(result);
  assert.match(text, /packet MISSING: docs\/notes\/astra-pr1-1\.md/);
  assert.match(text, /! cursor not writable/);
});

// ─────────────────────────────────────────────────────────────────────────────
// The long poll
// ─────────────────────────────────────────────────────────────────────────────

const ASK = line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1', ' Needs: review by 17:00');
const REPLY = 'astra → taxonomy, 9.14.26 16:08 NYC [astra-pr1-1 re taxonomy-pr1-1] RESULT: Two blockers.';

test('D2: nothing outstanding means no wait and no marker — the common case is instant', async () => {
  const home = tmp();
  const file = mirror(home, [line('astra', 'taxonomy', 'astra-x-1', 'FYI', 'unrelated')]);
  let called = 0;
  const found = await longPoll(
    { home, now: NOW, inbox: async () => { called += 1; return resultOf([]); }, sleep: async () => {}, listenSignals: false },
    resultOf([], 'taxonomy', [file]),
  );
  assert.equal(found, null);
  assert.equal(called, 0, 'it must not even read: there is nothing we are owed');
  assert.equal(fs.existsSync(listeningPath(home, 'taxonomy')), false);
});

test('D2: with an ASK outstanding it parks, marks itself listening, and delivers the reply', async () => {
  const home = tmp();
  const file = mirror(home, [ASK]);
  const result = resultOf([], 'taxonomy', [file]);

  // The clock is ours, so the test does not depend on what the wall clock says relative to the
  // fixture's timestamps.
  let clockNow = NOW;
  let markerDuringWait = null;
  const sleep = async () => {
    clockNow += 3_000;
    // The peer answers while we are parked.
    markerDuringWait = readListening(home, 'taxonomy');
    fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}${REPLY}\n`, 'utf8');
    const later = new Date(Date.now() + 5_000);
    fs.utimesSync(file, later, later);
  };
  const found = await longPoll(
    {
      home, now: NOW, sleep, listenSignals: false, clock: () => clockNow,
      inbox: async () => resultOf([REPLY], 'taxonomy', [file]),
    },
    result,
  );

  assert.equal(found.count, 1);
  assert.equal(markerDuringWait.slug, 'taxonomy');
  assert.deepEqual(markerDuringWait.asks, ['taxonomy-pr1-1']);
  assert.ok(markerDuringWait.until > NOW);
  assert.equal(fs.existsSync(listeningPath(home, 'taxonomy')), false, 'the marker is gone the moment we stop waiting');
});

test('D2: the marker is removed even when the wait times out', async () => {
  const home = tmp();
  const file = mirror(home, [ASK]);
  let clockNow = NOW;
  const found = await longPoll(
    {
      home, now: NOW, listenSignals: false,
      clock: () => clockNow,
      sleep: async () => { clockNow += 60_000; },
      inbox: async () => { throw new Error('must not read: nothing changed on disk'); },
    },
    resultOf([], 'taxonomy', [file]),
  );
  assert.equal(found, null);
  assert.equal(fs.existsSync(listeningPath(home, 'taxonomy')), false);
});

test('D2: MULTI_LONGPOLL_MAX_MIN=0 disables waiting entirely', async () => {
  const home = tmp();
  const file = mirror(home, [ASK]);
  assert.equal(longPollMaxMin({ MULTI_LONGPOLL_MAX_MIN: '0' }), 0);
  assert.equal(longPollMaxMin({}), 15);
  assert.equal(longPollMaxMin({ MULTI_LONGPOLL_MAX_MIN: 'nonsense' }), 15);
  const found = await longPoll(
    { home, now: NOW, env: { MULTI_LONGPOLL_MAX_MIN: '0' }, listenSignals: false, sleep: async () => {}, inbox: async () => resultOf([REPLY]) },
    resultOf([], 'taxonomy', [file]),
  );
  assert.equal(found, null);
  assert.equal(fs.existsSync(listeningPath(home, 'taxonomy')), false);
});

test('the Stop handler timeout must cover the cap with room to finish', () => {
  assert.equal(STOP_TIMEOUT_S, 1020);
});

test('ledgerPulse and scannedDirs look exactly where the inbox looked', () => {
  const home = tmp();
  const file = mirror(home, [ASK]);
  const result = resultOf([], 'taxonomy', [file]);
  assert.deepEqual(scannedDirs(result), [path.posix.dirname(toPosix(file))]);
  assert.ok(ledgerPulse(scannedDirs(result)) > 0);
  assert.equal(ledgerPulse(['/no/such/dir']), 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

const stubCtx = (over = {}) => ({
  home: over.home ?? tmp(), env: {}, now: NOW, listenSignals: false, sleep: async () => {},
  input: {}, cwd: '/repo', ...over,
});

test('UserPromptSubmit with notes returns additionalContext, with nothing returns silence', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const out = await runHookEvent(stubCtx({ event: 'UserPromptSubmit', inbox: async () => notes }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(out.suppressOutput, true);
  assert.equal(await runHookEvent(stubCtx({ event: 'UserPromptSubmit', inbox: async () => resultOf([]) })), null);
});

test('PostToolUse says the note arrived mid-turn', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const out = await runHookEvent(stubCtx({ event: 'PostToolUse', inbox: async () => notes }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, new RegExp(MID_TURN_NOTE.slice(0, 40)));
});

test('SessionStart delivers whatever is pending, as context', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const out = await runHookEvent(stubCtx({ event: 'SessionStart', inbox: async () => notes }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.systemMessage, /^📨/);
});

test('Stop with notes blocks; a re-fire never reads and never blocks', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const out = await runHookEvent(stubCtx({ event: 'Stop', inbox: async () => notes }));
  assert.equal(out.decision, 'block');

  let read = 0;
  const again = await runHookEvent(stubCtx({
    event: 'Stop', input: { stop_hook_active: true }, inbox: async () => { read += 1; return notes; },
  }));
  assert.equal(again, null);
  assert.equal(read, 0, 'a re-fire must not --ack notes the model is never shown');
});

test('Stop with nothing owed is silent and leaves no marker', async () => {
  const home = tmp();
  const file = mirror(home, [line('astra', 'taxonomy', 'astra-x-1', 'FYI', 'unrelated')]);
  const out = await runHookEvent(stubCtx({ event: 'Stop', home, inbox: async () => resultOf([], 'taxonomy', [file]) }));
  assert.equal(out, null);
  assert.equal(fs.existsSync(listeningPath(home, 'taxonomy')), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// The listening marker (D5's half of the contract)
// ─────────────────────────────────────────────────────────────────────────────

test('a marker is believed while it is fresh and its process is alive', () => {
  const home = tmp();
  writeListening(home, 'astra', { pid: process.pid, host: os.hostname(), until: NOW + HOUR, slug: 'astra', asks: [] });
  assert.ok(isListening(home, 'astra', { now: NOW }));
  assert.equal(isListening(home, 'astra', { now: NOW + 2 * HOUR }), null, 'expired');
});

test('a marker from a DEAD process on this host is ignored, not obeyed forever', () => {
  const home = tmp();
  writeListening(home, 'astra', { pid: 999999, host: os.hostname(), until: NOW + HOUR, slug: 'astra', asks: [] });
  assert.equal(isListening(home, 'astra', { now: NOW, alive: () => false }), null);
  // …but a marker written on ANOTHER machine is trusted until it expires: its pids mean nothing here.
  writeListening(home, 'nucleus', { pid: 999999, host: 'some-other-box', until: NOW + HOUR, slug: 'nucleus', asks: [] });
  assert.ok(isListening(home, 'nucleus', { now: NOW, host: os.hostname(), alive: () => false }));
});

test('removeListening is safe to call twice and readListening survives garbage', () => {
  const home = tmp();
  writeListening(home, 'astra', { until: NOW + HOUR });
  assert.equal(removeListening(home, 'astra'), true);
  assert.equal(readListening(home, 'astra'), null);
  fs.mkdirSync(path.dirname(listeningPath(home, 'astra')), { recursive: true });
  fs.writeFileSync(listeningPath(home, 'astra'), 'not json', 'utf8');
  assert.equal(readListening(home, 'astra'), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// The Codex adapter
// ─────────────────────────────────────────────────────────────────────────────

test('D3: the Codex slug is $NOTE_SLUG, then the binding — never a title', () => {
  const home = tmp();
  assert.deepEqual(codexSlug({ NOTE_SLUG: 'astra' }, home), { slug: 'astra', source: '$NOTE_SLUG' });
  assert.equal(codexSlug({}, home), null);
  assert.equal(codexSlug({ ORCA_TERMINAL_HANDLE: 'term_bbb' }, home), null, 'a handle with no binding is not an identity');

  fs.mkdirSync(path.join(home, '.agents/notes'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents/notes/panes.json'), JSON.stringify({ term_bbb: { slug: 'astra', at: NOW } }), 'utf8');
  assert.equal(codexSlug({ ORCA_TERMINAL_HANDLE: 'term_bbb' }, home).slug, 'astra');
  assert.equal(codexSlug({ NOTE_SLUG: 'nucleus', ORCA_TERMINAL_HANDLE: 'term_bbb' }, home).slug, 'nucleus');
});

test('D3: a session with no identity is silent, and never reads anybody\'s inbox', async () => {
  const home = tmp();
  let called = 0;
  const out = await runCodexHook(
    { hook_event_name: 'UserPromptSubmit', cwd: '/repo' },
    { home, env: {}, inbox: async () => { called += 1; return resultOf([]); } },
  );
  assert.equal(out, null);
  assert.equal(called, 0);
});

test('D3: the adapter passes --me so every turn re-states who this pane is', async () => {
  const home = tmp();
  const seen = [];
  const notes = resultOf([line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1')], 'astra');
  const out = await runCodexHook(
    { hook_event_name: 'UserPromptSubmit', cwd: '/repo' },
    { home, env: { NOTE_SLUG: 'astra' }, inbox: async (argv) => { seen.push(argv); return notes; } },
  );
  assert.deepEqual(seen, [['--me', 'astra', '--ack']]);
  assert.match(out.hookSpecificOutput.additionalContext, /\[taxonomy-pr1-1\]/);
  assert.match(out.systemMessage, /^📨 taxonomy → astra ASK/);
});

test('D3: Stop maps to the same block contract Claude gets', async () => {
  const home = tmp();
  const notes = resultOf([line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1')], 'astra');
  const out = await runCodexHook(
    { hook_event_name: 'Stop', cwd: '/repo', stop_hook_active: false },
    { home, env: { NOTE_SLUG: 'astra' }, inbox: async () => notes },
  );
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /Handle these before you stop/);
});

test('D3: an unknown event is silence, not a crash', async () => {
  const home = tmp();
  const out = await runCodexHook(
    { hook_event_name: 'SomethingNew', cwd: '/repo' },
    { home, env: { NOTE_SLUG: 'astra' }, inbox: async () => resultOf([]) },
  );
  assert.equal(out, null);
});
