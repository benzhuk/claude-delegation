// node --test "skills/multi/scripts/*.test.mjs"
// Inbox delivery (spec 2026-09-17): the registry, the two clients, and note-flush's delivery order.
//
// Nothing here touches a real session. The Claude client is exercised against a REAL local server
// (a Unix socket on POSIX, a named pipe on Windows) so the wire format is asserted from the bytes the
// receiver actually gets, and against injected sockets for the failure paths; the Codex client runs
// against an injected `execFile`, never the real CLI.
//
// THE SECRET RULE IS TESTED HERE, not assumed: a `claude-socket` record holds
// CLAUDE_CODE_MESSAGING_TOKEN, which is key material. `noToken()` below asserts that the token appears
// in NOTHING a human or a log ever sees — flush.log, stdout, the `--json` result, every returned
// object — and it is called by every test that could leak one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  toPosix, inboxesPath, readInboxes, writeInbox, removeInbox, pruneInboxes, registerInbox,
  describeInbox, claudeInboxRecord, codexInboxRecord, sameInbox, writeOutboxEntry, readOutbox,
  flushLogPath, benInboxPath, INBOX_MODE, INBOX_GC_MS, INBOX_REFRESH_MS,
  claimOutboxEntry, releaseClaim,
} from './transport.mjs';
import {
  inboxFrames, postToClaudeInbox, deliverToSlug as postToClaude, DEFAULT_POST_TIMEOUT_MS, STALE_CODES,
} from './inbox-claude.mjs';
import {
  resolveCodexCommand, queueToCodexInbox, deliverToSlug as queueToCodex, NO_THREAD_RE, codexChildEnv,
} from './inbox-codex.mjs';
import { runNoteFlush, deliverToInbox, formatFlush, INBOX_FLOOR_MS, NOT_AN_ATTEMPT } from './note-flush.mjs';
import { runNoteSend, SEND_INBOX_BUDGET_MS } from './note-send.mjs';
import { NoteError } from './envelope.mjs';

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-'))); }

const NOW = Date.UTC(2026, 8, 17, 22, 0);
const TOKEN = 'tok3n-that-must-never-be-printed';
// N1 (2026-09-20): ACK and FYI are ledger-only outbox entries that note-flush retires unattempted (see
// note-flush.test.mjs). This suite's default fixture exercises the inbox-delivery mechanism itself,
// which is orthogonal to kind, so it uses ASK.
const ENVELOPE = 'astra → taxonomy, 9.17.26 18:00 NYC [astra-inbox-1] ASK: delivered without a keystroke. Needs: none';

const SESSION_ID = 'sess-0001-aaaa';
const HOST = os.hostname();
const claudeRecord = (over = {}) => ({
  kind: 'claude-socket', socket: '/tmp/cc-socks/4242.sock', token: TOKEN,
  sessionId: SESSION_ID, host: HOST, pid: 4242, ...over,
});
const codexRecord = (over = {}) => ({
  kind: 'codex-queue', codexHome: '/home/ben/.codex',
  threadId: '01a0b193-d533-7360-be08-b82b41f19b3d', host: HOST, ...over,
});

/** Every place a token could surface. Any hit is a leak, and a leak is the one unrecoverable bug here. */
function noToken(...values) {
  for (const v of values) {
    const text = typeof v === 'string' ? v : JSON.stringify(v ?? null);
    assert.equal(text.includes(TOKEN), false, `token leaked into: ${String(text).slice(0, 300)}`);
  }
}

function queued(home, over = {}) {
  return writeOutboxEntry(home, {
    id: 'astra-inbox-1', from: 'astra', to: 'taxonomy', toSlug: 'taxonomy', handle: 'term_aaa',
    agentIdentity: 'claude', envelope: ENVELOPE, classification: 'agent-idle',
    ledgers: ['/repo/docs/ledger/2026-09-17.md'], packetPath: null,
    createdAt: new Date(NOW - 60_000).toISOString(), ...over,
  });
}

/** A drain that must never reach for a pane: any call at all is a failure. */
function forbiddenOrca() {
  const run = async (args) => { throw new Error(`orca must not be called: ${args.join(' ')}`); };
  run.calls = [];
  return run;
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 — the registry
// ─────────────────────────────────────────────────────────────────────────────

test('D1: a registration round-trips, and the returned object carries no token', () => {
  const home = tmp();
  const res = writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  assert.equal(res.error, null);
  assert.equal(res.file, inboxesPath(home));
  assert.deepEqual(res.inbox, {
    kind: 'claude-socket', at: NOW, pid: 4242, host: HOST,
    socket: '/tmp/cc-socks/4242.sock', sessionId: SESSION_ID,
  });
  noToken(res, describeInbox(claudeRecord()));

  const back = readInboxes(home);
  assert.equal(back.taxonomy.token, TOKEN, 'the token IS kept in the file — the client needs it');
  assert.equal(back.taxonomy.socket, '/tmp/cc-socks/4242.sock');
  assert.equal(back.taxonomy.at, NOW);
});

test('D1: the file is owner-only on create AND on rewrite', () => {
  const home = tmp();
  const chmods = [];
  const spy = { ...fs, chmodSync: (p, mode) => { chmods.push(mode); return fs.chmodSync(p, mode); } };

  writeInbox(home, 'taxonomy', claudeRecord(), { fs: spy, now: NOW });
  writeInbox(home, 'astra', codexRecord(), { fs: spy, now: NOW });

  assert.deepEqual(chmods, [INBOX_MODE, INBOX_MODE], 'both the create and the rewrite force 600');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(inboxesPath(home)).mode & 0o777, 0o600);
  }
  // And the temp file never survives a successful write.
  assert.deepEqual(fs.readdirSync(path.dirname(inboxesPath(home))).filter((n) => n.includes('.tmp')), []);
});

test('D1: a malformed entry is dropped, never half-kept', () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(inboxesPath(home)), { recursive: true });
  fs.writeFileSync(inboxesPath(home), JSON.stringify({
    version: 1,
    inboxes: {
      good: claudeRecord(),
      'Not A Slug': claudeRecord(),
      tokenless: { kind: 'claude-socket', socket: '/tmp/x.sock', sessionId: SESSION_ID },
      socketless: { kind: 'claude-socket', token: TOKEN, sessionId: SESSION_ID },
      // C6: no session id, no record - a socket path alone can be re-created by a recycled pid.
      unpinned: { kind: 'claude-socket', socket: '/tmp/x.sock', token: TOKEN },
      threadless: { kind: 'codex-queue', codexHome: '/home/ben/.codex' },
      alien: { kind: 'carrier-pigeon', socket: '/tmp/x.sock', token: TOKEN },
      nothing: null,
    },
  }));
  assert.deepEqual(Object.keys(readInboxes(home)), ['good']);
});

test('D1: a corrupt registry is an empty map, never a throw — a hook that throws is a broken session', () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(inboxesPath(home)), { recursive: true });
  fs.writeFileSync(inboxesPath(home), '{ this is not json');
  assert.deepEqual(readInboxes(home), {});
  assert.deepEqual(readInboxes(tmp()), {}, 'a missing file is the same');
});

test('D1: a flat map with no version wrapper still reads (forward/backward tolerant)', () => {
  const home = tmp();
  fs.mkdirSync(path.dirname(inboxesPath(home)), { recursive: true });
  fs.writeFileSync(inboxesPath(home), JSON.stringify({ taxonomy: claudeRecord() }));
  assert.equal(readInboxes(home).taxonomy.kind, 'claude-socket');
});

test('D1: an illegal slug is refused, and the refusal never quotes the record', () => {
  const home = tmp();
  const res = writeInbox(home, 'Taxonomy', claudeRecord(), { now: NOW });
  assert.match(res.error, /not a legal slug/);
  noToken(res);
  assert.deepEqual(readInboxes(home), {});

  const bad = writeInbox(home, 'taxonomy', { kind: 'claude-socket', token: TOKEN }, { now: NOW });
  assert.match(bad.error, /not a usable inbox record \(kind: claude-socket\)/);
  noToken(bad, bad.error);
});

test('D1: removeInbox forgets one slug and leaves the others', () => {
  const home = tmp();
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  writeInbox(home, 'astra', codexRecord(), { now: NOW });
  const res = removeInbox(home, 'taxonomy');
  assert.deepEqual(res.removed, {
    kind: 'claude-socket', at: NOW, pid: 4242, host: HOST,
    socket: '/tmp/cc-socks/4242.sock', sessionId: SESSION_ID,
  });
  noToken(res);
  assert.deepEqual(Object.keys(readInboxes(home)), ['astra']);
  assert.equal(removeInbox(home, 'nobody').removed, null, 'nothing to undo is not an error');
});

test('D1: pruneInboxes drops what nobody has refreshed, and keeps what is live', () => {
  const home = tmp();
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW - INBOX_GC_MS - 1 });
  writeInbox(home, 'astra', codexRecord(), { now: NOW - 1000 });
  const dropped = pruneInboxes(home, { now: NOW });
  assert.deepEqual(dropped.map((d) => d.slug), ['taxonomy']);
  assert.deepEqual(dropped.map((d) => d.kind), ['claude-socket']);
  noToken(dropped);
  assert.deepEqual(Object.keys(readInboxes(home)), ['astra']);
});

test('D1: registerInbox is throttled while the record is unchanged, and rewrites when it moves', () => {
  const home = tmp();
  const rec = claudeRecord();
  assert.equal(registerInbox(home, 'taxonomy', rec, { now: NOW }).written, true);

  const again = registerInbox(home, 'taxonomy', rec, { now: NOW + INBOX_REFRESH_MS - 1 });
  assert.equal(again.written, false);
  assert.equal(again.reason, 'fresh');
  noToken(again);

  const later = registerInbox(home, 'taxonomy', rec, { now: NOW + INBOX_REFRESH_MS + 1 });
  assert.equal(later.written, true, 'the stamp is refreshed once the TTL passes, which is what keeps it out of the GC');

  const moved = registerInbox(home, 'taxonomy', claudeRecord({ socket: '/tmp/cc-socks/9999.sock' }), { now: NOW + 1 });
  assert.equal(moved.written, true, 'a restarted session has a NEW socket and must not keep the old one');
  assert.equal(readInboxes(home).taxonomy.socket, '/tmp/cc-socks/9999.sock');
});

test('D1: registerInbox never throws — no record, no slug, or an unwritable file', () => {
  const home = tmp();
  assert.equal(registerInbox(home, 'taxonomy', null, { now: NOW }).reason, 'no-inbox-in-env');
  assert.equal(registerInbox(home, 'Nope', claudeRecord(), { now: NOW }).reason, 'no-slug');
  const broken = { ...fs, mkdirSync() { throw new Error('read-only fs'); } };
  const res = registerInbox(home, 'taxonomy', claudeRecord(), { fs: broken, now: NOW });
  assert.equal(res.written, false);
  assert.equal(res.reason, 'error');
  noToken(res, res.error);
});

// ─────────────────────────────────────────────────────────────────────────────
// D3/F4 (rename-build spec) — a rename moves the inbox: the OLD slug's entry for this same sessionId is
// removed in the SAME write that registers the new one, and the sweep runs even when the new slug's own
// record is already fresh (F4 — otherwise the fast path never reaches it).
// ─────────────────────────────────────────────────────────────────────────────

test('D3: registering a session under a NEW slug removes its OLD slug entry, in one write', () => {
  const home = tmp();
  const rec = claudeRecord();
  assert.equal(registerInbox(home, 'old-slug', rec, { now: NOW }).written, true);
  assert.ok(readInboxes(home)['old-slug'], 'sanity: the old entry is really there first');

  const moved = registerInbox(home, 'new-slug', claudeRecord({ socket: '/tmp/cc-socks/moved.sock' }), { now: NOW + 1 });
  assert.equal(moved.written, true);
  assert.equal(moved.removedSlug, 'old-slug');

  const after = readInboxes(home);
  assert.deepEqual(Object.keys(after), ['new-slug'], 'the old slug must not linger as a second, stale entry');
  assert.equal(after['new-slug'].sessionId, SESSION_ID);
});

test('D3: writeInbox itself only removes opts.removeSlug when it is a DIFFERENT, actually-present slug', () => {
  const home = tmp();
  // Asking to remove the slug being written is a no-op (nothing to move to itself).
  const same = writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW, removeSlug: 'taxonomy' });
  assert.equal(same.removedSlug, null);
  assert.deepEqual(Object.keys(readInboxes(home)), ['taxonomy']);

  // Asking to remove a slug that was never there is also a no-op, not an error.
  const nothing = writeInbox(home, 'astra', claudeRecord({ socket: '/tmp/cc-socks/astra.sock' }), {
    now: NOW, removeSlug: 'never-registered',
  });
  assert.equal(nothing.removedSlug, null);
  assert.deepEqual(Object.keys(readInboxes(home)).sort(), ['astra', 'taxonomy']);
});

// F4 (red-team FIX FIRST 4, citing transport.mjs:1526-1531): when the TARGET slug's own record is
// already fresh, `registerInbox` used to take the `reason: 'fresh'` fast path with no write at all — so
// a rename A→B→A performed inside the refresh window left B's entry live, because the fast path never
// reached the sweep. The required test, named exactly as the spec spells it out:
test('re-register under a previously used slug inside the refresh window still removes the other slug\'s entry', () => {
  const home = tmp();
  const rec = claudeRecord();
  // A→B: the session registers under 'astra', then is renamed to 'taxonomy' — the sweep on that second
  // call removes 'astra', so this is genuinely a clean rename, not a leftover.
  assert.equal(registerInbox(home, 'astra', rec, { now: NOW }).written, true);
  assert.equal(registerInbox(home, 'taxonomy', rec, { now: NOW + 500 }).removedSlug, 'astra');
  assert.deepEqual(Object.keys(readInboxes(home)), ['taxonomy']);

  // B→A: renamed BACK to 'astra' — a PREVIOUSLY USED slug — well inside the refresh window. 'taxonomy'
  // is swept away here (this is the ordinary rename path, already covered above); the interesting part
  // is what happens NEXT.
  assert.equal(registerInbox(home, 'astra', rec, { now: NOW + 1_000 }).removedSlug, 'taxonomy');
  assert.deepEqual(Object.keys(readInboxes(home)), ['astra']);

  // Now simulate the exact pre-F4 failure mode directly: a stale second entry for THIS SAME sessionId
  // reappears under 'taxonomy' (e.g. a hook event racing an older, un-swept write) WHILE 'astra' — the
  // slug we are about to re-register — is already fresh (written 1s ago, well inside refreshMs). Without
  // F4, registering 'astra' again here would hit `reason: 'fresh'` and never reach the sweep, leaving
  // 'taxonomy' behind forever.
  writeInbox(home, 'taxonomy', rec, { now: NOW + 1_000 });
  assert.deepEqual(Object.keys(readInboxes(home)).sort(), ['astra', 'taxonomy'], 'sanity: both entries exist now');

  const res = registerInbox(home, 'astra', rec, { now: NOW + 1_050 }); // well inside refreshMs of 'astra'
  assert.equal(res.reason, 'written', 'F4: never "fresh" — a stale OTHER slug must force the real write+sweep');
  assert.equal(res.removedSlug, 'taxonomy');
  assert.deepEqual(Object.keys(readInboxes(home)), ['astra'], 'taxonomy must not be left behind as a stale second entry');
});

test('D3: renaming does not disturb an UNRELATED session registered under its own slug', () => {
  const home = tmp();
  registerInbox(home, 'old-slug', claudeRecord(), { now: NOW });
  registerInbox(home, 'unrelated', claudeRecord({ sessionId: 'sess-0002-bbbb', socket: '/tmp/cc-socks/other.sock' }), { now: NOW });

  registerInbox(home, 'new-slug', claudeRecord({ socket: '/tmp/cc-socks/moved.sock' }), { now: NOW + 1 });
  assert.deepEqual(Object.keys(readInboxes(home)).sort(), ['new-slug', 'unrelated']);
  assert.equal(readInboxes(home).unrelated.sessionId, 'sess-0002-bbbb', 'a different session is never swept');
});

test('D3: the sweep never touches a codex-queue entry — Codex has no sessionId field at all (D7)', () => {
  const home = tmp();
  // A codex-queue registration happens to reuse this Claude session's sessionId in its own unrelated
  // field space — it cannot, since codex records carry threadId, not sessionId, but this proves the
  // sweep's `rec.kind === 'claude-socket'` guard rather than relying on that absence by accident.
  writeInbox(home, 'codex-slug', codexRecord(), { now: NOW });
  const rec = claudeRecord();
  registerInbox(home, 'claude-slug', rec, { now: NOW + 1 });
  assert.deepEqual(Object.keys(readInboxes(home)).sort(), ['claude-slug', 'codex-slug']);
});

test('D3: the existing inbox-conflict throttle (two DIFFERENT sessions on one slug) is unaffected by the sweep', () => {
  const home = tmp();
  const dir = tmp();
  const a = (name, over) => { const socket = path.join(dir, name); fs.writeFileSync(socket, ''); return claudeRecord({ socket, pid: process.pid, ...over }); };
  writeInbox(home, 'astra', a('a.sock', { sessionId: 'sess-A' }), { now: NOW });
  const conflict = writeInbox(home, 'astra', a('b.sock', { sessionId: 'sess-B' }), { now: NOW + 5_000 });
  assert.equal(conflict.conflict, true, 'two different sessions claiming the same slug is still flagged, unchanged');
});

test('D1: the env readers say exactly when a session has an inbox', () => {
  const both = { CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/cc-socks/1.sock', CLAUDE_CODE_MESSAGING_TOKEN: TOKEN };
  assert.equal(claudeInboxRecord({}, { sessionId: SESSION_ID }), null);
  assert.equal(
    claudeInboxRecord({ CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/x.sock' }, { sessionId: SESSION_ID }), null,
    'a socket with no token is not usable on Windows',
  );
  assert.equal(claudeInboxRecord(both, {}), null, 'C6: and no session id is no registration at all');
  const rec = claudeInboxRecord(both, { sessionId: SESSION_ID, pid: 7, cwd: 'C:\\repo' });
  assert.deepEqual(rec, {
    kind: 'claude-socket', socket: '/tmp/cc-socks/1.sock', token: TOKEN,
    sessionId: SESSION_ID, host: HOST, pid: 7, cwd: 'C:/repo',
  });
  assert.equal(claudeInboxRecord(both, { sessionId: SESSION_ID, host: 'elsewhere' }).host, 'elsewhere');

  assert.equal(codexInboxRecord({}, { threadId: null }), null);
  assert.equal(codexInboxRecord({ CODEX_HOME: '/orca/home' }, { threadId: 'abc' }).codexHome, '/orca/home');
  assert.equal(codexInboxRecord({}, { threadId: 'abc', home: '/home/ben' }).codexHome, '/home/ben/.codex');
  assert.equal(codexInboxRecord({}, { threadId: 'abc' }).host, HOST, 'C7: both kinds record the machine');

  assert.equal(sameInbox(claudeRecord(), claudeRecord({ at: 5, pid: 9 })), true);
  assert.equal(sameInbox(claudeRecord(), claudeRecord({ token: 'other' })), false);
  assert.equal(
    sameInbox(claudeRecord(), claudeRecord({ sessionId: 'sess-0002-bbbb' })), false,
    'C6: the same socket path with a different session behind it is NOT the same inbox',
  );
  assert.equal(sameInbox(claudeRecord(), claudeRecord({ host: 'other-box' })), false);
  assert.equal(sameInbox(claudeRecord(), codexRecord()), false);
  assert.equal(sameInbox(codexRecord(), codexRecord({ threadId: 'other' })), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// D4 — the Claude socket client
// ─────────────────────────────────────────────────────────────────────────────

test('D4: the wire format is the auth line, then a `user` frame with message.content', () => {
  const [auth, message] = inboxFrames(TOKEN, ENVELOPE, 'note-flush');
  assert.deepEqual(JSON.parse(auth), { type: 'auth', token: TOKEN });
  assert.deepEqual(JSON.parse(message), { type: 'user', from: 'note-flush', message: { content: ENVELOPE } });
  assert.equal('session_id' in JSON.parse(message), false, 'omitted when the registration has none to prove');
});

test('C6: a pinned registration sends its session_id, so a recycled pid is a drop and not a wrong turn', () => {
  const [, message] = inboxFrames(TOKEN, ENVELOPE, 'note-flush', SESSION_ID);
  assert.deepEqual(JSON.parse(message), {
    type: 'user', from: 'note-flush', session_id: SESSION_ID, message: { content: ENVELOPE },
  });
});

/** A minimal stand-in for the receiving session: collects the bytes and says nothing back. */
function fakeInboxServer() {
  const address = process.platform === 'win32'
    ? `\\\\.\\pipe\\multi-inbox-test-${process.pid}-${Math.random().toString(36).slice(2)}`
    : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-sock-')), 's.sock');
  const chunks = [];
  const server = net.createServer((socket) => { socket.on('data', (d) => chunks.push(String(d))); });
  return {
    address,
    received: () => chunks.join(''),
    listen: () => new Promise((resolve) => server.listen(address, resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('D4: a real post puts both lines on the socket, in order, newline-terminated', async () => {
  const server = fakeInboxServer();
  await server.listen();
  try {
    const verdict = await postToClaudeInbox(claudeRecord({ socket: server.address }), ENVELOPE);
    assert.equal(verdict.delivered, true);
    assert.equal(verdict.reason, 'delivered');
    // Give the server's data event a tick to land.
    await new Promise((r) => setTimeout(r, 50));
    const lines = server.received().split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { type: 'auth', token: TOKEN });
    assert.deepEqual(JSON.parse(lines[1]), {
      type: 'user', from: 'note-flush', session_id: SESSION_ID, message: { content: ENVELOPE },
    });
  } finally {
    await server.close();
  }
});

test('D4: a session that is gone is `inbox-stale`, and the registration is dropped', async () => {
  const home = tmp();
  writeInbox(home, 'taxonomy', claudeRecord({ socket: path.join(tmp(), 'no-such.sock') }), { now: NOW });
  const verdict = await postToClaude(home, 'taxonomy', ENVELOPE, { timeoutMs: 2_000 });
  assert.equal(verdict.delivered, false);
  assert.equal(verdict.reason, 'inbox-stale');
  assert.equal(verdict.stale, true);
  noToken(verdict, verdict.detail);
  assert.deepEqual(readInboxes(home), {}, 'a dead socket must not be retried nineteen more times');
});

test('D4: ECONNREFUSED is stale too; anything else is an error that keeps the registration', async () => {
  for (const code of [...STALE_CODES]) {
    const verdict = await postToClaudeInbox(claudeRecord(), ENVELOPE, { connect: () => fakeSocket({ errorCode: code }) });
    assert.equal(verdict.stale, true, `${code} means the session is gone`);
    assert.equal(verdict.reason, 'inbox-stale');
  }
  const home = tmp();
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  const other = await postToClaude(home, 'taxonomy', ENVELOPE, { connect: () => fakeSocket({ errorCode: 'EACCES' }) });
  assert.equal(other.reason, 'inbox-error');
  assert.equal(other.stale, false);
  noToken(other, other.detail);
  assert.deepEqual(Object.keys(readInboxes(home)), ['taxonomy'], 'a permission error is not a dead session');
});

/** An injected socket: no kernel involved, so the failure paths are deterministic on every platform. */
function fakeSocket({ errorCode = null, hang = false, writeError = null } = {}) {
  const handlers = {};
  const sock = {
    on(event, fn) { handlers[event] = fn; return sock; },
    once(event, fn) { handlers[event] = fn; return sock; },
    write(_payload, cb) { if (!hang) cb?.(writeError); },
    end() {},
    destroy() {},
  };
  setImmediate(() => {
    if (errorCode) handlers.error?.(Object.assign(new Error(`connect ${errorCode} /tmp/x.sock`), { code: errorCode }));
    else if (!hang) handlers.connect?.();
    else handlers.connect?.();
  });
  return sock;
}

test('D4: a connection that never completes the write is a timeout, not a hang', async () => {
  const started = Date.now();
  const verdict = await postToClaudeInbox(claudeRecord(), ENVELOPE, { timeoutMs: 60, connect: () => fakeSocket({ hang: true }) });
  assert.equal(verdict.reason, 'inbox-timeout');
  assert.equal(verdict.delivered, false);
  assert.ok(Date.now() - started < 5_000, 'the default 5 s ceiling is never the 30 s the receiver allows');
  assert.ok(DEFAULT_POST_TIMEOUT_MS < 30_000);
  noToken(verdict, verdict.detail);
});

test('D4: a slug registered as a Codex queue is never posted to as a socket', async () => {
  const home = tmp();
  writeInbox(home, 'astra', codexRecord(), { now: NOW });
  const verdict = await postToClaude(home, 'astra', ENVELOPE);
  assert.equal(verdict.reason, 'inbox-error');
  assert.match(verdict.detail, /registered as codex-queue/);
  assert.equal(readInboxes(home).astra.kind, 'codex-queue', 'and the registration survives the mismatch');
});

test('D4: no registration at all is `no-inbox`, not an error', async () => {
  const verdict = await postToClaude(tmp(), 'taxonomy', ENVELOPE);
  assert.equal(verdict.reason, 'no-inbox');
  assert.equal(verdict.delivered, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// D5 — the Codex queue client
// ─────────────────────────────────────────────────────────────────────────────

test('D5: the codex binary is resolved PATH first, then the known install paths', () => {
  const env = { PATH: '/usr/bin' };
  const onPath = resolveCodexCommand(undefined, env, { existsSync: (p) => p === path.join('/usr/bin', 'codex'), platform: 'linux' });
  assert.equal(onPath.exe, 'codex');
  assert.equal(onPath.source, 'PATH');

  const local = resolveCodexCommand(undefined, env, {
    existsSync: (p) => p === '/home/ben/.local/bin/codex', platform: 'linux', home: '/home/ben',
  });
  assert.equal(local.exe, '/home/ben/.local/bin/codex');
  assert.match(local.source, /\.local\/bin\/codex/);

  const brew = resolveCodexCommand(undefined, env, {
    existsSync: (p) => p === '/opt/homebrew/bin/codex', platform: 'darwin', home: '/Users/benzhuk',
  });
  assert.equal(brew.exe, '/opt/homebrew/bin/codex');

  const none = resolveCodexCommand(undefined, env, { existsSync: () => false, platform: 'linux', home: '/home/ben' });
  assert.equal(none.source, 'not found');
  assert.ok(none.tried.length >= 4, 'a failure must be able to say where we looked');

  assert.equal(resolveCodexCommand('/custom/codex', env).exe, '/custom/codex');
  assert.equal(resolveCodexCommand(undefined, { ...env, CODEX_CLI: '/from/env' }).exe, '/from/env');
});

test('D5: the call is `queue --thread <id> --message <text>` with CODEX_HOME in the CHILD env only', async () => {
  const calls = [];
  const before = process.env.CODEX_HOME;
  const verdict = await queueToCodexInbox(codexRecord({ codexHome: '/orca/home-a' }), ENVELOPE, {
    env: { PATH: '/usr/bin' },
    execFile: async (exe, args, opts) => { calls.push({ exe, args, opts }); return { stdout: 'Queued message x for thread y.\n' }; },
    existsSync: () => false,
  });
  assert.equal(verdict.delivered, true);
  assert.deepEqual(calls[0].args, [
    'queue', '--thread', '01a0b193-d533-7360-be08-b82b41f19b3d', '--message', ENVELOPE,
  ]);
  assert.equal(calls[0].opts.env.CODEX_HOME, '/orca/home-a');
  assert.equal(process.env.CODEX_HOME, before, "the flusher's OWN CODEX_HOME is never touched — the next entry may be another home");
  assert.ok(calls[0].opts.timeout > 0, 'a wedged codex must be killable');
});

test('D5: a thread with no persisted turn yet is `codex-no-thread`, and stays queued', async () => {
  const stderr = 'Error: failed to queue session message: thread/queue/add failed: failed to read thread: '
    + 'invalid thread-store request: no rollout found for thread id 01a0 (code -32603)';
  assert.match(stderr, NO_THREAD_RE);
  const verdict = await queueToCodexInbox(codexRecord(), ENVELOPE, {
    env: {}, existsSync: () => false,
    execFile: async () => { throw Object.assign(new Error('Command failed'), { stderr, code: 1 }); },
  });
  assert.equal(verdict.reason, 'codex-no-thread');
  assert.equal(verdict.delivered, false);
  assert.match(verdict.detail, /no rollout found/);
});

test('D5: any other failure is one line, and a killed call is a timeout', async () => {
  const noisy = await queueToCodexInbox(codexRecord(), ENVELOPE, {
    env: {}, existsSync: () => false,
    execFile: async () => { throw Object.assign(new Error('Command failed'), { stderr: 'boom: the store is locked\nline two\nline three', code: 1 }); },
  });
  assert.equal(noisy.reason, 'codex-error');
  assert.equal(noisy.detail, 'boom: the store is locked');

  const killed = await queueToCodexInbox(codexRecord(), ENVELOPE, {
    env: {}, existsSync: () => false,
    execFile: async () => { throw Object.assign(new Error('killed'), { killed: true }); },
  });
  assert.equal(killed.reason, 'codex-timeout');

  const missing = await queueToCodexInbox(codexRecord(), ENVELOPE, {
    env: {}, existsSync: () => false, home: '/home/ben',
    execFile: async () => { throw Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }); },
  });
  assert.equal(missing.reason, 'codex-error');
  assert.match(missing.detail, /no codex CLI found\. Looked at: .*\.local\/bin\/codex/);
});

test('D5: a slug registered as a socket is never queued as a Codex thread', async () => {
  const home = tmp();
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  const verdict = await queueToCodex(home, 'taxonomy', ENVELOPE, { execFile: async () => ({ stdout: '' }) });
  assert.equal(verdict.reason, 'codex-error');
  assert.match(verdict.detail, /registered as claude-socket/);
  noToken(verdict, verdict.detail);
});

// ─────────────────────────────────────────────────────────────────────────────
// D3 — note-flush's delivery order
// ─────────────────────────────────────────────────────────────────────────────

test('D3: a registered inbox is delivered to, the entry is retired, and no pane is touched', async () => {
  const home = tmp();
  queued(home);
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  const posts = [];
  const res = await runNoteFlush([], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async (_home, slug, envelope, record) => {
      posts.push({ slug, envelope, kind: record.kind });
      return { ok: true, delivered: true, reason: 'delivered' };
    },
  });
  assert.equal(res.drained, 1);
  assert.equal(res.remaining, 0);
  assert.deepEqual(posts, [{ slug: 'taxonomy', envelope: ENVELOPE, kind: 'claude-socket' }]);
  assert.equal(res.results[0].outcome, 'delivered');
  assert.match(res.results[0].detail, /inbox \(claude-socket\)/);
  assert.deepEqual(readOutbox(home), [], 'a delivered wake-up is gone from the outbox');

  const log = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.match(log, /delivered \[astra-inbox-1\] -> taxonomy — inbox \(claude-socket\)/);
  noToken(log, res, formatFlush(res), JSON.stringify(res));
});

test('D3: no registered inbox, typing off — `no-inbox`, nothing typed, and NOT counted as an attempt', async () => {
  const home = tmp();
  queued(home);
  const res = await runNoteFlush([], { home, now: NOW, env: {}, orca: forbiddenOrca() });
  assert.equal(res.drained, 0);
  assert.equal(res.attempted, 0, 'nothing was attempted, so nothing may walk this entry toward gave-up');
  assert.equal(res.remaining, 1);
  assert.equal(res.results[0].outcome, 'no-inbox');
  assert.equal(readOutbox(home)[0].attempts ?? 0, 0, 'the attempt counter must not move');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /no-inbox \[astra-inbox-1\] -> taxonomy/);
});

test('D3: typing is reachable only with MULTI_ALLOW_TYPING=1, and then only with no inbox', async () => {
  const home = tmp();
  queued(home);
  const calls = [];
  const orca = async (args) => {
    calls.push(args);
    if (args[1] === 'list') return { terminals: [] };
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  await runNoteFlush([], { home, now: NOW, env: { MULTI_ALLOW_TYPING: '1' }, orca });
  assert.deepEqual(calls[0], ['terminal', 'list', '--json'], 'with typing allowed it goes looking for the pane');

  // With an inbox registered, the same drain never asks orca anything at all.
  calls.length = 0;
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  const res = await runNoteFlush([], {
    home, now: NOW, env: { MULTI_ALLOW_TYPING: '1' }, orca,
    deliverToInbox: async () => ({ ok: true, delivered: true, reason: 'delivered' }),
  });
  assert.equal(res.drained, 1);
  assert.deepEqual(calls, [], 'the inbox wins over the keyboard, always');
});

test('D3: a stale inbox counts as an attempt, keeps the note, and drops the registration', async () => {
  const home = tmp();
  queued(home);
  writeInbox(home, 'taxonomy', claudeRecord({ socket: path.join(tmp(), 'gone.sock') }), { now: NOW });
  const res = await runNoteFlush([], { home, now: NOW, env: {}, orca: forbiddenOrca() });
  assert.equal(res.drained, 0);
  assert.equal(res.attempted, 1);
  assert.equal(res.results[0].outcome, 'inbox-stale');
  assert.equal(readOutbox(home)[0].attempts, 1);
  assert.deepEqual(readInboxes(home), {}, 'the next drain says no-inbox instead of dialling a dead socket');

  const log = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.match(log, /inbox-stale \[astra-inbox-1\] -> taxonomy — inbox \(claude-socket\)/);
  noToken(log, res, JSON.stringify(res));
});

test('C2: a Codex thread with no first turn yet is NOT an attempt, and says so once', async () => {
  const home = tmp();
  queued(home, { to: 'astra', toSlug: 'astra', agentIdentity: 'codex' });
  writeInbox(home, 'astra', codexRecord(), { now: NOW });
  const seen = [];
  const deliverToInbox = async (_h, slug, _env, record, opts) => {
    seen.push({ slug, kind: record.kind, budgetMs: opts.budgetMs });
    return { ok: false, delivered: false, reason: 'codex-no-thread', detail: 'no rollout found for thread id 01a0' };
  };
  const res = await runNoteFlush([], { home, now: NOW, env: {}, orca: forbiddenOrca(), deliverToInbox });
  assert.equal(seen[0].kind, 'codex-queue');
  assert.ok(seen[0].budgetMs > 0);
  assert.equal(res.results[0].outcome, 'codex-no-thread');
  // The state of a Codex pane that was just launched. Counting it walks the entry toward `gave-up`,
  // which dead-letters the note and writes a BLOCKED line for something nobody failed to deliver.
  assert.equal(readOutbox(home)[0].attempts ?? 0, 0, 'C2: a thread with no turn yet is a state, not a failure');
  assert.equal(res.attempted, 0, 'and it is not reported as an attempt either');
  const first = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.match(first, /codex-no-thread \[astra-inbox-1\] -> astra/);

  // C3: at one drain a minute this state would otherwise write the same line ~2 880 times.
  await runNoteFlush([], { home, now: NOW + 60_000, env: {}, orca: forbiddenOrca(), deliverToInbox });
  await runNoteFlush([], { home, now: NOW + 120_000, env: {}, orca: forbiddenOrca(), deliverToInbox });
  const after = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.equal(
    after.split('\n').filter((l) => l.includes('codex-no-thread')).length, 1,
    'the line is written on a change of state, not once a minute forever',
  );
  assert.equal(readOutbox(home)[0].attempts ?? 0, 0, 'and three passes still burn no attempts');
});

test('D3: the dispatcher clamps each client to the budget it was given', async () => {
  const calls = [];
  const home = tmp();
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  writeInbox(home, 'astra', codexRecord(), { now: NOW });
  await deliverToInbox(home, 'taxonomy', ENVELOPE, claudeRecord(), {
    budgetMs: 900, connect: () => { calls.push('socket'); return fakeSocket({ errorCode: 'EACCES' }); },
  });
  const verdict = await deliverToInbox(home, 'astra', ENVELOPE, codexRecord(), {
    budgetMs: 1_500, existsSync: () => false,
    execFile: async (_exe, _args, opts) => { calls.push(opts.timeout); return { stdout: 'ok' }; },
  });
  assert.equal(verdict.delivered, true);
  assert.deepEqual(calls, ['socket', 1_500], 'the codex call is bounded by the budget, not by its 20 s default');
});

test('D3: a superseded or already-read wake-up is retired before any inbox is dialled', async () => {
  const home = tmp();
  queued(home);
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  const ledger = path.join(home, '.agents/notes', '2026-09-17.md');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, `${ENVELOPE}\nastra → taxonomy, 9.17.26 18:05 NYC [astra-inbox-2 supersedes astra-inbox-1] FYI: scrap that.\n`);
  let posted = 0;
  const res = await runNoteFlush([], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async () => { posted += 1; return { ok: true, delivered: true, reason: 'delivered' }; },
  });
  assert.equal(posted, 0);
  assert.equal(res.results[0].outcome, 'superseded');
});

test('D3: a client that throws is an inbox-error, never an exception out of the drain', async () => {
  const home = tmp();
  queued(home);
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  const res = await runNoteFlush([], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async () => { throw new Error('bug in the client'); },
  });
  assert.equal(res.exitCode, 0);
  assert.equal(res.results[0].outcome, 'inbox-error');
  assert.equal(readOutbox(home)[0].attempts, 1);
});

test('D3: an inbox nobody has refreshed in a week is GC-ed, with a line saying so', async () => {
  const home = tmp();
  queued(home);
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW - INBOX_GC_MS - 1 });
  const res = await runNoteFlush([], { home, now: NOW, env: {}, orca: forbiddenOrca() });
  assert.equal(res.results[0].outcome, 'no-inbox');
  assert.deepEqual(readInboxes(home), {});
  const log = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.match(log, /gc-inbox taxonomy claude-socket/);
  noToken(log);
});

test('D3: a real end-to-end drain posts the envelope onto a real socket, with no orca at all', async () => {
  const home = tmp();
  const server = fakeInboxServer();
  await server.listen();
  try {
    queued(home);
    writeInbox(home, 'taxonomy', claudeRecord({ socket: server.address }), { now: NOW });
    const res = await runNoteFlush(['--json'], { home, now: NOW, env: {}, orca: forbiddenOrca() });
    assert.equal(res.drained, 1);
    await new Promise((r) => setTimeout(r, 50));
    const lines = server.received().split('\n').filter(Boolean);
    assert.deepEqual(JSON.parse(lines[1]).message.content, ENVELOPE);
    noToken(fs.readFileSync(flushLogPath(home), 'utf8'), JSON.stringify(res), formatFlush(res));
  } finally {
    await server.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// D3 — note-send takes the same route: inbox first, then queue, and never a keystroke by default
// ─────────────────────────────────────────────────────────────────────────────

// N1 (2026-09-20): ACK and FYI are ledger-only and never post to an inbox at all — see note-send.test.mjs
// for that contract's own tests. This fixture exercises the general inbox-delivery mechanism, which is
// orthogonal to kind, so it uses ASK.
const SEND_ARGS = ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'ASK', '--topic', 'ping', '--text', 'Batch finished, 413 films'];
/** A real directory, because note-send refuses to write a ledger into a recipient repo that is not there. */
const sendArgsIn = (repo, over = []) => [...SEND_ARGS, '--recipient-repo', repo, ...over];
const nucleusPane = (over = {}) => ({
  handle: 'term_aaa', title: 'nucleus', connected: true, writable: true, orphaned: false,
  agentIdentity: 'claude', agentWait: null, lastOutputAt: 1_000_000,
  preview: '⏵⏵ bypass permissions on (shift+tab to cycle)', worktreePath: '/repo', executionHostId: 'local', ...over,
});

/** A pane list, and a hard failure on anything that would put characters on a screen. */
function sendOrca(panes = [nucleusPane()]) {
  const run = async (args) => {
    if (args[1] === 'list') return { terminals: panes };
    if (args[1] === 'show') return { terminal: panes[0] };
    if (args[1] === 'read') return { terminal: { handle: 'term_aaa', status: 'running', tail: ['? for shortcuts'] } };
    throw new Error(`nothing may be typed: orca ${args.join(' ')}`);
  };
  run.calls = [];
  return run;
}

async function rejectsWith(promise, exitCode, re) {
  try { await promise; } catch (err) {
    assert.ok(err instanceof NoteError, `expected NoteError, got ${err}`);
    assert.equal(err.exitCode, exitCode, err.message);
    if (re) assert.match(err.message, re);
    return err;
  }
  return assert.fail('expected a rejection');
}

test('D3: note-send posts into a registered inbox and is exit 0 delivered, with nothing typed', async () => {
  const home = tmp();
  writeInbox(home, 'nucleus', claudeRecord(), { now: NOW });
  const posts = [];
  const res = await runNoteSend(sendArgsIn(home), {
    home, git: () => '.git', now: NOW, env: {}, orca: sendOrca(),
    deliverToInbox: async (_h, slug, envelope, record) => {
      posts.push({ slug, envelope, kind: record.kind });
      return { ok: true, delivered: true, reason: 'delivered' };
    },
  });
  assert.equal(res.exitCode, 0);
  assert.equal(res.delivered, true);
  assert.equal(res.queued, false);
  assert.equal(res.classification, 'inbox (claude-socket)');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].slug, 'nucleus');
  assert.match(posts[0].envelope, /\[taxonomy-ping-1\] ASK: Batch finished, 413 films/);
  assert.ok(res.ledgers.length >= 1, 'ledger first, as always');
  noToken(res, JSON.stringify(res));
});

test('D3: a recipient with no inbox is a deferral, not a keystroke — MULTI_ALLOW_TYPING is the only way in', async () => {
  const home = tmp();
  const err = await rejectsWith(
    runNoteSend(sendArgsIn(home), { home, git: () => '.git', now: NOW, env: {}, orca: sendOrca() }),
    3,
    /has registered no inbox on this machine, and typing into a pane is off/,
  );
  assert.equal(err.queued, true);
  assert.equal(err.classification, 'no-inbox');
  assert.match(err.message, /Do NOT re-send this id/);
  assert.equal(readOutbox(home).length, 1, 'the wake-up is queued for note-flush');
});

test('D3: a failed inbox post queues the wake-up and says so, token-free', async () => {
  const home = tmp();
  writeInbox(home, 'nucleus', claudeRecord(), { now: NOW });
  const err = await rejectsWith(
    runNoteSend(sendArgsIn(home), {
      home, git: () => '.git', now: NOW, env: {}, orca: sendOrca(),
      deliverToInbox: async () => ({ ok: false, delivered: false, reason: 'inbox-stale', detail: 'ENOENT connect ENOENT /tmp/cc-socks/4242.sock' }),
    }),
    3,
    /inbox-stale/,
  );
  assert.equal(err.queued, true);
  noToken(err.message, err);
});

test('D3: a registered inbox is used even when no pane resolves — the name stops mattering', async () => {
  const home = tmp();
  writeInbox(home, 'nucleus', claudeRecord(), { now: NOW });
  const res = await runNoteSend(sendArgsIn(home), {
    home, git: () => '.git', now: NOW, env: {}, orca: sendOrca([]), // no panes at all
    deliverToInbox: async () => ({ ok: true, delivered: true, reason: 'delivered' }),
  });
  assert.equal(res.delivered, true, 'exit 2 "no pane titled nucleus" is not reachable for a registered peer');
});

test('D3: --no-type still records and queues without delivering anything', async () => {
  const home = tmp();
  writeInbox(home, 'nucleus', claudeRecord(), { now: NOW });
  let posted = 0;
  const res = await runNoteSend(sendArgsIn(home, ['--no-type']), {
    home, git: () => '.git', now: NOW, env: {}, orca: sendOrca(),
    deliverToInbox: async () => { posted += 1; return { ok: true, delivered: true, reason: 'delivered' }; },
  });
  assert.equal(posted, 0);
  assert.equal(res.queued, true);
  assert.equal(res.delivered, false);
});

test('D3: --codex names the binary when a non-login PATH cannot find it (as --orca does for panes)', async () => {
  const home = tmp();
  queued(home, { to: 'astra', toSlug: 'astra' });
  writeInbox(home, 'astra', codexRecord(), { now: NOW });
  const seen = [];
  const res = await runNoteFlush(['--codex', '/custom/bin/codex'], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async (h, slug, envelope, record, opts) => {
      seen.push(opts.codex);
      return deliverToInbox(h, slug, envelope, record, {
        ...opts, existsSync: () => false,
        execFile: async (exe) => { seen.push(exe); return { stdout: 'Queued message x for thread y.' }; },
      });
    },
  });
  assert.equal(res.drained, 1);
  assert.deepEqual(seen, ['/custom/bin/codex', '/custom/bin/codex']);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix round (review rev-inbox, 2026-09-17)
// ─────────────────────────────────────────────────────────────────────────────

test('C1: a 3 s piggyback never STARTS a codex delivery it would have to SIGKILL', async () => {
  const home = tmp();
  queued(home, { to: 'astra', toSlug: 'astra', agentIdentity: 'codex' });
  writeInbox(home, 'astra', codexRecord(), { now: NOW });
  let started = 0;
  const res = await runNoteFlush(['--max-ms', '3000'], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async () => { started += 1; return { ok: true, delivered: true, reason: 'delivered' }; },
  });
  assert.equal(started, 0, 'codex queue spins up an app-server and opens SQLite; 3 s is not a start');
  assert.equal(res.attempted, 0, 'and a delivery that never began is not an attempt');
  assert.equal(readOutbox(home)[0].attempts ?? 0, 0, 'so it can never walk the entry toward gave-up');
  const log = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.match(log, /budget-only-pass 1 inbox entry left untouched/);
  assert.match(log, /needs 5000 ms to start/);
  assert.equal(log.split('\n').filter((l) => l.includes('budget-only-pass')).length, 1, 'one line, not one per entry');
});

test('C1: the same 3 s budget is plenty for a socket, which is a write', async () => {
  const home = tmp();
  queued(home);
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  let started = 0;
  const res = await runNoteFlush(['--max-ms', '3000'], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async (_h, _s, _e, _r, opts) => {
      started += 1;
      assert.ok(opts.budgetMs <= 3000 && opts.budgetMs >= INBOX_FLOOR_MS['claude-socket']);
      return { ok: true, delivered: true, reason: 'delivered' };
    },
  });
  assert.equal(started, 1);
  assert.equal(res.drained, 1);
});

test('C3: no-inbox says it once, and never again while nothing changes', async () => {
  const home = tmp();
  queued(home);
  for (const t of [NOW, NOW + 60_000, NOW + 120_000, NOW + 180_000]) {
    await runNoteFlush([], { home, now: t, env: {}, orca: forbiddenOrca() });
  }
  const lines = fs.readFileSync(flushLogPath(home), 'utf8').split('\n').filter((l) => l.includes('no-inbox'));
  assert.equal(lines.length, 1, 'four drains, one line - SKILL.md tells Ben to grep this file');
  assert.equal(readOutbox(home)[0].attempts ?? 0, 0);
  assert.equal(readOutbox(home)[0].lastOutcome, 'no-inbox', 'the entry remembers the state it reported');

  // A change of state speaks again: the peer registers, and the next drain delivers.
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  const res = await runNoteFlush([], {
    home, now: NOW + 240_000, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async () => ({ ok: true, delivered: true, reason: 'delivered' }),
  });
  assert.equal(res.drained, 1);
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /delivered \[astra-inbox-1\] -> taxonomy/);
});

test('C3: an entry that never had an inbox still reaches Ben when it expires', async () => {
  const home = tmp();
  queued(home, { createdAt: new Date(NOW - 49 * 3_600_000).toISOString(), lastOutcome: 'no-inbox' });
  const res = await runNoteFlush([], { home, now: NOW, env: {}, orca: forbiddenOrca() });
  assert.equal(res.results[0].outcome, 'expired');
  const ben = fs.readFileSync(benInboxPath(home), 'utf8');
  assert.match(ben, /BLOCKED: \[astra-inbox-1\] never had an inbox on this machine to deliver to, for 48h/);
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /never had an inbox to deliver to; reported to ben/);
});

test('C3: an ordinary expiry is still silent - only a never-reachable one is escalated', async () => {
  const home = tmp();
  queued(home, { createdAt: new Date(NOW - 49 * 3_600_000).toISOString() });
  await runNoteFlush([], { home, now: NOW, env: {}, orca: forbiddenOrca() });
  assert.equal(fs.existsSync(benInboxPath(home)), false);
});

test('C7: a registration from another machine is refused and dropped, by both clients', async () => {
  const home = tmp();
  writeInbox(home, 'taxonomy', claudeRecord({ host: 'some-other-box' }), { now: NOW });
  writeInbox(home, 'astra', codexRecord({ host: 'some-other-box' }), { now: NOW });

  const socket = await postToClaude(home, 'taxonomy', ENVELOPE, { connect: () => assert.fail('must not dial') });
  assert.equal(socket.reason, 'no-inbox');
  assert.match(socket.detail, /registered on "some-other-box"/);

  const queue = await queueToCodex(home, 'astra', ENVELOPE, { execFile: () => assert.fail('must not run codex') });
  assert.equal(queue.reason, 'no-inbox');

  assert.deepEqual(readInboxes(home), {}, 'a path that means something else here is not an inbox');
});

/** A record whose endpoint is provably THERE: a real file for the socket, and this process's own pid. */
function liveRecord(dir, name, over = {}) {
  const socket = path.join(dir, name);
  fs.writeFileSync(socket, '');
  return claudeRecord({ socket, pid: process.pid, ...over });
}

test('C8: two LIVE sessions claiming one slug leave a line in the file Ben greps', () => {
  const home = tmp();
  const dir = tmp();
  writeInbox(home, 'astra', liveRecord(dir, 'a.sock', { sessionId: 'sess-A' }), { now: NOW });
  const second = writeInbox(home, 'astra', liveRecord(dir, 'b.sock', { sessionId: 'sess-B' }), { now: NOW + 5_000 });
  assert.equal(second.conflict, true);
  const log = fs.readFileSync(flushLogPath(home), 'utf8');
  assert.match(log, /inbox-conflict astra - replaced a claude-socket registration written 5s ago whose session is still there/);
  assert.match(log, /Give one of them its own slug/);
  noToken(log, second);

  // The same session refreshing itself is not a conflict, and neither is a restart an hour later.
  const refresh = writeInbox(home, 'astra', liveRecord(dir, 'b.sock', { sessionId: 'sess-B' }), { now: NOW + 6_000 });
  assert.equal(refresh.conflict, undefined);
  const restart = writeInbox(home, 'astra', liveRecord(dir, 'c.sock', { sessionId: 'sess-C' }), { now: NOW + 3_600_000 });
  assert.equal(restart.conflict, undefined);
  assert.equal(fs.readFileSync(flushLogPath(home), 'utf8').split('\n').filter((l) => l.includes('inbox-conflict')).length, 1);
});

test('N3: a RESTART inside the refresh window is not a conflict - there is nobody to conflict with', () => {
  const home = tmp();
  const dir = tmp();
  const gone = claudeRecord({ socket: path.join(dir, 'exited.sock'), sessionId: 'sess-old', pid: 2 ** 30 });
  writeInbox(home, 'astra', gone, { now: NOW });
  // The pane restarts 5 s later: same slug, new session, and the old socket file is not there because
  // the old session took it with it when it exited.
  const after = writeInbox(home, 'astra', liveRecord(dir, 'new.sock', { sessionId: 'sess-new' }), { now: NOW + 5_000 });
  assert.equal(after.conflict, undefined, 'one session under a new id is not two sessions');
  assert.equal(fs.existsSync(flushLogPath(home)), false, 'and nothing is said about it at all');
});

test('N3: a real split says it once a minute, not once a hook event', () => {
  const home = tmp();
  const dir = tmp();
  const a = () => liveRecord(dir, 'a.sock', { sessionId: 'sess-A' });
  const b = () => liveRecord(dir, 'b.sock', { sessionId: 'sess-B' });
  writeInbox(home, 'astra', a(), { now: NOW });
  // Both sessions keep registering, every prompt and every stop, for a hundred seconds.
  const flapping = [];
  for (let i = 1; i <= 20; i += 1) {
    flapping.push(writeInbox(home, 'astra', i % 2 ? b() : a(), { now: NOW + i * 5_000 }));
  }
  const lines = fs.readFileSync(flushLogPath(home), 'utf8').split('\n').filter((l) => l.includes('inbox-conflict'));
  assert.equal(lines.length, 2, 'twenty swaps over 100 s: one line per refresh window, not one per event');
  assert.ok(flapping.every((r) => r.conflict), 'the caller is still told every time');
  assert.ok(flapping.some((r) => r.quiet), 'and is told when the line was suppressed');
});

test('N3: a codex-queue registration has no endpoint to test, so a fresh replacement still speaks', () => {
  const home = tmp();
  writeInbox(home, 'astra', codexRecord({ threadId: 'thread-A' }), { now: NOW });
  const second = writeInbox(home, 'astra', codexRecord({ threadId: 'thread-B' }), { now: NOW + 5_000 });
  assert.equal(second.conflict, true, 'a queue store outlives its session, so we cannot rule the first one out');
});

test('C12: a dead session is dialled ONCE, however many notes are queued for it', async () => {
  const home = tmp();
  queued(home, { id: 'astra-inbox-1' });
  queued(home, { id: 'astra-inbox-2' });
  queued(home, { id: 'astra-inbox-3' });
  writeInbox(home, 'taxonomy', claudeRecord({ socket: path.join(tmp(), 'gone.sock') }), { now: NOW });
  let connects = 0;
  const res = await runNoteFlush([], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: (h, slug, envelope, record, opts) => {
      connects += 1;
      return deliverToInbox(h, slug, envelope, record, opts);
    },
  });
  assert.equal(connects, 1, 'the first ENOENT drops the registration from the drains own map too');
  assert.equal(res.results.filter((r) => r.outcome === 'no-inbox').length, 2, 'the rest are plain no-inbox');
  assert.deepEqual(readInboxes(home), {});
});

test('S3: the codex child never inherits this session inbox credential', () => {
  const env = {
    PATH: '/usr/bin', CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/cc-socks/9.sock',
    CLAUDE_CODE_MESSAGING_TOKEN: TOKEN, ANTHROPIC_API_KEY: 'sk-not-a-real-key',
  };
  const child = codexChildEnv(env, '/orca/home-a');
  assert.equal(child.CODEX_HOME, '/orca/home-a');
  assert.equal('CLAUDE_CODE_MESSAGING_SOCKET' in child, false);
  assert.equal('CLAUDE_CODE_MESSAGING_TOKEN' in child, false);
  assert.equal(child.PATH, '/usr/bin', 'everything else still reaches the child');
  noToken(child);
  assert.equal(env.CLAUDE_CODE_MESSAGING_TOKEN, TOKEN, 'and our own environment is not mutated');
});

test('S3: the real call path strips them too', async () => {
  let seen = null;
  await queueToCodexInbox(codexRecord(), ENVELOPE, {
    env: { CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/x.sock', CLAUDE_CODE_MESSAGING_TOKEN: TOKEN },
    existsSync: () => false,
    execFile: async (_exe, _args, opts) => { seen = opts.env; return { stdout: 'ok' }; },
  });
  assert.equal('CLAUDE_CODE_MESSAGING_TOKEN' in seen, false);
  noToken(seen);
});

test('C10: a silent codex failure never puts the note body in the log', async () => {
  const verdict = await queueToCodexInbox(codexRecord(), ENVELOPE, {
    env: {}, existsSync: () => false,
    execFile: async () => {
      // Exactly what node builds when a child exits non-zero with no output: the whole argv, including
      // the envelope, in `message`.
      throw Object.assign(new Error(`Command failed: codex queue --thread abc --message ${ENVELOPE}`), { code: 3 });
    },
  });
  assert.equal(verdict.reason, 'codex-error');
  assert.equal(verdict.detail, 'codex queue exited 3');
  assert.equal(verdict.detail.includes('delivered without a keystroke'), false, 'the note body stays out of flush.log');
});

test('C5: a raw handle target never addresses an inbox - a guessed slug is not a recipient', async () => {
  const home = tmp();
  // `taxonomy` has an inbox. A handle whose PANE TITLE reduces to `taxonomy` must not reach it: the
  // slug was guessed, and the guess could name an entirely different session.
  writeInbox(home, 'taxonomy', claudeRecord(), { now: NOW });
  let posted = 0;
  const orca = async (args) => {
    if (args[1] === 'list') {
      return { terminals: [{ ...nucleusPane({ title: 'taxonomy', handle: 'term_aaa', worktreePath: home }) }] };
    }
    if (args[1] === 'show') return { terminal: nucleusPane({ title: 'taxonomy', worktreePath: home }) };
    if (args[1] === 'read') return { terminal: { handle: 'term_aaa', status: 'running', tail: ['? for shortcuts'] } };
    throw new Error(`nothing may be typed: ${args.join(' ')}`);
  };
  await rejectsWith(
    runNoteSend(['--from', 'astra', '--to', 'term_aaa', '--kind', 'ASK', '--topic', 'ping', '--text', 'x', '--recipient-repo', home], {
      home, git: () => '.git', now: NOW, env: {}, orca,
      deliverToInbox: async () => { posted += 1; return { ok: true, delivered: true, reason: 'delivered' }; },
    }),
    3,
    /typing into a pane is off/,
  );
  assert.equal(posted, 0, 'the note is queued for the pane it named, not posted to a slug we inferred');
});

test('C9: a registered inbox needs no pane, so no orca call is made at all', async () => {
  const home = tmp();
  let orcaCalls = 0;
  writeInbox(home, 'nucleus', claudeRecord({ cwd: home }), { now: NOW });
  const res = await runNoteSend(SEND_ARGS, {
    home, git: () => '.git', now: NOW, env: {},
    orca: async (args) => { orcaCalls += 1; throw new Error(`orca must not be called: ${args.join(' ')}`); },
    deliverToInbox: async () => ({ ok: true, delivered: true, reason: 'delivered' }),
  });
  assert.equal(orcaCalls, 0, 'no terminal list, no show, no read - the happy path costs one JSON read');
  assert.equal(res.delivered, true);
  // C9: and the ledger goes to the RECIPIENT's repo, which the registering session recorded as its cwd.
  assert.ok(res.ledgers.some((l) => l.startsWith(home)), `ledgers: ${res.ledgers.join(', ')}`);
  assert.deepEqual(res.warnings, []);
});

test('C11: an interactive send bounds its own inbox post', async () => {
  const home = tmp();
  writeInbox(home, 'nucleus', codexRecord({ cwd: home }), { now: NOW });
  let budget = null;
  await runNoteSend(SEND_ARGS, {
    home, git: () => '.git', now: NOW, env: {}, orca: sendOrca(),
    deliverToInbox: async (_h, _s, _e, _r, opts) => {
      budget = opts.budgetMs;
      return { ok: true, delivered: true, reason: 'delivered' };
    },
  });
  assert.equal(budget, SEND_INBOX_BUDGET_MS);
  assert.ok(budget < 15_000, 'note-send advertises 15 s for the whole call; the client default is 20 s');
});

// ─────────────────────────────────────────────────────────────────────────────
// Final round (delta review, 2026-09-17)
// ─────────────────────────────────────────────────────────────────────────────

test('N1: a drain never recreates an entry id it did not claim', async () => {
  // THE INVARIANT, not the symptom. `writeOutboxEntry` RECREATES the file, so any write outside a claim
  // can resurrect an entry another drainer has delivered and retired - and the next drain delivers it
  // again, which is a duplicate turn in a peer's session. The trigger is the deploy-day one: a peer
  // registers while a note for it is queued, so two overlapping drains see different worlds.
  const home = tmp();
  queued(home);                       // taxonomy has no inbox yet: this drain will take the no-inbox path
  const ids = () => readOutbox(home).map((e) => e.id);

  // Drain B reads the outbox, and WHILE it is mid-pass drain A delivers the same entry and retires it.
  // `deliverToInbox` is where B is awaiting a post for some other entry; we use it as the seam.
  writeInbox(home, 'other', claudeRecord(), { now: NOW });
  queued(home, { id: 'astra-inbox-9', to: 'other', toSlug: 'other' });
  const res = await runNoteFlush([], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async () => {
      // A wins the race for the queued taxonomy entry: delivered, claimed, retired, file gone.
      const claim = claimOutboxEntry(home, 'astra-inbox-1', fs);
      assert.ok(claim, 'A could claim it');
      releaseClaim(claim, fs);
      assert.deepEqual(ids(), [], 'A has retired it, and B holds the other one under a claim');
      return { ok: true, delivered: true, reason: 'delivered' };
    },
  });
  assert.equal(res.drained, 1);
  assert.deepEqual(ids(), [], 'B must not put astra-inbox-1 back: it never held it');
  assert.ok(
    res.results.some((r) => r.id === 'astra-inbox-1' && r.outcome === 'claimed-elsewhere'),
    `B should report it as claimed elsewhere, got ${JSON.stringify(res.results)}`,
  );
});

test('N1: the state write still happens when the entry IS ours', async () => {
  const home = tmp();
  queued(home);
  const res = await runNoteFlush([], { home, now: NOW, env: {}, orca: forbiddenOrca() });
  assert.equal(res.results[0].outcome, 'no-inbox');
  assert.equal(readOutbox(home)[0].lastOutcome, 'no-inbox', 'the entry is still here, and remembers');
  assert.equal(readOutbox(home)[0].attempts ?? 0, 0);
  // And the claim is released, not left behind to be reclaimed five minutes later.
  assert.deepEqual(
    fs.readdirSync(path.join(home, '.agents/notes/outbox')).filter((n) => n.includes('.claim')), [],
  );
});

test('N4: --dry-run describes inbox delivery, not the keystroke path', async () => {
  const home = tmp();
  writeInbox(home, 'nucleus', claudeRecord({ cwd: home }), { now: NOW });
  const withInbox = await runNoteSend([...SEND_ARGS, '--dry-run'], {
    home, git: () => '.git', now: NOW, env: {}, orca: forbiddenOrca(),
  });
  const plan = withInbox.plan.join(' | ');
  assert.match(plan, /registered inbox \(claude-socket\)/);
  assert.match(plan, /no pane is resolved/);
  assert.equal(/two-phase/.test(plan), false, 'the typed path is not what a real send would do here');

  const noInbox = await runNoteSend([...SEND_ARGS, '--dry-run', '--recipient-repo', home], {
    home: tmp(), git: () => '.git', now: NOW, env: {}, orca: forbiddenOrca(),
  });
  assert.match(noInbox.plan.join(' | '), /no registered inbox on this machine.*exit 3/s);
});

test('N5: a recipient cwd we cannot reach warns instead of quietly using the sender repo', async () => {
  const home = tmp();
  const removed = `${tmp()}/a-worktree-that-has-since-been-removed`;
  // The recipient registered a cwd that is not here any more. The note must still land - that is the
  // whole point of C9 - and the fallback must SAY where it went, which is what the old paneError branch
  // was careful to do and what this path quietly stopped doing.
  writeInbox(home, 'nucleus', claudeRecord({ cwd: removed }), { now: NOW });
  // ORCA_WORKTREE_ID is what the fallback reaches for first, so the ledger lands in a fixture rather
  // than in this checkout - a test must never write into the repo it is testing.
  const senderTree = tmp();
  const res = await runNoteSend(SEND_ARGS, {
    home, now: NOW, env: { ORCA_WORKTREE_ID: `wt::${senderTree}` }, git: () => '.git', orca: forbiddenOrca(),
    deliverToInbox: async () => ({ ok: true, delivered: true, reason: 'delivered' }),
  });
  assert.equal(res.delivered, true, 'the note still goes through');
  assert.equal(res.warnings.length, 1, `expected one warning, got ${JSON.stringify(res.warnings)}`);
  assert.match(res.warnings[0], /does not exist here/);
  assert.match(res.warnings[0], /this session's repo/);
  assert.match(res.warnings[0], /--recipient-repo/);
  assert.ok(res.ledgers.some((l) => l.startsWith(senderTree)), `ledgers: ${res.ledgers.join(', ')}`);
});

test('N5: a recipient that registered a real cwd is not warned about', async () => {
  const home = tmp();
  writeInbox(home, 'nucleus', claudeRecord({ cwd: home }), { now: NOW });
  const res = await runNoteSend(SEND_ARGS, {
    home, now: NOW, env: {}, git: () => '.git', orca: forbiddenOrca(),
    deliverToInbox: async () => ({ ok: true, delivered: true, reason: 'delivered' }),
  });
  assert.deepEqual(res.warnings, []);
  assert.ok(res.ledgers.some((l) => l.startsWith(home)));
});

test('N6: the budget line quotes the SMALLEST budget, not the first entry', async () => {
  const quotedFor = async (count) => {
    const home = tmp();
    writeInbox(home, 'astra', codexRecord(), { now: NOW });
    for (let i = 1; i <= count; i += 1) queued(home, { id: `astra-inbox-${i}`, to: 'astra', toSlug: 'astra' });
    let t = 0;
    await runNoteFlush(['--max-ms', '3000'], {
      home, now: NOW, env: {}, orca: forbiddenOrca(), clock: () => { t += 400; return t; },
    });
    const line = fs.readFileSync(flushLogPath(home), 'utf8').split('\n').find((l) => l.includes('budget-only-pass'));
    return Number(/ (\d+) ms left/.exec(line ?? '')?.[1]);
  };
  const one = await quotedFor(1);
  const three = await quotedFor(3);
  assert.ok(Number.isFinite(one) && Number.isFinite(three), `one=${one} three=${three}`);
  assert.ok(
    three < one,
    `with the clock running down, three entries must quote the tightest budget (${three}), not the first (${one})`,
  );
});
