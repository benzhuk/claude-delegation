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
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseDocument } from './decisions-read.mjs';

/** exit 2 from the CLI: a source file breaks a rule this lane enforces before it ever writes. */
export class RefusedError extends Error {}
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
  if (collapsed.length && collapsed[collapsed.length - 1].trim() === '<empty-block/>') collapsed.pop();
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

const HEX_TOKEN_RE = /\b[0-9a-fA-F]{7,40}\b/g;

function hasLetterAndDigit(token) {
  return /[a-fA-F]/.test(token) && /[0-9]/.test(token);
}

/** Blanks out (same length, so line/col accounting stays honest) the spans exempt from the hex
 * rule: a markdown link's target, a bare URL, and a double-quoted owner note. */
function stripExempt(line) {
  return line
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length))
    .replace(/"[^"]*"/g, (m) => ' '.repeat(m.length));
}

/** Throws RefusedError naming `sourceLabel:line` on the first violation found. */
export function checkProseLines(text, sourceLabel) {
  const lines = String(text).split(/\r\n|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();
    const isSummaryLine = /^<summary>.*<\/summary>$/.test(trimmed);
    if (!isSummaryLine && trimmed.startsWith('**')) {
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

/** exit 2: "a waiting item fails decisions-read.mjs (SHAPELESS or missing options)". */
export function checkWaitingItem(text, label) {
  let doc;
  try {
    doc = parseDocument(text);
  } catch (e) {
    throw new RefusedError(`${label}: unreadable by decisions-read.mjs (${e instanceof Error ? e.message : e})`);
  }
  if (doc.shapeless.length > 0) {
    throw new RefusedError(`${label}: SHAPELESS (a <summary> toggle with no checkbox options; decisions-read.mjs cannot see it)`);
  }
  if (doc.decisions.length === 0) {
    throw new RefusedError(`${label}: missing options (no decision item found by decisions-read.mjs)`);
  }
}

function buildWaitingSection({
  repo, readFile, readdirSync,
}) {
  const dir = path.join(repo, 'docs', 'decisions', 'waiting');
  const files = listDated(readdirSync, dir, /\.md$/);
  if (files.length === 0) return 'Nothing right now.';
  const blocks = files.map((f) => {
    const full = path.join(dir, f);
    const text = readRequired(readFile, full, `waiting/${f}`);
    checkWaitingItem(text, `waiting/${f}`);
    checkProseLines(text, `waiting/${f}`);
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
  repo, doneLine = '- [ ] Done', dropOwnerLines = null,
}, deps = {}) {
  if (!repo) throw new RefusedError('render requires --repo');
  const readFile = deps.readFile ?? defaultReadFile;
  const readdirSync = deps.readdirSync ?? defaultReaddir;
  const execGit = deps.execGit ?? defaultExecGit;

  const waitingBlock = buildWaitingSection({ repo, readFile, readdirSync });
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

  if (dropOwnerLines) {
    const raw = readRequired(readFile, dropOwnerLines, '--drop-owner-lines');
    const forbidden = raw.split(/\r\n|\n/).map((l) => l.trim()).filter((l) => l !== '');
    for (const f of forbidden) {
      if (page.includes(f)) {
        throw new RefusedError(`render would leak an owner-written line into the page: ${f}`);
      }
    }
  }

  return page;
}

export { buildSessionSection as _buildSessionSectionForTest };
