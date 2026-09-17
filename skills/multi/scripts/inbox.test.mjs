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
  flushLogPath, INBOX_MODE, INBOX_GC_MS, INBOX_REFRESH_MS,
} from './transport.mjs';
import {
  inboxFrames, postToClaudeInbox, deliverToSlug as postToClaude, DEFAULT_POST_TIMEOUT_MS, STALE_CODES,
} from './inbox-claude.mjs';
import {
  resolveCodexCommand, queueToCodexInbox, deliverToSlug as queueToCodex, NO_THREAD_RE,
} from './inbox-codex.mjs';
import { runNoteFlush, deliverToInbox, formatFlush } from './note-flush.mjs';
import { runNoteSend } from './note-send.mjs';
import { NoteError } from './envelope.mjs';

function tmp() { return toPosix(fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-'))); }

const NOW = Date.UTC(2026, 8, 17, 22, 0);
const TOKEN = 'tok3n-that-must-never-be-printed';
const ENVELOPE = 'astra → taxonomy, 9.17.26 18:00 NYC [astra-inbox-1] FYI: delivered without a keystroke.';

const claudeRecord = (over = {}) => ({ kind: 'claude-socket', socket: '/tmp/cc-socks/4242.sock', token: TOKEN, pid: 4242, ...over });
const codexRecord = (over = {}) => ({ kind: 'codex-queue', codexHome: '/home/ben/.codex', threadId: '01a0b193-d533-7360-be08-b82b41f19b3d', ...over });

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
  assert.deepEqual(res.inbox, { kind: 'claude-socket', at: NOW, pid: 4242, socket: '/tmp/cc-socks/4242.sock' });
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
      tokenless: { kind: 'claude-socket', socket: '/tmp/x.sock' },
      socketless: { kind: 'claude-socket', token: TOKEN },
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
  assert.deepEqual(res.removed, { kind: 'claude-socket', at: NOW, pid: 4242, socket: '/tmp/cc-socks/4242.sock' });
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

test('D1: the env readers say exactly when a session has an inbox', () => {
  assert.equal(claudeInboxRecord({}), null);
  assert.equal(claudeInboxRecord({ CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/x.sock' }), null, 'a socket with no token is not usable on Windows');
  const rec = claudeInboxRecord(
    { CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/cc-socks/1.sock', CLAUDE_CODE_MESSAGING_TOKEN: TOKEN },
    { pid: 7, cwd: 'C:\\repo' },
  );
  assert.deepEqual(rec, { kind: 'claude-socket', socket: '/tmp/cc-socks/1.sock', token: TOKEN, pid: 7, cwd: 'C:/repo' });

  assert.equal(codexInboxRecord({}, { threadId: null }), null);
  assert.equal(codexInboxRecord({ CODEX_HOME: '/orca/home' }, { threadId: 'abc' }).codexHome, '/orca/home');
  assert.equal(codexInboxRecord({}, { threadId: 'abc', home: '/home/ben' }).codexHome, '/home/ben/.codex');

  assert.equal(sameInbox(claudeRecord(), claudeRecord({ at: 5, pid: 9 })), true);
  assert.equal(sameInbox(claudeRecord(), claudeRecord({ token: 'other' })), false);
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
  assert.equal('session_id' in JSON.parse(message), false, 'a session_id that does not match the receiver is DROPPED — never send one');
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
    assert.deepEqual(JSON.parse(lines[1]), { type: 'user', from: 'note-flush', message: { content: ENVELOPE } });
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

test('D3: a Codex recipient is dispatched to the queue client, with its own budget', async () => {
  const home = tmp();
  queued(home, { to: 'astra', toSlug: 'astra', agentIdentity: 'codex' });
  writeInbox(home, 'astra', codexRecord(), { now: NOW });
  const seen = [];
  const res = await runNoteFlush([], {
    home, now: NOW, env: {}, orca: forbiddenOrca(),
    deliverToInbox: async (_h, slug, _env, record, opts) => {
      seen.push({ slug, kind: record.kind, budgetMs: opts.budgetMs });
      return { ok: false, delivered: false, reason: 'codex-no-thread', detail: 'no rollout found for thread id 01a0' };
    },
  });
  assert.equal(seen[0].kind, 'codex-queue');
  assert.ok(seen[0].budgetMs > 0);
  assert.equal(res.results[0].outcome, 'codex-no-thread');
  assert.equal(readOutbox(home)[0].attempts, 1, 'a zero-turn thread IS an attempt: the CLI ran');
  assert.match(fs.readFileSync(flushLogPath(home), 'utf8'), /codex-no-thread .* — inbox \(codex-queue\): no rollout found/);
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

const SEND_ARGS = ['--from', 'taxonomy', '--to', 'nucleus', '--kind', 'FYI', '--topic', 'ping', '--text', 'Batch finished, 413 films'];
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
  assert.match(posts[0].envelope, /\[taxonomy-ping-1\] FYI: Batch finished, 413 films/);
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
