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
const REPLY_PREFIX = 'Reply:';
const DEFAULT_AFTER_PREFIX = 'Default after ';
const DEFAULT_AFTER_RE = /^Default after (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) ([+-]\d{2}:\d{2}): (.+)$/;
// Column 0 only: no leading whitespace. Wherever such a line sits, it is the page-level
// Done marker, never an option of any decision (v2 rule R3).
const DONE_RE = /^-\s\[([ xX])\]\s+Done\s*$/;

function isCommentText(text) {
  return text.startsWith(ESCAPED_BOLD);
}

function stripCommentMarker(text) {
  return text.slice(ESCAPED_BOLD.length).trim();
}

/** Strip a `- ` / `- [ ] ` / `- [x] ` marker (if any) off a line already trimmed of indentation. */
function splitMarker(rawLine) {
  const stripped = rawLine.replace(/^[ \t]+/, '');
  const lstrip = (s) => s.replace(/^\s+/, '');
  let m = /^-\s\[([ xX])\]\s?(.*)$/.exec(stripped);
  if (m) return { kind: 'checkbox', ticked: m[1].toLowerCase() === 'x', text: lstrip(m[2]) };
  m = /^-\s(.*)$/.exec(stripped);
  if (m) return { kind: 'bullet', text: lstrip(m[1]) };
  return { kind: 'plain', text: stripped };
}

/** A `<summary>…</summary>` line, or a toggleable heading `#`/`##`/`###` … `{toggle="true"}`. */
function matchTitle(rawLine) {
  let m = /^[ \t]*<summary>(.*)<\/summary>[ \t]*$/.exec(rawLine);
  if (m) return m[1];
  m = /^[ \t]*#{1,3}[ \t]+(.*?)[ \t]*\{[^}]*\btoggle="true"[^}]*\}[ \t]*$/.exec(rawLine);
  if (m) return m[1];
  return null;
}

function normalizeTitle(raw) {
  let t = raw.trim();
  t = t.replace(/\(\d[^()]*\)\s*$/, '').trimEnd(); // trailing "(7 · 4 covered)"-style suffix
  if (t.startsWith('**') && t.endsWith('**') && t.length >= 4) t = t.slice(2, -2);
  return t.trim();
}

/**
 * `Default after YYYY-MM-DD HH:MM ±HH:MM: <text>` (rule R4). Returns the parsed payload,
 * or null when the shape or the date/time itself is invalid — the caller turns that into
 * a WARN, since a malformed deadline must never be silent.
 */
function parseDefaultAfter(text) {
  const m = DEFAULT_AFTER_RE.exec(text);
  if (!m) return null;
  const [, date, time, offset, optionText] = m;
  const when = new Date(`${date}T${time}:00${offset}`);
  if (Number.isNaN(when.getTime())) return null;
  return { text: optionText.trim(), at: when.toISOString(), atMs: when.getTime() };
}

/** The true last line of the document, ignoring trailing blank and `<empty-block/>` lines. */
function lastContentLineIndex(lines) {
  let i = lines.length - 1;
  while (i >= 0) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed === '<empty-block/>') { i -= 1; continue; }
    break;
  }
  return i;
}

/**
 * Every column-0 Done line found anywhere is a candidate (R3): never an option, and the
 * LAST one found is canonical — it sets `done`. Anything else about the set of candidates
 * (more than one, or the last one not truly last) is an anomaly and WARNs; it is never
 * silent, and it never fails the parse (this is still all inside "parsed, but look").
 */
function finalizeDone(candidates, lines) {
  if (candidates.length === 0) return { done: null, warnings: [] };
  const last = candidates[candidates.length - 1];
  const warnings = [];
  const trueLastIdx = lastContentLineIndex(lines);
  if (last.line - 1 !== trueLastIdx) warnings.push({ text: 'Done is not the last line', line: last.line });
  if (candidates.length > 1) warnings.push({ text: 'more than one Done line', line: last.line });
  return { done: last.ticked, warnings };
}

/** Status priority (R2): AMBIGUOUS > TICKED > COMMENTED > DUE > REPLIED > OPEN. */
function computeStatus(title, now) {
  const tickedCount = title.options.filter((o) => o.ticked).length;
  if (tickedCount >= 2) return 'AMBIGUOUS';
  if (tickedCount === 1) return 'TICKED';
  const hasUnrepliedComment = title.comments.some((c) => !c.replied);
  if (hasUnrepliedComment) return 'COMMENTED';
  const base = title.comments.length > 0 ? 'REPLIED' : 'OPEN';
  if (title.default && now.getTime() >= title.default.atMs) return 'DUE';
  return base;
}

/** Throw for anything that leaves the parse unable to trust the document (exit 3, never a crash). */
class BlindError extends Error {}

export function parseDocument(text, { now = new Date() } = {}) {
  if (!text || text.trim() === '') throw new BlindError('empty input');
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n/);

  let inFence = false;
  const titles = [];
  const unattached = [];
  const warnings = [];
  const doneCandidates = [];
  let currentTitle = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();

    if (/^`{3,}/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence) continue;

    const doneMatch = DONE_RE.exec(raw);
    if (doneMatch) {
      doneCandidates.push({ line: lineNo, ticked: doneMatch[1].toLowerCase() === 'x', attachedTitle: currentTitle });
      continue; // never an option of any decision, wherever it sits (R3)
    }

    if (/<summary\b/i.test(raw) && matchTitle(raw) === null) {
      throw new BlindError(`unreadable <summary> at line ${lineNo}`);
    }
    const titleText = matchTitle(raw);
    if (titleText !== null) {
      currentTitle = {
        title: normalizeTitle(titleText),
        line: lineNo,
        options: [],
        comments: [],
        default: null,
        _openComment: null,
      };
      titles.push(currentTitle);
      continue;
    }

    const parsed = splitMarker(raw);

    if (isCommentText(parsed.text)) {
      const commentText = stripCommentMarker(parsed.text);
      if (currentTitle) {
        const comment = { text: commentText, line: lineNo, replied: false };
        currentTitle.comments.push(comment);
        currentTitle._openComment = comment;
      } else {
        unattached.push({ text: commentText, line: lineNo, kind: 'comment' });
      }
      continue;
    }

    if (currentTitle && parsed.text.startsWith(REPLY_PREFIX)) {
      // Closes only the nearest still-open comment (R1); once closed, it stays closed —
      // a later Reply: line never reaches back past the next comment.
      if (currentTitle._openComment) {
        currentTitle._openComment.replied = true;
        currentTitle._openComment = null;
      }
      continue; // a reply marker, never an option or a comment
    }

    if (currentTitle && parsed.text.startsWith(DEFAULT_AFTER_PREFIX)) {
      const parsedDefault = parseDefaultAfter(parsed.text);
      if (parsedDefault) {
        if (!currentTitle.default) currentTitle.default = parsedDefault; // first one on the item wins
      } else {
        warnings.push({ text: `Malformed default at line ${lineNo}`, line: lineNo });
      }
      continue; // a deadline line, never an option
    }

    if (parsed.kind === 'checkbox') {
      const optionText = parsed.text.trim();
      if (currentTitle) currentTitle.options.push({ text: optionText, ticked: parsed.ticked, line: lineNo });
      else if (parsed.ticked) unattached.push({ text: optionText, line: lineNo, kind: 'tick' });
      // an unticked, unattached checkbox has nothing to attach to and nothing to act on: dropped
    }
    // a plain paragraph, a non-comment bullet, or a "No default"/other "Default…" line
    // carries no signal
  }

  if (inFence) throw new BlindError('unterminated fenced code block');
  if (titles.length === 0) throw new BlindError('no titles found');

  const { done, warnings: doneWarnings } = finalizeDone(doneCandidates, lines);
  warnings.push(...doneWarnings);

  // R5: a comment, or a stray ticked (non-canonical) Done line, attached to a title that
  // never gained a real option (a grouping section, not a decision) is reported, never
  // silently dropped. An unticked/untied option still makes a title a decision, as in v1.
  for (const t of titles) {
    if (t.options.length > 0) continue;
    for (const c of t.comments) unattached.push({ text: c.text, line: c.line, kind: 'comment', under: t.title });
  }
  for (const c of doneCandidates.slice(0, -1)) {
    if (!c.ticked) continue;
    if (c.attachedTitle) {
      if (c.attachedTitle.options.length === 0) {
        unattached.push({ text: 'Done', line: c.line, kind: 'tick', under: c.attachedTitle.title });
      }
    } else {
      unattached.push({ text: 'Done', line: c.line, kind: 'tick' });
    }
  }

  const decisions = titles
    .filter((t) => t.options.length > 0)
    .map((t) => {
      const { _openComment, ...rest } = t;
      return { ...rest, status: computeStatus(t, now) };
    });

  return { decisions, unattached, done, warnings };
}

function detailFor(d) {
  const tickedOptions = d.options.filter((o) => o.ticked);
  const unrepliedComments = d.comments.filter((c) => !c.replied);
  if (d.status === 'AMBIGUOUS') return tickedOptions.map((o) => o.text).join(' | ');
  if (d.status === 'TICKED') return [tickedOptions[0].text, ...unrepliedComments.map((c) => c.text)].join(' | ');
  if (d.status === 'COMMENTED') return unrepliedComments.map((c) => c.text).join(' | ');
  if (d.status === 'DUE') return d.default.text;
  return '';
}

export function formatText(doc) {
  const lines = doc.decisions.map((d) => `${d.status}\t${d.title}\t${detailFor(d)}`);
  for (const u of doc.unattached) lines.push(`UNATTACHED\tline ${u.line}\t${u.text}`);
  for (const w of doc.warnings) lines.push(`WARN\t${w.text}`);
  // Explicit, so a caller can tell "legitimately nothing to act on" apart from a format drift
  // that stopped matching decisions at all (finding 8): zero here on an otherwise non-trivial
  // page means the export shape moved, not that the owner has answered everything.
  lines.push(`DECISIONS\t${doc.decisions.length}`);
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
      comments: d.comments.map((c) => ({ text: c.text, line: c.line, replied: c.replied })),
      default: d.default ? { text: d.default.text, at: d.default.at } : null,
    })),
    unattached: doc.unattached.map((u) => ({
      text: u.text,
      line: u.line,
      kind: u.kind,
      ...(u.under !== undefined ? { under: u.under } : {}),
    })),
    warnings: doc.warnings.map((w) => ({ text: w.text, line: w.line })),
    decisionCount: doc.decisions.length,
    done: doc.done,
  };
}

export function formatJson(doc) {
  return JSON.stringify(toJsonObject(doc), null, 2);
}

/** 1 when there is anything for an agent to act on, else 0. Never called when the parse failed. */
export function computeExitCode(doc) {
  const actionableStatuses = new Set(['AMBIGUOUS', 'TICKED', 'COMMENTED', 'DUE']);
  const hasActionableDecision = doc.decisions.some((d) => actionableStatuses.has(d.status));
  return (hasActionableDecision || doc.unattached.length > 0 || doc.warnings.length > 0) ? 1 : 0;
}

function parseArgs(argv) {
  let json = false;
  let file = null;
  let now = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--now') { now = argv[i + 1]; i += 1; }
    else if (file === null) file = a;
  }
  return { json, file, now };
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
    const { json, file, now } = parseArgs(argv);
    const text = (!file || file === '-') ? readStdin() : readFile(file);
    const doc = parseDocument(text, now ? { now: new Date(now) } : {});
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
  const canon = (p) => {
    let r = path.resolve(p);
    try { r = fs.realpathSync(r); } catch { /* not on disk — fall back to the resolved path */ }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return canon(entry) === canon(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  // A closed downstream pipe (`| head`) raises EPIPE asynchronously, after run() has already
  // returned an honest exit code; left unhandled that becomes an uncaught exception and Node
  // exits 1. Never exit 2 either way — see run()'s own catch for the same rule.
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); });
  process.exitCode = run();
}
