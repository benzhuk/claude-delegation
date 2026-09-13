// envelope — the peer-note grammar: constants, validation, build, parse, id derivation, time.
//
// Pure. No filesystem, no child processes, no node builtins beyond Intl. `note-send.mjs` owns all I/O
// and transport and imports everything here. Split out per the orchestrator's ruling 7 (2026-09-13).
//
// The contract this implements is `../references/envelope.md` v4. Two rules drive most of the code:
// an envelope is exactly ONE physical line of at most 700 characters (v4 raised the cap from 500 after
// the pilot rejected 9 notes at it), and every field is validated
// with a clear message BEFORE the regex ever runs, so a bad field is never silently swallowed.

export const KINDS = ['ASK', 'ACK', 'RESULT', 'BLOCKED', 'FYI'];
export const NEEDS = ['decision', 'review', 'ack', 'none'];
/** Only ASK may carry a need other than `none` (envelope.md, Needs row; red-team M3). */
export const ASK_ONLY_NEEDS = ['decision', 'review', 'ack'];
export const RESERVED_WORDS = [' Goal: ', ' Details: ', ' Needs: '];
export const MAX_LINE = 700;
export const ARROW = '→'; // →
export const RESERVED_RECIPIENT = 'ben';
export const DEFAULT_ZONE = 'America/New_York';
export const DEFAULT_TZ_LABEL = 'NYC';

export const ENVELOPE_RE =
  /^(?<from>[a-z0-9-]+) → (?<to>[a-z0-9-]+), (?<date>\d{1,2}\.\d{1,2}\.\d{2}) (?<time>\d{2}:\d{2}) (?<tz>[A-Z]{2,5}) \[(?<id>[a-z0-9-]+-\d+)(?: re (?<re>[a-z0-9-]+-\d+))?(?: supersedes (?<sup>[a-z0-9-]+-\d+))?\] (?<kind>ASK|ACK|RESULT|BLOCKED|FYI): (?<body>.+?)(?: Goal: (?<goal>[^\t\n]+?))?(?: Details: (?<details>[A-Za-z0-9._/-]+))?(?: Needs: (?<needs>decision|review|ack|none)(?: by (?<by>[^\t\n]+?))?)?$/u;

/** v3: repo-relative POSIX only. The `<host>:` prefix was dropped — cross-host notes are sent over ssh. */
export const DETAILS_RE = /^[A-Za-z0-9._/-]+$/;
export const SLUG_RE = /^[a-z0-9-]+$/;
export const ID_RE = /^[a-z0-9-]+-\d+$/;

export class NoteError extends Error {
  constructor(exitCode, message, extra = {}) {
    super(message);
    this.name = 'NoteError';
    this.exitCode = exitCode;
    Object.assign(this, extra);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Characters that would let a note run as a command if it ever reached a shell pane. The
 * classifier already refuses to type into a `shell` pane; this is the second lock on the same
 * door, because a misclassification there is the one catastrophic failure (red-team M6, review H2).
 * `&` and `>` are deliberately allowed — far too common in ordinary prose to ban.
 */
export const SHELL_PAYLOAD_RE = /[`;|]|\$\(|&&/;

/** Reject anything that would split the line, hide a field, or execute in a shell pane. */
export function assertFieldSafe(name, value) {
  if (value === undefined || value === null) return;
  const s = String(value);
  if (/[\r\n\t]/.test(s)) {
    throw new NoteError(1, `--${name} contains a newline or tab; an envelope is exactly one physical line`);
  }
  for (const word of RESERVED_WORDS) {
    if (s.includes(word)) {
      throw new NoteError(1, `--${name} contains the reserved word "${word.trim()}"; it would silently swallow later fields`);
    }
  }
  const shell = SHELL_PAYLOAD_RE.exec(s);
  if (shell) {
    throw new NoteError(
      1,
      `--${name} contains "${shell[0]}" — a note must never be able to execute if it lands in a shell pane. ` +
      `Rephrase without \` ; | && $( , or move the text into the detail packet.`,
    );
  }
}

export function assertLowercase(name, value) {
  if (value !== String(value).toLowerCase()) {
    throw new NoteError(1, `--${name} must be lowercase; use "${String(value).toLowerCase()}"`);
  }
}

export function validateSlug(name, value) {
  assertLowercase(name, value);
  if (!SLUG_RE.test(value)) throw new NoteError(1, `--${name} must match [a-z0-9-]+ (got "${value}")`);
  return value;
}

export function validateId(name, value) {
  assertLowercase(name, value);
  if (!ID_RE.test(value)) throw new NoteError(1, `--${name} must be <slug>-<counter>, lowercase (got "${value}")`);
  return value;
}

/**
 * Details is validated BEFORE the regex so a bad path is a clear error, never three silently dropped
 * fields (red-team H2/H3). v3: repo-relative POSIX inside the RECIPIENT's repo — no host prefix.
 */
export function validateDetails(details) {
  const s = String(details);
  if (/\s/.test(s)) throw new NoteError(1, `--details must not contain spaces (got "${s}"); move the file or rename it`);
  if (s.includes('\\')) throw new NoteError(1, `--details must use POSIX slashes, not backslashes (got "${s}")`);
  if (/^[A-Za-z]:/.test(s)) throw new NoteError(1, `--details must not start with a drive letter (got "${s}"); use a repo-relative path`);
  if (s.includes(':')) {
    throw new NoteError(1, `--details must not carry a "<host>:" prefix (got "${s}"); v3 sends cross-host notes by running note-send on the recipient's host over ssh`);
  }
  if (s.startsWith('/')) throw new NoteError(1, `--details must be repo-relative, not absolute (got "${s}")`);
  if (s.endsWith('.')) throw new NoteError(1, `--details must not end with a period (got "${s}"); the trailing period is not part of the path`);
  if (s.split('/').includes('..')) throw new NoteError(1, `--details must not escape the repo with ".." (got "${s}")`);
  if (!DETAILS_RE.test(s)) throw new NoteError(1, `--details must match ${DETAILS_RE} (got "${s}")`);
  return s;
}

/** Only ASK may ask for something back (red-team M3). */
export function validateKindNeeds(kind, needs) {
  if (!KINDS.includes(kind)) throw new NoteError(1, `--kind must be one of ${KINDS.join('|')} (got "${kind}")`);
  if (needs === undefined) return;
  if (!NEEDS.includes(needs)) throw new NoteError(1, `--needs must be one of ${NEEDS.join('|')} (got "${needs}")`);
  if (kind !== 'ASK' && ASK_ONLY_NEEDS.includes(needs)) {
    throw new NoteError(1, `${kind} may only carry "Needs: none" or no Needs field; "${needs}" is ASK-only`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build / parse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Close a sentence field so the next reserved word reads as a boundary, matching the canonical example
 * in envelope.md. Applied to `substance` and `Goal:` only — never to `Details:` or `by`, which must stay
 * period-free (red-team H3).
 */
export function terminate(text) {
  const s = String(text).trim();
  return /[.!?:;,]$/.test(s) ? s : `${s}.`;
}

/**
 * Assemble the one-line envelope. Every field is validated first; the result must match the pinned
 * regex, so a line that passes here is a line the reader's parser accepts.
 */
export function buildEnvelope(o) {
  validateSlug('from', o.from);
  validateSlug('to', o.to);
  validateId('id', o.id);
  if (o.re !== undefined) validateId('re', o.re);
  if (o.supersedes !== undefined) validateId('supersedes', o.supersedes);
  if (!o.id.startsWith(`${o.from}-`)) {
    throw new NoteError(1, `id "${o.id}" must start with the sender slug "${o.from}-" (ids are collision-free by sender prefix)`);
  }
  validateKindNeeds(o.kind, o.needs);

  for (const [name, value] of [['text', o.body], ['goal', o.goal], ['by', o.by], ['tz', o.tz]]) {
    assertFieldSafe(name, value);
  }
  if (!o.body || !String(o.body).trim()) throw new NoteError(1, '--text is required and must not be empty');
  if (o.details !== undefined) validateDetails(o.details);
  if (o.by !== undefined && o.needs === undefined) throw new NoteError(1, '--by requires --needs');
  if (!/^[A-Z]{2,5}$/.test(o.tz)) throw new NoteError(1, `--tz must be 2-5 uppercase letters (got "${o.tz}")`);
  if (!/^\d{1,2}\.\d{1,2}\.\d{2}$/.test(o.date)) throw new NoteError(1, `internal: bad date "${o.date}"`);
  if (!/^\d{2}:\d{2}$/.test(o.time)) throw new NoteError(1, `internal: bad time "${o.time}"`);

  const brackets = [o.id, o.re ? `re ${o.re}` : null, o.supersedes ? `supersedes ${o.supersedes}` : null]
    .filter(Boolean).join(' ');

  let line = `${o.from} ${ARROW} ${o.to}, ${o.date} ${o.time} ${o.tz} [${brackets}] ${o.kind}: ${terminate(o.body)}`;
  if (o.goal) line += ` Goal: ${terminate(o.goal)}`;
  if (o.details) line += ` Details: ${o.details}`;
  if (o.needs) line += ` Needs: ${o.needs}${o.by ? ` by ${String(o.by).trim()}` : ''}`;

  if (line.length > MAX_LINE) {
    throw new NoteError(1, `envelope is ${line.length} chars, over the ${MAX_LINE} cap; shorten --text and move the rest into the detail packet`);
  }
  if (!ENVELOPE_RE.test(line)) throw new NoteError(1, `built line does not match the pinned envelope regex:\n${line}`);
  return line;
}

/**
 * Parse an envelope line back out. Strips at most one trailing period from `details`, so a line written
 * by hand with a sentence period after the path still yields a usable path (red-team H3).
 */
export function parseEnvelope(line) {
  const m = ENVELOPE_RE.exec(line);
  if (!m) return null;
  const g = { ...m.groups };
  if (g.details && g.details.endsWith('.')) g.details = g.details.slice(0, -1);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// Id derivation
// ─────────────────────────────────────────────────────────────────────────────

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Highest counter already used for `<from>-<topic>` anywhere in the ledger text we can see. */
export function highestCounter(texts, prefix) {
  const re = new RegExp(`${escapeRe(prefix)}-(\\d+)(?=[\\s\\]])`, 'g');
  let max = 0;
  for (const text of texts) {
    if (!text) continue;
    for (const m of String(text).matchAll(re)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

export function nextCounter(texts, prefix) { return highestCounter(texts, prefix) + 1; }

// ─────────────────────────────────────────────────────────────────────────────
// Time
// ─────────────────────────────────────────────────────────────────────────────

/** Ben's local zone always, whatever clock the box runs on (rule 05-time.md). */
export function timeParts(now = new Date(), zone = DEFAULT_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${Number(parts.month)}.${Number(parts.day)}.${String(parts.year).slice(-2)}`,
    time: `${hour}:${parts.minute}`,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * A wall-clock time in a named zone back to an absolute instant. Used by note-inbox to age a ledger
 * line whose only timestamp is the `M.D.YY HH:MM TZ` it carries. Two-pass: read the candidate instant
 * back out in the zone, and correct by the difference. Exact except in the one ambiguous hour of a
 * DST fall-back, where it can be an hour off — harmless for "is this line newer than N hours".
 */
export function zonedWallToInstant({ year, month, day, hour, minute }, zone = DEFAULT_ZONE) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return guess - (asIfUtc - guess);
}

/** The instant a parsed envelope claims, from its own `M.D.YY` + `HH:MM` fields. */
export function envelopeInstant(groups, zone = DEFAULT_ZONE) {
  const d = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(String(groups?.date ?? ''));
  const t = /^(\d{2}):(\d{2})$/.exec(String(groups?.time ?? ''));
  if (!d || !t) return null;
  return zonedWallToInstant({
    year: 2000 + Number(d[3]), month: Number(d[1]), day: Number(d[2]),
    hour: Number(t[1]), minute: Number(t[2]),
  }, zone);
}

// ─────────────────────────────────────────────────────────────────────────────
// Packet
// ─────────────────────────────────────────────────────────────────────────────

export function firstSentence(text) {
  const s = String(text).trim();
  const m = s.match(/^.{0,80}?[.!?](\s|$)/);
  return (m ? m[0] : s.slice(0, 80)).trim().replace(/[.!?]$/, '');
}

/** The template from envelope.md. A sender may pass its own body through --packet-file instead. */
export function packetTemplate(o) {
  return `# ${o.id} — ${o.title}
from: ${o.from} · to: ${o.to} · sent: ${o.date} ${o.time} ${o.tz} · event: ${o.event ?? 'same'} · supersedes: ${o.supersedes ?? 'none'}

## Ask / Decision
${o.body}

## Scope (files, branch/worktree, reviewed revision or content hash)
(fill in)

## Conditions (gates, ownership, budget, "no deploy/DB/flag changes" etc.)
(fill in)

## Evidence (paths, commits, measured numbers — reported vs verified vs pending)
(fill in)

## Next action (owner, by when)
${o.needs ? `${o.to}: ${o.needs}${o.by ? ` by ${o.by}` : ''}` : '(fill in)'}

## Received / acted (appended by the recipient: when read, what was done, RESULT id)
`;
}
