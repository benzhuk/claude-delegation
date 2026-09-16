// node --test "hooks/*.test.mjs"
// The shared hook core: what a note looks like when it lands, and why no event ever waits for a peer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { toPosix } from '../skills/multi/scripts/transport.mjs';
import {
  summarise, humanLine, humanSummary, contextOutput, blockOutput, runHookEvent,
  STOP_TIMEOUT_S, STOP_REASON, MID_TURN_NOTE, writeJson,
} from './multi-hook-core.mjs';
import { codexSlug, runCodexHook } from './multi-codex-hook.mjs';

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'hook-core-'))); }

const NOW = Date.UTC(2026, 8, 14, 20, 10); // 16:10 NYC

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
// No parking (the 2026-09-16 ruling)
// ─────────────────────────────────────────────────────────────────────────────

/** An ASK of ours that nobody has answered — under 0.4.0 this alone parked the turn for 15 minutes. */
const ASK = line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1', ' Needs: review by 17:00');

test('Stop never waits, however much this session is owed', async () => {
  const home = tmp();
  const file = mirror(home, [ASK]);
  let reads = 0;
  const started = Date.now();
  const out = await runHookEvent(stubCtx({
    event: 'Stop',
    home,
    inbox: async () => { reads += 1; return resultOf([], 'taxonomy', [file]); },
  }));

  assert.equal(out, null, 'nothing is waiting for us, so there is nothing to say');
  assert.equal(reads, 1, 'one read, not a poll');
  assert.ok(Date.now() - started < 1_000, 'and it came back at once');
  assert.deepEqual(
    fs.readdirSync(path.join(home, '.agents/notes')).filter((n) => n.startsWith('.listening-')), [],
    'and left no marker: nothing tells the flusher to stand aside any more',
  );
});

test('the Stop timeout is a minute, and hooks.json says the same', () => {
  assert.equal(STOP_TIMEOUT_S, 60);
  // The constant and the config must never drift: 0.4.0's 1020 s outlived the poll it was sized for.
  const json = JSON.parse(fs.readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));
  assert.equal(json.hooks.Stop[0].hooks[0].timeout, STOP_TIMEOUT_S);
});

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

const stubCtx = (over = {}) => ({
  home: over.home ?? tmp(), env: {}, now: NOW, input: {}, cwd: '/repo', ...over,
});

test('UserPromptSubmit with notes returns additionalContext, with nothing returns silence', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const seen = [];
  const res = await runHookEvent(stubCtx({
    event: 'UserPromptSubmit', inbox: async (argv) => { seen.push(argv); return notes; },
  }));
  assert.equal(res.output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(res.output.suppressOutput, true);
  // MAJOR 3: the READ does not ack. The ids come back so the adapter can ack them after it has printed.
  assert.deepEqual(seen, [[]], 'no --ack in the read');
  assert.deepEqual(res.ackIds, ['astra-pr1-1']);
  assert.equal(await runHookEvent(stubCtx({ event: 'UserPromptSubmit', inbox: async () => resultOf([]) })), null);
});

test('PostToolUse says the note arrived mid-turn', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const res = await runHookEvent(stubCtx({ event: 'PostToolUse', inbox: async () => notes }));
  assert.equal(res.output.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(res.output.hookSpecificOutput.additionalContext, new RegExp(MID_TURN_NOTE.slice(0, 40)));
});

test('SessionStart delivers whatever is pending, as context', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const res = await runHookEvent(stubCtx({ event: 'SessionStart', inbox: async () => notes }));
  assert.equal(res.output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(res.output.systemMessage, /^📨/);
});

test('Stop with notes blocks; a re-fire never reads and never blocks', async () => {
  const notes = resultOf([line('astra', 'taxonomy', 'astra-pr1-1', 'ASK', 'Review PR 1')]);
  const res = await runHookEvent(stubCtx({ event: 'Stop', inbox: async () => notes }));
  assert.equal(res.output.decision, 'block');
  assert.deepEqual(res.ackIds, ['astra-pr1-1']);

  let read = 0;
  const again = await runHookEvent(stubCtx({
    event: 'Stop', input: { stop_hook_active: true }, inbox: async () => { read += 1; return notes; },
  }));
  assert.equal(again, null);
  assert.equal(read, 0, 'a re-fire must not --ack notes the model is never shown');
});

test('Stop with nothing waiting is silent', async () => {
  const home = tmp();
  const file = mirror(home, [line('astra', 'taxonomy', 'astra-x-1', 'FYI', 'unrelated')]);
  const out = await runHookEvent(stubCtx({ event: 'Stop', home, inbox: async () => resultOf([], 'taxonomy', [file]) }));
  assert.equal(out, null);
});

test('MINOR 6: a control character in a body never reaches the line Ben sees', () => {
  const esc = String.fromCharCode(27);
  const note = noteOf(line('astra', 'taxonomy', 'astra-x-1', 'FYI', `hi${esc}[2J there`));
  const out = humanLine(note);
  assert.ok(!out.includes(esc), 'an ANSI escape would garble the terminal it is printed into');
  assert.match(out, /hi \[2J there/, 'the escape becomes a space; the harmless text stays readable');
});

test('MAJOR 4: writeJson resolves only once the stream has taken it', async () => {
  const chunks = [];
  let released = null;
  const stream = { write: (text, cb) => { chunks.push(text); released = cb; return false; } };
  let done = false;
  const p = writeJson({ a: 1 }, stream).then(() => { done = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(done, false, 'a pending pipe write must not be reported as written');
  released();
  await p;
  assert.equal(done, true);
  assert.equal(chunks[0], `{"a":1}\n`);
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
  assert.deepEqual(seen, [['--me', 'astra']], 'no --ack in the read (MAJOR 3)');
  assert.match(out.output.hookSpecificOutput.additionalContext, /\[taxonomy-pr1-1\]/);
  assert.match(out.output.systemMessage, /^📨 taxonomy → astra ASK/);
  // …and the ack the adapter runs afterwards names exactly what was printed.
  await out.ack(out.ackIds);
  assert.deepEqual(seen[1], ['--me', 'astra', '--ack-ids', 'taxonomy-pr1-1']);
});

test('D3: Stop maps to the same block contract Claude gets', async () => {
  const home = tmp();
  const notes = resultOf([line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1')], 'astra');
  const out = await runCodexHook(
    { hook_event_name: 'Stop', cwd: '/repo', stop_hook_active: false },
    { home, env: { NOTE_SLUG: 'astra' }, inbox: async () => notes },
  );
  assert.equal(out.output.decision, 'block');
  assert.match(out.output.reason, /Handle these before you stop/);
});

test('MINOR 5: an unparseable payload is silence — never a read, an ack, or a mislabelled output', async () => {
  const home = tmp();
  let called = 0;
  const out = await runCodexHook({}, { home, env: { NOTE_SLUG: 'astra' }, inbox: async () => { called += 1; return resultOf([]); } });
  assert.equal(out, null);
  assert.equal(called, 0, 'a PermissionRequest we failed to parse must not be read as a prompt');
});

test('MINOR 8: PostToolUse skips the repo scan, so the hot path never runs git', async () => {
  const home = tmp();
  const seen = [];
  const notes = resultOf([line('taxonomy', 'astra', 'taxonomy-pr1-1', 'ASK', 'Review PR 1')], 'astra');
  await runCodexHook(
    { hook_event_name: 'PostToolUse', cwd: '/repo' },
    { home, env: { NOTE_SLUG: 'astra' }, inbox: async (argv) => { seen.push(argv); return notes; } },
  );
  assert.deepEqual(seen, [['--me', 'astra', '--no-repo']]);
});

test('D3: an unknown event is silence, not a crash', async () => {
  const home = tmp();
  const out = await runCodexHook(
    { hook_event_name: 'SomethingNew', cwd: '/repo' },
    { home, env: { NOTE_SLUG: 'astra' }, inbox: async () => resultOf([]) },
  );
  assert.equal(out, null);
});
