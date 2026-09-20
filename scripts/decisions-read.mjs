#!/usr/bin/env node
/**
 * decisions-read — a PURE PARSER for the owner's Notion decisions page: markdown in, a
 * status list out. No network, no state files, no Notion calls, no dependencies beyond
 * Node's standard library. Every checkbox and owner comment attaches to the nearest
 * preceding title, at any depth — no other indentation logic. Full rules:
 * docs/specs/2026-09-20-decisions-reader.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The owner's asterisks arrive escaped one at a time: backslash, star, backslash,
// star (4 chars). Bold an agent writes is plain `**` and must never match this.
const ESCAPED_BOLD = '\\*\\*';

function isCommentText(text) {
  return text.startsWith(ESCAPED_BOLD);
}

function stripCommentMarker(text) {
  return text.slice(ESCAPED_BOLD.length).trim();
}

/** Strip a `- ` / `- [ ] ` / `- [x] ` marker (if any) off a line already trimmed of indentation. */
function splitMarker(rawLine) {
  const stripped = rawLine.replace(/^[ \t]+/, '');
  let m = /^-\s\[([ xX])\]\s?(.*)$/.exec(stripped);
  if (m) return { kind: 'checkbox', ticked: m[1].toLowerCase() === 'x', text: m[2] };
  m = /^-\s(.*)$/.exec(stripped);
  if (m) return { kind: 'bullet', text: m[1] };
  return { kind: 'plain', text: stripped };
}

/** A `<summary>…</summary>` line, or a toggleable heading `#`/`##`/`###` … `{toggle="true"}`. */
function matchTitle(rawLine) {
  let m = /^[ \t]*<summary>(.*)<\/summary>[ \t]*$/.exec(rawLine);
  if (m) return m[1];
  m = /^[ \t]*#{1,3}[ \t]+(.*?)[ \t]*\{toggle="true"\}[ \t]*$/.exec(rawLine);
  if (m) return m[1];
  return null;
}

function normalizeTitle(raw) {
  let t = raw.trim();
  t = t.replace(/\(\d[^()]*\)\s*$/, '').trimEnd(); // trailing "(7 · 4 covered)"-style suffix
  if (t.startsWith('**') && t.endsWith('**') && t.length >= 4) t = t.slice(2, -2);
  return t.trim();
}

/** The page-level Done line: last non-empty, non-`<empty-block/>` line, if it's a column-0 checkbox. */
function findDoneLine(lines) {
  let i = lines.length - 1;
  while (i >= 0) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed === '<empty-block/>') { i -= 1; continue; }
    break;
  }
  if (i < 0) return { doneLineIndex: -1, done: null };
  const m = /^-\s\[([ xX])\]\s+Done\s*$/.exec(lines[i]);
  if (!m) return { doneLineIndex: -1, done: null };
  return { doneLineIndex: i, done: m[1].toLowerCase() === 'x' };
}

function computeStatus(title) {
  const tickedCount = title.options.filter((o) => o.ticked).length;
  if (tickedCount >= 2) return 'AMBIGUOUS';
  if (tickedCount === 1) return 'TICKED';
  if (title.comments.length > 0) return 'COMMENTED';
  return 'OPEN';
}

/** Throw for anything that leaves the parse unable to trust the document (exit 3, never a crash). */
class BlindError extends Error {}

export function parseDocument(text) {
  if (!text || text.trim() === '') throw new BlindError('empty input');
  const lines = text.split(/\r\n|\n/);
  const { doneLineIndex, done } = findDoneLine(lines);

  let inFence = false;
  const titles = [];
  const unattached = [];
  let currentTitle = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();

    if (/^`{3,}/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (i === doneLineIndex) continue; // the page-level Done line is not an option of anything

    const titleText = matchTitle(raw);
    if (titleText !== null) {
      currentTitle = { title: normalizeTitle(titleText), line: lineNo, options: [], comments: [] };
      titles.push(currentTitle);
      continue;
    }

    const parsed = splitMarker(raw);
    if (isCommentText(parsed.text)) {
      const commentText = stripCommentMarker(parsed.text);
      if (currentTitle) currentTitle.comments.push({ text: commentText, line: lineNo });
      else unattached.push({ text: commentText, line: lineNo, kind: 'comment' });
      continue;
    }

    if (parsed.kind === 'checkbox') {
      const optionText = parsed.text.trim();
      if (currentTitle) currentTitle.options.push({ text: optionText, ticked: parsed.ticked, line: lineNo });
      else if (parsed.ticked) unattached.push({ text: optionText, line: lineNo, kind: 'tick' });
      // an unticked, unattached checkbox has nothing to attach to and nothing to act on: dropped
    }
    // a plain paragraph or a non-comment bullet carries no signal
  }

  if (inFence) throw new BlindError('unterminated fenced code block');
  if (titles.length === 0) throw new BlindError('no titles found');

  const decisions = titles
    .filter((t) => t.options.length > 0)
    .map((t) => ({ ...t, status: computeStatus(t) }));

  return { decisions, unattached, done };
}

function detailFor(d) {
  const tickedOptions = d.options.filter((o) => o.ticked);
  if (d.status === 'AMBIGUOUS') return tickedOptions.map((o) => o.text).join(' | ');
  if (d.status === 'TICKED') return [tickedOptions[0].text, ...d.comments.map((c) => c.text)].join(' | ');
  if (d.status === 'COMMENTED') return d.comments.map((c) => c.text).join(' | ');
  return '';
}

export function formatText(doc) {
  const lines = doc.decisions.map((d) => `${d.status}\t${d.title}\t${detailFor(d)}`);
  for (const u of doc.unattached) lines.push(`UNATTACHED\tline ${u.line}\t${u.text}`);
  lines.push(`DONE\t${doc.done === true ? 'true' : doc.done === false ? 'false' : 'absent'}`);
  return lines.join('\n');
}

export function toJsonObject(doc) {
  return {
    decisions: doc.decisions.map((d) => ({
      title: d.title,
      status: d.status,
      line: d.line,
      options: d.options.map((o) => ({ text: o.text, ticked: o.ticked, line: o.line })),
      comments: d.comments.map((c) => ({ text: c.text, line: c.line })),
    })),
    unattached: doc.unattached.map((u) => ({ text: u.text, line: u.line, kind: u.kind })),
    done: doc.done,
  };
}

export function formatJson(doc) {
  return JSON.stringify(toJsonObject(doc), null, 2);
}

/** 1 when there is anything for an agent to act on, else 0. Never called when the parse failed. */
export function computeExitCode(doc) {
  const actionable = doc.decisions.some((d) => d.status !== 'OPEN') || doc.unattached.length > 0;
  return actionable ? 1 : 0;
}

function parseArgs(argv) {
  let json = false;
  let file = null;
  for (const a of argv) {
    if (a === '--json') json = true;
    else if (file === null) file = a;
  }
  return { json, file };
}

/**
 * The whole CLI, wrapped: nothing above this line can crash the process past exit 3. IO is
 * injectable so tests exercise the exit-code/stdin/--json contract without spawning a process.
 */
export function run({
  argv = process.argv.slice(2),
  readStdin = () => fs.readFileSync(0, 'utf8'),
  readFile = (f) => fs.readFileSync(f, 'utf8'),
  write = (s) => process.stdout.write(s),
  writeErr = (s) => process.stderr.write(s),
} = {}) {
  try {
    const { json, file } = parseArgs(argv);
    const text = (!file || file === '-') ? readStdin() : readFile(file);
    const doc = parseDocument(text);
    const out = json ? formatJson(doc) : formatText(doc);
    write(out.endsWith('\n') ? out : `${out}\n`);
    return computeExitCode(doc);
  } catch (err) {
    // Never exit 2 — a hook harness reads 2 as "block". Blind or crashed, this is exit 3.
    writeErr(`decisions-read: ${err instanceof Error ? err.message : 'failed'}\n`);
    return 3;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  const canon = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) process.exitCode = run();
