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
// Narrowed to the form the skill and template mandate ("Reply:" + a numeric date) so a
// bare "Reply:" the OWNER happens to type does not clear his own comment (round-2 P6).
// The date is captured (group 1), not just matched: M1's hand-back archiving needs the
// actual reply date to tell a just-answered pair from one the owner has already seen.
const REPLY_RE = /^Reply:\s*(\d{4}-\d{2}-\d{2})/;
const DEFAULT_AFTER_RE = /^Default after (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) ([+-]\d{2}:\d{2}): (.+)$/;
// A recognised no-op per R4 — tracked (not just ignored) so the post-loop N5 check can
// tell "explicitly declared no default" apart from "never addressed the question".
const NO_DEFAULT_RE = /^No default\b/;

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
 * or null when the shape, or the date/time itself, is invalid — the caller turns that into
 * a WARN, since a malformed deadline must never be silent.
 */
function parseDefaultAfter(text) {
  const m = DEFAULT_AFTER_RE.exec(text);
  if (!m) return null;
  const [, date, time, offset, optionText] = m;
  const when = new Date(`${date}T${time}:00${offset}`);
  if (Number.isNaN(when.getTime())) return null;
  // `Date` silently rolls an impossible calendar value over (2026-02-30 -> March 2,
  // 24:00 -> the next day) instead of rejecting it. Round-trip the WRITTEN components
  // (ignoring the offset, which cannot affect calendar validity) to catch that (round-2 P4).
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const roundTrip = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  if (roundTrip.getUTCFullYear() !== y || roundTrip.getUTCMonth() + 1 !== mo || roundTrip.getUTCDate() !== d
      || roundTrip.getUTCHours() !== hh || roundTrip.getUTCMinutes() !== mm) return null;
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

/**
 * A leading UTF-8 BOM, stripped without an invisible character living in this source file
 * (round-2 P9: an escape sequence for U+FEFF was found to survive as the raw, invisible
 * byte sequence once written to disk — this sidesteps the whole class of problem).
 */
function stripBOM(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function parseDocument(text, { now = new Date() } = {}) {
  if (!text || text.trim() === '') throw new BlindError('empty input');
  const lines = stripBOM(text).split(/\r\n|\n/);

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
        noDefaultLine: false,
        _openComment: null,
      };
      titles.push(currentTitle);
      continue;
    }

    const parsed = splitMarker(raw);

    // R3/round-2 P1: a checkbox whose text is EXACTLY "Done" is the page-level Done at
    // ANY indentation, never an option — checked first, ahead of everything else a
    // checkbox line could otherwise be read as (round-2 P2's ordering).
    if (parsed.kind === 'checkbox' && parsed.text.trim() === 'Done') {
      const indented = /^[ \t]/.test(raw);
      doneCandidates.push({ line: lineNo, ticked: parsed.ticked, attachedTitle: currentTitle });
      if (indented) warnings.push({ text: 'Done line is indented', line: lineNo });
      continue;
    }

    if (isCommentText(parsed.text)) {
      const commentText = stripCommentMarker(parsed.text);
      if (currentTitle) {
        // `repliedAt` (v3, M1): the Reply line's own date, kept so a downstream tool (the
        // hand-back check) can tell a JUST-answered pair from one the owner has already seen —
        // never parsed back out of `text`, which never carries a date at all.
        const comment = { text: commentText, line: lineNo, replied: false, repliedAt: null };
        currentTitle.comments.push(comment);
        currentTitle._openComment = comment;
      } else {
        unattached.push({ text: commentText, line: lineNo, kind: 'comment' });
      }
      continue;
    }

    // Round-2 P2: a checkbox line is ALWAYS an option (or Done, or a comment) first —
    // the reserved `Reply:`/`Default` prefixes are only recognised on a line that is NOT
    // a checkbox, so a ticked option that happens to start with either text is never
    // swallowed as a marker.
    if (currentTitle && parsed.kind !== 'checkbox' && REPLY_RE.test(parsed.text)) {
      // Closes only the nearest still-open comment (R1); once closed, it stays closed —
      // a later Reply: line never reaches back past the next comment.
      if (currentTitle._openComment) {
        const replyMatch = REPLY_RE.exec(parsed.text);
        currentTitle._openComment.replied = true;
        currentTitle._openComment.repliedAt = replyMatch ? replyMatch[1] : null;
        currentTitle._openComment = null;
      }
      continue; // a reply marker, never an option or a comment
    }

    // R4, amended by round-2 P5: ANY non-checkbox line inside a decision that starts with
    // the word "Default" is inspected — not only the literal "Default after " prefix —
    // so an older deadline phrasing (or any other malformed one) WARNs instead of being
    // silently ignored. `No default…` does not start with "Default", so it is naturally
    // untouched and stays a no-op, per R4. Round-3 review N2: a deadline line always carries
    // `: <option>`, so also requiring a colon keeps ordinary prose that happens to start with
    // "Default" (e.g. an evidence sentence) from raising a false WARN.
    if (currentTitle && parsed.kind !== 'checkbox' && /^Default\b/.test(parsed.text)
        && parsed.text.includes(':')) {
      const parsedDefault = parseDefaultAfter(parsed.text);
      if (parsedDefault) {
        if (!currentTitle.default) currentTitle.default = parsedDefault; // first one on the item wins
      } else {
        warnings.push({ text: 'default line is not in the required shape', line: lineNo });
      }
      continue; // a deadline line, never an option
    }

    // R4: a line starting "No default" is the OTHER recognised no-op (alongside a
    // well-shaped `Default after `) — track that it appeared, per the final review's N5.
    if (currentTitle && parsed.kind !== 'checkbox' && NO_DEFAULT_RE.test(parsed.text)) {
      currentTitle.noDefaultLine = true;
      continue;
    }

    if (parsed.kind === 'checkbox') {
      const optionText = parsed.text.trim();
      if (currentTitle) currentTitle.options.push({ text: optionText, ticked: parsed.ticked, line: lineNo });
      else if (parsed.ticked) unattached.push({ text: optionText, line: lineNo, kind: 'tick' });
      // an unticked, unattached checkbox has nothing to attach to and nothing to act on: dropped
    }
    // a plain paragraph or a non-comment, non-marker bullet carries no signal
  }

  if (inFence) throw new BlindError('unterminated fenced code block');
  if (titles.length === 0) throw new BlindError('no titles found');

  const { done, warnings: doneWarnings } = finalizeDone(doneCandidates, lines);
  warnings.push(...doneWarnings);
  // Round-2 P8: a page that has at least one real decision but no Done line at all is a
  // page defect too — the skill leans on Done to assert "nothing open" — so it WARNs. A
  // page of grouping titles only, with no decisions, needs no Done line.
  if (doneCandidates.length === 0 && titles.some((t) => t.options.length > 0)) {
    const idx = lastContentLineIndex(lines);
    warnings.push({ text: 'no Done line found', line: idx >= 0 ? idx + 1 : 0 });
  }

  // Final review N5: the skill requires exactly one of a parsed default or a "No
  // default" line on every decision; make that rule mechanical rather than something an
  // agent must remember to check. Closed/archived bullets never reach here — they have
  // no options, so they are never a decision (filtered out below).
  for (const t of titles) {
    if (t.options.length === 0) continue;
    if (!t.default && !t.noDefaultLine) {
      warnings.push({ text: `no default or "No default" line: ${t.title}`, line: t.line });
    }
  }

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
      const { _openComment, noDefaultLine, ...rest } = t;
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
  for (const u of doc.unattached) {
    lines.push(`UNATTACHED\tline ${u.line}\t${u.text}${u.under !== undefined ? `\t(under ${u.under})` : ''}`);
  }
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
      comments: d.comments.map((c) => ({ text: c.text, line: c.line, replied: c.replied, repliedAt: c.repliedAt })),
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
    else if (a === '--now') {
      // Round-2 P3: a missing or unparseable --now is BLIND, never a silent fallback to
      // the system clock (a hook or a test that mistypes the flag must not be told the
      // owner has nothing due).
      if (i + 1 >= argv.length) throw new BlindError('--now needs an ISO timestamp');
      now = argv[i + 1];
      i += 1;
    } else if (file === null) file = a;
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
    let nowOpt = {};
    if (now !== null) {
      const at = new Date(now);
      if (Number.isNaN(at.getTime())) throw new BlindError(`--now is not a valid timestamp: ${now}`);
      nowOpt = { now: at };
    }
    const text = (!file || file === '-') ? readStdin() : readFile(file);
    const doc = parseDocument(text, nowOpt);
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
