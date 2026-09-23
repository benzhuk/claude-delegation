#!/usr/bin/env node
/**
 * goals-mirror — renders `docs/GOALS.md` and `docs/goals/card.md` into the Notion-flavoured
 * markdown shape of `templates/goals-page.md`, and publishes that render to the Goals page.
 * `render` is pure: no network, no git write, sources read straight off `--repo`. `publish`
 * refuses (exit 1) on a dirty source file or an un-acted owner note, and only then calls
 * `notion.js publish` — a whole-page replace. Full rules: docs/specs/2026-09-22-decisions-current.md.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from './decisions-read.mjs';
import { extractPageSha } from './decisions-handback.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_PATH = path.join(SCRIPT_DIR, '..', 'templates', 'goals-page.md');

const STATUS_COLOR = { MET: 'green', PARTIAL: 'orange', NONE: 'red', UNKNOWN: 'red' };

/** Refuses the render/publish outright (exit 1): a dirty source, an owner note, a bad CLI use. */
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

/** Rule 5: every full `YYYY-MM-DD` becomes `M-D`, no leading zeros. Any other date is untouched. */
function convertDates(text) {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, _y, mo, d) => `${Number(mo)}-${Number(d)}`);
}

/** Rule 6: one trailing ` (…)` group at the very end of the line is dropped whole. */
function stripTrailingParen(text) {
  return text.replace(/\s*\([^()]*\)\.?\s*$/, '');
}

function splitLines(text) {
  return text.split(/\r\n|\n/);
}

/** Rule 2: card.md's five lines, each TAB-prefixed, in source order. */
function buildCardBlock(cardText) {
  const lines = splitLines(cardText).filter((l) => l.trim() !== '');
  lines.forEach((l, idx) => checkForbidden(l, idx + 1, 'docs/goals/card.md'));
  return lines.map((l) => `\t${l}`).join('\n');
}

/** Rules 3-4-5-6-7: one `# X {toggle="true"}` block per `## ` section of GOALS.md. */
function renderSection(headingText, sectionLines) {
  const out = [`# ${headingText} {toggle="true"}`];
  let sawStatus = false;
  for (const { text, lineNo } of sectionLines) {
    if (text.trim() === '') continue;
    checkForbidden(text, lineNo, 'docs/GOALS.md');
    const converted = convertDates(text);
    const statusMatch = /^Status:\s*([A-Za-z]+)\.\s*([\s\S]*)$/.exec(converted);
    if (statusMatch) {
      sawStatus = true;
      const word = statusMatch[1];
      const rest = stripTrailingParen(statusMatch[2]);
      const color = STATUS_COLOR[word] || 'red';
      out.push(`\t<span color="${color}">**${word}**</span>${rest ? ` ${rest}` : ''}`);
    } else {
      out.push(`\t${converted}`);
    }
  }
  if (!sawStatus) out.push('\t<span color="red">**UNKNOWN**</span>');
  out.push('\t<empty-block/>');
  return out.join('\n');
}

function buildSections(goalsText) {
  const lines = splitLines(goalsText);
  const startIdx = lines.findIndex((l) => /^##[ \t]+/.test(l));
  if (startIdx === -1) return '';
  const blocks = [];
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
    blocks.push(renderSection(headingText, sectionLines));
  }
  return blocks.join('\n');
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
  const sectionsBlock = buildSections(goalsText);
  const values = { sha, card: cardBlock, sections: sectionsBlock };
  let page = template.replace(/\{\{(sha|card|sections)\}\}/g, (_m, key) => values[key]);
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

/** F6: publish refuses unless the working tree's sources equal their origin/main blob. */
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

/**
 * Owner notes blocking a publish: any decision carrying an unreplied comment, on EVERY
 * status (not only when `d.status === 'COMMENTED'` — the status priority AMBIGUOUS >
 * TICKED > COMMENTED > DUE > REPLIED > OPEN means a ticked option with an unanswered
 * comment reports as TICKED, not COMMENTED, and would otherwise slip past this check),
 * plus any UNATTACHED comment line.
 */
function ownerNoteLines(doc) {
  const lines = [];
  for (const d of doc.decisions) {
    const unreplied = d.comments.filter((c) => !c.replied);
    if (unreplied.length === 0) continue;
    lines.push(`COMMENTED\t${d.title}\t${unreplied.map((c) => c.text).join(' | ')}`);
  }
  for (const u of doc.unattached) {
    if (u.kind !== 'comment') continue;
    lines.push(`UNATTACHED\tline ${u.line}\t${u.text}${u.under !== undefined ? `\t(under ${u.under})` : ''}`);
  }
  return lines;
}

/**
 * Backstop for the reader: any line whose text, past indentation and block markers
 * (bullet, number, quote, heading, to-do box, inline tags), starts with the escaped marker.
 */
const RAW_NOTE_RE = /^[\t ]*(?:(?:[-*+>]|\d+[.)]|#{1,6})[\t ]+|\[[ xX]\][\t ]*|<[^>]+>)*\\\*\\\*/;
function rawNoteLines(text) {
  return text.split(/\r\n|\n/).flatMap((l, i) => (RAW_NOTE_RE.test(l) ? [`NOTE\tline ${i + 1}\t${l.trim()}`] : []));
}

function defaultSpawnNotion({ parent, title, file }) {
  const script = path.join(os.homedir(), '.claude', 'scripts', 'notion.js');
  const res = spawnSync(process.execPath, [script, 'publish', parent, title, file], { encoding: 'utf8' });
  return { status: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/**
 * `--current none` is allowed only when `--parent` has no child page titled `title`. This lists
 * the parent's children with `notion.js read-blocks <parent>` (paginated, parent-scoped: the same
 * set `notion.js publish` searches with findChildPageByTitle). Any doubt is BLIND, never "absent".
 */
export function defaultCheckGoalsPageAbsent({ parent, title, spawn = spawnSync }) {
  const script = path.join(os.homedir(), '.claude', 'scripts', 'notion.js');
  const res = spawn(process.execPath, [script, 'read-blocks', parent], { encoding: 'utf8' });
  if (!res || res.status !== 0) {
    throw new BlindError(`cannot list the children of ${parent}: notion.js read-blocks exited ${res ? res.status : 'no result'}`);
  }
  const out = typeof res.stdout === 'string' ? res.stdout : '';
  if (!/^# /.test(out)) {
    throw new BlindError('notion.js read-blocks gave no page header; cannot tell whether the Goals page exists');
  }
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !new RegExp(`^[ \\t]*\\[child page: ${esc}\\] \\(`, 'm').test(out);
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
  writeFile = (f, s) => fs.writeFileSync(f, s),
  write = (s) => process.stdout.write(s),
  writeErr = (s) => process.stderr.write(s),
  git = defaultGit,
  spawnNotion = defaultSpawnNotion,
  checkGoalsPageAbsent = defaultCheckGoalsPageAbsent,
  tmpFile = () => path.join(os.tmpdir(), `goals-mirror-${process.pid}-${Date.now()}.md`),
} = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.cmd === 'render') {
      if (!opts.repo) throw new RefusedError('render requires --repo');
      const sha = opts.sha || computeSha({ repo: opts.repo, git });
      const page = renderPage({ repo: opts.repo, sha, readFile });
      write(page);
      return 0;
    }
    if (opts.cmd === 'publish') {
      if (!opts.repo) throw new RefusedError('publish requires --repo');
      if (!opts.parent) throw new RefusedError('publish requires --parent');
      if (opts.current === undefined) throw new RefusedError('publish requires --current');

      const dirty = checkDirty({ repo: opts.repo, readFile, git });
      if (dirty.dirty) {
        writeErr(`goals-mirror: working tree ${dirty.path} differs from origin/main; commit and push before publish\n`);
        return 1;
      }

      if (opts.current === 'none') {
        // The owner-note check must never be skippable just by claiming --current none:
        // refuse unless we can positively confirm the target Goals page does not exist yet.
        let absent;
        try {
          absent = checkGoalsPageAbsent({ parent: opts.parent, title: 'Goals' });
        } catch (e) {
          if (e instanceof BlindError) throw e;
          throw new BlindError(`cannot check whether the Goals page exists: ${e instanceof Error ? e.message : e}`);
        }
        if (absent !== true) {
          writeErr('goals-mirror: --current none requires the Goals page to be absent, but one was found; pass a --current read of it instead\n');
          return 1;
        }
      } else {
        let currentText;
        try {
          currentText = readFile(opts.current);
        } catch (e) {
          throw new BlindError(`cannot read --current ${opts.current}: ${e instanceof Error ? e.message : e}`);
        }
        let doc;
        try {
          doc = parseDocument(currentText);
        } catch (e) {
          throw new BlindError(`cannot parse --current: ${e instanceof Error ? e.message : e}`);
        }
        const readerNotes = ownerNoteLines(doc);
        const notes = readerNotes.length > 0 ? readerNotes : rawNoteLines(currentText);
        if (notes.length > 0) {
          for (const l of notes) write(`${l}\n`);
          writeErr('goals-mirror: owner notes on the goals page; act on them and republish before this can proceed\n');
          return 1;
        }
        if (extractPageSha(currentText) === null) {
          writeErr('goals-mirror: --current has no "main at <sha>" on the first line of its first callout; it is not a read of the Goals mirror page\n');
          return 1;
        }
      }

      const sha = opts.sha || computeSha({ repo: opts.repo, git });
      const page = renderPage({ repo: opts.repo, sha, readFile });
      const tmp = tmpFile();
      writeFile(tmp, page);
      const result = spawnNotion({ parent: opts.parent, title: 'Goals', file: tmp });
      if (result.stdout) write(result.stdout);
      if (result.status && result.status !== 0) {
        if (result.stderr) writeErr(result.stderr);
        return 1;
      }
      return 0;
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
