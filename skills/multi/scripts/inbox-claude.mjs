#!/usr/bin/env node
// inbox-claude — post one note into a Claude Code session's OWN inbox socket (spec 2026-09-17, D4).
//
// This is the delivery path that replaced typing. Claude Code binds a per-session Unix domain socket
// (macOS/Linux/WSL2) or named pipe (native Windows) and exports its path and a per-session token to
// that session's own hooks; the hook writes both into `~/.agents/notes/inboxes.json`, and this script
// opens the socket and writes the note. "When the receiving session is idle, Claude Code starts a new
// turn with the message" — so a peer wakes up without one synthesised keystroke, and Ben's half-typed
// prompt is never touched. Live-verified on Netcup 2026-09-17: a note posted while
// `this is ben typing a half-finished prom` sat in the receiver's composer arrived as its own turn and
// left that line exactly where it was, unsubmitted.
//
// THE WIRE FORMAT (read out of Claude Code 2.1.275's own `[uds-messaging]` handler, then confirmed
// live). One JSON object per line, in this order, on one connection:
//
//   {"type":"auth","token":"<CLAUDE_CODE_MESSAGING_TOKEN>"}
//   {"type":"user","from":"note-flush","message":{"content":"<the envelope line>"}}
//
//   · the message frame's type is `user`, and the text lives at `message.content`. A frame with a
//     missing or non-string `message.content` is dropped with a warning in the receiver's debug log.
//   · the auth line is OPTIONAL on macOS/Linux and REQUIRED on native Windows. We always send it.
//   · `session_id` IS sent, and it is load-bearing (review C6). The receiver drops any frame whose
//     `session_id` is not its own, so sending the id the registering session wrote down turns the one
//     misdelivery this design allows — a recycled pid re-creating `/tmp/cc-socks/<pid>.sock` for a
//     different session — into a silent drop instead of a turn started in the wrong session. The
//     registry is still keyed by slug; the id is the proof that the slug still means this session.
//   · nothing is written back. The connection is fire-and-forget and the only completion signal is the
//     write callback, which is why `timeoutMs` below is a write/connect bound, not a reply bound.
//   · the receiver closes a connection that has not sent a complete line within 30 s, so we open only
//     when the text is ready — and our own default ceiling is 5 s, never 30.
//
// A PREREQUISITE, not a nicety: the receiving session needs `crossSessionInbound: "accept"`. Without
// it, a session that bypasses permission prompts HOLDS the message behind a modal approval dialog in
// its pane (spiked 2026-09-17 — the token does not help, because on Linux own-child verification is by
// process ancestry and the flusher is nobody's child).
//
// THE TOKEN IS KEY MATERIAL. It is read from the registry, written to the socket, and never anywhere
// else: not into a log line, not into an error message, not into a returned object. Every result this
// module produces is token-free by construction.
//
// USAGE (debugging only; note-flush calls the function)
//   inbox-claude --to <slug> --text "<line>" [--from <name>] [--timeout-ms 5000] [--home <dir>] [--json]

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';

import { NoteError } from './envelope.mjs';
import { readInboxes, removeInbox, isMainModule, toPosix, appendFlushLog } from './transport.mjs';

/** Our own ceiling on a post. The receiver's first-line deadline is 30 s; we never go near it. */
export const DEFAULT_POST_TIMEOUT_MS = 5_000;
/** What the receiving session shows as the sender's name. */
export const DEFAULT_FROM = 'note-flush';

/**
 * `ENOENT` is an exited session — the socket file goes with the process (verified: the path is
 * `/tmp/cc-socks/<pid>.sock` on Linux and it is gone the moment the session ends). `ECONNREFUSED` is
 * the same thing with the file left behind. Either way the registration is garbage and must be dropped
 * rather than retried nineteen more times.
 */
export const STALE_CODES = new Set(['ENOENT', 'ECONNREFUSED', 'ENOTSOCK', 'ECONNRESET', 'EPIPE']);

/**
 * The two lines, ready to write. Exported so a test can assert the wire format without a socket.
 *
 * `JSON.stringify` is the only escaping involved, and it is enough: a note body cannot contain a raw
 * newline (the envelope grammar forbids it), and anything else it can contain is escaped by the
 * serialiser rather than pasted into a shell or a terminal.
 */
export function inboxFrames(token, text, from = DEFAULT_FROM, sessionId = undefined) {
  return [
    JSON.stringify({ type: 'auth', token: String(token) }),
    JSON.stringify({
      type: 'user',
      from: String(from),
      // C6: the receiver DROPS a frame whose `session_id` is not its own, which turns the one
      // misdelivery this design allows - a recycled pid behind a socket path recorded for a session that
      // has since exited - from "another session is interrupted with somebody else's note" into a silent
      // no-op the ledger already covers. Sent exactly when the registration carries one.
      ...(sessionId ? { session_id: String(sessionId) } : {}),
      message: { content: String(text) },
    }),
  ];
}

/**
 * Post `text` to one registered `claude-socket` inbox.
 *
 * Resolves — never rejects — with a token-free verdict:
 *   · `{ ok: true, delivered: true }`                      the bytes are on the socket
 *   · `{ ok: false, stale: true, reason: 'inbox-stale' }`   the session is gone; drop the registration
 *   · `{ ok: false, reason: 'inbox-error', detail }`        anything else; leave the note queued
 *   · `{ ok: false, reason: 'inbox-timeout', detail }`      connect/write did not finish in time
 *
 * There is no retry here, by design. A burst to one session is refused AT THE SENDER by Claude Code,
 * and a retry loop against a refusal is how a wake-up turns into a flood; the note is in the ledger
 * either way, so the entry simply stays queued for the next drain.
 */
export function postToClaudeInbox(record, text, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? DEFAULT_POST_TIMEOUT_MS);
  const connect = opts.connect ?? ((path_) => net.connect(path_));
  const from = opts.from ?? DEFAULT_FROM;

  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (verdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.destroy(); } catch { /* already gone */ }
      resolve(verdict);
    };
    const timer = setTimeout(
      () => finish({ ok: false, delivered: false, stale: false, reason: 'inbox-timeout', detail: `no write completion within ${timeoutMs} ms` }),
      Math.max(1, timeoutMs),
    );
    timer.unref?.();

    try {
      socket = connect(record.socket);
    } catch (err) {
      // A synchronous throw from connect (a malformed pipe name on Windows) is the same class of
      // failure as ENOENT: there is nothing listening at that address.
      finish({ ok: false, delivered: false, stale: true, reason: 'inbox-stale', detail: errorDetail(err) });
      return;
    }

    socket.on('error', (err) => {
      const code = String(err?.code ?? '');
      finish(STALE_CODES.has(code)
        ? { ok: false, delivered: false, stale: true, reason: 'inbox-stale', detail: errorDetail(err) }
        : { ok: false, delivered: false, stale: false, reason: 'inbox-error', detail: errorDetail(err) });
    });

    const write = () => {
      // Both lines in one write: verified live, and it means the receiver's 30-second first-line
      // deadline can never be a factor — the complete auth line is in the same buffer as the message.
      const payload = `${inboxFrames(record.token, text, from, record.sessionId).join('\n')}\n`;
      socket.write(payload, (err) => {
        if (err) {
          finish({ ok: false, delivered: false, stale: STALE_CODES.has(String(err?.code ?? '')), reason: 'inbox-error', detail: errorDetail(err) });
          return;
        }
        try { socket.end(); } catch { /* the bytes are already out */ }
        finish({ ok: true, delivered: true, stale: false, reason: 'delivered', bytes: Buffer.byteLength(payload) });
      });
    };

    if (typeof socket.once === 'function') socket.once('connect', write);
    else write();
  });
}

/**
 * The message an error may contribute to a log line: its code and its message, with anything that looks
 * like the token scrubbed by construction — we never interpolate the record, only the error.
 */
function errorDetail(err) {
  const code = err?.code ? `${err.code} ` : '';
  return `${code}${String(err?.message ?? err ?? 'unknown error').split('\n')[0]}`.slice(0, 200);
}

/**
 * Deliver to the inbox registered for `slug`, looking it up in the registry and dropping a stale
 * registration as a side effect.
 *
 * @returns {Promise<{ok: boolean, delivered: boolean, reason: string, detail?: string, kind?: string}>}
 */
export async function deliverToSlug(home, slug, text, opts = {}) {
  const fsImpl = opts.fsImpl ?? fs;
  const record = (opts.inboxes ?? readInboxes(home, fsImpl))[String(slug)];
  if (!record) return { ok: false, delivered: false, reason: 'no-inbox', detail: `nothing registered for ${slug}` };
  if (record.kind !== 'claude-socket') {
    return { ok: false, delivered: false, reason: 'inbox-error', detail: `${slug} is registered as ${record.kind}, not claude-socket` };
  }
  // C7: a registration stamped with another machine's hostname describes a socket path that means
  // something DIFFERENT here - the honest answer for a restored backup or a synced profile is that this
  // machine has no inbox for that slug, and the entry goes rather than being dialled.
  const host = opts.hostname ?? os.hostname();
  if (record.host && record.host !== host) {
    forget(home, slug, opts, fsImpl);
    return {
      ok: false, delivered: false, reason: 'no-inbox',
      detail: `${slug} is registered on "${record.host}", not "${host}" - registration dropped`,
    };
  }
  const verdict = await postToClaudeInbox(record, text, opts);
  if (verdict.stale && !opts.keepStale) forget(home, slug, opts, fsImpl);
  return { ...verdict, kind: 'claude-socket' };
}

/**
 * Drop a registration from the file AND from the caller's in-memory map (review C12). Without the
 * second half a drain holding N notes for one dead session pays a connect and rewrites the registry N
 * times, having already learnt on the first that there is nothing there.
 */
function forget(home, slug, opts, fsImpl) {
  removeInbox(home, slug, { fs: fsImpl });
  if (opts.inboxes) delete opts.inboxes[String(slug)];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const STRING_FLAGS = new Set(['to', 'text', 'from', 'timeout-ms', 'home']);
const BOOL_FLAGS = new Set(['json', 'help']);

export function parseInboxArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new NoteError(1, `unexpected argument "${a}"`);
    const name = a.slice(2);
    if (BOOL_FLAGS.has(name)) { out[name] = true; continue; }
    if (!STRING_FLAGS.has(name)) throw new NoteError(1, `unknown flag --${name}`);
    const value = argv[++i];
    if (value === undefined) throw new NoteError(1, `--${name} needs a value`);
    out[name] = value;
  }
  return out;
}

const USAGE = `inbox-claude — post one line into a Claude Code session's own inbox socket.

  inbox-claude --to <slug> --text "<line>" [--from <name>] [--timeout-ms 5000] [--home <dir>] [--json]

The socket and its per-session token come from ~/.agents/notes/inboxes.json, which that session's own
hook wrote. The token is never printed. note-flush calls this code in-process; the CLI is for debugging.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) { process.stdout.write(USAGE); return 0; }
  const args = parseInboxArgs(argv);
  const home = toPosix(args.home ?? os.homedir());
  if (!args.to || !args.text) { process.stdout.write(USAGE); return 1; }
  const result = await deliverToSlug(home, args.to, args.text, {
    from: args.from,
    ...(args['timeout-ms'] === undefined ? {} : { timeoutMs: Number(args['timeout-ms']) }),
  });
  // Token-free by construction: `result` carries only a verdict, a reason and an error detail.
  process.stdout.write(args.json ? `${JSON.stringify(result)}\n` : `inbox-claude: ${result.reason}${result.detail ? ` — ${result.detail}` : ''}\n`);
  appendFlushLog(home, `${new Date().toISOString()} inbox-claude ${args.to} ${result.reason}`);
  return result.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) process.exitCode = await main();
