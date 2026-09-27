// node --test "hooks/*.test.mjs"
//
// delete-guard — a PreToolUse guard on `Bash` and `PowerShell` tool calls that denies a
// recursive delete issued FROM A SUBAGENT, before the permission prompt nobody watches
// ever appears (spec: pack/spec.md, Territory D1).
//
// Why: twice in one night a mid-tier builder chained `rm -rf` into a command despite its
// mandate carrying the sentence forbidding it, and sat on the unattended prompt: 3.5 hours
// in lane ten, 40 minutes in lane fifteen. A text rule has now failed under measurement
// twice, which by this project's own standard means it is replaced by a mechanical one.
// `~/.claude/settings.json` denying `Bash(rm -rf *)` does not catch it either — that
// pattern only matches a command that BEGINS with those bytes, so `git clone … && rm -rf …`
// falls through to the classifier and the prompt.
//
// Pattern copied from hooks/agent-dispatch-guard.mjs: `decide(input, ctx)` is the pure
// core (`ctx = { home, fsImpl }`, tests always pass a scratch `home`); the CLI wrapper below
// is the only thing that touches the real filesystem/stdio, and on ANY parse failure,
// missing field, or thrown error it prints nothing and exits 0 (fail open) — a hook that
// can block a Bash call by accident on a bug is worse than the problem this file fixes.
//
// UNLIKE THE DISPATCH GUARD, THIS ONE ENFORCES BY DEFAULT (spec item 2). The dispatch
// guard's observe-only default exists because false denies there are expensive (a top-tier
// spawn that legitimately needed reviewing). Here the failure this hook fixes is the
// UNATTENDED one — an opt-in enforce file would leave the guard off exactly where it
// matters, on the exact call shape that already cost two lanes hours. So: no enforce file.
// A match, from a subagent, is a deny, full stop. The lead's own pane (no `agent_id` on the
// call) keeps today's prompt — see the agent_id scoping note below.
//
// Kill switches (spec item 2): `~/.agents/no-delete-guard` (this hook only) and the shared
// `~/.agents/ws-off`. Either present means print nothing AND log nothing, exit 0 — same
// "fail toward doing nothing" polarity as the dispatch guard's off switches.
//
// Scope by caller (spec item 4): the dispatch guard already reads this same field at
// hooks/agent-dispatch-guard.mjs:576 (`from_subagent: input?.agent_id !== undefined`) to
// tell a subagent's call from the lead session's own. This hook denies only when
// `agent_id` is present on the hook payload; when absent, it logs `passed-lead` and passes,
// so Ben's own pane keeps its permission prompt. A LIVE confirmation that `agent_id` really
// is present on a subagent's Bash call and absent on the lead's (spec item 4, "do not
// guess this; run it") is the integrator's live check, not this builder's — see this
// territory's report for how to run it against this branch.
//
// Regex scope, and its acknowledged limits (spec item 3):
//   - `rm` with any flag GROUP containing `r`/`R`, or the word `--recursive`, matched
//     anywhere in the string (a compound command is the case that bit the prior incidents:
//     `git clone … && rm -rf …`). Covers `rm -rf`, `rm -fr`, `rm -r -f`, `rm --recursive`,
//     `\rm -rf` (alias bypass), `command rm -rf`, `sudo rm -rf`, `xargs rm -rf`, and
//     `sh -c "rm -rf x"` (the quoted content there is a REAL delete once `sh -c` runs it —
//     `sh`/`bash -c` are not on the safe-quote list below, on purpose).
//   - `rmdir /s` and `rd /s` (Windows cmd).
//   - `Remove-Item`, `ri`, `rmdir`, `rd`, `del`, `erase` with `-Recurse` (or an unambiguous
//     `-r` prefix abbreviation, PowerShell's own convention) — including `-Recurse:$true`.
//     `rmdir`/`rd` are also Windows-cmd verbs (`/s`, handled separately below, checked
//     first so its own verb label wins); the same words are PowerShell `Remove-Item`
//     aliases too (`rmdir C:\x -Recurse -Force`), which is why they are on both lists.
//     `Remove-Item … -Force` on a directory path is NOT distinguishable by regex from a
//     single-file force-delete (spec item 3 says so explicitly) — out of scope, not guessed.
//   - `git clean` with `-f`, `-d`, or `-x`/`-X` in any short flag group, or `--force` — and
//     `git worktree remove` with `--force` or its short form `-f`, and `git worktree
//     prune` — all three seen through up to 6 leading git global options (`-C <path>`,
//     `-c k=v`, `--git-dir=…`, `--no-pager`, …), since `git -C <worktree> clean -fdx` is
//     the normal way to address a path outside the caller's own cwd (bare `git worktree
//     remove <path>`, no `--force`/`-f`, is the sanctioned allowance below — git itself
//     refuses a non-empty/dirty worktree without it).
//   - `find … -delete`.
//   Allowances, pinned by tests: `git worktree remove <path>` without `--force`, and
//   `git branch -d`/`-D` (scripts/janitor.mjs's sanctioned verb — a ref delete, not a
//   directory delete; nothing in this file even has a pattern shaped to catch it).
//   Quoted-argument exception: a matched verb that appears inside ANY single- or
//   double-quoted span within the sub-command window of `grep`, `echo`, `printf`,
//   `git commit -m`, or `note-send --text` is not treated as a delete (the simple case the
//   spec asks for), UNLESS that same sub-command's window also pipes into a shell/xargs
//   (`echo "rm -rf x" | sh`), or the double-quoted span itself contains a command
//   substitution (`"...$(rm -rf x)..."` or a backtick form) — both of those really execute,
//   so they are excluded from the exemption rather than trusted. A here-doc that writes a
//   script to a FILE and runs that file as a later, separate command is a known,
//   undocumented-by-regex residual limit: the delete is a literal substring of the
//   here-doc body (and is caught, see the here-doc test below) but nothing here follows a
//   script file written by one call into a DIFFERENT call that later executes it.
//   Also out of scope, by the same "regex over a string" limit, not guessed at: a delete
//   issued through a language runtime rather than a shell verb (`node -e
//   "fs.rmSync(x,{recursive:true})"`, `python -c "shutil.rmtree(x)"`,
//   `[System.IO.Directory]::Delete(x,$true)`) and `Remove-Item` fed a path over a pipe
//   (`gci -Recurse | Remove-Item`, no delete-shaped flag on the `Remove-Item` word itself).
//   A handful of quoted/safe-command shapes still false-refuse rather than being made
//   quote-aware inside `commandWindow` (accepted per "false refusals are cheap"): a
//   here-doc body quoted into `git commit -m "$(cat <<'EOF' … EOF)"`, a `;` inside a quoted
//   commit message (`git commit -m "fix: rm -rf; guard"`), and a `|` inside a quoted grep
//   pattern (`grep -E "rm -rf|rd /s"`) — each stops the sub-command window early because
//   the window scan is not quote-aware.
//   False refusals are cheap (the agent rephrases or asks); false passes cost hours — when
//   in doubt, this file refuses.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Reason text (spec item 5, exact string) — exported so tests assert on the same
// constant the guard emits, never a re-typed copy that can drift.
// ─────────────────────────────────────────────────────────────────────────────

export function reasonText(verb) {
  return `delete-guard: recursive delete refused for an agent (${verb}). Removal of `
    + "worktrees and scratch is the lead's own standalone command; report what needs "
    + 'deleting. Kill switch ~/.agents/no-delete-guard.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** An off-switch path counts as PRESENT if it exists, and also if checking it throws —
 * fail toward doing nothing (here: skip entirely), same shape as the dispatch guard's
 * `switchPresentFailSafe`. */
function switchPresentFailSafe(fsImpl, filePath) {
  try {
    return fsImpl.existsSync(filePath);
  } catch {
    return true;
  }
}

/** From startIdx, the rest of THIS sub-command only — stops at the next `;`, `&&`, `||`,
 * `|`, or newline, capped at `cap` characters. Keeps a recursive-flag check from leaking
 * into a chained command after `&&`/`;` while still catching a flag written anywhere
 * within the same sub-command. Bounded negated-class slice, then one bounded regex probe
 * on that slice — linear, no catastrophic-backtracking shape. */
const SEP_RE = /;|&&|\|\||\n|\|/;
function commandWindow(command, startIdx, cap = 300) {
  const rest = command.slice(startIdx, startIdx + cap);
  const sep = SEP_RE.exec(rest);
  return sep ? rest.slice(0, sep.index) : rest;
}

function isExcluded(safeSpans, index) {
  return safeSpans.some(([s, e]) => index >= s && index < e);
}

/** A single-dash short flag group containing any of `letters` (checked per-character, so
 * `-rf`/`-fr`/`-vrf` all count for `r`). The flag must START a token — preceded by
 * whitespace, a quote, a backslash, or the start of the window (review r2 MAJOR R1: a
 * flag can be split open by shell quoting or escaping, e.g. `rm "-rf" x`, `rm \-rf x`,
 * `git clean "-fdx"` — those are real recursive deletes once the shell strips the quote
 * or the escape) — and end at any character that cannot continue a word or path (a
 * negated class: not a letter, digit, `_`, `.`, `/`, or `-`), instead of a short allow-list
 * of terminators. That single negated class covers whitespace, the shell separators
 * `;&|)"':`, AND punctuation the old allow-list missed — a redirect (`rm -rf>/dev/null`),
 * a comma, braces, a backtick — while a `-` in the MIDDLE of a word (a path like
 * `-orca`/`-results`, or `wt-fix`) still never counts as a flag START, and a hyphenated
 * path like `-results.json`/`-r.log` still does not end at a word boundary so it stays
 * allowed. A double-dash long option is still out (the character right after the leading
 * `-` in `--force` is another `-`, not a letter, so it can never start this match; a long
 * option only counts via its own exact-word check elsewhere, e.g. `--recursive`,
 * `--force`). */
function hasShortFlagWithAnyOf(window, letters) {
  const re = /(?:^|[\s"'\\])-([a-zA-Z]{1,20})(?=$|[^\w./-])/g;
  let m;
  while ((m = re.exec(window))) {
    if (letters.test(m[1])) return true;
  }
  return false;
}

function hasRecursiveFlag(window) {
  return /--recursive\b/i.test(window) || hasShortFlagWithAnyOf(window, /[rR]/);
}

function hasCleanFlag(window) {
  return /--force\b/i.test(window) || hasShortFlagWithAnyOf(window, /[fdxX]/);
}

/** Up to 6 leading git global options (`-C <path>`, `-c k=v`, `--git-dir=…`,
 * `--no-pager`, …) between `git` and the subcommand word — `git -C <worktree> clean -fdx`
 * is the normal way this project addresses a path outside the caller's own cwd (30+
 * occurrences across agents/, skills/, docs). The repeat count is capped, so there is no
 * unbounded-backtracking shape even on an adversarial run of repeated options. Also
 * matches `git.exe` (review r2 n1), the space-separated form of the long path-valued
 * options (`--work-tree ../wt`, not just `--work-tree=../wt`), and the short `-p`/`-P`
 * pager toggle, all of which were falling through the alternation entirely and letting
 * `git --work-tree ../wt clean -fdx` / `git -P clean -fdx` / `git.exe clean -fdx` skip the
 * global-option scan and read as an un-prefixed (safe) `clean`. */
// review r3 n6: a quoted full path (`"C:\Program Files\Git\bin\git.exe" clean -fdx`) has a
// closing quote right after `git.exe`, not whitespace, so `["']?` after the executable
// name admits it; `-[Cc]\s*` (was `-[Cc]\s+`) admits the value glued to `-C` with no space
// (`-Cx`), matching the same shape already allowed for `--long=value`.
const GIT_PREFIX = String.raw`\bgit(?:\.exe)?["']?(?:\s+(?:-[Cc]\s*(?:"[^"]*"|'[^']*'|\S+)|--(?:git-dir|work-tree|namespace|exec-path|super-prefix|config-env)\s+(?:"[^"]*"|'[^']*'|\S+)|--[a-zA-Z-]+(?:=\S+)?|-[pP])){0,6}\s+`;

/** PowerShell allows an unambiguous prefix abbreviation of a parameter name — `-r`, `-re`,
 * `-recurse`, all the way to `-Recurse`, optionally `:$true`. `'recurse'.startsWith(base)`
 * accepts any real prefix and rejects an unrelated flag that merely starts with the same
 * letter (`-root`, `-recreate`). */
function hasRecurseFlag(window) {
  const re = /-([a-zA-Z]{1,20})(:\$true)?\b/g;
  let m;
  while ((m = re.exec(window))) {
    const base = m[1].toLowerCase();
    if ('recurse'.startsWith(base)) return true;
  }
  return false;
}

/** Spans of quoted text that are an ARGUMENT to a known-safe command (`grep`, `echo`,
 * `printf`, `git commit -m`, `note-send --text`) — a verb matched only inside one of these
 * is text being displayed or committed, not executed. Every quoted span within that same
 * sub-command's window counts (spec examples include `printf "%s" "rm -rf /"`, where the
 * matched text is the SECOND quoted argument, not the one immediately after the word). */
const SAFE_CMD_RE = /\b(?:grep|echo|printf|git\s+commit\s+-m|note-send\s+--text)\b/gi;
// A quoted span within an already-bounded (<=300 char) window: negative lookahead per
// character is linear here because the window itself is capped, not because the pattern
// is bounded on its own.
const QUOTE_SPAN_RE = /(["'])((?:(?!\1).)*)\1/g;
// If the sub-command's window terminates at a `|` that feeds a shell/interpreter, the
// quoted text is not just displayed/committed — it really executes once that pipe runs,
// so none of that window's quoted spans are safe (m1). Checked per pipe STAGE (review r2
// n2), not just the stage immediately after the window, so an intermediate stage the
// window doesn't lead straight into (`| tee f | sh`) still counts, and a stage led by an
// interpreter reached through a path (`| /bin/sh`) or through `sudo` with its own options
// (`| sudo -u me sh`), or `env`'s own launcher form (`| env bash`, `| /usr/bin/env sh`,
// review r3 n5), still counts.
// review r3 MAJOR R3-1: the prior sudo-options group, `(?:-\S+\s+(?:\S+\s+)?)*`, let a
// dash-token be read either as a new option OR as the previous option's argument, so a
// run of n dash-tokens had ~Fib(n) splits and the engine tried them all before failing —
// exponential backtracking that can stall the whole hook past its 5s timeout and fail
// open. Forbidding a leading `-` on an option's argument (`[^-\s]\S*`) gives every token
// exactly one reading, which removes the ambiguity outright instead of merely capping it.
// The `env` launcher group below has no such ambiguity (its dash options never carry a
// separate optional argument to be confused with), so it stays linear too.
const PIPE_STAGE_SHELL_RE = /^\s*(?:sudo(?:\s+-\S+(?:\s+[^-\s]\S*)?)*\s+)?(?:(?:\S*[\\/])?env\s+(?:-\S+\s+)*)?(?:\S*[\\/])?(?:sh|bash|zsh|dash|pwsh|powershell|cmd|iex|Invoke-Expression|xargs)\b/i;
function pipesToShell(afterWindow) {
  const stages = afterWindow.split('|');
  for (let i = 1; i < stages.length; i += 1) {
    if (PIPE_STAGE_SHELL_RE.test(stages[i])) return true;
  }
  return false;
}

function findSafeQuoteSpans(command) {
  const spans = [];
  SAFE_CMD_RE.lastIndex = 0;
  let m;
  while ((m = SAFE_CMD_RE.exec(command))) {
    const windowStart = SAFE_CMD_RE.lastIndex;
    const window = commandWindow(command, windowStart, 300);
    const afterWindow = command.slice(windowStart + window.length, windowStart + 300);
    if (pipesToShell(afterWindow)) continue;
    QUOTE_SPAN_RE.lastIndex = 0;
    let qm;
    while ((qm = QUOTE_SPAN_RE.exec(window))) {
      // A command substitution inside a DOUBLE-quoted span really executes even though
      // the outer text is a safe command's argument (m2) — a single-quoted span never
      // substitutes, so it stays exempt.
      if (qm[1] === '"' && /\$\(|`/.test(qm[2])) continue;
      spans.push([windowStart + qm.index + 1, windowStart + qm.index + qm[0].length - 1]);
    }
  }
  return spans;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verb detectors — each scans the whole command string (global regex), skips any
// occurrence inside a safe-quote span, and returns the FIRST surviving match as
// `{ verb, index }`, or null.
// ─────────────────────────────────────────────────────────────────────────────

function detectRm(command, safeSpans) {
  const re = /\brm\b/gi;
  let m;
  while ((m = re.exec(command))) {
    if (!isExcluded(safeSpans, m.index) && hasRecursiveFlag(commandWindow(command, re.lastIndex))) {
      return { verb: 'rm -r', index: m.index };
    }
  }
  return null;
}

function detectRmdirWin(command, safeSpans) {
  const re = /\b(rmdir|rd)\b/gi;
  let m;
  while ((m = re.exec(command))) {
    if (!isExcluded(safeSpans, m.index) && /\/s\b/i.test(commandWindow(command, re.lastIndex))) {
      return { verb: `${m[1].toLowerCase()} /s`, index: m.index };
    }
  }
  return null;
}

function detectPowerShellDelete(command, safeSpans) {
  const re = /\b(Remove-Item|ri|rmdir|rd|del|erase)\b/gi;
  let m;
  while ((m = re.exec(command))) {
    if (!isExcluded(safeSpans, m.index) && hasRecurseFlag(commandWindow(command, re.lastIndex))) {
      return { verb: `${m[1]} -Recurse`, index: m.index };
    }
  }
  return null;
}

function detectGitClean(command, safeSpans) {
  const re = new RegExp(GIT_PREFIX + String.raw`clean\b`, 'gi');
  let m;
  while ((m = re.exec(command))) {
    if (!isExcluded(safeSpans, m.index) && hasCleanFlag(commandWindow(command, re.lastIndex))) {
      return { verb: 'git clean', index: m.index };
    }
  }
  return null;
}

function detectGitWorktreeForceRemove(command, safeSpans) {
  const re = new RegExp(GIT_PREFIX + String.raw`worktree\s+remove\b`, 'gi');
  let m;
  while ((m = re.exec(command))) {
    const window = commandWindow(command, re.lastIndex);
    // `--force` or git's own short form `-f` (`git worktree remove [-f] <worktree>`) —
    // `hasShortFlagWithAnyOf` requires the flag to START a token, so a sanctioned
    // `git worktree remove ../wt-fix` (no flag at all) is unaffected.
    if (!isExcluded(safeSpans, m.index) && (
      /--force\b/i.test(window) || hasShortFlagWithAnyOf(window, /f/)
    )) {
      return { verb: 'git worktree remove --force', index: m.index };
    }
  }
  return null;
}

function detectGitWorktreePrune(command, safeSpans) {
  const re = new RegExp(GIT_PREFIX + String.raw`worktree\s+prune\b`, 'gi');
  let m;
  while ((m = re.exec(command))) {
    if (!isExcluded(safeSpans, m.index)) return { verb: 'git worktree prune', index: m.index };
  }
  return null;
}

function detectFindDelete(command, safeSpans) {
  const re = /\bfind\b/gi;
  let m;
  while ((m = re.exec(command))) {
    if (!isExcluded(safeSpans, m.index) && /-delete\b/i.test(commandWindow(command, re.lastIndex, 500))) {
      return { verb: 'find -delete', index: m.index };
    }
  }
  return null;
}

const DETECTORS = [
  detectRm,
  detectRmdirWin,
  detectPowerShellDelete,
  detectGitClean,
  detectGitWorktreeForceRemove,
  detectGitWorktreePrune,
  detectFindDelete,
];

/** The pure matcher: one string in, `{ verb, index } | null` out. Exported directly so
 * tests can probe it without building a full hook payload. Never throws on a string
 * input — every internal regex is bounded (capped quantifiers, no adjacent-unbounded
 * classes), so there is no catastrophic-backtracking shape to guard against here the way
 * agent-dispatch-guard.mjs had to fix twice. */
export function detectDelete(command) {
  if (typeof command !== 'string') return null;
  // A backslash- or backtick-newline line continuation (bash, or PowerShell's backtick)
  // hides a flag on the next line from every window scan above, which stops at `\n`
  // (m3) — collapse it to a single space so the whole logical command is one line.
  const normalized = command.replace(/[\\`]\r?\n/g, ' ');
  const safeSpans = findSafeQuoteSpans(normalized);
  for (const detector of DETECTORS) {
    const found = detector(normalized, safeSpans);
    if (found) return found;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// decide() — the pure core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} input  the PreToolUse hook payload (parsed JSON)
 * @param {object} ctx    { home, fsImpl } — tests always pass a scratch `home`
 * @returns {{ action: 'allow'|'deny', verb: string|null, text: string|null,
 *             skip: boolean, logVerb: 'denied'|'passed-lead'|null }}
 *
 * `skip` is true only when a kill switch is present — print nothing AND log nothing.
 * `logVerb` is null whenever nothing should be logged at all: a kill switch, a
 * non-string/missing command, or a command that matches no delete pattern (spec item 5:
 * "a command that matches nothing is not logged"). Otherwise it is `denied` (agent_id
 * present) or `passed-lead` (agent_id absent — the lead's own pane keeps its prompt).
 */
export function decide(input, ctx = {}) {
  const home = ctx.home ?? os.homedir();
  const fsImpl = ctx.fsImpl ?? fs;

  if (
    switchPresentFailSafe(fsImpl, path.join(home, '.agents', 'no-delete-guard'))
    || switchPresentFailSafe(fsImpl, path.join(home, '.agents', 'ws-off'))
  ) {
    return { action: 'allow', verb: null, text: null, skip: true, logVerb: null };
  }

  const command = input?.tool_input?.command;
  const match = detectDelete(command);
  if (!match) {
    return { action: 'allow', verb: null, text: null, skip: false, logVerb: null };
  }

  const fromSubagent = input?.agent_id !== undefined;
  if (!fromSubagent) {
    return { action: 'allow', verb: match.verb, text: null, skip: false, logVerb: 'passed-lead' };
  }

  return {
    action: 'deny',
    verb: match.verb,
    text: reasonText(match.verb),
    skip: false,
    logVerb: 'denied',
  };
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
 * are async; exiting right after `write()` can hand back a truncated line) — same fix as
 * agent-dispatch-guard.mjs's `writeJsonFlushed`. */
function writeJsonFlushed(obj) {
  return new Promise((resolve) => {
    try {
      process.stdout.write(`${JSON.stringify(obj)}\n`, () => resolve());
    } catch {
      resolve();
    }
  });
}

/** `<stamp> <logVerb> [<matched verb>] <first 80 chars>` — the existing flush.log shape
 * (`<stamp> <verb> …`, skills/multi/scripts/note-flush.mjs's `log()`) adapted to this
 * hook's own fields: never the whole command (spec item 5's 80-character cap), and never
 * logged at all for a non-match (see `decide()`'s `logVerb: null`). The matched verb is
 * bracketed because some verb labels contain a space (`rm -r`) — brackets keep a line
 * scan unambiguous about where the verb ends and the command snippet begins. */
function appendLog(home, fsImpl, logVerb, verb, command) {
  try {
    const dir = path.join(home, '.agents', 'notes');
    fsImpl.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString();
    // A multi-line command must still produce ONE log line (spec item 5) — strip any
    // newline/tab that survived the 80-char slice (m4).
    const snippet = command.slice(0, 80).replace(/[\r\n\t]+/g, ' ');
    fsImpl.appendFileSync(path.join(dir, 'delete-guard.log'), `${stamp} ${logVerb} [${verb}] ${snippet}\n`, 'utf8');
  } catch {
    // A log write failure is swallowed — the guard's decision never depends on it.
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

  let result;
  try {
    result = decide(input, { home, fsImpl });
  } catch {
    return; // any thrown error: fail open, print nothing, exit 0.
  }

  if (result.logVerb === null) return; // kill switch, or no match: no log, no output.

  const command = typeof input?.tool_input?.command === 'string' ? input.tool_input.command : '';
  appendLog(home, fsImpl, result.logVerb, result.verb, command);

  if (result.action === 'deny') {
    await writeJsonFlushed({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.text,
      },
    });
  }
  // passed-lead: logged above, nothing printed — the lead's own pane keeps its prompt.
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
    () => process.exit(0), // never exit 2 — a crash here must fail open, not block the call.
  );
}
