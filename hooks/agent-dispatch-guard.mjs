// node --test "hooks/*.test.mjs"
//
// agent-dispatch-guard — a PreToolUse guard on `Agent` and `SendMessage` dispatch calls.
// Enforces, in code, three rules that used to be prose nobody enforced (spec: build 0921,
// Territory G; amended in fix round 1 by the owner's rulings on the Opus review —
// `review-guard-report.md` / `review-guard-rulings.md`):
//   R1  a top-tier model (opus/fable) on a spawn that is not a review or a stated
//       judgment is denied. Execution runs on sonnet or haiku.
//   R1b the mirror note: a spawn states a JUDGMENT but will not run on opus.
//   R2  a DECLARED round of 3 or more (a `Round:` label, colon required, at the start of
//       a line) needs a `Research:` line (a report path, or "not needed, <reason>"), or
//       it is denied. A prompt that merely MENTIONS a round number in prose is never
//       denied — only recorded in the log (`round_mention: true`). Round 1 of this build
//       shipped a mention-based regex that denied the mandate template, quoted review
//       reports, and its own deny text pasted back into a retry; this is the fix.
//   R3  a long mandate that does not authorize a negative result, or names no report
//       file, gets a note (never a deny — a thin mandate is a smell, not a stop).
//
// `decide(input, ctx)` is the pure core. `ctx = { home, fsImpl, now }` — tests always pass
// a scratch `home` from `mkdtempSync` and never touch the real one. The CLI wrapper below
// is the only thing that reads the real filesystem, and it resolves `home` from exactly
// one place: `os.homedir()` (HOME on POSIX, USERPROFILE on Windows — Node's own resolution,
// the same one every other hook in this repo uses).
//
// OBSERVE-ONLY IS THE DEFAULT (round 1 ruling on MAJOR 2). A missing file must never be
// what turns enforcement ON: enforcement requires an explicit opt-in file
// (`~/.agents/dispatch-guard-enforce`) to exist AND `~/.agents/ws-off` to be absent. Every
// other case — the enforce file absent, its path unreadable, `ws-off` present, or `ws-off`
// unreadable — is observe-only: rules are still evaluated and logged (`enforced:false`),
// but the wrapper never prints. `~/.agents/no-dispatch-guard` remains the total kill switch
// (skip evaluation and logging entirely); it is unrelated to the enforce/observe split.
//
// Failure posture, absolute: any exception, unreadable stdin, or unparseable JSON prints
// nothing and exits 0. A hook that can throw a nonzero exit is a hook that can block a
// dispatch by accident, which is worse than the problem this file fixes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Rule text — exact strings the spec (and the round-1 rulings) pin. Exported so tests
// assert on the same constant the guard emits, never a re-typed copy that can drift.
// ─────────────────────────────────────────────────────────────────────────────

export const R1_TEXT = 'dispatch-guard R1: top-tier model on a spawn that is not a review or a '
  + 'stated judgment. Execution runs on sonnet or haiku. Respawn without the model override, '
  + 'or add a line "JUDGMENT: <the verdict you are buying>". Off switch: ~/.agents/no-dispatch-guard';

export const R1B_TEXT = 'dispatch-guard R1b: this spawn states a JUDGMENT but will not run on '
  + 'opus. A quality verdict is opus at minimum.';

// Round-1 ruling, verbatim (replaces the round-0 text). The "not needed," example is
// deliberately long — the round-0 example (`<reason>`, 8 characters) failed its own
// 10-character minimum, denying anyone who copied it (MAJOR 1).
export const R2_TEXT_BASE = 'dispatch-guard R2: a declared round of 3 or more needs a research '
  + 'line. Run a research lane first and add a line "Research: <path to its report>", or add '
  + 'a line like "Research: not needed, this round only applies an approved reviewer patch". '
  + 'Off switch: ~/.agents/no-dispatch-guard';

export const R3_NEG_TEXT = 'dispatch-guard R3: this mandate does not authorize a negative '
  + 'result. Add the sentence from docs/mandate-template.md.';

export const R3_REPORT_TEXT = 'dispatch-guard R3: this mandate names no report file.';

// ─────────────────────────────────────────────────────────────────────────────
// Regexes
// ─────────────────────────────────────────────────────────────────────────────

const R1_MODEL_RE = /opus|fable/i;
const REVIEWER_RE = /(^|:)reviewer$/i;
// JUDGMENT stays strict (round-1 ruling on MAJOR 5): no markdown decoration allowed, and
// the deny/note text quotes this exact line-start, uppercase-label form.
const JUDGMENT_LINE_RE = /^\s*JUDGMENT:\s*\S.{9,}/m;
const R1B_MODEL_RE = /sonnet|haiku/i;

// R2 is a DECLARATION rule, not a mention rule (round-1 ruling on BLOCKER 1/2, MINOR N1).
// `Round:` — the label, WITH its colon — at the start of a line, with optional markdown
// list/quote/bold decoration before and around the label. A report line like
// "Round 3 findings" (no colon) must NOT fire; a declared "Round: 3" / "**Round:** 3" /
// "- Round: 3" / "> Round: 3" must. Verified directly against both forms (see the test
// file) before wiring this in.
const ROUND_DECL_RE = /^[\s>*+-]*\**Round:\**\s*#?\s*([3-9]|[1-9]\d)\b/mi;
// The OLD, too-loose round-0 pattern. Never enforced any more — kept only to log when a
// prompt mentions a round number in prose without declaring one, so the observe week has
// a number to look at. `\bround` already excludes "around" (no word boundary between the
// "a" and the "r" inside it, since both are word characters) — confirmed directly, no
// regex change was needed there.
const ROUND_MENTION_RE = /\bround\s*:?\s*#?\s*([3-9]|[1-9]\d)\b/i;

// Round-1 ruling on MAJOR 5: `Research:` accepts the same markdown decoration as `Round:`
// (bullets, blockquotes, bold) — mandates in this repo are routinely written as markdown
// bulleted fields, and the round-0 regex denied both `- Research: x.md` and
// `**Research:** x.md`.
const RESEARCH_LINE_RE = /^[\s>*+-]*\**Research:\**\s*(.+)$/mi;
const NOT_NEEDED_RE = /^not needed,\s*(.+)$/i;
const R3_MIN_LEN = 400;
const R3_NEG_RESULT_RE = /negative result|not found|not determined|not verified|first-class|is a good answer|is a good result/i;
const R3_MD_PATH_RE = /\.md\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip one layer of surrounding backticks or quotes (both ends match, or neither is touched). */
function stripWrap(raw) {
  const t = raw.trim();
  const pairs = ['``', '""', "''"];
  for (const pair of pairs) {
    const [open, close] = pair;
    if (t.length >= 2 && t[0] === open && t[t.length - 1] === close) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

/**
 * An OFF-SWITCH path (`no-dispatch-guard`, `ws-off`) counts as PRESENT if it exists, and
 * ALSO if checking it throws — fail toward doing nothing, where "nothing" means no
 * blocking effect (skip entirely, or observe-only). `fsImpl.existsSync` does not normally
 * throw, but a test double is free to simulate an unreadable path, and this is where that
 * gets honored.
 */
function switchPresentFailSafe(fsImpl, filePath) {
  try {
    return fsImpl.existsSync(filePath);
  } catch {
    return true;
  }
}

/**
 * The ENFORCE-GATE path (`dispatch-guard-enforce`) is the opposite polarity on purpose
 * (round-1 ruling on MAJOR 2): "fail toward doing nothing" here means never turning
 * enforcement on when we can't be sure the file is there, so an unreadable path counts as
 * ABSENT, not present.
 */
function enforceFilePresent(fsImpl, filePath) {
  try {
    return fsImpl.existsSync(filePath);
  } catch {
    return false;
  }
}

/** Cap a logged string field so a hostile or oversized value can't blow up the log file
 * (round-1 ruling on N4). `null` for anything that isn't a string, so a forged non-string
 * `model`/`subagent_type` can never serialize an object into the log either. */
function cappedString(value, max = 64) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule checks — each returns a finding ({ id, type, text }) or null (R3 returns an array).
// ─────────────────────────────────────────────────────────────────────────────

export function checkR1(input) {
  if (input?.tool_name !== 'Agent') return null;
  const model = input.tool_input?.model;
  if (typeof model !== 'string' || !R1_MODEL_RE.test(model)) return null;
  const subagentType = input.tool_input?.subagent_type;
  if (typeof subagentType === 'string' && REVIEWER_RE.test(subagentType)) return null;
  const prompt = input.tool_input?.prompt;
  if (typeof prompt === 'string' && JUDGMENT_LINE_RE.test(prompt)) return null;
  return { id: 'R1', type: 'deny', text: R1_TEXT };
}

export function checkR1b(input) {
  if (input?.tool_name !== 'Agent') return null;
  const prompt = input.tool_input?.prompt;
  if (typeof prompt !== 'string' || !JUDGMENT_LINE_RE.test(prompt)) return null;
  const model = input.tool_input?.model;
  const noModel = model === undefined;
  const lowTierModel = typeof model === 'string' && R1B_MODEL_RE.test(model);
  if (!noModel && !lowTierModel) return null;
  const subagentType = input.tool_input?.subagent_type;
  if (typeof subagentType === 'string' && REVIEWER_RE.test(subagentType)) return null;
  return { id: 'R1b', type: 'note', text: R1B_TEXT };
}

/** The text R2 (and its mention-logging sibling) look at: Agent's prompt, or SendMessage's
 * message ONLY when it is a string (the tool also carries JSON protocol objects). */
function r2Text(input) {
  const isAgent = input?.tool_name === 'Agent';
  const isSendMessage = input?.tool_name === 'SendMessage';
  if (!isAgent && !isSendMessage) return null;
  const text = isAgent ? input.tool_input?.prompt : input.tool_input?.message;
  return typeof text === 'string' ? text : null;
}

/** Resolve a research-report path: absolute as given, else relative to the hook's cwd. */
function resolveResearchPath(rawValue, cwd) {
  const stripped = stripWrap(rawValue);
  if (path.isAbsolute(stripped)) return stripped;
  const base = typeof cwd === 'string' ? cwd : process.cwd();
  return path.resolve(base, stripped);
}

export function checkR2(input, fsImpl) {
  const text = r2Text(input);
  if (text === null) return null;
  if (!ROUND_DECL_RE.test(text)) return null; // a mention alone never denies

  const researchMatch = RESEARCH_LINE_RE.exec(text);
  if (!researchMatch) return { id: 'R2', type: 'deny', text: R2_TEXT_BASE };

  const rawValue = researchMatch[1].trim();
  const notNeeded = NOT_NEEDED_RE.exec(rawValue);
  if (notNeeded) {
    const reason = notNeeded[1].trim();
    if (reason.length >= 10) return null;
    return { id: 'R2', type: 'deny', text: R2_TEXT_BASE };
  }

  const resolved = resolveResearchPath(rawValue, input.cwd);
  let exists = false;
  try { exists = fsImpl.existsSync(resolved); } catch { exists = false; }
  if (exists) return null;
  return { id: 'R2', type: 'deny', text: `${R2_TEXT_BASE} (report not found: ${resolved})` };
}

/**
 * True only when the OLD free-text pattern matches but the new declaration does not — a
 * prompt that talks about a round in prose without ever declaring one. Log-only signal
 * (round-1 ruling): never denies, never notes, just a `round_mention: true` for whoever
 * reads the observe-only log to see how often this happens.
 */
export function checkRoundMention(input) {
  const text = r2Text(input);
  if (text === null) return false;
  return ROUND_MENTION_RE.test(text) && !ROUND_DECL_RE.test(text);
}

export function checkR3(input) {
  if (input?.tool_name !== 'Agent') return [];
  const prompt = input.tool_input?.prompt;
  if (typeof prompt !== 'string' || prompt.length <= R3_MIN_LEN) return [];
  const findings = [];
  if (!R3_NEG_RESULT_RE.test(prompt)) findings.push({ id: 'R3-neg', type: 'note', text: R3_NEG_TEXT });
  if (!R3_MD_PATH_RE.test(prompt)) findings.push({ id: 'R3-report', type: 'note', text: R3_REPORT_TEXT });
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// decide() — the pure core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} input  the PreToolUse hook payload (parsed JSON)
 * @param {object} ctx    { home, fsImpl, now } — tests always pass a scratch `home`
 * @returns {{ action: 'allow'|'deny'|'note', rule: string[], text: string|null,
 *             skip: boolean, enforced: boolean, roundMention: boolean }}
 *
 * `skip` is true only when `~/.agents/no-dispatch-guard` is present — the CLI wrapper's
 * cue to print nothing AND log nothing, as if this call was never evaluated at all.
 *
 * `enforced` is true ONLY when `~/.agents/dispatch-guard-enforce` exists AND
 * `~/.agents/ws-off` does not (round-1 ruling on MAJOR 2 — observe-only is the default;
 * a MISSING file must never be what turns enforcement on). In every other case rules are
 * still evaluated and logged, but the wrapper never prints.
 *
 * `roundMention` is true when the prompt/message mentions a round number in free text
 * without declaring one (see `checkRoundMention`) — log-only, never affects `action`.
 *
 * Evaluation order is R1, R1b, R2, R3, exactly as the spec lists them. The first deny
 * (R1 or R2) wins outright and short-circuits — no later rule can change a decided deny.
 * Notes (R1b, R3) accumulate along the way and become one joined `additionalContext` if
 * no deny ever fires.
 *
 * `ctx.now` is accepted for interface symmetry with `home`/`fsImpl` but unused today — no
 * current rule is time-dependent. Left in rather than silently dropped, in case a future
 * rule needs a deterministic clock in tests.
 */
export function decide(input, ctx = {}) {
  const home = ctx.home ?? os.homedir();
  const fsImpl = ctx.fsImpl ?? fs;

  if (switchPresentFailSafe(fsImpl, path.join(home, '.agents', 'no-dispatch-guard'))) {
    return { action: 'allow', rule: [], text: null, skip: true, enforced: true, roundMention: false };
  }

  const enforceOn = enforceFilePresent(fsImpl, path.join(home, '.agents', 'dispatch-guard-enforce'));
  const wsOff = switchPresentFailSafe(fsImpl, path.join(home, '.agents', 'ws-off'));
  const enforced = enforceOn && !wsOff;

  const roundMention = checkRoundMention(input);
  const notes = [];

  const r1 = checkR1(input);
  if (r1) return { action: 'deny', rule: [r1.id], text: r1.text, skip: false, enforced, roundMention };

  const r1b = checkR1b(input);
  if (r1b) notes.push(r1b);

  const r2 = checkR2(input, fsImpl);
  if (r2) return { action: 'deny', rule: [r2.id], text: r2.text, skip: false, enforced, roundMention };

  for (const finding of checkR3(input)) notes.push(finding);

  if (notes.length > 0) {
    return {
      action: 'note',
      rule: notes.map((n) => n.id),
      text: notes.map((n) => n.text).join('\n'),
      skip: false,
      enforced,
      roundMention,
    };
  }

  return { action: 'allow', rule: [], text: null, skip: false, enforced, roundMention };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI wrapper — the only part that touches the real filesystem or stdio.
// ─────────────────────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

/** One JSON line to stdout, resolved only once the write is flushed (Windows pipe writes
 * are async; exiting right after `write()` can hand back a truncated line). */
function writeJsonFlushed(obj) {
  return new Promise((resolve) => {
    try {
      process.stdout.write(`${JSON.stringify(obj)}\n`, () => resolve());
    } catch {
      resolve();
    }
  });
}

function appendLog(home, fsImpl, entry) {
  try {
    const dir = path.join(home, '.agents', 'ws');
    fsImpl.mkdirSync(dir, { recursive: true });
    fsImpl.appendFileSync(path.join(dir, 'dispatch-guard.log'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // A log write failure is swallowed (spec G5). The guard's decision does not depend on it.
  }
}

export async function runCli(fsImpl = fs) {
  const home = os.homedir();
  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch {
    return; // unreadable stdin or unparseable JSON: print nothing, exit 0.
  }

  const result = decide(input, { home, fsImpl });
  if (result.skip) return; // no-dispatch-guard: print nothing, log nothing.

  const entry = {
    at: new Date().toISOString(),
    session: typeof input?.session_id === 'string' ? input.session_id.slice(0, 8) : null,
    tool: input?.tool_name ?? null,
    from_subagent: input?.agent_id !== undefined,
    subagent_type: cappedString(input?.tool_input?.subagent_type),
    model: cappedString(input?.tool_input?.model),
    rules: result.rule,
    action: result.action,
    enforced: result.enforced,
  };
  if (result.roundMention) entry.round_mention = true;
  appendLog(home, fsImpl, entry);

  if (!result.enforced) return; // observe-only (the default): never print.

  if (result.action === 'deny') {
    await writeJsonFlushed({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.text,
      },
    });
  } else if (result.action === 'note') {
    await writeJsonFlushed({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: result.text,
      },
    });
  }
  // action === 'allow': nothing to print — silence means "proceed" to a PreToolUse hook.
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
  } catch {
    return false;
  }
})();

if (isMain) {
  runCli().then(
    () => process.exit(0),
    () => process.exit(0), // never exit 2 — a crash here must fail open, not block dispatch.
  );
}
