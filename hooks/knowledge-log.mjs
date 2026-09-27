// node --test "hooks/*.test.mjs"
//
// knowledge-log — a PostToolUse counter on `Read`, `Write`, and `Edit` tool calls that
// appends one line to a per-host log when the call's `file_path` resolves under the
// chezmoi-synced knowledge store, so a later census can measure whether sessions actually
// open the store once it is in front of them (spec: pack/spec.md, Territory K1; goal
// "What one session learns reaches every machine").
//
// Why: research for this lane (docs/reports/, copied from skills-fable's runner) found
// zero topic-file or INDEX.md opens in any transcript since 2026-09-25, and nothing in the
// plugin reads, writes, or counts `~/.claude/knowledge/` at all (0 hits for `_inbox` or
// `.claude/knowledge` as a path in 164 files). This hook is the count; it changes nothing
// about the build path itself (spec: "nothing on the build path changes").
//
// Two destinations (spec item 1):
//   - `~/.agents/knowledge/read.log`  — a Read/Write/Edit whose `file_path` resolves under
//     `~/.claude/knowledge/` and NOT under its `_inbox/` subdirectory.
//   - `~/.agents/knowledge/inbox.log` — the same, but under `~/.claude/knowledge/_inbox/`.
// The log lives under `~/.agents/`, never inside the chezmoi-managed knowledge dir itself
// (rules/00-machine.md: machine-specific state stays out of managed dirs).
//
// Line format (exact, spec item 1): `<ISO UTC> <tool> <path> <session id or unknown>` —
// one line, newline-terminated, capped at 400 characters (spec item 2). `<path>` is the
// resolved, human-readable absolute path (not the case-folded comparison key — see
// `normalizeForCompare` below); `<tool>` is `tool_name` verbatim; the session id falls back
// to the literal string `unknown` when absent or non-string.
//
// Pattern copied from hooks/delete-guard.mjs: `decide(input, ctx)` is the pure core
// (`ctx = { home, fsImpl }`, tests always pass a scratch `home`); the CLI wrapper below is
// the only thing that touches the real filesystem/stdio, and on ANY parse failure, missing
// field, or thrown error it prints nothing, logs nothing, and exits 0 (fail open) — a
// PostToolUse hook can never block the call it observes (the tool already ran by the time
// PostToolUse fires), but a crash here must still never surface to the session.
//
// Kill switches (spec item 2): `~/.agents/no-knowledge-log` (this hook only) and the shared
// `~/.agents/ws-off`. Either present means log nothing, exit 0 — same fail-toward-doing-
// nothing polarity as delete-guard.mjs's `switchPresentFailSafe` (a stat error other than
// ENOENT/ENOTDIR counts as PRESENT, i.e. skip).
//
// Writes nothing when `~/.claude/knowledge/` does not exist (spec item 2): checked with the
// same fail-safe polarity, but inverted — a stat error here counts as ABSENT (skip), since
// the safe default for an uncertain filesystem read is to log nothing, not to guess the
// store exists.
//
// Path comparison (spec item 1's "normalising separators and case on Windows", and this
// file's own autonomy call on HOW): `normalizeForCompare` expands a leading `~`, resolves a
// relative path against `tool_input.cwd` (falling back to `process.cwd()`), then — on
// win32 only — lower-cases the result and forces forward slashes, so
// `C:\Users\x\.claude\Knowledge\_INBOX\note.md` compares equal to
// `c:/users/x/.claude/knowledge/_inbox/note.md`. The logged `<path>` itself keeps its
// resolved-but-original case/separators (path.resolve's own normal form) for readability;
// only the comparison key is case-folded.
//
// Rotation (spec item 2, "a log over 1 MB is rotated to `.1` once, never deleted" — this
// file's own autonomy call on the mechanics): checked BEFORE each append. If the target log
// is already >= 1 MiB, it is renamed to `<name>.1` (overwriting any prior `.1` — a single
// backup generation, never a `.2`/`.3` chain, and the live log file is never deleted, only
// renamed), then a fresh log is started with the new line. This can repeat indefinitely
// (each future crossing again rotates the current file to `.1`), which keeps exactly one
// once-live backup generation rather than letting the file grow forever after a single
// lifetime rotation — read literally, "rotated ... once" describes the single-generation
// shape (no numbered chain), not a one-time-ever event.
//
// Codex (spec item 3): NOT registered. Investigated against the upstream `openai/codex`
// source already checked out for this build's Codex research (commit
// `7dae8c53d97e61cd774e4d6bcca5243c29ca615c`, same checkout
// `docs/notes/2026-09-27-delete-deny-codex-pretooluse-gap.md` used):
//   - `codex-rs/core/src/tools/hook_names.rs` (`HookToolName::apply_patch()`): `Write` and
//     `Edit` are ONLY matcher aliases for Codex's own file-edit tool; the `tool_name`
//     Codex actually SERIALIZES into a hook payload for any edit is always the literal
//     string `apply_patch`, never `Write`/`Edit` — so a Claude-shaped `"Read|Write|Edit"`
//     matcher would not even select the right Codex tool by name.
//   - `codex-rs/core/src/tools/handlers/apply_patch.rs:481-496` (`post_tool_use_payload`):
//     the PostToolUse `tool_input` Codex builds for `apply_patch` is
//     `{ "command": "<raw patch text>" }` — no `file_path` field. The edited path(s) live
//     only as substrings inside a unified-diff-shaped patch body (`*** Update File: ...`),
//     not as a named field a hook can read directly.
//   - Codex has no dedicated file-read tool at all (no `read_file`/equivalent handler under
//     `codex-rs/core/src/tools/handlers/`); a Codex session reads a file through its shell
//     tool, whose own hook `tool_input` is also `{ "command": "<shell text>" }` — again no
//     `file_path` field, and no reliable way to tell a file read from any other shell
//     command without parsing shell text (out of scope; delete-guard.mjs already limits how
//     far this project trusts shell-text parsing).
//   - `codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json` confirms
//     `tool_input` is typed as an opaque `true` (any shape) at the schema level — Codex
//     does not publish a stable file-path field for any tool.
//   Conclusion: unsupported on Codex, per spec item 3's own instruction ("if it does not
//   [name the file path], state `unsupported on Codex` ... and do not guess"). No second
//   hooks.json / codex-hooks.json entry, and no change to
//   scripts/mirror-shared-skills.mjs (lead addendum: K1 only owns that file "if the Codex
//   payload carries a file path").

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LINE_CAP = 400;
const ROTATE_AT_BYTES = 1024 * 1024; // 1 MiB

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (same shape as hooks/delete-guard.mjs)
// ─────────────────────────────────────────────────────────────────────────────

/** An off-switch path counts as PRESENT if it exists, and also if checking it throws —
 * fail toward doing nothing (here: skip entirely). Copied from
 * hooks/delete-guard.mjs:113-122. */
function switchPresentFailSafe(fsImpl, filePath) {
  try {
    return fsImpl.existsSync(filePath);
  } catch {
    return true;
  }
}

/** The knowledge dir counts as ABSENT if checking it throws — the opposite fail-safe
 * polarity from the kill switch above, because the safe default for "we can't tell" is to
 * log nothing, not to assume the store exists and write into `~/.agents/knowledge/`. */
function dirExistsFailSafe(fsImpl, dirPath) {
  try {
    return fsImpl.existsSync(dirPath);
  } catch {
    return false;
  }
}

/** Expand a leading `~`, then resolve to an absolute path (relative paths resolve against
 * `cwd`, falling back to `process.cwd()`). Returns null for anything that is not a
 * non-empty string. Never throws. */
function resolveDisplayPath(filePath, cwd) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  let p = filePath;
  try {
    if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
      p = path.join(os.homedir(), p.slice(1));
    }
    const base = typeof cwd === 'string' && cwd.length > 0 ? cwd : process.cwd();
    return path.isAbsolute(p) ? path.resolve(p) : path.resolve(base, p);
  } catch {
    return null;
  }
}

/** The case/separator-folded comparison key for a resolved absolute path (see file header
 * comment on Windows normalisation). */
function normalizeForCompare(resolvedPath) {
  const slashed = resolvedPath.replace(/\\/g, '/');
  return process.platform === 'win32' ? slashed.toLowerCase() : slashed;
}

function isUnder(childKey, parentKey) {
  return childKey === parentKey || childKey.startsWith(`${parentKey}/`);
}

// ─────────────────────────────────────────────────────────────────────────────
// decide() — the pure core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} input  the PostToolUse hook payload (parsed JSON)
 * @param {object} ctx    { home, fsImpl } — tests always pass a scratch `home`
 * @returns {{ skip: boolean, target: 'read'|'inbox'|null, line: string|null }}
 *
 * `skip` is true only when a kill switch is present. `target` is null whenever nothing
 * should be logged at all: a kill switch, a missing/non-string `file_path`, a missing
 * knowledge dir, or a path outside the store. Otherwise it names which log file the line
 * belongs in.
 */
export function decide(input, ctx = {}) {
  const home = ctx.home ?? os.homedir();
  const fsImpl = ctx.fsImpl ?? fs;

  if (
    switchPresentFailSafe(fsImpl, path.join(home, '.agents', 'no-knowledge-log'))
    || switchPresentFailSafe(fsImpl, path.join(home, '.agents', 'ws-off'))
  ) {
    return { skip: true, target: null, line: null };
  }

  const knowledgeDir = path.join(home, '.claude', 'knowledge');
  if (!dirExistsFailSafe(fsImpl, knowledgeDir)) {
    return { skip: false, target: null, line: null };
  }

  const filePath = input?.tool_input?.file_path;
  const cwd = typeof input?.cwd === 'string' ? input.cwd : undefined;
  const displayPath = resolveDisplayPath(filePath, cwd);
  if (displayPath === null) {
    return { skip: false, target: null, line: null };
  }

  const knowledgeKey = normalizeForCompare(path.resolve(knowledgeDir));
  const inboxKey = normalizeForCompare(path.resolve(knowledgeDir, '_inbox'));
  const pathKey = normalizeForCompare(displayPath);

  let target = null;
  if (isUnder(pathKey, inboxKey)) {
    target = 'inbox';
  } else if (isUnder(pathKey, knowledgeKey)) {
    target = 'read';
  } else {
    return { skip: false, target: null, line: null };
  }

  const toolName = typeof input?.tool_name === 'string' && input.tool_name.length > 0
    ? input.tool_name
    : 'unknown';
  const sessionId = typeof input?.session_id === 'string' && input.session_id.length > 0
    ? input.session_id
    : 'unknown';

  const stamp = new Date().toISOString();
  // One line, no matter what a path/tool/session id contains — strip anything that could
  // split it, then cap at LINE_CAP characters (spec item 2).
  const raw = `${stamp} ${toolName} ${displayPath} ${sessionId}`.replace(/[\r\n\t]+/g, ' ');
  const line = raw.slice(0, LINE_CAP);

  return { skip: false, target, line };
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

/** Rotate `logPath` to `logPath.1` (overwriting any prior `.1`) if it is already at or
 * over the 1 MiB cap, then append `line`. Swallows any error — a log write failure must
 * never affect this hook's (already no-op) exit behaviour. */
function appendWithRotation(fsImpl, logPath, line) {
  try {
    fsImpl.mkdirSync(path.dirname(logPath), { recursive: true });
    let size = 0;
    try {
      size = fsImpl.statSync(logPath).size;
    } catch {
      size = 0; // does not exist yet: nothing to rotate.
    }
    if (size >= ROTATE_AT_BYTES) {
      try {
        fsImpl.renameSync(logPath, `${logPath}.1`);
      } catch {
        // If the rename itself fails, fall through and append to the existing file rather
        // than losing the line entirely.
      }
    }
    fsImpl.appendFileSync(logPath, `${line}\n`, 'utf8');
  } catch {
    // A log write failure is swallowed — this hook never blocks or throws on it.
  }
}

export async function runCli(fsImpl = fs) {
  const home = os.homedir();
  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch {
    return; // unreadable stdin or unparseable JSON: do nothing, exit 0.
  }

  let result;
  try {
    result = decide(input, { home, fsImpl });
  } catch {
    return; // any thrown error: fail open, do nothing, exit 0.
  }

  if (result.skip || result.target === null) return;

  const fileName = result.target === 'inbox' ? 'inbox.log' : 'read.log';
  const logPath = path.join(home, '.agents', 'knowledge', fileName);
  appendWithRotation(fsImpl, logPath, result.line);
  // PostToolUse never blocks or prints hook output — the tool call already completed.
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
    () => process.exit(0), // never exit non-zero: a crash here must fail open.
  );
}
