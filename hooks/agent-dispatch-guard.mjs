// node --test "hooks/*.test.mjs"
//
// agent-dispatch-guard — a PreToolUse guard on `Agent` and `SendMessage` dispatch calls.
// Enforces, in code, three rules that used to be prose nobody enforced (spec: build 0921,
// Territory G):
//   R1  a top-tier model (opus/fable) on a spawn that is not a review or a stated
//       judgment is denied. Execution runs on sonnet or haiku.
//   R1b the mirror note: a spawn states a JUDGMENT but will not run on opus.
//   R2  round 3 or later of a fix loop needs a `Research:` line (a report path, or
//       "not needed, <reason>"), or it is denied.
//   R3  a long mandate that does not authorize a negative result, or names no report
//       file, gets a note (never a deny — a thin mandate is a smell, not a stop).
//
// `decide(input, ctx)` is the pure core. `ctx = { home, fsImpl, now }` — tests always pass
// a scratch `home` from `mkdtempSync` and never touch the real one. The CLI wrapper below
// is the only thing that reads the real filesystem, and it resolves `home` from exactly
// one place: `os.homedir()` (HOME on POSIX, USERPROFILE on Windows — Node's own resolution,
// the same one every other hook in this repo uses).
//
// Failure posture, absolute: any exception, unreadable stdin, or unparseable JSON prints
// nothing and exits 0. A hook that can throw a nonzero exit is a hook that can block a
// dispatch by accident, which is worse than the problem this file fixes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Rule text — exact strings the spec pins. Exported so tests assert on the same
// constant the guard emits, never a re-typed copy that can drift.
// ─────────────────────────────────────────────────────────────────────────────

export const R1_TEXT = 'dispatch-guard R1: top-tier model on a spawn that is not a review or a '
  + 'stated judgment. Execution runs on sonnet or haiku. Respawn without the model override, '
  + 'or add a line "JUDGMENT: <the verdict you are buying>". Off switch: ~/.agents/no-dispatch-guard';

export const R1B_TEXT = 'dispatch-guard R1b: this spawn states a JUDGMENT but will not run on '
  + 'opus. A quality verdict is opus at minimum.';

export const R2_TEXT_BASE = 'dispatch-guard R2: round 3 or later needs a research line. Before a '
  + 'third fix round, run a research lane and add "Research: <path to its report>", or state '
  + '"Research: not needed, <reason>". Off switch: ~/.agents/no-dispatch-guard';

export const R3_NEG_TEXT = 'dispatch-guard R3: this mandate does not authorize a negative '
  + 'result. Add the sentence from docs/mandate-template.md.';

export const R3_REPORT_TEXT = 'dispatch-guard R3: this mandate names no report file.';

// ─────────────────────────────────────────────────────────────────────────────
// Regexes — pinned to the spec's exact patterns.
// ─────────────────────────────────────────────────────────────────────────────

const R1_MODEL_RE = /opus|fable/i;
const REVIEWER_RE = /(^|:)reviewer$/i;
const JUDGMENT_LINE_RE = /^\s*JUDGMENT:\s*\S.{9,}/m;
const R1B_MODEL_RE = /sonnet|haiku/i;
// "around 3" must not match: \b already refuses a boundary between two word chars, and
// "a" and "r" (the letters straddling "round" inside "around") are both word chars, so
// there is no boundary there for \bround to land on. Verified directly (see the test file);
// no regex change was needed.
const ROUND_RE = /\bround\s*#?\s*([3-9]|[1-9]\d)\b/i;
const RESEARCH_LINE_RE = /^\s*Research:\s*(.+)$/mi;
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
 * A switch path counts as PRESENT if it exists, and ALSO if checking it throws — fail
 * toward doing nothing (spec G3). `fsImpl.existsSync` does not normally throw, but a test
 * double is free to simulate an unreadable path, and this is where that gets honored.
 */
function switchPresent(fsImpl, filePath) {
  try {
    return fsImpl.existsSync(filePath);
  } catch {
    return true;
  }
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

/** Resolve a research-report path: absolute as given, else relative to the hook's cwd. */
function resolveResearchPath(rawValue, cwd) {
  const stripped = stripWrap(rawValue);
  if (path.isAbsolute(stripped)) return stripped;
  return path.resolve(cwd ?? process.cwd(), stripped);
}

export function checkR2(input, fsImpl) {
  const isAgent = input?.tool_name === 'Agent';
  const isSendMessage = input?.tool_name === 'SendMessage';
  if (!isAgent && !isSendMessage) return null;

  const text = isAgent ? input.tool_input?.prompt : input.tool_input?.message;
  if (typeof text !== 'string') return null;
  if (!ROUND_RE.test(text)) return null;

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
 *             skip: boolean, enforced: boolean }}
 *
 * `skip` is true only when `~/.agents/no-dispatch-guard` is present — the CLI wrapper's
 * cue to print nothing AND log nothing, as if this call was never evaluated at all.
 * `enforced` is false when `~/.agents/ws-off` is present — rules are still evaluated and
 * logged, but the wrapper never prints, per the observe-only ship plan.
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

  if (switchPresent(fsImpl, path.join(home, '.agents', 'no-dispatch-guard'))) {
    return { action: 'allow', rule: [], text: null, skip: true, enforced: true };
  }
  const enforced = !switchPresent(fsImpl, path.join(home, '.agents', 'ws-off'));

  const notes = [];

  const r1 = checkR1(input);
  if (r1) return { action: 'deny', rule: [r1.id], text: r1.text, skip: false, enforced };

  const r1b = checkR1b(input);
  if (r1b) notes.push(r1b);

  const r2 = checkR2(input, fsImpl);
  if (r2) return { action: 'deny', rule: [r2.id], text: r2.text, skip: false, enforced };

  for (const finding of checkR3(input)) notes.push(finding);

  if (notes.length > 0) {
    return {
      action: 'note',
      rule: notes.map((n) => n.id),
      text: notes.map((n) => n.text).join('\n'),
      skip: false,
      enforced,
    };
  }

  return { action: 'allow', rule: [], text: null, skip: false, enforced };
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

  appendLog(home, fsImpl, {
    at: new Date().toISOString(),
    session: typeof input?.session_id === 'string' ? input.session_id.slice(0, 8) : null,
    tool: input?.tool_name ?? null,
    from_subagent: input?.agent_id !== undefined,
    subagent_type: input?.tool_input?.subagent_type ?? null,
    model: input?.tool_input?.model ?? null,
    rules: result.rule,
    action: result.action,
    enforced: result.enforced,
  });

  if (!result.enforced) return; // ws-off: observe-only. Never print.

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
