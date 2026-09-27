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

/** Every non-zero publish exit named in the spec (3/4/5/6); `code` is the CLI exit code. */
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

export async function defaultReadPickupCapture({ repo, page }) {
  let pickupMod;
  try {
    pickupMod = await import('./decisions-pickup.mjs');
  } catch {
    return null;
  }
  let st;
  try {
    st = pickupMod.status({ repo, page });
  } catch {
    return null;
  }
  const round = st?.receipt?.round;
  if (!Number.isSafeInteger(round)) return null;
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
  return { round, tickAt, triples: ownerInputTriples(doc) };
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

/** Step 8's push, with the one non-fast-forward retry the spec allows (fetch, rebase, push
 * again); a second failure leaves the commit on `render/last-<ISO>` and throws exit 6. */
function pushWithRebase(execGit, repo, nowIso) {
  try {
    execGit(['push'], repo);
    return;
  } catch {
    // fall through to the one allowed retry
  }
  try {
    execGit(['fetch'], repo);
    execGit(['rebase'], repo);
    execGit(['push'], repo);
  } catch (e2) {
    const branch = `render/last-${nowIso}`;
    try {
      execGit(['branch', branch], repo);
    } catch {
      /* best-effort: the commit still exists on the current branch even if this fails */
    }
    throw new PublishError(6, `push failed twice; the page is already updated, the commit is left on ${branch} for the caller (${e2 instanceof Error ? e2.message : e2})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// publish()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{repo:string, page:string, clearDone?:boolean, adoptLive?:boolean, dryRun?:boolean, topic?:string|null}} opts
 * @param {object} deps injected IO: `readPage`, `replaceMd`, `titleSet`, `readPickupCapture`,
 *   `readLatestBackup`, `execGit`, `readFile`, `readdirSync`, `writeFile`, `now`, `write`.
 */
export async function publish(opts, deps = {}) {
  const {
    repo, page, clearDone = false, adoptLive = false, dryRun = false, topic = null,
  } = opts;
  if (!repo) throw new PublishError(2, 'publish requires --repo');
  if (!page) throw new PublishError(2, 'publish requires --page');

  const now = deps.now ? deps.now() : new Date();
  const readFile = deps.readFile ?? defaultReadFile;
  const readdirSync = deps.readdirSync ?? defaultReaddir;
  const execGit = deps.execGit ?? defaultExecGit;
  const writeFile = deps.writeFile;
  const write = deps.write ?? (() => {});
  const readPickupCapture = deps.readPickupCapture ?? defaultReadPickupCapture;
  const readLatestBackup = deps.readLatestBackup ?? (async () => null);

  if (!deps.readPage) throw new PublishError(3, 'publish requires deps.readPage (the notion.js reader)');

  // Step 1: fresh read.
  const fresh = await deps.readPage(page);

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
  if (clearDone) {
    const capture = await readPickupCapture({ repo, page });
    if (!capture) throw new PublishError(3, 'clear-done: no captured pickup round for this page');
    const freshTriples = ownerInputTriples(doc);
    if (!multisetsEqual(freshTriples, capture.triples)) {
      throw new PublishError(3, `clear-done: captured owner inputs do not match the fresh read (${describeMismatch(freshTriples, capture.triples)})`);
    }
    const todayFile = path.join(repo, 'docs', 'decisions', 'history', `${todayYmdNY(now)}.md`);
    let todayText = '';
    try {
      todayText = readFile(todayFile);
    } catch {
      todayText = '';
    }
    const waitingDir = path.join(repo, 'docs', 'decisions', 'waiting');
    let waitingTexts = [];
    try {
      waitingTexts = readdirSync(waitingDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => readFile(path.join(waitingDir, f)));
    } catch {
      waitingTexts = [];
    }
    for (const [, , text] of freshTriples) {
      if (!todayText.includes(text) && !waitingTexts.some((w) => w.includes(text))) {
        throw new PublishError(3, `clear-done: owner text is not present verbatim in today's history file or a waiting item: "${text}"`);
      }
    }
    doneLineForRender = `- [ ] Done (last cleared: ${formatClearedTimestamp(now)})`;
    sessionSince = capture.tickAt ?? now.toISOString();
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
  const freshNorm = normalize(fresh);
  if (freshNorm !== normalize(lastRender)) {
    if (!adoptLive) {
      const backup = await readLatestBackup(page);
      const crashed = backup !== null && normalize(backup) === freshNorm;
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
    writeFile(lastRenderPath, fresh);
    const nowIso = now.toISOString();
    execGit(['add', 'docs/decisions/last-render.md'], repo);
    execGit(['commit', '-m', `chore: decisions page adopted ${nowIso}`], repo);
    pushWithRebase(execGit, repo, nowIso);
    write('adopted the live page as last-render.md (--adopt-live)\n');
    return { code: 0, adopted: true };
  }

  // Step 4: render.
  const rendered = render({ repo, doneLine: doneLineForRender }, { readFile, readdirSync, execGit });

  if (dryRun) {
    write(rendered);
    return { code: 0, rendered };
  }

  if (!deps.replaceMd) throw new PublishError(3, 'publish requires deps.replaceMd (notion.js replace-md)');
  if (!deps.titleSet) throw new PublishError(3, 'publish requires deps.titleSet (decisions-title.mjs)');
  if (!writeFile) throw new PublishError(3, 'publish requires deps.writeFile (to write last-render.md/session.md)');

  // Step 5: notion.js replace-md.
  await deps.replaceMd(page, rendered);

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
    throw new PublishError(5, 'readback did not verify (decisions-read.mjs was not exit 0, or the normalised diff against the render is nonempty); restore from the backup notion.js logged at step 5');
  }

  // Step 7: retitle.
  await deps.titleSet({ page, topic });

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
  execGit(['add', ...toAdd], repo);
  execGit(['commit', '-m', `chore: decisions page published ${nowIso}`], repo);
  pushWithRebase(execGit, repo, nowIso);

  return { code: 0, rendered };
}
