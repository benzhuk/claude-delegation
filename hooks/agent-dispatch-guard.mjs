// node --test "hooks/*.test.mjs"
//
// agent-dispatch-guard — a PreToolUse guard on `Agent` and `SendMessage` dispatch calls.
// Enforces, in code, three rules that used to be prose nobody enforced (spec: build 0921,
// Territory G; amended in fix round 1 by the owner's rulings on the Opus review —
// `review-guard-report.md` / `review-guard-rulings.md` — and again in fix round 2 on the
// delta review — `review-guard-delta-report.md`, no separate rulings file that round, the
// coordinator's message inlined the rulings):
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
import { readContextTokens, readTail } from './resume-size.mjs';

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
//
// Round-2 fix (found while checking every regex for MAJOR 1's shape, not itself named by
// the review): the OLD `^\s*JUDGMENT:\s*\S.{9,}` was quadratic on the exact same shape as
// round 2's MAJOR 1 — `\s` matches `\n`, so with the `m` flag a long blank-line run before
// (or after) a single real `JUDGMENT:` gives every line-start position in that run its own
// full-length failed match attempt. Measured: a ~200-line-worth blank run around one
// `JUDGMENT:` with no valid 10+ char tail took 8.2s at 100k padding chars, 50.3s at 200k —
// see the round-2 report. Bounding both whitespace runs to `[ \t]{0,20}` (spaces/tabs only,
// capped) removes the newline-crossing, multi-restart shape entirely; behavior is
// unchanged for every real JUDGMENT line in this repo (none use more than a couple of
// leading/trailing spaces).
const JUDGMENT_LINE_RE = /^[ \t]{0,20}JUDGMENT:[ \t]{0,20}\S.{9,}/m;
const R1B_MODEL_RE = /sonnet|haiku/i;

// R2 is a DECLARATION rule, not a mention rule (round-1 ruling on BLOCKER 1/2, MINOR N1).
// `Round:` — the label, WITH its colon — at the start of a line, with optional markdown
// list/bold decoration before and around the label. A report line like "Round 3 findings"
// (no colon) must NOT fire; a declared "Round: 3" / "**Round:** 3" / "- Round: 3" must.
// Verified directly against both forms (see the test file) before wiring this in.
//
// Round-2 fixes, both from the delta review:
//   MAJOR 1 — the round-1 prefix `[\s>*+-]*\**` was quadratic: `\s` matches `\n`, so with
//   the `m` flag it could span multiple lines (O(n) redundant restart points), and
//   `[\s>*+-]*` / `\**` both matched `*`, an ambiguous split that backtracks the same way
//   on a run of asterisks. Reviewer-measured: 8.7s at 100k whitespace chars, 2.6s at 100k
//   asterisks, through the real CLI wrapper — past the hook's own 5s timeout. Fixed by
//   `[ \t]` (never crosses a line) instead of `\s`, dropping the redundant `\**` (it is
//   already inside the class), and a `{0,20}` bound.
//   MINOR N1 — `>` is dropped from the class entirely (not just bounded): blockquoting is
//   how a mandate quotes SOMEONE ELSE'S round declaration (a prior mandate pasted as
//   context, a ledger excerpt), not how you declare your own. A fenced-code or bulleted
//   quotation of a declaration is a known, accepted residual limit — see model-tiers.md.
const ROUND_DECL_RE = /^[ \t*+-]{0,20}Round:\**[ \t]*#?[ \t]*([3-9]|[1-9]\d)\b/mi;
// The OLD, too-loose round-0 pattern. Never enforced — kept only to log when a prompt
// mentions a round number in prose without declaring one, so the observe week has a
// number to look at. `\bround` already excludes "around" (no word boundary between the
// "a" and the "r" inside it, since both are word characters) — confirmed directly.
//
// Round-2 fix (own finding, same MAJOR-1-shaped check): the old separator
// `\s*:?\s*#?\s*` chained THREE unbounded quantifiers over overlapping character sets
// with two optional single chars between them — the classic catastrophic-backtracking
// shape, and it was worse than quadratic: a whitespace run with no trailing digit took
// 17.3s at just 2,000 characters and did not finish in 3s at 2,000 (measured with a hard
// per-run kill timeout after the first probe hung past its own budget — see the round-2
// report). Collapsed the three separate quantified pieces into ONE bounded class,
// `[ \t:#]{0,10}` — a single quantifier has nothing to backtrack against. Every realistic
// separator this was meant to catch ("round 3", "round: 3", "round #3", "Round:12") is
// well under 10 characters.
const ROUND_MENTION_RE = /\bround[ \t:#]{0,10}([3-9]|[1-9]\d)\b/i;

// Round-1 ruling on MAJOR 5: `Research:` accepts the same markdown decoration as `Round:`
// (bullets, blockquotes, bold) — mandates in this repo are routinely written as markdown
// bulleted fields, and the round-0 regex denied both `- Research: x.md` and
// `**Research:** x.md`. `>` stays here (unlike `Round:`): MINOR N1 was specifically about
// a DECLARATION being quotable, not a research line, and no finding named this one.
// Round-2 MAJOR 1 fix applied the same way as `ROUND_DECL_RE`: `[ \t]` instead of `\s`,
// `{0,20}` bound, no redundant `\**` outside the class.
const RESEARCH_LINE_RE = /^[ \t>*+-]{0,20}Research:\**[ \t]*(.+)$/mi;
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

// Resume notice — separate from R1/R1b/R2/R3. SendMessage only, never denies, is the one
// thing this guard can still print in observe mode (CLI wrapper below). Off switches: the
// env var here, plus the existing no-dispatch-guard (via decide()) and ws-off (rechecked
// here — the notice isn't gated by the enforce file the way enforcement is).
export const RESUME_NOTICE_KIND = 'resume-big';
const DEFAULT_RESUME_NOTICE_TOKENS = 150000;
const RESUME_NOTICE_BUDGET_MS = 200;
// Round-2 review MAJOR 1: the dedup scan must never read the whole (forever-growing) log.
const DEDUP_TAIL_BYTES = 1024 * 1024;
// Same shape the CLI already caps `tool_input.to` to before logging it.
const AGENT_NAME_RE = /^[A-Za-z0-9_-]{1,80}$/;
const META_SCAN_CAP = 200;

export function resumeNoticeText(to, tokens) {
  const kTokens = Math.round(tokens / 1000);
  return `resume notice: agent ${to} is at ${kTokens}k tokens of context and re-reads all of `
    + 'it on every call. A fresh agent started from its state file opens small. Resume only '
    + 'if its warm context is worth that.';
}

// Round-2 review MINOR 5: an unset var means the default threshold (150000, notice ON); a
// SET-BUT-MALFORMED one (`-1`, `banana`, `off`) must not silently mean the same thing — it
// falls back to DISABLED instead, since "I typed the switch wrong" should never turn a
// switch that reads as off-ish back on.
function resumeNoticeThreshold(env) {
  const raw = env?.DELEGATION_RESUME_NOTICE_TOKENS;
  if (raw === undefined || raw === '') return DEFAULT_RESUME_NOTICE_TOKENS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readAgentType(fsImpl, metaPath) {
  try {
    const meta = JSON.parse(fsImpl.readFileSync(metaPath, 'utf8'));
    return typeof meta?.agentType === 'string' ? meta.agentType : null;
  } catch {
    return null;
  }
}

/** `<dir of transcript_path>/<session id>/subagents/agent-<to>.jsonl`, or — when `to` was a
 * spawn NAME, not the internal id — the newest `agent-*.meta.json` (capped) with `name ===
 * to`. Null on no match (peer session, teammate, `main`) or any error. */
function resolveSubagentTranscript(input, fsImpl) {
  const to = input?.tool_input?.to;
  const transcriptPath = input?.transcript_path;
  const sessionId = input?.session_id;
  if (typeof to !== 'string' || !AGENT_NAME_RE.test(to)) return null;
  if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const subagentsDir = path.join(path.dirname(transcriptPath), sessionId, 'subagents');

  try {
    const directFile = path.join(subagentsDir, `agent-${to}.jsonl`);
    if (fsImpl.existsSync(directFile)) {
      const agentType = readAgentType(fsImpl, path.join(subagentsDir, `agent-${to}.meta.json`));
      return { agentId: to, transcriptFile: directFile, agentType };
    }
  } catch {
    return null;
  }

  let entries;
  try { entries = fsImpl.readdirSync(subagentsDir); } catch { return null; }
  // Round-2 review MAJOR 2: sort NEWEST-FIRST before capping, not the reverse. Capping in
  // raw readdirSync order and only THEN looking at mtime let the cap silently drop exactly
  // the long-running, big-context agents this feature exists for, in any session with more
  // than META_SCAN_CAP sidecars.
  const metaFiles = entries
    .filter((name) => name.startsWith('agent-') && name.endsWith('.meta.json'))
    .map((name) => {
      let mtimeMs = 0;
      try { mtimeMs = fsImpl.statSync(path.join(subagentsDir, name)).mtimeMs; } catch { mtimeMs = 0; }
      return { name, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, META_SCAN_CAP);

  let best = null;
  for (const { name } of metaFiles) {
    let meta;
    try { meta = JSON.parse(fsImpl.readFileSync(path.join(subagentsDir, name), 'utf8')); } catch { continue; }
    if (meta?.name !== to) continue;
    best = {
      agentId: name.slice('agent-'.length, name.length - '.meta.json'.length),
      agentType: typeof meta.agentType === 'string' ? meta.agentType : null,
    };
    break; // metaFiles is newest-first, so the first match IS the newest.
  }
  if (!best) return null;
  return {
    agentId: best.agentId,
    transcriptFile: path.join(subagentsDir, `agent-${best.agentId}.jsonl`),
    agentType: best.agentType,
  };
}

/** Once per agent: true when the guard's own log already carries a `resume-big` line for
 * this dedup key (scanned fresh each call, no separate state file). Round-2 review MAJOR 1:
 * this log grows one line per dispatch forever, on every machine — read only its tail, the
 * same bound `resume-size.mjs` already gives the transcript read. */
function alreadyNotified(fsImpl, home, dedupKey) {
  try {
    const logPath = path.join(home, '.agents', 'ws', 'dispatch-guard.log');
    const text = readTail(fsImpl, logPath, DEDUP_TAIL_BYTES);
    for (const line of text.split('\n')) {
      if (!line) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry?.kind === RESUME_NOTICE_KIND && entry?.agent_id === dedupKey) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function elapsedMs(t0) {
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/** { home, fsImpl, env } — tests inject all three. Null on any error, missing/malformed
 * transcript, sub-threshold size, an already-notified agent, or a run past its time budget.
 * Never throws, never denies. The budget is checked once right after resolution (the
 * expensive part, e.g. a large sidecar scan) and again before returning, so a slow call is
 * cut short before the token read too, not just after all the work is already done. */
export function checkResumeNotice(input, ctx = {}) {
  const t0 = process.hrtime.bigint();
  try {
    if (input?.tool_name !== 'SendMessage') return null;
    const home = ctx.home ?? os.homedir();
    const fsImpl = ctx.fsImpl ?? fs;
    const env = ctx.env ?? process.env;

    const threshold = resumeNoticeThreshold(env);
    if (threshold <= 0) return null; // DELEGATION_RESUME_NOTICE_TOKENS=0, or a malformed value
    if (switchPresentFailSafe(fsImpl, path.join(home, '.agents', 'ws-off'))) return null;

    const resolved = resolveSubagentTranscript(input, fsImpl);
    if (!resolved) return null;
    if (elapsedMs(t0) > RESUME_NOTICE_BUDGET_MS) return null;

    // Round-2 review MINOR 6: key the dedup on session + agent id, not the agent id alone —
    // two different sessions can otherwise resolve to the same unnamed direct-file agent id
    // and silence each other's notice.
    const dedupKey = `${input.session_id}:${resolved.agentId}`;
    if (alreadyNotified(fsImpl, home, dedupKey)) return null;

    const tokens = readContextTokens(fsImpl, resolved.transcriptFile);
    if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < threshold) return null;
    if (elapsedMs(t0) > RESUME_NOTICE_BUDGET_MS) return null;

    return {
      agentId: resolved.agentId,
      dedupKey,
      agentType: resolved.agentType,
      tokens,
      text: resumeNoticeText(input.tool_input.to, tokens),
    };
  } catch {
    return null;
  }
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

  // Resume notice: its own branch, evaluated BEFORE the observe-only return below, so it is
  // the one thing this guard can still print when not enforcing. It never denies; a deny
  // already decided above for another reason always wins over it (spec: Territory C).
  const denyWins = result.enforced && result.action === 'deny';
  const notice = denyWins ? null : checkResumeNotice(input, { home, fsImpl, env: process.env });
  if (notice) {
    appendLog(home, fsImpl, {
      at: new Date().toISOString(),
      kind: RESUME_NOTICE_KIND,
      agent_id: notice.dedupKey,
      agent_type: cappedString(notice.agentType),
      n: notice.tokens,
    });
  }

  if (denyWins) {
    await writeJsonFlushed({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.text,
      },
    });
    return;
  }

  // Round-2 review MINOR 7: join rather than return-early on the notice, so a future rule
  // that ever notes on SendMessage (none does today — R1/R1b/R3 are Agent-only, R2 only
  // denies) can never have its note silently dropped by a notice firing on the same call.
  const parts = [];
  if (notice) parts.push(notice.text);
  if (result.enforced && result.action === 'note') parts.push(result.text);

  if (parts.length > 0) {
    await writeJsonFlushed({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: parts.join('\n'),
      },
    });
  }
  // Nothing in parts: either observe-only with no notice, or an enforced plain allow.
  // Silence means "proceed" either way.
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
