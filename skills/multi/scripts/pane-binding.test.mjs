// node --test "skills/multi/scripts/*.test.mjs"
// Durable pane↔slug bindings (spec 2026-09-14, D1–D6). Temp homes and a mocked orca runner, exactly as
// the note-flush suite does it: no real pane is touched and nothing is ever typed anywhere.
//
// The incident these cover: a Codex pane restarted, Codex retitled it from `astra` to `Continue`, and
// `note-flush` spent 35 minutes logging `no pane titled "astra"` at a pane that was reading astra's
// inbox the whole time. The pane knows who it is; nothing used to remember what it said.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NoteError } from './envelope.mjs';
import {
  toPosix, bindingsPath, readBindings, writeBinding, pruneBindings, maybeBindPane,
  resolvePane, resolvePaneWithSource, resolveSlug, flushLogPath, paneSlugCachePath,
  writeOutboxEntry, BINDING_GC_MS, BINDING_SOURCES, cursorPath, readCursor,
} from './transport.mjs';
import { runNoteInbox, formatInbox } from './note-inbox.mjs';
import { runNoteFlush } from './note-flush.mjs';
import { runNoteNotify } from './note-notify.mjs';

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'pane-binding-'))); }

/** Typing is opt-in since 0.5.0 (spec 2026-09-17, D3) — see the same constant in note-flush.test.mjs. */
const TYPING = { MULTI_ALLOW_TYPING: '1' };

const NOW = Date.UTC(2026, 8, 14, 20, 10);
const HOUR = 3_600_000;
const ENVELOPE = 'taxonomy → astra, 9.14.26 16:10 NYC [taxonomy-main-tip-8] ASK: Pick up the tip. Needs: review by 17:00';

const claudePane = (over = {}) => ({
  handle: 'term_aaa', title: 'taxonomy', connected: true, writable: true, orphaned: false,
  agentIdentity: 'claude', agentWait: null, lastOutputAt: NOW - 1000,
  preview: '⏵⏵ bypass permissions on (shift+tab to cycle)', worktreePath: '/repo',
  executionHostId: 'local', ...over,
});
const readOf = (lines, status = 'running') => ({ handle: 'term_aaa', status, tail: lines });

function mockOrca(cfg = {}) {
  const calls = [];
  const reads = cfg.reads ? [...cfg.reads] : null;
  const run = async (args) => {
    calls.push(args);
    const verb = args[1];
    if (verb === 'list') return { terminals: cfg.panes ?? [] };
    if (verb === 'show') {
      if (!args.includes('--terminal')) throw new NoteError(4, 'orca terminal show failed: no_active_terminal');
      return { terminal: (cfg.panes ?? [])[0] };
    }
    if (verb === 'read') return { terminal: reads && reads.length ? reads.shift() : readOf(['? for shortcuts']) };
    if (verb === 'send') return { ok: true };
    throw new Error(`unexpected orca call ${args.join(' ')}`);
  };
  run.calls = calls;
  run.sends = () => calls.filter((c) => c[1] === 'send');
  return run;
}

/** `assert.throws` returns nothing; every assertion here wants the error itself. */
function caught(fn) {
  try { fn(); } catch (err) { return err; }
  assert.fail('expected a throw, got a return');
  return null;
}

/** The reads one clean two-phase delivery consumes: classify, baseline, post-text, re-classify. */
const DELIVERY_READS = (id) => [
  readOf(['? for shortcuts']),
  readOf(['? for shortcuts']),
  readOf([`❯ … [${id}] ASK: x`]),
  readOf([`❯ … [${id}] ASK: x`]),
];

// ─────────────────────────────────────────────────────────────────────────────
// D1 — the file
// ─────────────────────────────────────────────────────────────────────────────

test('D1: a binding round-trips through panes.json, keyed by handle, posix path', () => {
  const home = tmp();
  const res = writeBinding(home, 'term_bbb', 'astra', { now: NOW, title: 'Continue | bto-workflows' });
  assert.equal(res.error, null);
  assert.equal(res.rebound, false);
  assert.equal(res.previous, null);
  assert.equal(toPosix(res.file), bindingsPath(home));
  assert.equal(bindingsPath(home), `${home}/.agents/notes/panes.json`);
  assert.deepEqual(readBindings(home), {
    term_bbb: { slug: 'astra', at: NOW, title: 'Continue | bto-workflows' },
  });
});

test('D1: the write is atomic — no .tmp file survives it', () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'astra', { now: NOW });
  const left = fs.readdirSync(path.dirname(bindingsPath(home))).filter((n) => n.includes('.tmp'));
  assert.deepEqual(left, [], 'a tmp file left behind is a half-written binding waiting to be read');
});

test('a corrupt or hostile panes.json reads as empty, never as a throw — a hook must not die on it', () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(bindingsPath(home)), { recursive: true });
  fs.writeFileSync(bindingsPath(home), '{ this is not json', 'utf8');
  assert.deepEqual(readBindings(home), {});
  fs.writeFileSync(bindingsPath(home), '["astra"]', 'utf8');
  assert.deepEqual(readBindings(home), {}, 'an array is not a binding map');
});

test('malformed records are dropped one by one, the good ones survive', () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(bindingsPath(home)), { recursive: true });
  fs.writeFileSync(bindingsPath(home), JSON.stringify({
    term_good: { slug: 'astra', at: NOW },
    'not-a-handle': { slug: 'astra', at: NOW },
    term_upper: { slug: 'NotASlug', at: NOW },
    term_null: null,
    term_noat: { slug: 'nucleus' },
  }), 'utf8');
  assert.deepEqual(readBindings(home), {
    term_good: { slug: 'astra', at: NOW },
    term_noat: { slug: 'nucleus', at: 0 },
  });
});

test('writeBinding refuses a non-handle or an illegal slug, and says so instead of throwing', () => {
  const home = tmp();
  assert.match(writeBinding(home, 'astra', 'astra', { now: NOW }).error, /not a pane handle/);
  assert.match(writeBinding(home, 'term_bbb', 'Astra Prime', { now: NOW }).error, /not a legal slug/);
  assert.deepEqual(readBindings(home), {}, 'nothing is written on a refusal');
});

// ─────────────────────────────────────────────────────────────────────────────
// D2 — registration and rebinding
// ─────────────────────────────────────────────────────────────────────────────

test('D2: the pane is the authority — a new slug for a bound handle WINS and is logged as a rebind', () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'n-astra', { now: NOW - HOUR });
  const res = writeBinding(home, 'term_bbb', 'astra', { now: NOW });
  assert.equal(res.rebound, true);
  assert.equal(res.previous, 'n-astra');
  assert.equal(readBindings(home).term_bbb.slug, 'astra');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /rebind term_bbb n-astra -> astra/);
});

test('re-registering the SAME slug is not a rebind and writes no log line', () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - HOUR });
  const res = writeBinding(home, 'term_bbb', 'astra', { now: NOW });
  assert.equal(res.rebound, false);
  assert.equal(readBindings(home).term_bbb.at, NOW, 'the refresh still moves `at`, which is what the GC reads');
  assert.equal(fs.existsSync(flushLogPath(home)), false);
});

test('D2: only a pane naming ITSELF binds — a title-derived slug never does', () => {
  const home = tmp();
  const env = { ORCA_TERMINAL_HANDLE: 'term_bbb' };
  assert.equal(maybeBindPane({ home, env, slug: 'continue', source: '$ORCA_TERMINAL_HANDLE', now: NOW }), null);
  assert.equal(maybeBindPane({ home, env, slug: 'continue', source: '$ORCA_TERMINAL_HANDLE (cached)', now: NOW }), null);
  assert.deepEqual(readBindings(home), {}, 'a guess must never overwrite a statement (D4)');
  assert.ok(maybeBindPane({ home, env, slug: 'astra', source: '--me', now: NOW }));
  assert.equal(readBindings(home).term_bbb.slug, 'astra');
  assert.deepEqual([...BINDING_SOURCES].sort(), ['$NOTE_SLUG', '--me', 'binding']);
});

test('no handle in the environment means nothing to bind, and that is not an error', () => {
  const home = tmp();
  assert.equal(maybeBindPane({ home, env: {}, slug: 'astra', source: '--me', now: NOW }), null);
  assert.equal(maybeBindPane({ home, env: { ORCA_TERMINAL_HANDLE: 'nonsense' }, slug: 'astra', source: '--me', now: NOW }), null);
  assert.equal(fs.existsSync(bindingsPath(home)), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// D3 — resolution order
// ─────────────────────────────────────────────────────────────────────────────

const PANES = [
  claudePane({ handle: 'term_aaa', title: 'taxonomy' }),
  claudePane({ handle: 'term_bbb', title: 'Continue | bto-workflows', agentIdentity: 'codex' }),
];
const BOUND = { term_bbb: { slug: 'astra', at: NOW } };

test('D3: the incident — a pane whose title is not its slug resolves through its binding', () => {
  const { pane, via } = resolvePaneWithSource(PANES, 'astra', { bindings: BOUND });
  assert.equal(pane.handle, 'term_bbb');
  assert.equal(via, 'binding');
  assert.equal(resolvePane(PANES, 'astra', { bindings: BOUND }), pane, 'the wrapper returns the pane itself');
});

test('D3: a handle beats everything, a title beats a binding', () => {
  assert.equal(resolvePaneWithSource(PANES, 'term_bbb', { bindings: BOUND }).via, 'handle');
  assert.equal(resolvePaneWithSource(PANES, 'taxonomy', { bindings: BOUND }).via, 'title');

  // A pane renamed to `nucleus` and bound to nothing: the rename is the newest intent, title wins.
  const renamed = [claudePane({ handle: 'term_ccc', title: 'nucleus' })];
  assert.equal(resolvePaneWithSource(renamed, 'nucleus', { bindings: BOUND }).via, 'title');
});

test('MAJOR 1: a title NEVER wins for a pane that has said it is somebody else', () => {
  // The real astra, retitled by a restart and bound to astra; and an unrelated pane whose conversation
  // title happens to reduce to `astra` while it has bound itself to nucleus. Before the fix the title
  // pass returned term_other and astra's note was typed into nucleus's live session.
  const panes = [
    claudePane({ handle: 'term_astra', title: 'Continue | bto-workflows', agentIdentity: 'codex' }),
    claudePane({ handle: 'term_other', title: 'astra', agentIdentity: 'codex' }),
  ];
  const bindings = {
    term_astra: { slug: 'astra', at: NOW },
    term_other: { slug: 'nucleus', at: NOW },
  };
  const r = resolvePaneWithSource(panes, 'astra', { bindings });
  assert.equal(r.pane.handle, 'term_astra');
  assert.equal(r.via, 'binding');
  // And nucleus is still reachable as itself, by its own binding.
  assert.equal(resolvePaneWithSource(panes, 'nucleus', { bindings }).pane.handle, 'term_other');
});

test('MAJOR 1: an UNBOUND pane still matches on its title, even against a binding elsewhere', () => {
  const panes = [
    claudePane({ handle: 'term_bound', title: 'Continue' }),
    claudePane({ handle: 'term_titled', title: 'astra' }),
  ];
  const bindings = { term_bound: { slug: 'astra', at: NOW } };
  const r = resolvePaneWithSource(panes, 'astra', { bindings });
  assert.equal(r.pane.handle, 'term_titled', 'a rename is deliberate; an unbound title is not a contradiction');
  assert.equal(r.via, 'title');
});

test('D3: when title and binding agree, nothing changes — still `title`', () => {
  const bindings = { term_aaa: { slug: 'taxonomy', at: NOW } };
  const r = resolvePaneWithSource(PANES, 'taxonomy', { bindings });
  assert.equal(r.pane.handle, 'term_aaa');
  assert.equal(r.via, 'title');
});

test('D3/H9: two LIVE panes bound to one slug is exit 2 with the candidates, never a guess', () => {
  const panes = [
    claudePane({ handle: 'term_aaa', title: 'Continue' }),
    claudePane({ handle: 'term_bbb', title: 'switch-to-astra-model' }),
  ];
  const bindings = { term_aaa: { slug: 'astra', at: NOW }, term_bbb: { slug: 'astra', at: NOW } };
  const err = caught(() => resolvePane(panes, 'astra', { bindings }));
  assert.ok(err instanceof NoteError);
  assert.equal(err.exitCode, 2);
  assert.match(err.message, /bound to 2 live panes/);
  assert.match(err.message, /term_aaa/);
  assert.match(err.message, /term_bbb/);
});

test('D3: two identical TITLES still report as today — the binding pass never sees them', () => {
  const panes = [claudePane({ handle: 'term_aaa' }), claudePane({ handle: 'term_bbb' })];
  const err = caught(() => resolvePane(panes, 'taxonomy', { bindings: {} }));
  assert.match(err.message, /matches 2 panes/);
});

test('D3: a binding for a DEAD handle is skipped, and the failure names the fix', () => {
  const bindings = { term_gone: { slug: 'astra', at: NOW } };
  const err = caught(() => resolvePane([claudePane()], 'astra', { bindings }));
  assert.ok(err instanceof NoteError);
  assert.equal(err.exitCode, 2);
  assert.match(err.message, /no pane titled "astra" and no bound pane/);
  assert.match(err.message, /note-inbox --bind astra/);
  assert.match(err.message, /term_aaa/, 'the pane list is still printed');
});

test('D3: no bindings at all behaves exactly as before', () => {
  assert.equal(resolvePane(PANES, 'taxonomy').handle, 'term_aaa');
  assert.throws(() => resolvePane(PANES, 'astra'), (e) => e.exitCode === 2 && /no pane titled "astra"/.test(e.message));
  assert.throws(() => resolvePane(PANES, 'term_zzz'), (e) => e.exitCode === 2 && /no pane with handle/.test(e.message));
});

// ─────────────────────────────────────────────────────────────────────────────
// D4/D5 — "which pane am I"
// ─────────────────────────────────────────────────────────────────────────────

test('D5: with no --me, the binding answers before the title — and without asking orca', async () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - HOUR });
  const orca = mockOrca({ panes: [claudePane({ handle: 'term_bbb', title: 'Continue' })] });
  const r = await resolveSlug({ env: { ORCA_TERMINAL_HANDLE: 'term_bbb' }, home, orca, now: NOW });
  assert.equal(r.slug, 'astra');
  assert.equal(r.source, 'binding', 'note-notify logs slug=astra(binding) from this');
  assert.equal(orca.calls.length, 0, 'a binding is free; a title costs a terminal show');
});

test('D4: --me and $NOTE_SLUG still outrank the binding', async () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'astra', { now: NOW });
  const env = { ORCA_TERMINAL_HANDLE: 'term_bbb' };
  assert.equal((await resolveSlug({ explicit: 'nucleus', env, home, now: NOW })).slug, 'nucleus');
  assert.equal((await resolveSlug({ env: { ...env, NOTE_SLUG: 'nucleus' }, home, now: NOW })).slug, 'nucleus');
});

test('D4: the cached TITLE must not beat a binding, however fresh the cache is', async () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(paneSlugCachePath(home)), { recursive: true });
  fs.writeFileSync(paneSlugCachePath(home), JSON.stringify({ term_bbb: { slug: 'continue', at: NOW } }), 'utf8');
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - 10 * HOUR });
  const r = await resolveSlug({ env: { ORCA_TERMINAL_HANDLE: 'term_bbb' }, home, now: NOW });
  assert.equal(r.slug, 'astra');
});

test('an unbound handle still falls through to the live title, and caches it', async () => {
  const home = tmp();
  const orca = mockOrca({ panes: [claudePane({ handle: 'term_aaa', title: '◑ taxonomy' })] });
  const r = await resolveSlug({ env: { ORCA_TERMINAL_HANDLE: 'term_aaa' }, home, orca, now: NOW });
  assert.equal(r.slug, 'taxonomy');
  assert.equal(r.source, '$ORCA_TERMINAL_HANDLE');
  assert.deepEqual(readBindings(home), {}, 'a title is cached, never bound');
});

// ─────────────────────────────────────────────────────────────────────────────
// note-inbox
// ─────────────────────────────────────────────────────────────────────────────

const inboxDeps = (home, env) => ({ home, now: NOW, env, git: () => '.git', cwd: home });

test('D2: `note-inbox --me astra` binds the pane as a side effect of reading', async () => {
  const home = tmp();
  const res = await runNoteInbox(['--me', 'astra'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(res.slug, 'astra');
  assert.equal(res.binding.rebound, false);
  assert.equal(readBindings(home).term_bbb.slug, 'astra');
  assert.equal(readBindings(home).term_bbb.at, NOW);
});

test('D2: an inbox read in a pane bound to something else REBINDS it, and says so in flush.log', async () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'n-astra', { now: NOW - 3 * HOUR });
  const res = await runNoteInbox(['--me', 'astra'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(res.binding.rebound, true);
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /rebind term_bbb n-astra -> astra/);
});

test('an inbox read outside a pane binds nothing and reports nothing', async () => {
  const home = tmp();
  const res = await runNoteInbox(['--me', 'astra'], inboxDeps(home, {}));
  assert.equal(res.binding, null);
  assert.deepEqual(res.problems, []);
  assert.equal(fs.existsSync(bindingsPath(home)), false);
});

test('D2: `--bind` registers and stops — no ledger scan, no cursor, and it prints the binding', async () => {
  const home = tmp();
  const res = await runNoteInbox(['--bind', 'astra', '--title', 'Continue | bto-workflows'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(res.mode, 'bind');
  assert.equal(res.exitCode, 0);
  assert.deepEqual(res.scanned, []);
  assert.equal(res.cursor, null);
  assert.deepEqual(readBindings(home), { term_bbb: { slug: 'astra', at: NOW, title: 'Continue | bto-workflows' } });
  assert.equal(formatInbox(res), `bound term_bbb → astra in ${bindingsPath(home)}`);
});

test('`--bind` over a different slug reports what it replaced', async () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'n-astra', { now: NOW - HOUR });
  const res = await runNoteInbox(['--bind', 'astra'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.match(formatInbox(res), /bound term_bbb → astra in .*panes\.json \(was n-astra\)/);
});

test('`--bind` outside an Orca pane fails loud — a binding with no handle is meaningless', async () => {
  const home = tmp();
  await assert.rejects(
    () => runNoteInbox(['--bind', 'astra'], inboxDeps(home, {})),
    (e) => e instanceof NoteError && e.exitCode === 2 && /ORCA_TERMINAL_HANDLE is not set/.test(e.message),
  );
});

test('`--bind` validates the slug like every other slug in the protocol', async () => {
  const home = tmp();
  await assert.rejects(
    () => runNoteInbox(['--bind', 'Astra Prime'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' })),
    (e) => e instanceof NoteError && e.exitCode === 1,
  );
});

test('BLOCKER 1: --no-bind reads the inbox and records NOTHING — a guess must not become a statement', async () => {
  const home = tmp();
  const res = await runNoteInbox(['--me', 'astra', '--no-bind', '--no-repo'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(res.slug, 'astra');
  assert.equal(res.binding, null);
  assert.deepEqual(readBindings(home), {});
  assert.equal(fs.existsSync(bindingsPath(home)), false);
});

test('BLOCKER 1: --no-bind does not disturb a binding that is already there', async () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - HOUR });
  await runNoteInbox(['--me', 'nucleus', '--no-bind', '--no-repo'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(readBindings(home).term_bbb.slug, 'astra', 'a guessed slug neither writes nor rebinds');
  assert.equal(readBindings(home).term_bbb.at, NOW - HOUR);
});

test('MINOR 6: --unbind removes THIS pane entry and says what it removed', async () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - HOUR });
  writeBinding(home, 'term_ccc', 'nucleus', { now: NOW - HOUR });
  const res = await runNoteInbox(['--unbind'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(res.mode, 'unbind');
  assert.equal(res.slug, 'astra');
  assert.deepEqual(Object.keys(readBindings(home)), ['term_ccc'], 'only this pane loses its binding');
  assert.match(formatInbox(res), /unbound term_bbb \(was astra\) in .*panes\.json/);
});

test('MINOR 6: --unbind in an unbound pane is a no-op that says so, not an error', async () => {
  const home = tmp();
  const res = await runNoteInbox(['--unbind'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(res.ok, true);
  assert.equal(res.slug, null);
  assert.equal(formatInbox(res), 'term_bbb was not bound to anything');
});

test('MINOR 6: --unbind outside an Orca pane fails loud, like --bind', async () => {
  const home = tmp();
  await assert.rejects(
    () => runNoteInbox(['--unbind'], inboxDeps(home, {})),
    (e) => e instanceof NoteError && e.exitCode === 2 && /ORCA_TERMINAL_HANDLE is not set/.test(e.message),
  );
});

test('MINOR 5: a --me read keeps a title an earlier --bind recorded', async () => {
  const home = tmp();
  await runNoteInbox(['--bind', 'astra', '--title', 'Continue | bto-workflows'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  await runNoteInbox(['--me', 'astra', '--no-repo'], inboxDeps(home, { ORCA_TERMINAL_HANDLE: 'term_bbb' }));
  assert.equal(readBindings(home).term_bbb.title, 'Continue | bto-workflows');
});

// ─────────────────────────────────────────────────────────────────────────────
// note-notify
// ─────────────────────────────────────────────────────────────────────────────

test('BLOCKER 3: note-notify NEVER binds — its --to is one line for the whole machine', async () => {
  const home = tmp();
  // `notify = [... , "--to", "astra"]` lives in ~/.codex/config.toml, so EVERY Codex pane on the box
  // spawns this with the same slug. Binding whatever handle survived into the child would record some
  // other pane as astra, and `--to astra` would then wake the wrong live session.
  const res = await runNoteNotify(['--to', 'astra', '--no-chain'], {
    home, now: NOW, env: { ...TYPING, ORCA_TERMINAL_HANDLE: 'term_bbb' }, orca: mockOrca(), flush: async () => ({ drained: 0, attempted: 0, remaining: 0, results: [] }),
  });
  assert.equal(res.slug, 'astra', 'it still knows which inbox to drain');
  assert.deepEqual(readBindings(home), {});
  assert.equal(fs.existsSync(bindingsPath(home)), false);
});

test('D4: a notify that resolved itself from the binding logs slug=<slug>(binding)', async () => {
  const home = tmp();
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - HOUR });
  const res = await runNoteNotify(['--no-chain'], {
    home, now: NOW, env: { ...TYPING, ORCA_TERMINAL_HANDLE: 'term_bbb' }, orca: mockOrca(), flush: async () => ({ drained: 0, attempted: 0, remaining: 0, results: [] }),
  });
  assert.equal(res.slugSource, 'binding');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /notify event=none slug=astra\(binding\)/);
});

// ─────────────────────────────────────────────────────────────────────────────
// note-flush — delivery through a binding, and the GC
// ─────────────────────────────────────────────────────────────────────────────

function queue(home, over = {}) {
  return writeOutboxEntry(home, {
    id: 'taxonomy-main-tip-8', from: 'taxonomy', to: 'astra', toSlug: 'astra', handle: null,
    agentIdentity: null, envelope: ENVELOPE, classification: 'permission',
    ledgers: ['/repo/docs/ledger/2026-09-14.md'], packetPath: null,
    createdAt: new Date(NOW - 60_000).toISOString(), ...over,
  });
}

test('D3 end to end: the wake-up that logged `no pane titled "astra"` for 35 minutes now lands', async () => {
  const home = tmp();
  queue(home);
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - HOUR });
  const pane = claudePane({ handle: 'term_bbb', title: 'Continue | bto-workflows' });
  const orca = mockOrca({ panes: [pane], reads: DELIVERY_READS('taxonomy-main-tip-8') });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 1);
  assert.equal(res.results[0].outcome, 'delivered');
  const log = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.match(log, /typed into term_bbb \(binding, title "Continue \| bto-workflows", agent-idle\)/);
});

test('with no binding the same drain reports no-pane and keeps the entry', async () => {
  const home = tmp();
  queue(home);
  const orca = mockOrca({ panes: [claudePane({ handle: 'term_bbb', title: 'Continue | bto-workflows' })] });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 0);
  assert.equal(res.results[0].outcome, 'no-pane');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /no-pane \[taxonomy-main-tip-8\] -> astra/);
});

test('the restart case end to end: dead handle, new pane, title changed — the binding still lands it', async () => {
  const home = tmp();
  // Exactly the Netcup shape: the entry was queued against the OLD astra pane, Ben restarted it, and
  // the new pane carries a conversation title. Neither the handle nor the title can resolve this.
  queue(home, { handle: 'term_old' });
  writeBinding(home, 'term_new', 'astra', { now: NOW - HOUR });
  const orca = mockOrca({
    panes: [claudePane({ handle: 'term_new', title: 'switch-to-astra-model' })],
    reads: DELIVERY_READS('taxonomy-main-tip-8'),
  });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.drained, 1);
  assert.match(res.results[0].detail, /handle gone, resolved by slug; typed into term_new \(binding, title "switch-to-astra-model", agent-idle\)/);
});

/** The machine-wide mirror every sender appends to — what a cold-start read scans. */
function mirror(home, ymd, lines) {
  const file = path.join(home, '.agents/notes', `${ymd}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [`# Peer-note ledger ${ymd}`, '', ...lines, ''].join('\n'), 'utf8');
  return toPosix(file);
}

test('BLOCKER 2: a note the cold-start window SUPPRESSED is not "already read" — the wake-up still lands', async () => {
  const home = tmp();
  // A peer that was down for over 12 hours. The ask is 13 h old, so astra's first inbox read marks it
  // seen WITHOUT showing it — and D9 must not read that as "the recipient has it" and bin the wake-up,
  // or the note is lost to everybody. This is exactly what the outbox 48-hour window exists for.
  const old = 'taxonomy → astra, 9.14.26 03:10 NYC [taxonomy-cold-1] ASK: Old ask. Needs: review by 17:00';
  mirror(home, '2026-09-14', [old]);
  writeOutboxEntry(home, {
    id: 'taxonomy-cold-1', from: 'taxonomy', to: 'astra', toSlug: 'astra', handle: null,
    agentIdentity: null, envelope: old, classification: 'permission', ledgers: [], packetPath: null,
    createdAt: new Date(NOW - 13 * HOUR).toISOString(),
  });

  const read = await runNoteInbox(['--me', 'astra', '--no-repo'], inboxDeps(home, {}));
  assert.equal(read.count, 0, 'never displayed');
  assert.equal(read.suppressed, 1);
  const cursor = readCursor(home, 'astra');
  assert.equal(cursor.seen['taxonomy-cold-1'], '2026-09-14');
  assert.equal(cursor.cold['taxonomy-cold-1'], '2026-09-14', 'suppressed ids stay distinguishable from shown ones');

  const orca = mockOrca({
    panes: [claudePane({ handle: 'term_aaa', title: 'astra' })],
    reads: DELIVERY_READS('taxonomy-cold-1'),
  });
  const res = await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.equal(res.results[0].outcome, 'delivered');
  assert.equal(res.drained, 1);
});

test('BLOCKER 2: a note that really WAS shown is still retired, cold or not', async () => {
  const home = tmp();
  const shown = 'taxonomy → astra, 9.14.26 16:00 NYC [taxonomy-shown-1] ASK: Recent ask. Needs: review by 17:00';
  mirror(home, '2026-09-14', [shown]);
  writeOutboxEntry(home, {
    id: 'taxonomy-shown-1', from: 'taxonomy', to: 'astra', toSlug: 'astra', handle: null,
    agentIdentity: null, envelope: shown, classification: 'permission', ledgers: [], packetPath: null,
    createdAt: new Date(NOW - 10 * 60_000).toISOString(),
  });

  // Inside the cold-start window, so it IS displayed, and --ack marks it read for real.
  const read = await runNoteInbox(['--me', 'astra', '--ack', '--no-repo'], inboxDeps(home, {}));
  assert.equal(read.count, 1);
  assert.equal(Object.keys(readCursor(home, 'astra').cold).length, 0);

  const res = await runNoteFlush([], { home, orca: mockOrca({ panes: [claudePane({ title: 'astra' })] }), now: NOW });
  assert.equal(res.results[0].outcome, 'retired');
});

test('D6: pruneBindings drops a handle gone for more than 24 h and keeps everything else', () => {
  const home = tmp();
  writeBinding(home, 'term_live', 'taxonomy', { now: NOW - 40 * HOUR });
  writeBinding(home, 'term_recent', 'nucleus', { now: NOW - 2 * HOUR });
  writeBinding(home, 'term_gone', 'astra', { now: NOW - 25 * HOUR });
  const dropped = pruneBindings(home, [claudePane({ handle: 'term_live' })], { now: NOW });
  assert.deepEqual(dropped.map((d) => d.handle), ['term_gone']);
  assert.deepEqual(Object.keys(readBindings(home)).sort(), ['term_live', 'term_recent']);
  assert.equal(BINDING_GC_MS, 24 * HOUR);
});

test('D6: note-flush runs the GC while it has the terminal list, and logs it', async () => {
  const home = tmp();
  queue(home);
  writeBinding(home, 'term_bbb', 'astra', { now: NOW - HOUR });
  writeBinding(home, 'term_gone', 'n-astra', { now: NOW - 30 * HOUR });
  const orca = mockOrca({
    panes: [claudePane({ handle: 'term_bbb', title: 'Continue' })],
    reads: DELIVERY_READS('taxonomy-main-tip-8'),
  });
  await runNoteFlush([], { home, orca, now: NOW, env: TYPING });
  assert.deepEqual(Object.keys(readBindings(home)), ['term_bbb']);
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /gc term_gone n-astra — no such pane and bound 30h ago/);
});

test('D6: --dry-run never deletes a binding', async () => {
  const home = tmp();
  queue(home);
  writeBinding(home, 'term_gone', 'astra', { now: NOW - 30 * HOUR });
  await runNoteFlush(['--dry-run'], { home, orca: mockOrca({ panes: [] }), now: NOW });
  assert.deepEqual(Object.keys(readBindings(home)), ['term_gone']);
});
