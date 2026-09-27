#!/usr/bin/env node
/**
 * goals-mirror — renders `docs/GOALS.md` and `docs/goals/card.md` into the Notion-flavoured
 * markdown shape of `templates/goals-page.md`. `render` is pure: no network, no git write,
 * sources read straight off `--repo`. Publication is deliberately disabled: use the existing
 * notion-writing skill's fresh targeted edits and readback for an attended update.
 *
 * Pinned shape (2026-09-27, "one line per goal, detail collapsed"): the marker callout is
 * the FIRST callout on the page, its first line carrying the sha (decisions-handback reads
 * it from there); then one table, a row per `## ` goal (state word, heading, one-sentence
 * status cut, status date); then ONE `# Detail {toggle="true"}` whose tab-indented children
 * are the card callout, the source note, and today's per-goal `# X {toggle="true"}` sections
 * carried byte for byte after one added tab; then a trailing `<empty-block/>`. No callout
 * lives outside Detail except the marker callout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_PATH = path.join(SCRIPT_DIR, '..', 'templates', 'goals-page.md');

const STATUS_COLOR = { MET: 'green', PARTIAL: 'orange', NONE: 'red', UNKNOWN: 'red' };

/** Refuses an unsupported command or malformed render request (exit 1). */
export class RefusedError extends Error {}
/** A read or parse failure the caller cannot trust (exit 3), never a silent false-clean. */
export class BlindError extends Error {}

function checkForbidden(text, lineNo, sourceLabel) {
  const t = text.trim();
  const body = t.replace(/^[-*+]\s+/, ''); // what the reader tests after splitMarker strips a bullet
  if (/^[-*+]\s+\[/.test(t)) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a checkbox ("- ["): ${t}`);
  }
  if (/<summary\b/i.test(t)) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a <summary> toggle: ${t}`);
  }
  if (/^Default\b/.test(body) && body.includes(':')) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a Default line: ${t}`);
  }
  if (/^`{3,}/.test(t)) {
    throw new RefusedError(`${sourceLabel}:${lineNo} would render as a code fence: ${t}`);
  }
}

function splitLines(text) {
  return text.split(/\r\n|\n/);
}

/** Every line of `text` gets exactly one leading tab; a genuinely blank line stays blank. */
function indentBlock(text) {
  if (text === '') return '';
  return text.split('\n').map((l) => (l === '' ? '' : `\t${l}`)).join('\n');
}

/** Rule 2: card.md's five lines, each TAB-prefixed, in source order. */
function buildCardBlock(cardText) {
  const lines = splitLines(cardText).filter((l) => l.trim() !== '');
  lines.forEach((l, idx) => checkForbidden(l, idx + 1, 'docs/goals/card.md'));
  return lines.map((l) => `\t${l}`).join('\n');
}

// ── Table-row refusal rules: a hex token (7-40 hex chars with a letter and a digit), a test
// count (`N of M` or `N/M`), or a session id (a UUID shape) in the one-sentence table cut —
// the Status line is fixed in GOALS.md at the source, never patched here.
const TEST_COUNT_RE = /\b\d+\s+of\s+\d+\b|\b\d+\/\d+\b/;
const SESSION_ID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;

/** First 7-40-char hex run in `s` that mixes at least one letter (a-f) and one digit, or null. */
function findHexToken(s) {
  const re = /\b[0-9a-fA-F]{7,40}\b/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(s))) {
    const tok = m[0];
    if (/[a-fA-F]/.test(tok) && /\d/.test(tok)) return tok;
  }
  return null;
}

/** Throws RefusedError naming the goal heading and the offending token, else returns. */
function checkTableSentence(sentence, heading, lineNo) {
  const session = SESSION_ID_RE.exec(sentence);
  if (session) {
    throw new RefusedError(`docs/GOALS.md:${lineNo} table sentence for "${heading}" carries a session id "${session[0]}": fix the Status line at the source`);
  }
  const testCount = TEST_COUNT_RE.exec(sentence);
  if (testCount) {
    throw new RefusedError(`docs/GOALS.md:${lineNo} table sentence for "${heading}" carries a test count "${testCount[0]}": fix the Status line at the source`);
  }
  const hex = findHexToken(sentence);
  if (hex) {
    throw new RefusedError(`docs/GOALS.md:${lineNo} table sentence for "${heading}" carries a hex token "${hex}": fix the Status line at the source`);
  }
}

/** The Status line's text after the state word, up to (and including) its first ". ". */
function cutSentence(rest) {
  const idx = rest.indexOf('. ');
  if (idx === -1) return rest.trim();
  return rest.slice(0, idx + 1).trim();
}

// A trailing dated citation, e.g. "(2026-09-22 audit)" or "(2026-09-25 bearings O5; note
// `...`)" at the very end of the Status line's text — any other date mentioned mid-evidence
// (a file name, an earlier citation) is not "the status date".
const STATUS_DATE_RE = /\((\d{4}-\d{2}-\d{2})\b[^()]*\)\s*$/;

function extractStatusDate(rest) {
  const m = STATUS_DATE_RE.exec(rest.trim());
  return m ? m[1] : 'undated';
}

function escapeCell(s) {
  return s.replace(/\|/g, '\\|');
}

function buildTableRow({ heading, word, sentence, date }) {
  const color = STATUS_COLOR[word] || 'red';
  const stateCell = `<span color="${color}">**${word}**</span>`;
  return `| ${stateCell} | ${escapeCell(heading)} | ${escapeCell(sentence)} | ${date} |`;
}

const TABLE_HEADER = '| State | Goal | Summary | Date |\n| --- | --- | --- | --- |';

/**
 * One goal's Detail toggle (unchanged text vs. before Detail existed) and its table row.
 * Both are derived from the same single pass over the section's lines so the table's word,
 * sentence and date always agree with what Detail shows.
 */
function renderSection(headingText, sectionLines) {
  const out = [`# ${headingText} {toggle="true"}`];
  let sawStatus = false;
  let tableWord = 'UNKNOWN';
  let tableSentence = '';
  let tableDate = 'undated';
  for (const { text, lineNo } of sectionLines) {
    if (text.trim() === '') continue;
    checkForbidden(text, lineNo, 'docs/GOALS.md');
    const statusMatch = /^Status:\s*([A-Za-z]+)\.\s*([\s\S]*)$/.exec(text);
    if (statusMatch) {
      sawStatus = true;
      const word = statusMatch[1];
      const rest = statusMatch[2];
      const color = STATUS_COLOR[word] || 'red';
      out.push(`\t<span color="${color}">**${word}**</span>${rest ? ` ${rest}` : ''}`);
      tableWord = word;
      tableSentence = cutSentence(rest);
      tableDate = extractStatusDate(rest);
      checkTableSentence(tableSentence, headingText, lineNo);
    } else {
      out.push(`\t${text}`);
    }
  }
  if (!sawStatus) out.push('\t<span color="red">**UNKNOWN**</span>');
  out.push('\t<empty-block/>');
  const tableRow = buildTableRow({
    heading: headingText, word: tableWord, sentence: tableSentence, date: tableDate,
  });
  return { detail: out.join('\n'), tableRow };
}

/** One `{ headingText, sectionLines }` per `## ` section of GOALS.md, in source order. */
function parseGoalSections(goalsText) {
  const lines = splitLines(goalsText);
  const startIdx = lines.findIndex((l) => /^##[ \t]+/.test(l));
  if (startIdx === -1) return [];
  const sections = [];
  let i = startIdx;
  while (i < lines.length) {
    const headingMatch = /^##[ \t]+(.*)$/.exec(lines[i]);
    const headingText = headingMatch[1].trim();
    i += 1;
    const sectionLines = [];
    while (i < lines.length && !/^##[ \t]+/.test(lines[i])) {
      sectionLines.push({ text: lines[i], lineNo: i + 1 });
      i += 1;
    }
    sections.push({ headingText, sectionLines });
  }
  return sections;
}

/** Rules 3-4-7-refusals: the Detail block (goal sections, unchanged text) and the table rows. */
function buildDetailAndTable(goalsText) {
  const sections = parseGoalSections(goalsText);
  const details = [];
  const rows = [TABLE_HEADER];
  for (const { headingText, sectionLines } of sections) {
    const { detail, tableRow } = renderSection(headingText, sectionLines);
    details.push(detail);
    rows.push(tableRow);
  }
  return { sectionsBlock: details.join('\n'), tableBlock: rows.join('\n') };
}

const defaultReadFile = (f) => fs.readFileSync(f, 'utf8');

/**
 * Pure: `--repo`'s two sources plus the skill's own template, joined directly (never a root
 * walk-up). Never touches git; `sha` is supplied by the caller (CLI resolves `--sha` or git).
 */
export function renderPage({ repo, sha, readFile = defaultReadFile, templatePath = DEFAULT_TEMPLATE_PATH }) {
  const readOrBlind = (f) => {
    try {
      return readFile(f);
    } catch (e) {
      throw new BlindError(`cannot read ${f}: ${e instanceof Error ? e.message : e}`);
    }
  };
  const goalsText = readOrBlind(path.join(repo, 'docs', 'GOALS.md'));
  const cardText = readOrBlind(path.join(repo, 'docs', 'goals', 'card.md'));
  const template = readOrBlind(templatePath);
  const cardBlock = buildCardBlock(cardText);
  const { sectionsBlock, tableBlock } = buildDetailAndTable(goalsText);

  // The card callout + source note, exactly as they read before Detail existed — indented one
  // tab, same as the goal sections, because both are now Detail's children (2026-09-27 rule).
  const cardCallout = [
    '<callout icon="🃏" color="blue_background">',
    '\t**Five-line project card** (rendered from source; installed host injection coverage is unknown)',
    cardBlock,
    '\tGOAL, NOT, DONE, and KILL are source labels, not attributed quotations. Verify the source and `main at` version before an attended publication; the card is capped at 800 bytes by a plugin constant.',
    '</callout>',
    'Source lines labeled as quotations retain their source attribution and date. Other lines are project wording. Status styling reflects the source text: MET, PARTIAL, NONE, or UNKNOWN; it does not establish installed behavior or release state.',
  ].join('\n');

  const detailBlock = [indentBlock(cardCallout), indentBlock(sectionsBlock)].filter((s) => s !== '').join('\n');

  const values = { sha, table: tableBlock, detail: detailBlock };
  let page = template.replace(/\{\{(sha|table|detail)\}\}/g, (_m, key) => values[key]);
  if (!page.endsWith('\n')) page += '\n';
  return page;
}

function defaultGit(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

/** `git log -1 --format=%h origin/main -- <sources>` in `--repo` — the last commit that changed either. */
export function computeSha({ repo, git = defaultGit }) {
  let out;
  try {
    out = git(repo, ['log', '-1', '--format=%h', 'origin/main', '--', 'docs/GOALS.md', 'docs/goals/card.md']);
  } catch (e) {
    throw new BlindError(`git log failed in ${repo}: ${e instanceof Error ? e.message : e}`);
  }
  const sha = out.trim();
  if (!sha) throw new BlindError('git log gave no sha for the goals sources on origin/main');
  return sha;
}

/** Retained pure helper for callers that compare local goals sources with origin/main. */
export function checkDirty({ repo, readFile = defaultReadFile, git = defaultGit }) {
  const sources = ['docs/GOALS.md', 'docs/goals/card.md'];
  for (const rel of sources) {
    let origin;
    try {
      origin = git(repo, ['show', `origin/main:${rel}`]);
    } catch (e) {
      throw new BlindError(`cannot read origin/main:${rel}: ${e instanceof Error ? e.message : e}`);
    }
    const local = readFile(path.join(repo, ...rel.split('/')));
    if (local.replace(/\r\n/g, '\n') !== origin.replace(/\r\n/g, '\n')) {
      return { dirty: true, path: rel };
    }
  }
  return { dirty: false, path: null };
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--repo') { opts.repo = rest[i += 1]; }
    else if (a === '--sha') { opts.sha = rest[i += 1]; }
    else if (a === '--parent') { opts.parent = rest[i += 1]; }
    else if (a === '--current') { opts.current = rest[i += 1]; }
  }
  return opts;
}

/**
 * The whole CLI, wrapped: nothing above this line can crash the process past exit 3. IO and
 * git/spawn are injectable so tests never touch a real repo or call the real notion.js.
 */
export function run({
  argv = process.argv.slice(2),
  readFile = defaultReadFile,
  write = (s) => process.stdout.write(s),
  writeErr = (s) => process.stderr.write(s),
  git = defaultGit,
} = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.cmd === 'render') {
      if (!opts.repo) throw new RefusedError('render requires --repo');
      const sha = opts.sha || computeSha({ repo: opts.repo, git });
      if (!opts.sha) {
        const freshness = checkDirty({ repo: opts.repo, readFile, git });
        if (freshness.dirty) {
          throw new RefusedError(`render refuses local ${freshness.path} that differs from origin/main; use --sha only for a caller-attested preview`);
        }
      }
      const page = renderPage({ repo: opts.repo, sha, readFile });
      write(page);
      return 0;
    }
    if (opts.cmd === 'publish') {
      writeErr('goals-mirror: publish is disabled; run render, read the Goals page fresh, then use notion-writing targeted anchored edits and verify readback\n');
      return 1;
    }
    throw new RefusedError(`unknown command: ${opts.cmd ?? '(none)'}`);
  } catch (err) {
    if (err instanceof BlindError) {
      writeErr(`goals-mirror: BLIND: ${err.message}\n`);
      return 3;
    }
    writeErr(`goals-mirror: ${err instanceof Error ? err.message : err}\n`);
    return 1;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync(r); } catch { /* not on disk — fall back to the resolved path */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); });
  process.exitCode = run();
}
