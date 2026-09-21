#!/usr/bin/env node
// note-send — PINNED CLI CONTRACT v4 (2026-09-13, after the pilot). The v3 interface is unchanged; v4
// adds `--no-type`, a 15-second default wait, the outbox, and the Codex rules the pilot forced.
//
// Compose one peer-note envelope (see ../references/envelope.md), write it to the ledger(s) — which IS
// the channel the recipient reads — then try to type it into the recipient's Orca pane as a wake-up.
// Typing is best-effort. Deferral is normal and cheap; a sender that waits is the bug.
//
// USAGE
//   note-send --from <slug> --to <slug|term_handle> --kind ASK|ACK|RESULT|BLOCKED|FYI --topic <slug> --text "<substance>"
//             [--n <int>] [--re <parent-id>] [--supersedes <id>] [--goal "<why>"] [--details <path>]
//             [--needs decision|review|ack|none] [--by "<time>"] [--recipient-repo <dir>] [--sender-repo <dir>]
//             [--packet-file <path|->] [--force] [--tz NYC] [--orca <cmd>] [--wait-max <seconds>=15]
//             [--no-type] [--no-drain] [--dry-run] [--json]
//
//   --packet-file writes the detail packet to <recipient-repo>/docs/notes/<id>.md BEFORE the ledger line (stdin when `-`);
//   an existing packet is never overwritten without --force. Cross-host notes: run note-send on the recipient's host
//   over ssh (see envelope.md transport step 7); there is no <host>: Details form.
//
//   The id is derived: <from>-<topic>-<n>; --n defaults to (highest n already in the ledgers for that prefix) + 1.
//   Text for any field is passed as an argv value and forwarded to `orca` with execFile(argv[]) — never through a
//   shell string, so quotes, `$` and backticks in the substance are safe.
//
// BEHAVIOUR (in this order)
//   1. Validate: id lowercase (exit 1 with the lowercase form suggested); kind/needs pairing (only ASK may carry
//      decision/review/ack); Details path format (see envelope.md); no \n \r \t or reserved words in any field;
//      whole line ≤ 700 chars. Build the envelope; it must match the pinned regex (exit 1 otherwise). A validation
//      failure prints the `ok:false` JSON on STDOUT and one line on stderr — never silence, even piped.
//   2. Drain the outbox first (~3 s, best effort): a pane that has since gone idle gets its backlog before this
//      note, so wake-ups arrive in send order.
//   3. Resolve the recipient pane (`<orca> terminal list --json`): slug match on title with leading glyphs and
//      whitespace stripped, case-insensitive, or a raw `term_…` handle. Ambiguous → exit 2 listing every candidate
//      handle+title; not found → exit 2 listing the panes that exist. Reserved `--to ben`: skip delivery, write
//      ledger + packet, append to ~/.agents/notes/ben-inbox.md when Ben must act, exit 0 notified:true.
//   4. Decide where files go. Recipient repo = the pane's `worktreePath` main checkout (`git rev-parse
//      --git-common-dir`), unless --recipient-repo overrides; empty worktreePath → require --recipient-repo (exit 1).
//      If the pane's `executionHostId` is not the local runtime and --recipient-repo was passed: exit 5.
//   5. Ledger first: append the line to <repo>/docs/ledger/<YYYY-MM-DD>.md (mkdir -p) in the recipient repo and,
//      when --sender-repo differs, in the sender repo; always also to ~/.agents/notes/<YYYY-MM-DD>.md. Then
//      classify the pane from `terminal show` + the tail of `terminal read` into
//      agent-idle | agent-working | permission | shell | hibernated | unknown.
//   5b. INBOX FIRST (spec 2026-09-17). If the recipient has registered an inbox on this machine
//      (`~/.agents/notes/inboxes.json`), the envelope is posted straight into it — a Claude session's
//      messaging socket, a Codex session's queue — and no pane is touched at all. That is exit 0,
//      delivered, with no keystroke anywhere near anybody's composer.
//   5c. NO INBOX → deferred (exit 3, queued) — because TYPING IS OFF unless `MULTI_ALLOW_TYPING=1`.
//      Steps 6 and 7 below are that last resort, kept for machines whose peers predate the
//      registering hooks. Default: nothing is ever typed. (On 2026-09-17 the typed path landed a note
//      inside a sentence Ben was mid-way through writing and submitted it.)
//   6. Gate: Claude panes send on agent-idle or agent-working (Claude Code queues typed input mid-turn).
//      CODEX PANES SEND ON agent-idle ONLY — the pilot proved Codex does not queue, and that
//      `terminal wait --for tui-idle` never resolves for a Codex pane, so that wait is GONE. `permission` →
//      poll up to --wait-max (default 15 s), then defer. shell / hibernated / unknown → defer, never type.
//      Every deferral writes `~/.agents/notes/outbox/<id>.json` and exits 3; note-flush retries it.
//   7. Two-phase delivery: `terminal send --text <line>` (NO --enter); re-read; if the line is visible and the
//      classification is unchanged, `terminal send --enter`. State changed between reads → do NOT press Enter.
//   8. Output: one human line by default; with --json exactly one object
//      { ok, exitCode, envelope, id, to, handle, classification, delivered, deferred, queued, notified,
//        ledgers: [paths], packetPath, outbox, error }.
//
// ORCA COMMAND RESOLUTION
//   --orca <cmd>  >  $ORCA_CLI  >  "orca" on PATH. Hetzner needs ~/.local/bin/orca-native-fixed; Windows may pass
//   "node C:/Users/benzh/.local/share/orca-fork-cli/out/cli/index.js" (split on whitespace; first token is the
//   executable). Node ≥ 20, zero npm dependencies; macOS, Linux, Windows (Git Bash or cmd).
//
// EXIT CODES: 0 delivered, queued, or notified · 1 bad arguments/envelope · 2 pane not found or ambiguous ·
//             3 deferred (queued in the outbox, NOT typed) · 4 orca CLI error · 5 cross-host misuse
//
// NEVER: print or log token material; use orca orchestration commands; press Enter into a pane whose state you
//        did not just verify; pick one of several matching panes; wait minutes for a peer.
//
// The grammar lives in ./envelope.mjs and the shared transport in ./transport.mjs; both are re-exported here,
// so every symbol this file used to define is still importable from it.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  NoteError, RESERVED_RECIPIENT, DEFAULT_ZONE, DEFAULT_TZ_LABEL, LEDGER_ONLY_KINDS,
  assertFieldSafe, validateSlug, validateId, validateDetails, validateKindNeeds,
  buildEnvelope, nextCounter, timeParts, suggestSlug,
} from './envelope.mjs';

import {
  HANDLE_RE, toPosix, gitRunner, mainCheckout, makeOrcaRunner,
  classifyPane, isSendable, twoPhaseSend, showPane, readPane,
  resolvePane, isLocalPane, titleToSlug, readBindings,
  ledgerPath, notesMirrorPath, packetPathFor, appendLine, writePacket, readIfExists, readLedgerCorpus,
  writeOutboxEntry, benInboxPath, notesDir, isMainModule, worktreePathFromEnv,
  readInboxes, wakeAllKindsPath, noUnknownCheckPath, isUnknownRecipient, knownSlugs, recentMirrorTexts,
  killSwitchActive, withoutIds, undeliveredIds,
} from './transport.mjs';

import { drainQuietly, deliverToInbox } from './note-flush.mjs';

export * from './envelope.mjs';
export * from './transport.mjs';

/** v4: a sender never blocks for minutes. 15 s is one permission-poll cycle, not a wait. */
export const DEFAULT_WAIT_MAX_SECONDS = 15;
/** The piggyback drain at the start of a send. Bounded hard: this is someone else's backlog. */
export const DRAIN_BUDGET_MS = 3_000;
/**
 * C11: how long an interactive send may spend posting into a recipient's inbox.
 *
 * A socket write is milliseconds; `codex queue` spins up an app-server and can take seconds, and its
 * own default ceiling is 20 s - longer than the 15 s note-send advertises for the whole call. This is
 * the ceiling that keeps the promise. Below the drain's per-transport floor nothing is even started.
 */
export const SEND_INBOX_BUDGET_MS = 8_000;
const PERMISSION_POLL_MS = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

const STRING_FLAGS = new Set([
  'from', 'to', 'kind', 'topic', 'text', 'n', 're', 'supersedes', 'goal', 'details',
  'needs', 'by', 'recipient-repo', 'sender-repo', 'packet-file', 'tz', 'orca', 'wait-max', 'id',
]);
const BOOL_FLAGS = new Set(['dry-run', 'json', 'force', 'help', 'no-type', 'no-drain']);

export function parseArgs(argv) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function uniq(a) { return [...new Set(a)]; }

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

async function classifyNowWith(orca, handle, deps) {
  if (deps.classify) return deps.classify(handle);
  const show = await showPane(orca, handle);
  const read = await readPane(orca, handle);
  return classifyPane(show, read, { now: Date.now() });
}

function deferMessage(classification, pane, envelope, ledgers, agentIdentity) {
  const why = {
    permission: 'it is sitting at a permission/approval prompt — typing there could approve it',
    shell: 'it is a plain shell with no agent — a note typed there would EXECUTE',
    hibernated: 'its agent appears gone (no output and no composer) — bytes would land in a PTY nobody reads',
    unknown: 'its state could not be read — a deferred note is cheap, an approved dialog is not',
    'agent-working': String(agentIdentity).toLowerCase() === 'codex'
      ? 'it is a Codex pane mid-turn, and Codex does not queue typed input (pilot, 9.13.26)'
      : 'it is mid-turn',
  }[classification] ?? classification;
  return `NOT typed into ${pane.handle} ("${pane.title}"): ${why}. `
    + `The note IS in the ledger (${ledgers[0]}) — that is where the recipient reads it — and the wake-up is queued `
    + 'in the outbox for note-flush to retry. Do NOT re-send this id.\n'
    + envelope;
}

/**
 * What the LEDGER LINE says the recipient is. For `--to <slug>` that is the slug; for a raw handle it
 * has to be derived, and the pane's binding is the only first-hand source — `titleToSlug` on a Codex
 * pane titled `Continue | bto-workflows` files the note as addressed to `continue`, which no
 * note-inbox ever reads (review MAJOR 2). Both ambiguity errors tell people to re-send with a handle,
 * so this path is exactly where a retitled pane sends them.
 */
function recipientSlug(pane, raw, bindings = {}) {
  if (!HANDLE_RE.test(raw)) return raw;
  return bindings[pane?.handle]?.slug ?? titleToSlug(pane?.title) ?? 'peer';
}

/** Spec V7: one file Ben reads for everything waiting on him. */
export function appendBenInbox(home, envelope, packetPath, fsImpl = fs) {
  const file = benInboxPath(home);
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fsImpl.writeFileSync(file, '# Ben\'s inbox — peer notes that need Ben\n\nAppended by note-send. Delete a line when it is handled.\n\n', { flag: 'wx' });
    } catch { /* already there */ }
    fsImpl.appendFileSync(file, `- ${envelope}${packetPath ? `\n  packet: ${packetPath}` : ''}\n`, 'utf8');
  } catch { /* never fail a send because a convenience file could not be written */ }
  return file;
}

/** BLOCKED to ben always; a decision only Ben can make also belongs in the one file he reads. */
export function needsBen(kind, to, needs) {
  if (String(to).toLowerCase() !== RESERVED_RECIPIENT) return false;
  return kind === 'BLOCKED' || needs === 'decision';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} argv
 * @param {object} deps - { orca, fsImpl, git, now, home, env, sleep, stdin, flush } — injectable for tests.
 */
export async function runNoteSend(argv, deps = {}) {
  const args = parseArgs(argv);
  const fsImpl = deps.fsImpl ?? fs;
  const env = deps.env ?? process.env;
  const home = toPosix(deps.home ?? os.homedir());
  const nap = deps.sleep ?? defaultSleep;
  const git = deps.git ?? gitRunner;
  const now = deps.now ? new Date(deps.now) : new Date();
  const dryRun = Boolean(args['dry-run']);
  const noType = Boolean(args['no-type']);
  const force = Boolean(args.force);

  for (const r of ['from', 'to', 'kind', 'topic', 'text']) {
    if (!args[r]) throw new NoteError(1, `--${r} is required`);
  }

  const from = validateSlug('from', args.from);
  const topic = validateSlug('topic', args.topic);
  const kind = String(args.kind).toUpperCase();
  const tz = args.tz ? String(args.tz) : DEFAULT_TZ_LABEL;
  const { date, time, ymd } = timeParts(now, env.NOTE_SEND_ZONE || DEFAULT_ZONE);
  const toRaw = String(args.to);
  const isBen = toRaw.toLowerCase() === RESERVED_RECIPIENT;
  const senderHost = env.ORCA_SENDER_HOST || '';

  // N1 (spec 2026-09-20): ACK and FYI are ledger-only for everyone except ben — "unchanged for every
  // kind" there. No wake-up is created: no outbox entry, no inbox post, and (for a slug recipient) no
  // pane resolution at all. `~/.agents/notes/wake-all-kinds` restores the old behaviour.
  const wakeAllKinds = killSwitchActive(fsImpl, wakeAllKindsPath(home));
  const quietKind = !isBen && LEDGER_ONLY_KINDS.has(kind) && !wakeAllKinds;
  // A raw `term_…` handle carries no slug of its own — only the pane it names does — so a quiet kind
  // addressed BY HANDLE still has to resolve the pane once to learn what to write in the ledger. Only a
  // slug recipient can skip pane resolution outright.
  const quietSkipsResolution = quietKind && !HANDLE_RE.test(toRaw);

  // Step 1 of the contract: every check that does not need a pane runs BEFORE we touch orca,
  // so a typo never costs a terminal round-trip and never half-resolves a recipient.
  if (args['wait-max'] !== undefined && !/^\d+$/.test(String(args['wait-max']))) {
    throw new NoteError(1, `--wait-max must be a whole number of seconds (got "${args['wait-max']}")`);
  }
  const waitMaxMs = Math.max(0, Number(args['wait-max'] ?? DEFAULT_WAIT_MAX_SECONDS) * 1000);
  if (args.n !== undefined && !/^\d+$/.test(String(args.n))) {
    throw new NoteError(1, `--n must be a positive integer (got "${args.n}")`);
  }
  if (!isBen && !HANDLE_RE.test(toRaw)) validateSlug('to', toRaw);
  validateKindNeeds(kind, args.needs);
  if (args.details) validateDetails(args.details);
  for (const [name, value] of [['text', args.text], ['goal', args.goal], ['by', args.by]]) {
    assertFieldSafe(name, value);
  }
  if (args.re) validateId('re', args.re);
  if (args.supersedes) validateId('supersedes', args.supersedes);

  const senderRepo = args['sender-repo'] ? mainCheckout(args['sender-repo'], git) : null;
  const plan = [];
  const warnings = [];

  // C9: the registry is one small JSON read and a registered inbox makes the pane irrelevant, so it is
  // read BEFORE the pane is resolved. That removes the `terminal list` call from the happy path and,
  // more importantly, removes three ways a note could fail for a reason that no longer matters: a pane
  // that resolves to another host (exit 5), a pane with no worktreePath (exit 1), and a pane whose name
  // nobody updated (exit 2).
  //
  // C5: only a slug we were GIVEN may address an inbox. `--to <term_handle>` reduces to a slug by
  // GUESSING at the pane's title, and the 0.4.0 rule says a guess must never pick a recipient - on the
  // write side that rule was already enforced, and this is the read side. A handle target therefore
  // keeps the pane path, where "the right pane under a wrong label" is the worst case; posting a guessed
  // slug into whatever OTHER session registered it would start a turn in the wrong conversation.
  const slugWasGiven = !isBen && !HANDLE_RE.test(toRaw);
  // N4: `--dry-run` reads it too. It is a read, and a preview that cannot see the inbox describes the
  // 0.4.2 world - a pane classification and a two-phase keystroke sequence - for a send that would in
  // fact post into a socket and touch no pane at all.
  const inboxRecord = (!isBen && !noType && slugWasGiven)
    ? (readInboxes(home, fsImpl)[toRaw] ?? null)
    : null;

  // ── 2/3. Drain the backlog, then resolve the pane. In --dry-run we never touch orca at all.
  let pane = null;
  let bindings = {};
  let terminals = [];
  let orca = null;
  let drained = null;
  let paneError = null;
  if (isBen) {
    plan.push('"ben" is a reserved recipient: no pane is resolved; the line is recorded and printed');
  } else if (quietSkipsResolution) {
    // N1: no wake-up for this kind — no outbox entry, no inbox post, and (the whole point of this
    // branch) no pane resolution at all. The ledger write below is exactly what any other kind gets.
    plan.push(`${kind} is ledger-only: written to the ledger, no wake-up is created `
      + '(no outbox entry, no inbox post, no pane resolution)');
  } else if (dryRun) {
    // review NIT14: a handle-addressed quiet kind reaches this branch (quietSkipsResolution is false for
    // a handle), but the exit-0/no-wake-up plan line below is the true one for it — printing this exit-3
    // plan too was self-contradictory.
    if (!quietKind) {
      plan.push(inboxRecord
        ? `post the envelope into "${toRaw}"'s registered inbox (${inboxRecord.kind}): no pane is resolved, `
          + 'nothing is typed, and no orca call is made (skipped: --dry-run)'
        : `"${toRaw}" has no registered inbox on this machine, so this would record the note, queue the `
          + 'wake-up and exit 3 - typing is off unless MULTI_ALLOW_TYPING=1 (skipped: --dry-run)');
    }
  } else if (noType) {
    plan.push('--no-type: the envelope is recorded and queued; nothing is typed and no pane is resolved');
  } else if (inboxRecord) {
    // C9: a registered inbox needs no pane, no title match and no orca call. The piggyback drain still
    // runs - it delivers other people's backlog through their inboxes too, and it spawns nothing when
    // every recipient has one.
    plan.push(`"${toRaw}" has a registered inbox (${inboxRecord.kind}): no pane is resolved and nothing is typed`);
    if (!args['no-drain']) {
      const flush = deps.flush ?? drainQuietly;
      drained = await flush({ fsImpl, home, env, now: now.getTime() }, { maxMs: DRAIN_BUDGET_MS });
    }
  } else {
    orca = deps.orca ?? makeOrcaRunner(args.orca, env);
    if (!args['no-drain']) {
      const flush = deps.flush ?? drainQuietly;
      drained = await flush({ fsImpl, home, env, orca, now: now.getTime() }, { maxMs: DRAIN_BUDGET_MS });
    }
    // H3: a pane-NAME problem must never cost the note. The ledger is the channel and the pane is only
    // a wake-up, so an exit 2 is carried past the ledger write and thrown after it — with the record,
    // and the outbox entry, already on disk. The pilot's real failures were exactly this shape: a pane
    // renamed mid-flight, an ambiguous title, Orca's status tag.
    try {
      // The bindings make `--to astra` work against a pane whose title is no longer its slug — a Codex
      // pane retitled `Continue` by a restart. Resolution order is unchanged otherwise: handle, then
      // exact title, then the binding (spec 2026-09-14 D3).
      bindings = readBindings(home, fsImpl);
      terminals = (await orca(['terminal', 'list', '--json']))?.terminals ?? [];
      pane = resolvePane(terminals, toRaw, { bindings });
    } catch (err) {
      if (!(err instanceof NoteError) || err.exitCode !== 2) throw err;
      // A raw `term_…` handle that resolves to nothing is the one case we cannot record: without a pane
      // there is no slug, and a ledger line addressed to "peer" is invisible to every note-inbox.
      if (HANDLE_RE.test(toRaw)) {
        throw new NoteError(2, `${err.message}\n\nNothing was recorded: a handle names no slug, so the note would `
          + 'have no readable recipient. Re-send with --to <slug> and the ledger keeps it even if the pane is gone.');
      }
      paneError = err;
    }
  }

  // ── 4. Where the files go. v3: the packet ALWAYS lives in the recipient's repo.
  const local = isBen ? true : isLocalPane(pane, senderHost);
  if (pane && !local && args['recipient-repo']) {
    throw new NoteError(
      5,
      `pane ${pane.handle} runs on host "${pane.executionHostId}", not this runtime — --recipient-repo cannot reach it. ` +
      `Send from that host instead, quoting the whole remote command as one argument: ` +
      `ssh <host> '~/.local/bin/note-send --from ${from} --to ${toRaw} … --packet-file -' < packet.md`,
    );
  }

  let targetRepo;
  if (isBen) {
    targetRepo = senderRepo ?? mainCheckout(process.cwd(), git);
    if (!targetRepo) throw new NoteError(1, '--to ben needs --sender-repo (or run inside a repo) so the note has a home');
  } else if (args['recipient-repo']) {
    targetRepo = mainCheckout(args['recipient-repo'], git);
  } else if (pane) {
    if (!pane.worktreePath) {
      throw new NoteError(1, `pane ${pane.handle} ("${pane.title}") has no worktreePath (floating pane) — pass --recipient-repo`);
    }
    targetRepo = mainCheckout(pane.worktreePath, git);
  } else if (inboxRecord) {
    // The registering session recorded its own cwd, which IS the recipient's working tree - a better
    // answer than this session's repo, and available without resolving a pane. Fall back the same way
    // the paneError branch does when it is missing or not a checkout.
    // N5: the fallback must never be silent. `mainCheckout` returns null for a cwd that is not a
    // checkout at all - a session started in a scratch directory, a worktree since removed - and the
    // note then goes to the SENDER's repo, which is exactly what the old paneError branch was careful
    // to say out loud. So the warning keys on what we actually used, not on whether a cwd was recorded.
    // `mainCheckout` answers "write where you were told" for a directory that is not a checkout, and
    // only a path that does not EXIST here is a real dead end - a worktree the recipient has since
    // removed, or a cwd from another machine. Both are the fallback; neither may be silent.
    const recipientRepo = inboxRecord.cwd && fsImpl.existsSync(inboxRecord.cwd)
      ? mainCheckout(inboxRecord.cwd, git)
      : null;
    targetRepo = recipientRepo ?? mainCheckout(worktreePathFromEnv(env) ?? process.cwd(), git);
    if (!targetRepo) {
      throw new NoteError(1, `"${toRaw}" has a registered inbox but no repo could be resolved to record the note in - pass --recipient-repo`);
    }
    if (!recipientRepo) {
      warnings.push(
        `"${toRaw}" registered ${inboxRecord.cwd ? `cwd ${inboxRecord.cwd}, which does not exist here` : 'no cwd'}, `
        + `so the ledger line went to ${targetRepo} (this session's repo), not the recipient's. The `
        + '~/.agents/notes mirror is what note-inbox reads, so the note still arrives; pass '
        + '--recipient-repo to put the repo copy where you want it.',
      );
    }
  } else if (paneError) {
    // H3, orchestrator ruling: no pane, so no recipient repo — fall back to this pane's own worktree
    // (ORCA_WORKTREE_ID), then the cwd's main checkout. The `~/.agents/notes` mirror is the record that
    // actually matters here, because every note-inbox reads it; the repo ledger is a bonus.
    targetRepo = mainCheckout(worktreePathFromEnv(env) ?? process.cwd(), git);
    if (!targetRepo) throw new NoteError(2, `${paneError.message}\n\nAnd no repo could be resolved to record it in.`);
    warnings.push(
      `pane "${toRaw}" did not resolve, so the ledger line went to ${targetRepo} (this session's repo), `
      + 'not the recipient\'s. The ~/.agents/notes mirror is what note-inbox reads.',
    );
  } else if (quietSkipsResolution) {
    // N1: no pane was ever resolved for a ledger-only kind addressed by slug, so there is nothing to
    // derive a repo from beyond this pane's own worktree — same fallback the paneError branch uses.
    targetRepo = mainCheckout(worktreePathFromEnv(env) ?? process.cwd(), git);
    if (!targetRepo) {
      throw new NoteError(1, `${kind} is ledger-only and resolves no pane — pass --recipient-repo so the note has a home`);
    }
    // review MINOR 7: the paneError branch below says this out loud; this branch did not, so the repo-side
    // ledger line (and any packet) landing in the SENDER's repo instead of the recipient's went unremarked.
    warnings.push(
      `${kind} is ledger-only, so no pane was resolved and the ledger line (and any packet) went to `
      + `${targetRepo} (this session's repo), not the recipient's. The ~/.agents/notes mirror is what `
      + 'note-inbox reads.',
    );
  } else if (noType) {
    throw new NoteError(1, '--no-type needs --recipient-repo: no pane is resolved, so nothing says where the note lives');
  } else {
    throw new NoteError(1, '--dry-run without --recipient-repo cannot decide where the note would live; pass --recipient-repo');
  }

  // A repo we cannot see is a repo we must not pretend to write to. For a pane on another host that is
  // exactly the cross-host misuse the contract names; locally it is a bad --recipient-repo.
  if (!dryRun && !fsImpl.existsSync(targetRepo)) {
    if (!local) {
      throw new NoteError(
        5,
        `pane ${pane.handle} works in "${targetRepo}" on host "${pane.executionHostId}", which does not exist here. ` +
        `Run note-send on that host, quoting the whole remote command as one argument: ` +
        `ssh <host> '~/.local/bin/note-send --from ${from} --to ${toRaw} … --packet-file -' < packet.md`,
      );
    }
    throw new NoteError(1, `recipient repo "${targetRepo}" does not exist`);
  }

  const details = args.details ? validateDetails(args.details) : undefined;

  // ── Id, derived from every ledger we can see.
  const ledgerDirs = [
    path.posix.join(toPosix(targetRepo), 'docs/ledger'),
    senderRepo ? path.posix.join(toPosix(senderRepo), 'docs/ledger') : null,
    notesDir(home),
  ].filter(Boolean);
  const prefix = `${from}-${topic}`;
  const n = args.n !== undefined ? Number(args.n) : nextCounter(readLedgerCorpus(ledgerDirs, fsImpl), prefix);
  if (!Number.isInteger(n) || n < 1) throw new NoteError(1, `--n must be a positive integer (got "${args.n}")`);
  const id = args.id ? validateId('id', args.id) : `${prefix}-${n}`;

  const toSlug = isBen ? RESERVED_RECIPIENT : recipientSlug(pane, toRaw, bindings);
  const envelope = buildEnvelope({
    from, to: toSlug, date, time, tz, id,
    re: args.re, supersedes: args.supersedes, kind, body: args.text, goal: args.goal, details,
    needs: args.needs, by: args.by,
  });

  const packetPath = args['packet-file'] !== undefined ? packetPathFor(targetRepo, id) : null;
  const ledgerTargets = uniq([
    ledgerPath(targetRepo, ymd),
    senderRepo && senderRepo !== targetRepo ? ledgerPath(senderRepo, ymd) : null,
    notesMirrorPath(home, ymd),
  ].filter(Boolean));

  if (packetPath && paneError) {
    warnings.push(`the packet was written to ${packetPath} — this session's repo, not the recipient's, because the pane did not resolve. Details: may not resolve for the reader.`);
  }
  if (details && !packetPath && !dryRun && !fsImpl.existsSync(path.posix.join(toPosix(targetRepo), details))) {
    warnings.push(`Details points at ${details}, which does not exist in ${targetRepo} — write it, or pass --packet-file`);
  }

  if (dryRun) {
    if (packetPath) {
      plan.push(`write packet ${packetPath} from ${args['packet-file'] === '-' ? 'stdin' : args['packet-file']}${force ? ' (--force: overwrites an existing packet)' : ' (refuses to overwrite)'}`);
    }
    for (const t of ledgerTargets) plan.push(`append envelope to ${t}`);
    if (quietKind) {
      // N1: "--dry-run says the same" — no pane-resolution plan for a ledger-only kind.
      plan.push(`exit 0: delivered:false, wake:none (${kind} is ledger-only)`);
    } else if (!isBen && inboxRecord) {
      // N4: this is what a real send would do, so it is what the preview says.
      plan.push('drain ~/.agents/notes/outbox first (3 s budget)');
      plan.push(`post the envelope into ${toRaw}'s inbox and exit 0 - no terminal list, show, read or send`);
    } else if (!isBen) {
      plan.push('drain ~/.agents/notes/outbox first (3 s budget)');
      plan.push('no registered inbox: record the note, queue the wake-up, exit 3');
      plan.push('classify pane via `terminal show` + `terminal read` (the LAST-RESORT typed path, reachable '
        + 'only with MULTI_ALLOW_TYPING=1); Claude sends idle or working, Codex idle only');
      plan.push('two-phase: baseline read, `terminal send --text <envelope>` (no --enter), re-read, then '
        + '`terminal send --enter` - last resort only; a recipient with a registered inbox is posted to instead');
    }
    return {
      ok: true, exitCode: 0, envelope, id, to: toRaw, handle: null,
      classification: isBen ? 'n/a (ben)' : (quietKind ? 'ledger-only (quiet kind)' : 'not-checked (--dry-run)'),
      delivered: false, deferred: false, queued: false, notified: false, dryRun: true,
      ledgers: ledgerTargets, packetPath, outbox: null, plan, warnings, error: null,
      ...(quietKind ? { wake: 'none', reason: 'ledger-only kind' } : {}),
    };
  }

  // ── 5. Packet BEFORE the ledger line; ledger BEFORE any delivery attempt.
  let packetWritten = false;
  if (packetPath) {
    const source = String(args['packet-file']);
    const content = source === '-' ? (deps.stdin ?? readStdin()) : readIfExists(path.resolve(source), fsImpl);
    if (!content.trim()) {
      throw new NoteError(1, `--packet-file ${source} is empty or unreadable; a packet with no body is worse than none`);
    }
    const res = writePacket(packetPath, content, { force, fsImpl });
    if (res.skipped) {
      throw new NoteError(1, `packet ${packetPath} already exists; pass --force to overwrite it (the recipient may have annotated it)`);
    }
    packetWritten = res.written;
  }

  // N2: snapshot the mirror BEFORE this send's own line lands in it — otherwise the line we are about to
  // write (which necessarily names `toRaw`) would make every recipient look "known" by definition. Read
  // for every kind, including a quiet one (review MINOR 8): three of N2's four "known" signals need no
  // orca, so a quiet kind can still get a warning about an unrecognized recipient even though it never
  // creates a wake-up. Wrapped (review MINOR 6): this sits between "the note is decided" and "the note
  // is on disk" — a read that cannot even throw with the real fs must never cost the ledger write next.
  const mirrorTextsBeforeSend = (() => {
    try { return recentMirrorTexts(home, 3, now.getTime(), fsImpl); } catch { return []; }
  })();

  for (const t of ledgerTargets) appendLine(t, envelope, fsImpl);

  const base = {
    envelope, id, to: toRaw, handle: pane?.handle ?? null, ledgers: ledgerTargets,
    packetPath, packetWritten, warnings, drained: drained ? drained.drained : 0,
  };

  const queue = (classification) => writeOutboxEntry(home, {
    id, from, to: toRaw, toSlug, handle: pane?.handle ?? null,
    agentIdentity: pane?.agentIdentity ?? null, envelope, classification,
    ledgers: ledgerTargets, packetPath, lastOutcome: 'deferred',
  }, fsImpl);

  // ── `ben` stops here: recorded, printed, and put in the one file Ben reads when he must act.
  if (isBen) {
    const benInbox = needsBen(kind, toRaw, args.needs) ? appendBenInbox(home, envelope, packetPath, fsImpl) : null;
    return {
      ok: true, exitCode: 0, ...base, classification: 'n/a (ben)',
      delivered: false, deferred: false, queued: false, notified: true, benInbox, outbox: null, error: null,
    };
  }

  // ── N1: a ledger-only kind stops here too — validated and recorded exactly like any other kind, but
  //    no outbox entry, no inbox post, no pane resolution. The recipient's own hooks surface the ledger
  //    line at its next event; this call never tries to start one.
  if (quietKind) {
    // review MINOR 8: N1 removed ACK/FYI's only loudness — with no pane resolved, the exit-2 banner can
    // never fire for a quiet kind either, so a quiet note to a typo'd slug used to vanish into the ledger
    // silently. Three of N2's four "known" signals need no orca, so they still run here: a WARNING only
    // (exit stays 0 — "no wake-up is created" is still true), and only for a slug we were given (a raw
    // handle already resolved a pane above, via `quietSkipsResolution`, and is never "unknown").
    let extra = {};
    if (!HANDLE_RE.test(toRaw)) {
      const noUnknownCheck = killSwitchActive(fsImpl, noUnknownCheckPath(home));
      try {
        if (!noUnknownCheck) {
          const context = {
            inboxes: readInboxes(home, fsImpl), bindings: readBindings(home, fsImpl), terminals: [],
            ledgerTexts: withoutIds(mirrorTextsBeforeSend, undeliveredIds(home, fsImpl)),
          };
          if (isUnknownRecipient(toRaw, context)) {
            const known = knownSlugs(context);
            const suggestion = suggestSlug(toRaw, known);
            warnings.push(
              `"${toRaw}" is not a recognized recipient on this machine (no inbox, binding, live pane, or `
              + `recent ledger line)${suggestion ? ` — did you mean "${suggestion}"?` : ''}. ${kind} is `
              + 'ledger-only, so no wake-up was ever going to be created for it — this warning is the only signal.',
            );
            extra = { unknown_recipient: true, known, suggestion };
          }
        }
      } catch { /* fails open: no warning, no unknown_recipient flag */ }
    }
    return {
      ok: true, exitCode: 0, ...base, classification: 'ledger-only (quiet kind)',
      delivered: false, deferred: false, queued: false, notified: false,
      wake: 'none', reason: 'ledger-only kind', outbox: null, error: null,
      ...extra,
    };
  }

  // ── Inbox delivery (spec 2026-09-17, D3). The recipient's OWN inbox, if it registered one on this
  //    machine: a Claude session's messaging socket or a Codex session's queue. No pane, no keystroke,
  //    no composer to collide with. Deliberately BEFORE the exit 2 below — a registered inbox makes the
  //    pane's name irrelevant, so a peer Orca has retitled is still reached.
  //    `--no-type` means "record it, deliver nothing now", so it skips this too.
  if (inboxRecord) {
    const post = deps.deliverToInbox ?? deliverToInbox;
    let verdict;
    try {
      // C11: note-send advertises a 15 s ceiling, and the Codex client's own default is 20 s. The
      // drain's per-entry floor (INBOX_FLOOR_MS) still decides whether this is enough to start.
      verdict = await post(home, toSlug, envelope, inboxRecord, { fsImpl, env, budgetMs: SEND_INBOX_BUDGET_MS });
    } catch (err) {
      verdict = { ok: false, delivered: false, reason: 'inbox-error', detail: err?.message ?? String(err) };
    }
    const how = `inbox (${inboxRecord.kind})`;
    if (verdict.delivered) {
      return {
        ok: true, exitCode: 0, ...base, classification: how,
        delivered: true, deferred: false, queued: false, notified: false, outbox: null, error: null,
      };
    }
    // Not delivered: the ledger already has the note, so this is a latency cost. The detail is
    // token-free by construction — the clients never put a record in a verdict.
    const outbox = queue(how);
    throw new NoteError(
      3,
      `${verdict.reason}${verdict.detail ? ` — ${verdict.detail}` : ''}. The ledger has the note (${ledgerTargets.join(', ')}); `
      + 'the wake-up is queued for note-flush. Do NOT re-send this id.',
      { ...base, classification: how, notified: false, queued: true, outbox },
    );
  }

  // ── H3: the pane did not resolve, but the note now EXISTS. Queue the wake-up keyed on the raw --to
  //       (note-flush re-resolves on every drain, so a pane that comes back still gets nudged) and only
  //       then report the exit 2, with the ledger paths in the message and in the JSON.
  if (paneError) {
    const outbox = queue('not-resolved');

    // N2 (spec 2026-09-20): a slug that no inbox, binding, live pane title or recent ledger line has
    // ever heard of is UNKNOWN, not merely "not found right now" — loud enough that a typo (`fable` for
    // `taxonomy-fable`) is caught before two hours pass, not after. `~/.agents/notes/no-unknown-check`
    // restores today's plain message. Never runs for a raw handle or `ben` — both throw earlier.
    const noUnknownCheck = killSwitchActive(fsImpl, noUnknownCheckPath(home));
    let message = `${paneError.message}\n\nThe note IS recorded (${ledgerTargets.join(', ')}) and the wake-up is queued — `
      + 'note-inbox reads the mirror, so the recipient still gets it. Do NOT re-send this id; fix the pane name '
      + 'or rename the pane to its slug, and the queued wake-up lands on the next flush.';
    let extra = {};
    // Fails open: anything unreadable here (a corrupt registry, an I/O error) must fall back to today's
    // plain message rather than crash a send whose note is already safely on disk.
    try {
      if (!noUnknownCheck) {
        // review MAJOR 2: exclude every id whose wake-up is still undelivered (queued or dead-lettered),
        // not just this send's own — a mirror line from the FIRST unanswered send to a wrong slug would
        // otherwise make that slug look "known" to the second, third, … send, switching the banner off
        // exactly when a session repeats the mistake it exists to catch.
        const context = {
          inboxes: readInboxes(home, fsImpl), bindings, terminals,
          ledgerTexts: withoutIds(mirrorTextsBeforeSend, undeliveredIds(home, fsImpl)),
        };
        if (isUnknownRecipient(toRaw, context)) {
          const known = knownSlugs(context);
          const suggestion = suggestSlug(toRaw, known);
          message = `UNKNOWN RECIPIENT "${toRaw}"\n`
            + `Known slugs on this machine: ${known.length ? known.join(', ') : '(none)'}`
            + (suggestion ? `\ndid you mean "${suggestion}"?` : '')
            + `\n\n${paneError.message}\n\nThe note IS recorded (${ledgerTargets.join(', ')}) and the wake-up is `
            + 'queued — the slug may register later. Do NOT re-send this id; fix the recipient name and send '
            + 'under the right slug with a NEW id.';
          extra = { unknownRecipient: true, known, suggestion };
        }
      }
    } catch { /* fails open: keep the plain message computed above */ }
    throw new NoteError(
      2, message,
      { ...base, classification: 'not-resolved', notified: false, queued: true, outbox, ...extra },
    );
  }

  // ── `--no-type`: the ledger is the channel; the wake-up is queued for note-flush. Not a failure.
  if (noType) {
    const outbox = queue('not-checked (--no-type)');
    // review MAJOR 3: `--no-type` never resolves a pane, so it never reaches the `paneError` branch and
    // its exit-2 banner — a `--no-type` ASK to a typo'd slug used to be recorded and queued with zero
    // signal that anything was wrong. Same check, run with `terminals: []` because no `terminal list`
    // call was ever made. This is a WARNING, not the exit-2 error, and the exit code stays 0: a caller
    // that opted out of pane resolution has not earned an exit-2 for a pane that was never looked at.
    let extra = {};
    if (!HANDLE_RE.test(toRaw)) {
      const noUnknownCheck = killSwitchActive(fsImpl, noUnknownCheckPath(home));
      try {
        if (!noUnknownCheck) {
          // `bindings` (the outer variable) is only populated on the real pane-resolution path, which
          // --no-type never takes — read fresh here, same as the quietKind check above.
          const context = {
            inboxes: readInboxes(home, fsImpl), bindings: readBindings(home, fsImpl), terminals: [],
            ledgerTexts: withoutIds(mirrorTextsBeforeSend, undeliveredIds(home, fsImpl)),
          };
          if (isUnknownRecipient(toRaw, context)) {
            const known = knownSlugs(context);
            const suggestion = suggestSlug(toRaw, known);
            warnings.push(
              `"${toRaw}" is not a recognized recipient on this machine (no inbox, binding, live pane, or `
              + `recent ledger line)${suggestion ? ` — did you mean "${suggestion}"?` : ''}. The note IS `
              + 'recorded and the wake-up is queued; --no-type never resolved a pane, so this is not the '
              + 'exit-2 unknown-recipient error.',
            );
            extra = { unknown_recipient: true, known, suggestion };
          }
        }
      } catch { /* fails open: no warning, no unknown_recipient flag */ }
    }
    return {
      ok: true, exitCode: 0, ...base, classification: 'not-checked (--no-type)',
      delivered: false, deferred: false, queued: true, notified: false, outbox, error: null,
      ...extra,
    };
  }

  // ── Typing is the LAST RESORT (spec 2026-09-17, D3(3)). Nothing below runs unless this machine asks
  //    for it: the recipient registered no inbox, the note is in the ledger, and its own hooks read it
  //    on its next event. A composer is never touched by default, whatever `no-type` says.
  if (String(env.MULTI_ALLOW_TYPING ?? '') !== '1') {
    const outbox = queue('no-inbox');
    throw new NoteError(
      3,
      `${toSlug} has registered no inbox on this machine, and typing into a pane is off `
      + '(set MULTI_ALLOW_TYPING=1 to allow the keystroke path). The ledger has the note '
      + `(${ledgerTargets.join(', ')}) and the recipient's own hooks read it on its next event; note-flush `
      + 'retries the wake-up once that session registers. Do NOT re-send this id.',
      { ...base, classification: 'no-inbox', notified: false, queued: true, outbox },
    );
  }

  // ── 6. Gate on pane state. No `terminal wait` anywhere: the pilot proved `--for tui-idle` never
  //       resolves for a Codex pane (8 s waits time out on both panes, idle or not). The Codex rule is
  //       now a classification rule instead — idle-only, read from the tail (see transport.mjs).
  const deadline = Date.now() + waitMaxMs;
  let classification = await classifyNowWith(orca, pane.handle, deps);
  while (classification === 'permission' && Date.now() < deadline) {
    await nap(Math.min(PERMISSION_POLL_MS, Math.max(0, deadline - Date.now())));
    classification = await classifyNowWith(orca, pane.handle, deps);
  }
  if (!isSendable(classification, pane.agentIdentity)) {
    const outbox = queue(classification);
    throw new NoteError(3, deferMessage(classification, pane, envelope, ledgerTargets, pane.agentIdentity),
      { ...base, classification, notified: false, queued: true, outbox });
  }

  // ── 7. Two-phase delivery: baseline, text, verify, only then Enter (C1 / review H1).
  const res = await twoPhaseSend(orca, pane, envelope, id, classification);
  if (!res.delivered) {
    if (res.cliError && !res.stranded) {
      const outbox = queue(classification);
      throw new NoteError(4, `${res.cliError.message} — nothing was typed`,
        { ...base, classification, notified: false, queued: true, outbox });
    }
    if (res.stranded) {
      // The text is sitting in someone's composer. Re-typing it is how you get the same note twice, so
      // this one is NOT queued — a human clears the pane.
      throw new NoteError(res.cliError ? 4 : 3,
        `${res.reason}. The text may be sitting UNSENT in ${pane.handle}'s composer; the ledger already has the note. Clear the pane by hand — the wake-up is NOT queued for retry.`,
        { ...base, classification: res.classification, notified: false, queued: false, outbox: null });
    }
    const outbox = queue(res.classification);
    throw new NoteError(3, `${res.reason}. The ledger has the note; the wake-up is queued for note-flush.`,
      { ...base, classification: res.classification, notified: false, queued: true, outbox });
  }

  return {
    ok: true, exitCode: 0, ...base, classification,
    delivered: true, deferred: false, queued: false, notified: false, outbox: null, error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry
// ─────────────────────────────────────────────────────────────────────────────

const USAGE = `note-send — one peer-note envelope, ledger-first, with a best-effort wake-up typed into a peer's pane.

  note-send --from <slug> --to <slug|term_handle|ben> --kind ASK|ACK|RESULT|BLOCKED|FYI
            --topic <slug> --text "<substance>"
            [--n <int>] [--re <parent-id>] [--supersedes <id>] [--goal "<why>"] [--details <repo/relative/path.md>]
            [--needs decision|review|ack|none] [--by "<time>"] [--recipient-repo <dir>] [--sender-repo <dir>]
            [--packet-file <path|->] [--force] [--tz NYC] [--orca <cmd>] [--wait-max <seconds>]
            [--no-type] [--no-drain] [--dry-run] [--json]

The ledger is the channel: the recipient finds the note by reading it (note-inbox), not by being typed
at. Typing is a wake-up. Deferral is normal — the outbox retries it. NEVER re-send the same id.

Cross-host: run note-send ON the recipient's host over ssh. Use the absolute path (an ssh command
gets a non-login shell, which has no ~/.local/bin on PATH) and quote the whole remote command as
ONE argument, on one line (a \\ continuation is literal inside single quotes):
  ssh ben@<host> '~/.local/bin/note-send --from <you> --to <pane> --kind ASK --topic <t> --text "…" --packet-file -' < packet.md

Exit: 0 delivered, queued (--no-type) or notified (ben) · 1 bad arguments/envelope · 2 pane not found/ambiguous ·
      3 deferred — queued in the outbox, NOT typed · 4 orca CLI error · 5 cross-host misuse
`;

function failureJson(err, exitCode) {
  return {
    ok: false, exitCode, envelope: err.envelope ?? null, id: err.id ?? null, to: err.to ?? null,
    handle: err.handle ?? null, classification: err.classification ?? null, delivered: false,
    deferred: exitCode === 3, queued: Boolean(err.queued), notified: Boolean(err.notified),
    ledgers: err.ledgers ?? [], packetPath: err.packetPath ?? null, outbox: err.outbox ?? null,
    warnings: err.warnings ?? [], error: err.message,
    // N2: only present when note-send actually ran the unknown-recipient check and it fired.
    ...(err.unknownRecipient
      ? { unknown_recipient: true, known: err.known ?? [], suggestion: err.suggestion ?? null }
      : {}),
  };
}

/**
 * review NIT13: N2's contract is "prints as the FIRST line of stderr" — literally, not "the first line
 * after a note-send: prefix". Every other line still gets the prefix. A pure, exported function so this
 * exact rule is unit-testable without spawning a real orca-dependent CLI process.
 */
export function firstStderrLine(message) {
  const line = String(message).split('\n')[0];
  return line.startsWith('UNKNOWN RECIPIENT ') ? line : `note-send: ${line}`;
}

function emit(result, wantsJson) {
  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(`${result.envelope}\n`);
  if (result.dryRun) {
    process.stdout.write('\n--dry-run — nothing was written or sent. Planned actions:\n');
    for (const a of result.plan) process.stdout.write(`  - ${a}\n`);
  } else if (result.delivered) {
    process.stdout.write(`delivered to ${result.handle} (${result.classification}); ledger: ${result.ledgers.join(', ')}\n`);
  } else if (result.queued) {
    process.stdout.write(`recorded and queued for note-flush (to: ${result.to}); ledger: ${result.ledgers.join(', ')}\n`);
  } else {
    process.stdout.write(`recorded, not delivered (to: ${result.to}); ledger: ${result.ledgers.join(', ')}\n`);
  }
  if (result.benInbox) process.stdout.write(`also appended to ${result.benInbox}\n`);
  for (const w of result.warnings ?? []) process.stderr.write(`note-send: warning: ${w}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsJson = argv.includes('--json');
  if (argv.length === 0 || argv.includes('--help')) {
    process.stdout.write(USAGE);
    process.exitCode = argv.length === 0 ? 1 : 0;
    return;
  }
  try {
    const result = await runNoteSend(argv);
    emit(result, wantsJson);
    process.exitCode = 0;
  } catch (err) {
    const exitCode = err instanceof NoteError ? err.exitCode : 1;
    // v4: the machine-readable object goes to STDOUT on EVERY failure, with or without --json. Nine
    // notes died silently in the pilot because a validation rejection was piped through `grep -c` and
    // the only message went to stderr. The packet and ledger are written before most failures, so this
    // object also tells the caller what DID land.
    process.stdout.write(`${JSON.stringify(failureJson(err, exitCode))}\n`);
    process.stderr.write(`${firstStderrLine(err.message)}\n`);
    if (!wantsJson && err.message.includes('\n')) {
      for (const line of err.message.split('\n').slice(1)) process.stderr.write(`note-send: ${line}\n`);
    }
    if (err.ledgers?.length) process.stderr.write(`note-send: the note IS recorded in ${err.ledgers.join(', ')}\n`);
    process.exitCode = exitCode;
  }
}

if (isMainModule(import.meta.url)) await main();
