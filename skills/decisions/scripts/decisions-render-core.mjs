/**
 * decisions-render-core — the pure page-composition half of the renderer: `normalize()` (the
 * ONE comparison function this whole lane uses, spec's "Normalisation" paragraph), the source
 * readers, the refusal checks, and `render()` itself. No network, no git write, no Notion — the
 * only side effect anywhere in this file is an optional injected `execGit` read (`ls-tree`,
 * read-only) used to refuse a 404 link before it ever reaches Notion.
 *
 * Split out of `decisions-render.mjs` (which stays the CLI entry point and re-exports
 * everything here) and `decisions-render-publish.mjs` (which imports this file, never the other
 * way around) so no file in this lane needs to import a script it does not own past ~800 lines.
 * Full contract: pack/spec.md, Lane 26.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseDocument, computeExitCode } from './decisions-read.mjs';
import { lintPage, formatViolations } from '../../notion-writing/scripts/page-lint.mjs';

/** exit 2 from the CLI: a source file breaks a rule this lane enforces before it ever writes. */
export class RefusedError extends Error {}

/**
 * The page-lint rules the render does NOT run on its own page, because it already owns the
 * concern: `checkWaitingItem` and `decisions-read.mjs` (finalizeDone) cover the waiting-item shape
 * and the Done line, and the history template writes " — " between a date link and its summary.
 * Everything else in page-lint's `decisions` kind runs (lane 39, spec Revision 2 F4).
 */
export const PAGE_LINT_SKIP = ['open-question-visible', 'decision-block', 'done-last', 'em-dash-arrow'];

/** Fail-open presence test for a kill-switch file: anything but "it does not exist" counts as present. */
function killSwitchPresent(p) {
  try {
    fs.statSync(p);
    return true;
  } catch (e) {
    return Boolean(e) && e.code !== 'ENOENT' && e.code !== 'ENOTDIR';
  }
}

/** exit 3 from the CLI: a source file could not even be read/parsed — never treated as clean. */
export class BlindError extends Error {}

export const REPO_BLOB_BASE = 'https://github.com/benzhuk/claude-delegation/blob/main';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation — spec: "CRLF to LF, strip trailing whitespace per line, collapse runs of blank
// lines to one, drop one trailing `<empty-block/>`; nothing else". Used by every comparison in
// this lane (the drift check, the readback check, `--adopt-live`, and every test that compares
// two renders) so a real edit is never hidden and a cosmetic one never blocks a publish.
// ─────────────────────────────────────────────────────────────────────────────

export function normalize(text) {
  const lines = String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''));
  const collapsed = [];
  let prevBlank = false;
  for (const l of lines) {
    const isBlank = l === '';
    if (isBlank && prevBlank) continue;
    collapsed.push(l);
    prevBlank = isBlank;
  }
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();
  // Review round-2 NIT: compare against the exact `<empty-block/>` string (no `.trim()`) — a
  // tab-indented trailing block is a different (indented) thing, never the page's own marker.
  if (collapsed.length && collapsed[collapsed.length - 1] === '<empty-block/>') collapsed.pop();
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();
  return collapsed.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Prose rules shared by now.md, session.md, waiting items and every history/archive Summary
// line: no line outside a `<summary>` starts with bold, and no line outside a URL or a quoted
// owner note carries a 7-40 char hex-looking token with at least one letter AND one digit (a sha,
// never a plain digit count or a calendar date). Exported so a unit test can drive both rules
// directly against synthetic strings, per the acceptance list.
// ─────────────────────────────────────────────────────────────────────────────

const HEX_TOKEN_RE = /(?<![0-9A-Za-z])[0-9a-fA-F]{7,40}(?![0-9A-Za-z])/g;

function hasLetterAndDigit(token) {
  return /[a-fA-F]/.test(token) && /[0-9]/.test(token);
}

/** Blanks out (same length, so line/col accounting stays honest) the spans exempt from the hex
 * rule: a markdown link's `(target)` only (never its `[visible text]`, which a sha can still hide
 * in), a bare URL, and a quoted owner note in exactly the spec's `Your note/question, <M-D>: "…"`
 * form (review round-2 M1: a bare `"…"` span anywhere was too wide an exemption). */
function stripExempt(line) {
  return line
    .replace(/\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length))
    .replace(/Your (?:note|question), [^:]*: "[^"]*"/g, (m) => ' '.repeat(m.length));
}

/** Throws RefusedError naming `sourceLabel:line` on the first violation found. */
export function checkProseLines(text, sourceLabel) {
  const lines = String(text).split(/\r\n|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();
    const isSummaryLine = /^<summary>.*<\/summary>$/.test(trimmed);
    // Review round-2 M2: strip a leading bullet/checkbox marker before testing "starts with
    // bold" (a bullet whose bold starts right after `- ` is still a plain-bullet-with-bold
    // violation), and also refuse a leading escaped `\*\*` (the page's own comment marker,
    // never legitimate outside a real, captured owner comment — F3).
    const withoutMarker = trimmed.replace(/^-\s*(?:\[[ xX]\]\s*)?/, '');
    if (!isSummaryLine && (withoutMarker.startsWith('**') || withoutMarker.startsWith('\\*\\*'))) {
      throw new RefusedError(`${sourceLabel}:${lineNo} starts with bold outside a <summary>: ${trimmed}`);
    }
    const scanned = stripExempt(raw);
    HEX_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = HEX_TOKEN_RE.exec(scanned))) {
      if (hasLetterAndDigit(m[0])) {
        throw new RefusedError(`${sourceLabel}:${lineNo} carries a hex-looking token outside a URL/quote: ${m[0]}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Autolink-guard (Lane 32, pack/spec.md): Notion autolinks a bare `word.TLD`-shaped filename, a
// bare `~`, or an unwrapped `www.`/`http(s)://` span on the way back onto the page — silently
// rewriting text nobody asked it to touch (the observed defect: `GOALS.md` became
// `[GOALS.md](http://GOALS.md)`, `~` became `\~`). Refused here, before `publish` ever reaches
// Notion, rather than caught after the write at the readback-compare step. No owner-quote
// exemption here (unlike the hex rule's `stripExempt`, which is never widened for this): Notion
// rewrites the text whoever wrote it, so a quoted filename is still written in backticks.
// ─────────────────────────────────────────────────────────────────────────────

const AUTOLINK_EXTENSIONS = ['md', 'sh', 'io', 'ai', 'co', 'me', 'so', 'py'];
const AUTOLINK_FILENAME_RE = new RegExp(`[A-Za-z0-9_-]+\\.(?:${AUTOLINK_EXTENSIONS.join('|')})(?![A-Za-z0-9_-]|[./][A-Za-z0-9_-])`, 'i');
const AUTOLINK_WWW_HTTP_RE = /www\.\S+|https?:\/\/\S+/i;

/** Blanks (same length, so line/col accounting stays honest) the spans exempt from the autolink
 * rules below: inline code spans, whole `[text](url)` links (both the visible text and the
 * target — `stripExempt` above only ever blanks a link's target, and only for the hex rule;
 * never widened here), fenced code blocks, and `<http(s)://...>` / `<www....>` autolinks (markdown's
 * own escape, which Notion leaves alone — NOT every `<...>` span: review r1 F1, a blanket blank
 * there let ordinary prose like `x <- y, ~/.agents -> z` or `latency < 5s, see GOALS.md` through
 * unchecked). Runs on the whole text at once, never a single line, because a fenced block's own
 * fence lines are the only signal that its content is exempt. */
export function stripAutolinkExempt(text) {
  const lines = String(text).split(/\r\n|\n/);
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      out.push(' '.repeat(line.length));
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(' '.repeat(line.length));
      continue;
    }
    out.push(
      line
        .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
        .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
        .replace(/<(?:https?:\/\/|www\.)[^>\s]*>/gi, (m) => ' '.repeat(m.length)),
    );
  }
  return out.join('\n');
}

/** Throws RefusedError naming `sourceLabel:line` on the first bare filename (final path segment
 * only), bare `~`, or unwrapped `www.`/`http(s)://` span found — text Notion will silently
 * autolink on the way back (Lane 32). Runs on the same lines `checkProseLines` runs on, wired in
 * next to it at every call site. */
export function checkAutolinkLines(text, sourceLabel) {
  const rawLines = String(text).split(/\r\n|\n/);
  const strippedLines = stripAutolinkExempt(text).split(/\r\n|\n/);
  for (let i = 0; i < rawLines.length; i += 1) {
    const lineNo = i + 1;
    const scanned = strippedLines[i] ?? '';
    const filenameMatch = AUTOLINK_FILENAME_RE.exec(scanned);
    if (filenameMatch) {
      throw new RefusedError(`${sourceLabel}:${lineNo} carries a bare filename Notion will autolink (${filenameMatch[0]}) — wrap it in backticks or write it as a link.`);
    }
    if (scanned.includes('~')) {
      throw new RefusedError(`${sourceLabel}:${lineNo} carries a bare ~ Notion will autolink — wrap it in backticks or write it as a link.`);
    }
    const urlMatch = AUTOLINK_WWW_HTTP_RE.exec(scanned);
    if (urlMatch) {
      throw new RefusedError(`${sourceLabel}:${lineNo} carries a bare ${urlMatch[0]} Notion will autolink — wrap it in backticks or write it as a link.`);
    }
  }
}

/** "a sentence ends at `. `, `? ` or `! ` outside a markdown link" (plus the paragraph's own end). */
export function countSentences(text) {
  const stripped = String(text).replace(/\[[^\]]*\]\([^)]*\)/g, (m) => 'x'.repeat(m.length));
  const mid = stripped.match(/[.?!] /g) || [];
  const endsTerminated = /[.?!]$/.test(stripped.trim());
  return mid.length + (endsTerminated ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Time formatting — all America/New_York, all via Intl (never a fixed offset), matching the
// exact wording already live on the page (pack/live-page.md).
// ─────────────────────────────────────────────────────────────────────────────

function nyParts(date, opts) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...opts }).formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}

/** `# This session (since your tick at <Day H:MM AM/PM>)` — e.g. "Sun 2:16 PM". */
export function formatSinceHeading(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new BlindError(`session.md since: is not a valid date: ${iso}`);
  const p = nyParts(d, {
    weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${p.weekday} ${p.hour}:${p.minute} ${String(p.dayPeriod || '').toUpperCase()}`;
}

/** `- [ ] Done (last cleared: <now, America/New_York>)` — e.g. "Sep 27, 2026, 2:16 PM America/New_York". */
export function formatClearedTimestamp(date) {
  const p = nyParts(date, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${p.month} ${p.day}, ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod || '').toUpperCase()} America/New_York`;
}

/** `[Mon D]` from a `YYYY-MM-DD` filename stem — no leading zero on the day, matching the page. */
export function formatMonthDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new BlindError(`not a YYYY-MM-DD date: ${ymd}`);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) throw new BlindError(`not a valid month: ${ymd}`);
  return `${MONTHS[month - 1]} ${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default, injectable IO. Every reader below takes these through `deps` so a test never touches
// the real filesystem or a real git checkout.
// ─────────────────────────────────────────────────────────────────────────────

export function defaultReadFile(f) {
  return fs.readFileSync(f, 'utf8');
}
export function defaultReaddir(d) {
  return fs.readdirSync(d);
}
export function defaultExecGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

function readRequired(readFile, fullPath, label) {
  try {
    return readFile(fullPath);
  } catch (e) {
    throw new BlindError(`cannot read ${label} (${fullPath}): ${e instanceof Error ? e.message : e}`);
  }
}

function listDated(readdirSync, dir, pattern) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw new BlindError(`cannot list ${dir}: ${e instanceof Error ? e.message : e}`);
  }
  return names.filter((n) => pattern.test(n)).sort();
}

/** exit 2: a linked file this render depends on is absent from `origin/main` — "a 404 link never
 * publishes". A no-op when `execGit` is not supplied (render() itself always supplies one; only a
 * caller testing composition alone in isolation would omit it, and does so deliberately). */
function checkLsTree(execGit, repo, relPath, label) {
  if (!execGit) return;
  let out;
  try {
    out = execGit(['ls-tree', '--name-only', 'origin/main', '--', relPath], repo);
  } catch (e) {
    throw new RefusedError(`${label}: git ls-tree failed (${e instanceof Error ? e.message : e})`);
  }
  if (!String(out).trim()) {
    throw new RefusedError(`${label}: ${relPath} is referenced but absent from git ls-tree origin/main (a 404 link never publishes)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Waiting items
// ─────────────────────────────────────────────────────────────────────────────

/** A waiting item's file is checked on its own, never inside the composed page, so the one
 * page-level warning that only means something once every item is assembled under a real Done
 * line ("no Done line found") is never a defect in a standalone item — excluded here, kept for
 * the composed-page self-check below (which always carries a real Done line). */
function itemWarnings(doc) {
  return doc.warnings.filter((w) => w.text !== 'no Done line found');
}

/** 1-based line number of a document's true last content line (ignores trailing blank lines
 * and one trailing `<empty-block/>`) — the same "true last line" decisions-read.mjs itself uses
 * for its DONE_NOT_LAST rule, recomputed here (never imported: this lane only reads
 * decisions-read.mjs through its exports) so a Done line sitting exactly there can be named by
 * file and line (round-2 R2-3). */
function lastContentLineNumber(text) {
  const lines = text.split('\n');
  let i = lines.length - 1;
  while (i >= 0) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed === '<empty-block/>') { i -= 1; continue; }
    break;
  }
  return i + 1;
}

function hasReadDefect(doc, warnings = doc.warnings) {
  const actionableStatuses = new Set(['AMBIGUOUS', 'TICKED', 'COMMENTED', 'DUE']);
  return doc.done === true
    || doc.decisions.some((d) => actionableStatuses.has(d.status))
    || doc.unattached.length > 0
    || warnings.length > 0;
}

/** Names the first thing `decisions-read.mjs` would flag on `doc` — used to put a file:line-ish
 * detail on a render-time refusal (F3) rather than a bare "computeExitCode !== 0". */
function describeReadDefect(doc, warnings = doc.warnings) {
  if (warnings.length) return `${warnings[0].text} (line ${warnings[0].line})`;
  for (const d of doc.decisions) {
    const ticked = d.options.find((o) => o.ticked);
    if (ticked) return `a pre-ticked option "${ticked.text}" (line ${ticked.line})`;
    if (d.comments.length) return `a comment "${d.comments[0].text}" (line ${d.comments[0].line})`;
    if (d.status === 'DUE') return `an overdue default (line ${d.line})`;
  }
  if (doc.unattached.length) {
    return `an unattached ${doc.unattached[0].kind} "${doc.unattached[0].text}" (line ${doc.unattached[0].line})`;
  }
  if (doc.done === true) return 'a ticked Done line';
  return 'decisions-read.mjs would exit non-zero on this text';
}

/** exit 2: "a waiting item fails decisions-read.mjs (SHAPELESS, missing options, owner input
 * already present, or any other page defect decisions-read.mjs would warn or act on)". Review
 * round-2 F3: a waiting item is source, never a live page — any owner input in it, any warning
 * (no default, an overdue default, more than one Done line, a non-decision item) is a defect to
 * refuse before it is ever composed into the page, not something to publish and only catch at
 * step 6. `now` is threaded through so an overdue default is refused too. */
export function checkWaitingItem(text, label, now = new Date()) {
  let doc;
  try {
    doc = parseDocument(text, { now });
  } catch (e) {
    throw new RefusedError(`${label}: unreadable by decisions-read.mjs (${e instanceof Error ? e.message : e})`);
  }
  if (doc.shapeless.length > 0) {
    throw new RefusedError(`${label}: SHAPELESS (a <summary> toggle with no checkbox options; decisions-read.mjs cannot see it)`);
  }
  if (doc.decisions.length === 0) {
    throw new RefusedError(`${label}: missing options (no decision item found by decisions-read.mjs)`);
  }
  // Review round-2 R2-3: a Done line that is the item's own true last line raises no
  // decisions-read.mjs warning (there is only one, and it is not "not last"), and when it is
  // unticked doc.done is false, so hasReadDefect below never sees it either. Only the renderer
  // ever writes a Done line — refused here, by file and line, before the composed-page
  // self-check would otherwise blame the renderer for a source-file defect.
  if (doc.doneLabel !== null) {
    throw new RefusedError(`${label}:${lastContentLineNumber(text)} carries a Done line (only the renderer writes Done)`);
  }
  const warnings = itemWarnings(doc);
  if (hasReadDefect(doc, warnings)) {
    throw new RefusedError(`${label}: carries owner input or a page defect decisions-read.mjs would flag (${describeReadDefect(doc, warnings)})`);
  }
}

function buildWaitingSection({
  repo, readFile, readdirSync, now,
}) {
  const dir = path.join(repo, 'docs', 'decisions', 'waiting');
  const files = listDated(readdirSync, dir, /\.md$/);
  if (files.length === 0) return 'Nothing right now.';
  const blocks = files.map((f) => {
    const full = path.join(dir, f);
    const text = readRequired(readFile, full, `waiting/${f}`);
    checkWaitingItem(text, `waiting/${f}`, now);
    checkProseLines(text, `waiting/${f}`);
    checkAutolinkLines(text, `waiting/${f}`);
    return text.replace(/\s+$/, '');
  });
  return blocks.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// now.md / session.md
// ─────────────────────────────────────────────────────────────────────────────

const NOW_MIN_SENTENCES = 3;
const NOW_MAX_SENTENCES = 5;
const SESSION_MAX_BULLETS = 8;
const SESSION_MAX_BULLET_CHARS = 200;

function buildNowSection({ repo, readFile }) {
  const full = path.join(repo, 'docs', 'decisions', 'now.md');
  const text = readRequired(readFile, full, 'now.md').trim();
  checkProseLines(text, 'now.md');
  checkAutolinkLines(text, 'now.md');
  const n = countSentences(text);
  if (n < NOW_MIN_SENTENCES || n > NOW_MAX_SENTENCES) {
    throw new RefusedError(`now.md:1 has ${n} sentences, outside the required ${NOW_MIN_SENTENCES}-${NOW_MAX_SENTENCES}`);
  }
  return text;
}

/** Returns `{ since, bullets }`; `since` is the raw ISO string from line 1. */
export function parseSessionSource(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const sinceMatch = /^since:\s*(\S+)\s*$/.exec(lines[0] ?? '');
  if (!sinceMatch) throw new BlindError('session.md:1 is not "since: <ISO>"');
  const bullets = lines.slice(1).map((l) => l.trim()).filter((l) => l !== '');
  return { since: sinceMatch[1], bullets };
}

function buildSessionSection({ repo, readFile }) {
  const full = path.join(repo, 'docs', 'decisions', 'session.md');
  const text = readRequired(readFile, full, 'session.md');
  const { since, bullets } = parseSessionSource(text);
  checkProseLines(bullets.join('\n'), 'session.md');
  checkAutolinkLines(text, 'session.md');
  if (bullets.length > SESSION_MAX_BULLETS) {
    throw new RefusedError(`session.md has ${bullets.length} bullets, more than the required ${SESSION_MAX_BULLETS}`);
  }
  for (const [idx, b] of bullets.entries()) {
    const bare = b.replace(/^-\s*/, '');
    if (bare.length > SESSION_MAX_BULLET_CHARS) {
      throw new RefusedError(`session.md:${idx + 2} is ${bare.length} characters, more than the required ${SESSION_MAX_BULLET_CHARS}`);
    }
  }
  const heading = `# This session (since your tick at ${formatSinceHeading(since)})`;
  const body = bullets.map((b) => (b.startsWith('-') ? b : `- ${b}`));
  return { heading, body, since };
}

// ─────────────────────────────────────────────────────────────────────────────
// History / archive
// ─────────────────────────────────────────────────────────────────────────────

const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const ARCHIVE_FILE_RE = /^decisions-page-(\d{4}-\d{2}-\d{2})\.md$/;

function extractSummary(text, label) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const summaryLine = lines[1];
  const m = summaryLine !== undefined ? /^Summary:\s*(.+)$/.exec(summaryLine) : null;
  if (!m) throw new RefusedError(`${label}:2 lacks its required "Summary: <one sentence>" line`);
  return { text: m[1].trim(), line: 2 };
}

function buildHistorySection({
  repo, readFile, readdirSync, execGit,
}) {
  const historyDir = path.join(repo, 'docs', 'decisions', 'history');
  const historyFiles = listDated(readdirSync, historyDir, DATE_FILE_RE).sort().reverse();
  const bullets = [];
  for (const file of historyFiles) {
    const label = `history/${file}`;
    const full = path.join(historyDir, file);
    const text = readRequired(readFile, full, label);
    const { text: summaryText, line } = extractSummary(text, label);
    checkProseLines(summaryText, `${label}:${line}`);
    checkAutolinkLines(summaryText, `${label}:${line}`);
    checkLsTree(execGit, repo, `docs/decisions/history/${file}`, label);
    const day = formatMonthDay(DATE_FILE_RE.exec(file)[1]);
    bullets.push(`- [${day}](${REPO_BLOB_BASE}/docs/decisions/history/${file}) — ${summaryText}`);
  }

  const archiveDir = path.join(repo, 'docs', 'decisions', 'archive');
  const archiveFiles = listDated(readdirSync, archiveDir, ARCHIVE_FILE_RE).sort();
  for (const file of archiveFiles) {
    const label = `archive/${file}`;
    checkLsTree(execGit, repo, `docs/decisions/archive/${file}`, label);
    const day = formatMonthDay(ARCHIVE_FILE_RE.exec(file)[1]);
    bullets.push(`- Everything before today's rewrite is kept, byte for byte, in the [${day} archive](${REPO_BLOB_BASE}/docs/decisions/archive/${file}).`);
  }
  return bullets;
}

// ─────────────────────────────────────────────────────────────────────────────
// render()
// ─────────────────────────────────────────────────────────────────────────────

const COMMENT_CALLOUT = [
  '<callout icon="✅">',
  '\tTo comment, start a line with `**` anywhere on this page, then tick Done to submit; the answer appears here and the exchange is kept in that day\'s history file.',
  '</callout>',
].join('\n');

/**
 * The whole page, composed purely from `--repo`'s source files (spec's Source-files list) —
 * never from a live Notion read. `deps.execGit` is the ONE optional side effect (an `ls-tree`
 * read against `origin/main`, never a write); everything else is injectable IO for tests.
 *
 * `dropOwnerLines`: an optional file of exact lines (one per line, blanks ignored) that must
 * never appear verbatim anywhere in the composed page — `publish`'s belt-and-braces guard
 * (used under `--clear-done`) that the fresh read's owner-written lines never leak back into
 * the repo-sourced render that replaces them.
 */
export function render({
  repo, doneLine = '- [ ] Done', dropOwnerLines = null, now = new Date(),
}, deps = {}) {
  if (!repo) throw new RefusedError('render requires --repo');
  const readFile = deps.readFile ?? defaultReadFile;
  const readdirSync = deps.readdirSync ?? defaultReaddir;
  const execGit = deps.execGit ?? defaultExecGit;

  checkAutolinkLines(doneLine, '--done-line');

  const waitingBlock = buildWaitingSection({
    repo, readFile, readdirSync, now,
  });
  const nowText = buildNowSection({ repo, readFile });
  const session = buildSessionSection({ repo, readFile });
  const historyBullets = buildHistorySection({
    repo, readFile, readdirSync, execGit,
  });

  const lines = [];
  lines.push('# Waiting on you now');
  lines.push(waitingBlock);
  lines.push('# What is going on');
  lines.push(nowText);
  lines.push(session.heading);
  lines.push(...session.body);
  lines.push('# History {toggle="true"}');
  for (const b of historyBullets) lines.push(`\t${b}`);
  lines.push('\t<empty-block/>');
  lines.push(COMMENT_CALLOUT);
  lines.push(doneLine);
  lines.push('<empty-block/>');
  const page = `${lines.join('\n')}\n`;

  // Review round-2 F3: render()'s own acceptance rule, enforced — the composed page must itself
  // be exit-0-clean by decisions-read.mjs's rules (no warnings, no actionable decision, no
  // unattached comment/tick, Done not ticked) before it is ever handed to a caller to write.
  // `publish()` never passes a ticked Done line, so this cannot block a legitimate publish.
  let selfCheck;
  try {
    selfCheck = parseDocument(page, { now });
  } catch (e) {
    throw new RefusedError(`render produced a page unreadable by decisions-read.mjs: ${e instanceof Error ? e.message : e}`);
  }
  if (computeExitCode(selfCheck) !== 0 || selfCheck.done !== false) {
    throw new RefusedError(`render produced a page decisions-read.mjs would flag (${describeReadDefect(selfCheck)}; done=${selfCheck.done}) — this is a renderer defect, never a source-file refusal`);
  }

  if (dropOwnerLines) {
    const raw = readRequired(readFile, dropOwnerLines, '--drop-owner-lines');
    const forbidden = raw.split(/\r\n|\n/).map((l) => l.trim()).filter((l) => l !== '');
    for (const f of forbidden) {
      if (page.includes(f)) {
        throw new RefusedError(`render would leak an owner-written line into the page: ${f}`);
      }
    }
  }

  // Lane 39: one call to the shared page checker, after every guard the render owns and before the
  // page leaves render(), so `render`, `publish` and `publish --dry-run` are all covered by it.
  // `~/.agents/no-page-lint` skips the call (fail-open, logged); a missing page-lint module is not
  // fail-open, the static import above fails the whole process loudly instead.
  const killSwitch = deps.pageLintKillSwitch ?? path.join(os.homedir(), '.agents', 'no-page-lint');
  if (killSwitchPresent(killSwitch)) {
    (deps.pageLintLog ?? ((line) => process.stderr.write(line)))(`decisions-render: page-lint skipped, kill switch ${killSwitch} exists\n`);
  } else {
    const violations = lintPage(page, { kind: 'decisions', skip: PAGE_LINT_SKIP });
    if (violations.length > 0) {
      throw new RefusedError(formatViolations(violations, 'composed-page').join('\n'));
    }
  }

  return page;
}

export { buildSessionSection as _buildSessionSectionForTest };
