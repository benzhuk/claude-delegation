/**
 * decisions-render-publish — the `publish` pipeline (spec's numbered steps 1-8). Every network
 * or write call (`notion.js read`/`replace-md`, `decisions-title.mjs set`, the pickup's status
 * read) is injected through `deps`; nothing here reaches the real Notion API, spawns
 * `decisions-title.mjs`, or writes the page on its own. `deps.readPickupCapture`'s default
 * implementation calls only `decisions-pickup.mjs`'s existing exported `status`/`openPrivateCapture`
 * (read-only, never imported for anything else) — the territory rule that this lane calls that
 * script "read-only through their CLI/exports".
 *
 * Imports `decisions-render-core.mjs` for `render`/`normalize`; never the other way around, so
 * there is no import cycle between this file and `decisions-render.mjs` (the CLI entry, which
 * imports both and re-exports everything).
 */
import path from 'node:path';
import { parseDocument, computeExitCode } from './decisions-read.mjs';
import {
  render, normalize, defaultReadFile, defaultReaddir, defaultExecGit,
  formatClearedTimestamp, parseSessionSource,
} from './decisions-render-core.mjs';

/** Every non-zero publish exit named in the spec (2/3/4/5/6/7); `code` is the CLI exit code. */
export class PublishError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner-input triples — deliberately re-derived here rather than imported from
// decisions-pickup.mjs's private `capturedItems`/`ownerInputs` (not exported, and this lane only
// reads that script's CLI/exports, never its internals): same shape, copied by value, the same
// convention decisions-title.mjs already uses for notion.js's `NOTION_VERSION` constant.
// ─────────────────────────────────────────────────────────────────────────────

export function ownerInputTriples(doc) {
  const triples = [];
  for (const d of doc.decisions) {
    for (const o of d.options.filter((opt) => opt.ticked)) triples.push(['selection', d.title, o.text]);
    for (const c of d.comments) triples.push(['comment', d.title, c.text]);
  }
  for (const u of doc.unattached) {
    if (u.kind === 'comment') triples.push(['comment', u.under ?? null, u.text]);
    else if (u.kind === 'tick') triples.push(['selection', u.under ?? null, u.text]);
  }
  return triples;
}

/** Step 2: "any escaped `\*\*` comment line, a ticked Done, a ticked option". */
export function hasOwnerInput(doc) {
  if (doc.done === true) return true;
  for (const d of doc.decisions) {
    if (d.options.some((o) => o.ticked)) return true;
    if (d.comments.length > 0) return true;
  }
  for (const u of doc.unattached) {
    if (u.kind === 'comment' || u.kind === 'tick') return true;
  }
  return false;
}

function tripleKey(t) {
  return JSON.stringify(t);
}

/** Multiset subtraction: elements of `a` with no matching element left in `b`. */
function multisetExtra(a, b) {
  const counts = new Map();
  for (const t of b) counts.set(tripleKey(t), (counts.get(tripleKey(t)) ?? 0) + 1);
  const extra = [];
  for (const t of a) {
    const k = tripleKey(t);
    const c = counts.get(k) ?? 0;
    if (c > 0) counts.set(k, c - 1);
    else extra.push(t);
  }
  return extra;
}

export function multisetsEqual(a, b) {
  return a.length === b.length && multisetExtra(a, b).length === 0 && multisetExtra(b, a).length === 0;
}

export function describeMismatch(fresh, captured) {
  const onlyFresh = multisetExtra(fresh, captured);
  const onlyCaptured = multisetExtra(captured, fresh);
  const parts = [];
  if (onlyFresh.length) parts.push(`fresh has ${JSON.stringify(onlyFresh)} the capture does not`);
  if (onlyCaptured.length) parts.push(`the capture has ${JSON.stringify(onlyCaptured)} the fresh read does not`);
  return parts.join('; ') || 'counts differ';
}

// ─────────────────────────────────────────────────────────────────────────────
// Default pickup-capture reader — read-only through decisions-pickup.mjs's own exports.
// ─────────────────────────────────────────────────────────────────────────────

export async function defaultReadPickupCapture({ repo, page }, { pickup } = {}) {
  let pickupMod = pickup;
  if (!pickupMod) {
    try {
      pickupMod = await import('./decisions-pickup.mjs');
    } catch {
      return null;
    }
  }
  let st;
  try {
    st = pickupMod.status({ repo, page });
  } catch {
    return null;
  }
  const round = st?.receipt?.round;
  if (!Number.isSafeInteger(round)) return null;
  // Lane 58 (was Review round-2 M8): ACCOUNTED is now accepted too, since there is exactly one
  // receipt (and so exactly one round) tracked per page — `st.receipt.round` above is always
  // that round; whether the page is still in that round's Done episode is checked separately
  // (observedUncheckedAt here, the Done label in `publish`). Following the SKILL.md order
  // (account, then clear Done) leaves the page ACCOUNTED with Done still checked and no route
  // able to clear it, so an ACCOUNTED capture is tagged `accounted: true` below; `publish` itself
  // requires the fresh page's Done to still be checked, AND its Done line to still equal this
  // capture's, before it will use one (see its own comments at the call site). NEEDS_RECONCILIATION
  // and any legacy/unknown status still mean this round was closed out abnormally (or is broken)
  // and must not be treated as fresh, verbatim-checked capture.
  const acceptableStatuses = new Set(['PREPARED', 'RECORDED', 'WAITING_OWNER', 'ACCOUNTED']);
  // Lane 64: the one NEEDS_RECONCILIATION shape the pickup itself knows how to close (a round whose
  // checked page bytes changed after its note was recorded, with its evidence intact) is returned,
  // tagged `reconciling`, so `publish` can close it in the same step as clearing Done. Anything
  // else in that status (broken evidence, conflicting envelope, uncertain delivery) stays refused.
  const stuckRound = st?.status === 'NEEDS_RECONCILIATION'
    && st.receipt?.state === 'NEEDS_RECONCILIATION'
    && st.receipt.reconciliationReason === STUCK_ROUND_REASON
    && st.evidenceIntegrity?.status === 'OK';
  if (!acceptableStatuses.has(st?.status) && !stuckRound) return null;
  // Review r1 F1: an ACCOUNTED round whose unchecked page the pickup host has already observed
  // is over: any checked Done now is a new hand-back (round + 1), never this round's.
  if (st.status === 'ACCOUNTED' && st.receipt.observedUncheckedAt) return null;
  let originalBuf;
  try {
    originalBuf = pickupMod.openPrivateCapture({ repo, page, round });
  } catch {
    return null;
  }
  let doc;
  try {
    doc = parseDocument(originalBuf.toString('utf8'));
  } catch {
    return null;
  }
  const tickAt = st.receipt.captureReadAt ?? st.receipt.preparedAt ?? null;
  return {
    round, tickAt, triples: ownerInputTriples(doc),
    ...(st.status === 'ACCOUNTED' ? { accounted: true, doneLabel: doc.doneLabel } : {}),
    ...(stuckRound ? { reconciling: true } : {}),
  };
}

const STUCK_ROUND_REASON = 'checked page bytes changed during the active round';

/** Lane 64 item 1: the default one-step close, `decisions-pickup.mjs`'s `closeRound` (the same
 * rules `account` enforces, with the outcome written by the call itself). Throws on refusal. */
export async function defaultAccountRound({
  repo, page, owner, reconciliation, now,
}, { pickup } = {}) {
  const pickupMod = pickup ?? await import('./decisions-pickup.mjs');
  return pickupMod.closeRound({
    repo, page, ...(owner ? { owner } : {}), reconciliation,
  }, now ? { now } : {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayYmdNY(now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** A short, deterministic line diff for the exit-4 message — not a byte-perfect patch, just
 * enough for a human (or a test) to see which lines changed. */
export function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const max = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < max; i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) out.push(`- ${a[i]}`);
    if (b[i] !== undefined) out.push(`+ ${b[i]}`);
  }
  return out.join('\n');
}

/** The Done line exactly as the fresh read carries it (step 4's "copies the fresh Done line
 * verbatim" path), reconstructed from decisions-read.mjs's own parsed `done`/`doneLabel`. */
function extractDoneLineVerbatim(doc) {
  if (doc.doneLabel === null) {
    throw new PublishError(3, 'fresh read has no Done line to preserve (decisions-read.mjs: doc.doneLabel is null)');
  }
  return `- [${doc.done ? 'x' : ' '}] ${doc.doneLabel}`;
}

/** Review round-2 F1: under `--clear-done`, the fresh read always carries Ben's own input (a
 * ticked option, an escaped `\*\*` comment, a ticked Done) that `last-render.md` never does — a
 * plain drift compare exits 4 on every real round. This reverts exactly the lines `decisions-read`
 * attributed to owner input (by the same `line` numbers `parseDocument` already returns), and
 * nothing else, so anything ELSE Ben (or an agent) changed still trips the drift check. */
export function revertOwnerInput(freshText, doc) {
  const lines = freshText.split(/\r\n|\n/);
  const deleteLines = new Set();
  const flipLines = new Set();
  for (const d of doc.decisions) {
    for (const c of d.comments) deleteLines.add(c.line);
    for (const o of d.options) if (o.ticked) flipLines.add(o.line);
  }
  for (const u of doc.unattached) {
    if (u.kind === 'comment') deleteLines.add(u.line);
    else if (u.kind === 'tick') flipLines.add(u.line);
  }
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    if (deleteLines.has(lineNo)) continue;
    out.push(flipLines.has(lineNo) ? lines[i].replace(/\[[xX]\]/, '[ ]') : lines[i]);
  }
  let text = out.join('\n');
  if (doc.done === true && doc.doneLabel !== null) {
    const escLabel = doc.doneLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^-\\s*\\[[xX]\\]\\s*${escLabel}\\s*$`, 'gm');
    const matches = [...text.matchAll(re)];
    if (matches.length) {
      const last = matches[matches.length - 1];
      const start = last.index;
      text = `${text.slice(0, start)}- [ ] ${doc.doneLabel}${text.slice(start + last[0].length)}`;
    }
  }
  return text;
}

/** Review round-2 F2: reads committed, pushed content only — the same trust basis the render-time
 * `ls-tree` refusal already uses — never the working tree, so an uncommitted or unpushed "answer"
 * cannot pass the verbatim check. */
function gitShow(execGit, repo, ref, relPath) {
  try {
    return String(execGit(['show', `${ref}:${relPath}`], repo));
  } catch {
    return null;
  }
}

function gitLsTreeFiles(execGit, repo, ref, relDir) {
  try {
    const out = execGit(['ls-tree', '--name-only', '-r', ref, '--', relDir], repo);
    return String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Lane 64 item 2: every committed history file on origin/main, any day, concatenated. */
function readAllHistory(execGit, repo) {
  return gitLsTreeFiles(execGit, repo, 'origin/main', 'docs/decisions/history')
    .filter((rel) => rel.endsWith('.md'))
    .map((rel) => gitShow(execGit, repo, 'origin/main', rel) ?? '')
    .join('\n');
}

/** An owner input counts as quoted in history only in its exact quoted form (selection or comment). */
function quotedInAllHistory([, , text], historyText) {
  return typeof text === 'string' && text !== '' && historyText.includes(`"${text}"`);
}

const OPTION_LINE_RE = /^\s*-\s*\[[ xX]\]/;

/** A waiting item's own lines that are NOT one of its option checkboxes — used so a ticked
 * option's bare, unticked sibling line in the same file can never itself count as "the item
 * recorded the choice" (review F2: that always exists, ticked or not). */
function textOutsideOptionLines(text) {
  return text.split(/\r\n|\n/).filter((l) => !OPTION_LINE_RE.test(l)).join('\n');
}

/** Review round-2 F2: does today's committed history file, or the waiting item this triple
 * answers, carry a durable, verbatim, quoted record of it? A short comment (`** no`) must not
 * pass as a substring of unrelated prose, and a ticked option must not pass merely because its
 * own (unticked) checkbox line exists in its waiting item. */
function verbatimAnswerPresent({
  kind, title, text,
}, todayText, waitingFiles) {
  const quoted = `"${text}"`;
  const inHistory = kind === 'comment' ? todayText.includes(quoted) : todayText.includes(text);
  if (inHistory) return true;
  return waitingFiles.some(({ text: waitingText }) => {
    if (waitingText === null) return false;
    let wDoc;
    try {
      wDoc = parseDocument(waitingText);
    } catch {
      return false;
    }
    const wTitle = wDoc.decisions[0]?.title;
    if (wTitle === undefined || wTitle !== title) return false;
    if (kind === 'comment') return waitingText.includes(quoted);
    return textOutsideOptionLines(waitingText).includes(quoted);
  });
}

/** Review round-2 F6: before any page write (a real publish OR `--adopt-live`), require an
 * up-to-date `main` checkout — nothing unpushed, nothing to fetch — so a stale or lane checkout
 * refuses before touching Notion rather than after, leaving `last-render.md` off `main`.
 *
 * Split into a detail probe (`mainCheckDetail`, never throws) and the throwing wrapper
 * (`checkOnMain`) so Fix 1 (render-guard, pack/spec.md) can fold the same detail into an exit-7
 * message when a checkout is both dirty and off main, without running the up-to-date check twice
 * for its own exit-2 message text. */
function mainCheckDetail(execGit, repo) {
  try {
    execGit(['fetch', 'origin', 'main'], repo);
  } catch (e) {
    return `git fetch origin main failed: ${e instanceof Error ? e.message : e}`;
  }
  let branch;
  try {
    branch = String(execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).trim();
  } catch (e) {
    return `cannot determine the current branch: ${e instanceof Error ? e.message : e}`;
  }
  if (branch !== 'main') return `currently on ${branch}, not main`;
  let head;
  let originMain;
  try {
    head = String(execGit(['rev-parse', 'HEAD'], repo)).trim();
    originMain = String(execGit(['rev-parse', 'origin/main'], repo)).trim();
  } catch (e) {
    return `cannot compare HEAD to origin/main: ${e instanceof Error ? e.message : e}`;
  }
  if (head !== originMain) return 'HEAD is not origin/main — push or pull first';
  return null;
}

function mainCheckMessage(detail) {
  return `push main first; publish runs from an up-to-date main checkout (${detail})`;
}

function checkOnMain(execGit, repo) {
  const detail = mainCheckDetail(execGit, repo);
  if (detail) throw new PublishError(2, mainCheckMessage(detail));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1 (render-guard, pack/spec.md): publish refuses a dirty docs/decisions tree.
// ─────────────────────────────────────────────────────────────────────────────

const DIRTY_DECISIONS_MESSAGE = 'publish renders only what origin/main holds. Commit and push '
  + 'the listed files if they are intended, otherwise git restore -- <files>, then rerun.';

/** Parses `git status --porcelain` output into `{status, paths, rest}` entries. A rename line
 * (`orig -> new`) keeps BOTH paths — `git restore -- <new>` alone does not undo a staged rename,
 * the old path is needed too — and `rest` keeps the raw `orig -> new` text for the printed list. */
function parsePorcelainEntries(output) {
  const lines = String(output ?? '').split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((line) => {
    const status = line.slice(0, 2);
    const rest = line.slice(3);
    const arrow = rest.indexOf(' -> ');
    const paths = arrow === -1 ? [rest] : [rest.slice(0, arrow), rest.slice(arrow + 4)];
    return { status, paths, rest };
  });
}

/** Pinned rule: right after step 1 (fresh read) and before step 2, ahead of any write, `publish`
 * runs `git status --porcelain -- docs/decisions` in `--repo`. Any modified, staged or untracked
 * path under `docs/decisions/` other than `docs/decisions/last-render.md` (exempt: step 8 writes
 * it) is exit 7 with the list and the pinned message. A checkout that is both dirty and off main
 * reports exit 7 with the list and then the exit-2 detail (never exit 2 itself — the dirty tree
 * is the more actionable refusal). Under `--dry-run` the list is printed to stderr as `warning:`
 * and the run continues, so a lead can preview an edit before committing. No bypass flag. */
function checkDecisionsTreeClean(execGit, repo, { dryRun, writeErr }) {
  let output;
  try {
    output = execGit(['status', '--porcelain', '--untracked-files=all', '--', 'docs/decisions'], repo);
  } catch (e) {
    throw new PublishError(7, `cannot check docs/decisions for a dirty tree: ${e instanceof Error ? e.message : e}`);
  }
  // A rename onto or from last-render.md still counts as dirty: drop an entry only when EVERY
  // path it names (both sides of a rename) is last-render.md — step 8 writes that file in place,
  // it never renames it away.
  const entries = parsePorcelainEntries(output)
    .filter((e) => !e.paths.every((path) => path === 'docs/decisions/last-render.md'));
  if (entries.length === 0) return;
  const list = entries.map((e) => `  ${e.status} ${e.rest}`).join('\n');
  if (dryRun) {
    writeErr(`warning: ${DIRTY_DECISIONS_MESSAGE}\n${list}\n`);
    return;
  }
  const offMainDetail = mainCheckDetail(execGit, repo);
  const suffix = offMainDetail ? `\n${mainCheckMessage(offMainDetail)}` : '';
  throw new PublishError(7, `${DIRTY_DECISIONS_MESSAGE}\n${list}${suffix}`);
}

/** Step 8's push, with the one non-fast-forward retry the spec allows (fetch, rebase, push
 * again); a second failure leaves the commit on `render/last-<ISO>` and throws exit 6. Review
 * round-2 F5/F6: push and retry target `origin`/`main` explicitly (never the caller's own
 * upstream, and never linearising an unrelated unpushed merge with a bare `rebase`); the parking
 * branch name is sanitised (an ISO timestamp's `:`/`.` are not valid in a git ref), a conflicted
 * rebase is aborted first, and the message only claims the branch exists once creating it in fact
 * succeeded. */
function pushWithRebase(execGit, repo, nowIso) {
  try {
    execGit(['push', 'origin', 'HEAD:main'], repo);
    return;
  } catch {
    // fall through to the one allowed retry
  }
  try {
    execGit(['fetch', 'origin', 'main'], repo);
    execGit(['rebase', 'origin/main'], repo);
    execGit(['push', 'origin', 'HEAD:main'], repo);
  } catch (e2) {
    const branch = `render/last-${nowIso.replace(/[:.]/g, '-')}`;
    try { execGit(['rebase', '--abort'], repo); } catch { /* no rebase in progress */ }
    let where = `on ${branch}`;
    try {
      execGit(['branch', branch, 'HEAD'], repo);
    } catch (e3) {
      where = `on the current branch only (creating ${branch} failed: ${e3 instanceof Error ? e3.message : e3})`;
    }
    throw new PublishError(6, `push failed twice; the page is already updated, the commit is left ${where} for the caller (${e2 instanceof Error ? e2.message : e2})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// publish()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{repo:string, page:string, clearDone?:boolean, adoptLive?:boolean, dryRun?:boolean, topic?:string|null}} opts
 * @param {object} deps injected IO: `readPage`, `replaceMd`, `titleSet`, `readPickupCapture`,
 *   `readLatestBackup`, `execGit`, `readFile`, `readdirSync`, `writeFile`, `now`, `write`,
 *   `writeErr` (Fix 1's dry-run dirty-tree warning; defaults to a no-op, same as `write`).
 */
export async function publish(opts, deps = {}) {
  const {
    repo, page, clearDone = false, adoptLive = false, dryRun = false, topic = null, owner = null,
  } = opts;
  if (!repo) throw new PublishError(2, 'publish requires --repo');
  if (!page) throw new PublishError(2, 'publish requires --page');
  // Review round-2 F1: --adopt-live is a crash-recovery shortcut ("Notion already carries this
  // content verbatim") that adopts the fresh read as-is; it cannot also compute a cleared Done
  // state, so the combination must never return 0 before Done is actually cleared.
  if (adoptLive && clearDone) {
    throw new PublishError(2, '--adopt-live and --clear-done cannot be combined: adopt-live adopts the page as-is and cannot also clear Done; clear the pickup round with a plain --clear-done publish first, or adopt without it');
  }

  const now = deps.now ? deps.now() : new Date();
  const readFile = deps.readFile ?? defaultReadFile;
  const readdirSync = deps.readdirSync ?? defaultReaddir;
  const execGit = deps.execGit ?? defaultExecGit;
  const writeFile = deps.writeFile;
  const write = deps.write ?? (() => {});
  const writeErr = deps.writeErr ?? (() => {});
  const readPickupCapture = deps.readPickupCapture ?? defaultReadPickupCapture;
  const accountRound = deps.accountRound ?? defaultAccountRound;
  const readLatestBackup = deps.readLatestBackup ?? (async () => null);

  if (!deps.readPage) throw new PublishError(3, 'publish requires deps.readPage (the notion.js reader)');

  // Step 1: fresh read.
  const fresh = await deps.readPage(page);

  // Fix 1 (render-guard, pack/spec.md): refuse a dirty docs/decisions tree before any owner-input
  // check, drift compare or write — right after step 1, ahead of step 2.
  checkDecisionsTreeClean(execGit, repo, { dryRun, writeErr });

  // Step 2: owner input on the fresh read.
  let doc;
  try {
    doc = parseDocument(fresh);
  } catch (e) {
    throw new PublishError(3, `fresh read is BLIND: ${e instanceof Error ? e.message : e}`);
  }
  const pending = hasOwnerInput(doc);
  if (pending && !clearDone) {
    throw new PublishError(3, 'owner input pending: run the pickup, then publish --clear-done');
  }

  let doneLineForRender;
  let sessionSince = null;
  let roundToAccount = null;
  if (clearDone) {
    const capture = await readPickupCapture({ repo, page });
    if (!capture) throw new PublishError(3, 'clear-done: no captured pickup round for this page');
    // Lane 58: a capture tagged `accounted` came from an already-ACCOUNTED round (SKILL.md's
    // account-then-clear order). It backs this publish only in exactly the state right after that
    // accounting, before Done is cleared: the fresh page's Done still checked. Any other fresh
    // page (Done already unchecked, or never was) means this round is not (or no longer) the one
    // that produced this capture, so it must not be spent here.
    if (capture.accounted && doc.done !== true) {
      throw new PublishError(3, "clear-done: an already-accounted round requires the fresh page's Done to still be checked");
    }
    // Review (lane 58): Done still checked is not enough. Once that round's Done was cleared, the
    // page carries a newer `last cleared:` stamp; a re-check (even with identical inputs) is a NEW
    // hand-back the pickup has not captured. Only the capture's own Done line proves same episode.
    if (capture.accounted && doc.doneLabel !== capture.doneLabel) {
      throw new PublishError(3, `clear-done: an already-accounted round's Done line ("${capture.doneLabel}") differs from the fresh page's ("${doc.doneLabel}"): Done was cleared and re-checked since that round; run the pickup for the new round`);
    }
    const freshTriples = ownerInputTriples(doc);
    // Lane 64 item 2: a round the pickup holds as stuck (`reconciling`) is closed by history, not by
    // multiset equality: either the fresh page adds nothing the round's capture did not hold, or
    // every owner input of the round and of the fresh page is quoted in a committed history file on
    // origin/main (any day). The pickup re-checks its own side before it accounts.
    let allHistory = null;
    if (capture.reconciling) {
      const addsNothing = multisetExtra(freshTriples, capture.triples).length === 0;
      if (!addsNothing) {
        allHistory = readAllHistory(execGit, repo);
        const unquoted = [...capture.triples, ...freshTriples].filter((t) => !quotedInAllHistory(t, allHistory));
        if (unquoted.length) {
          throw new PublishError(3, `clear-done: the round is stuck in reconciliation and not every owner input is quoted in a committed history file on origin/main: ${JSON.stringify(unquoted)}`);
        }
      }
    } else if (!multisetsEqual(freshTriples, capture.triples)) {
      throw new PublishError(3, `clear-done: captured owner inputs do not match the fresh read (${describeMismatch(freshTriples, capture.triples)})`);
    }
    // Review round-2 F2: read committed, pushed content only (origin/main), require the spec's
    // quoted form for a comment, and for a selection require either today's history to name the
    // option text or the waiting item's OWN prose (never just its own unticked option line) to
    // quote the choice — so a short comment can never pass as a substring of unrelated text, and
    // a tick can never pass merely because its own waiting item still exists.
    const todayRelPath = `docs/decisions/history/${todayYmdNY(now)}.md`;
    const todayText = allHistory ?? gitShow(execGit, repo, 'origin/main', todayRelPath) ?? '';
    const waitingRelPaths = gitLsTreeFiles(execGit, repo, 'origin/main', 'docs/decisions/waiting');
    const waitingFiles = waitingRelPaths.map((rel) => ({ rel, text: gitShow(execGit, repo, 'origin/main', rel) }));
    for (const [kind, title, text] of freshTriples) {
      if (!verbatimAnswerPresent({ kind, title, text }, todayText, waitingFiles)) {
        throw new PublishError(3, `clear-done: owner text is not present verbatim (quoted) in today's committed history file, or in the waiting item it answers: "${text}"`);
      }
    }
    doneLineForRender = `- [ ] Done (last cleared: ${formatClearedTimestamp(now)})`;
    sessionSince = capture.tickAt ?? now.toISOString();
    roundToAccount = capture.accounted ? null : { ownerInputCount: freshTriples.length };
  } else {
    doneLineForRender = extractDoneLineVerbatim(doc);
  }

  // Step 3: drift.
  const lastRenderPath = path.join(repo, 'docs', 'decisions', 'last-render.md');
  let lastRender;
  try {
    lastRender = readFile(lastRenderPath);
  } catch (e) {
    throw new PublishError(3, `cannot read last-render.md: ${e instanceof Error ? e.message : e}`);
  }
  // Review round-2 F1: under --clear-done, compare last-render.md against the fresh read with
  // exactly the owner-input lines decisions-read found taken back out (comments deleted, ticked
  // options and Done flipped back) — never against the raw fresh read, which always carries Ben's
  // input and so would never match a clean render. Anything ELSE changed still trips this check.
  const compareFresh = clearDone ? revertOwnerInput(fresh, doc) : fresh;
  const freshNorm = normalize(compareFresh);
  if (freshNorm !== normalize(lastRender)) {
    if (!adoptLive) {
      const backup = await readLatestBackup(page);
      // Review round-2 M6: the notion.js backup is the PRE-write snapshot, so a crash right after
      // a write shows `backup ≈ last-render.md` (what the page looked like right before this
      // publish overwrote it with a new render) — never `backup ≈ fresh` (comparing the crash
      // signature against itself would always accidentally read true for the current page).
      const crashed = backup !== null && normalize(backup) === normalize(lastRender);
      const diff = lineDiff(normalize(lastRender), freshNorm);
      throw new PublishError(
        4,
        'the page was written outside the renderer. An agent line (a legacy Closed bullet or an '
        + 'anchored edit) is moved verbatim into today\'s history file, then publish again; a line '
        + 'Ben wrote goes through the pickup. If the diff equals the fresh read versus the newest '
        + 'notion.js backup for this page, the last publish crashed after writing: rerun with '
        + `--adopt-live.${crashed ? ' (this diff matches that case.)' : ''}\n${diff}`,
      );
    }
    // --adopt-live: the fresh read becomes last-render.md as-is; Notion already carries it (the
    // documented crash-recovery case), so no write to Notion happens here. Step 2 above still ran.
    if (dryRun) {
      write(`--adopt-live: would adopt the fresh read as last-render.md (no Notion write)\n`);
      return { code: 0, adopted: true };
    }
    if (!writeFile) throw new PublishError(3, 'publish requires deps.writeFile to adopt the live page');
    checkOnMain(execGit, repo); // F6: a write must never land off an up-to-date main checkout.
    writeFile(lastRenderPath, fresh);
    const nowIso = now.toISOString();
    execGit(['add', 'docs/decisions/last-render.md'], repo);
    execGit(['commit', '-m', `chore: decisions page adopted ${nowIso}`, '--', 'docs/decisions/last-render.md'], repo);
    pushWithRebase(execGit, repo, nowIso);
    write('adopted the live page as last-render.md (--adopt-live)\n');
    return { code: 0, adopted: true };
  }

  // Step 4: render.
  const rendered = render({
    repo, doneLine: doneLineForRender, now,
  }, { readFile, readdirSync, execGit });

  if (dryRun) {
    write(rendered);
    return { code: 0, rendered };
  }

  if (!deps.replaceMd) throw new PublishError(3, 'publish requires deps.replaceMd (notion.js replace-md)');
  if (!deps.titleSet) throw new PublishError(3, 'publish requires deps.titleSet (decisions-title.mjs)');
  if (!writeFile) throw new PublishError(3, 'publish requires deps.writeFile (to write last-render.md/session.md)');

  // Review round-2 F6: refuse before any Notion write, not after, when this checkout is not an
  // up-to-date main.
  checkOnMain(execGit, repo);

  // Lane 64 item 1: clearing Done and accounting the round are one step. Every check above has
  // passed, so the round is accounted here, BEFORE the page is written: a failure from here on
  // leaves an ACCOUNTED round with Done still checked (the lane-58 state this same command can
  // finish), never a cleared Done with an unaccounted round. A refusal to account stops the publish.
  if (roundToAccount) {
    try {
      await accountRound({
        repo,
        page,
        owner,
        reconciliation: `publish --clear-done at ${now.toISOString()}: the ${roundToAccount.ownerInputCount} owner input(s) on the fresh page were verified quoted verbatim in committed history on origin/main, and Done is cleared in this same step.`,
        now,
      });
    } catch (e) {
      throw new PublishError(3, `clear-done: the round could not be accounted, so Done was not cleared: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Step 5: notion.js replace-md.
  const replaceResult = await deps.replaceMd(page, rendered);
  const backupFile = (replaceResult && typeof replaceResult === 'object' && replaceResult.backupFile) || null;
  if (backupFile) {
    write(`backup: ${backupFile}\n`);
    // Review round-2 F4: reread the pre-write backup immediately — it is the page exactly as it
    // stood right before this write. If it does not match the step-1 fresh read, something wrote
    // in the window between steps 1 and 5, and that line must never be silently overwritten by an
    // exit 0.
    let backupText = null;
    try {
      backupText = readFile(backupFile);
    } catch {
      backupText = null;
    }
    if (backupText !== null && normalize(backupText) !== normalize(fresh)) {
      throw new PublishError(
        5,
        'the page changed between the fresh read (step 1) and the write (step 5); the pre-write '
        + `backup at ${backupFile} holds what was actually overwritten: restore it with `
        + `\`notion.js replace-md ${page} ${backupFile} --force\`, then run the pickup again before publishing`,
      );
    }
  }

  // Step 6: fresh readback.
  const readback = await deps.readPage(page);
  let readbackOk = true;
  try {
    const readbackDoc = parseDocument(readback);
    if (computeExitCode(readbackDoc) !== 0) readbackOk = false;
  } catch {
    readbackOk = false;
  }
  if (readbackOk && normalize(readback) !== normalize(rendered)) readbackOk = false;
  if (!readbackOk) {
    throw new PublishError(5, `readback did not verify (decisions-read.mjs was not exit 0, or the normalised diff against the render is nonempty); restore from the backup${backupFile ? ` at ${backupFile}` : ' notion.js logged at step 5'}`);
  }

  // Step 7: retitle. Review round-2 M4: a retitle failure must not abort before step 8 — the page
  // is already written and verified, so last-render.md must still be updated (else every later
  // publish exits 4 on drift this publish itself caused). Report the failure after step 8 instead.
  let retitleError = null;
  try {
    await deps.titleSet({ page, topic });
  } catch (e) {
    retitleError = e instanceof Error ? e.message : String(e);
  }

  // Step 8: last-render.md, session.md (clear-done only), commit, push.
  writeFile(lastRenderPath, readback);
  if (clearDone) {
    const sessionPath = path.join(repo, 'docs', 'decisions', 'session.md');
    const { bullets } = parseSessionSource(readFile(sessionPath));
    writeFile(sessionPath, `since: ${sessionSince}\n${bullets.join('\n')}\n`);
  }
  const nowIso = now.toISOString();
  const toAdd = ['docs/decisions/last-render.md'];
  if (clearDone) toAdd.push('docs/decisions/session.md');
  try {
    execGit(['add', ...toAdd], repo);
  } catch (e) {
    throw new PublishError(6, `git add failed after the page was written and verified: ${e instanceof Error ? e.message : e}`);
  }
  // Review round-2 M10: a republish whose readback is byte-identical to the last commit has
  // nothing new to commit — `git commit` would exit non-zero and fall through to a bare exit 1
  // after a successful, verified write. `git diff --cached --quiet` exits non-zero exactly when
  // there IS a staged difference, so a thrown call here means "there is something to commit".
  let hasChanges = true;
  try {
    execGit(['diff', '--cached', '--quiet', '--', ...toAdd], repo);
    hasChanges = false;
  } catch {
    hasChanges = true;
  }
  if (hasChanges) {
    try {
      execGit(['commit', '-m', `chore: decisions page published ${nowIso}`, '--', ...toAdd], repo);
    } catch (e) {
      throw new PublishError(6, `git commit failed after the page was written and verified: ${e instanceof Error ? e.message : e}`);
    }
    pushWithRebase(execGit, repo, nowIso);
  } else {
    write('nothing to commit: last-render.md (and session.md) already match the readback\n');
  }

  if (retitleError) {
    throw new Error(`decisions-title.mjs set failed after the page was written, verified and committed: ${retitleError}`);
  }

  return { code: 0, rendered };
}
