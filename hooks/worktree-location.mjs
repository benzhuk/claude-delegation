// hooks/worktree-location.mjs — the pure core of dispatch-guard rule R4 (lane 65,
// docs/specs/worktree-location-65/spec.md item 1): every worktree lives at
// `<repo>/.claude/worktrees/<name>`, never as a sibling in Code or anywhere else.
//
// Two shapes are checked, both by `agent-dispatch-guard.mjs`:
//   * a Bash/PowerShell `git worktree add <path>` (`checkBashWorktreeAdd`): the path is
//     resolved against the call's cwd (and any `git -C <dir>`), `<repo>` is the MAIN checkout
//     (git's common dir, so a linked worktree resolves to the repo that owns it), and the call
//     is refused unless the path is strictly inside `<repo>/.claude/worktrees/`.
//   * an Agent spawn whose mandate carries a `Worktree: <path>` declaration (line start, or after
//     a sentence end as build-loop-workflow.js writes it) (`checkAgentWorktree`): refused unless
//     the path already exists or has a `/.claude/worktrees/<name>` segment (an Agent call has no
//     path field of its own; `isolation: worktree` with no `Worktree:` line is allowed, since
//     Claude Code creates that one in the right place). This arm is advisory hygiene; the Bash
//     arm is the enforcement.
//
// Failure posture: ANY error, unresolvable path (a `$VAR`, a glob, `--git-dir`), non-git
// directory or unusual repo layout (bare repo, submodule) returns null — allow. A guard that
// can guess wrong must guess "allow".

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const WORKTREE_FOLDER = '.claude/worktrees';

/** Deny text. `repo` is null when unresolved (the literal `<repo>` is printed instead). */
export function r4Text(repo, name) {
  const root = `${repo ?? '<repo>'}/${WORKTREE_FOLDER}`;
  const leaf = name || '<name>';
  return 'dispatch-guard R4: a worktree outside <repo>/.claude/worktrees/ is refused. Every '
    + 'worktree lives at `<repo>/.claude/worktrees/<name>`, never as a sibling in Code or '
    + `anywhere else. Use ${root}/${leaf}. Off switch: ~/.agents/no-dispatch-guard`;
}

// ─── path helpers (string-only, cross-platform: a drive-lettered path is absolute on Linux too) ───

const toPosix = (p) => String(p).replace(/\\/g, '/');
const isAbs = (p) => p.startsWith('/') || /^[A-Za-z]:\//.test(p);

function normAbs(p, platform) {
  let s = toPosix(p);
  if (platform === 'win32' && /^\/[A-Za-z](\/|$)/.test(s)) s = `${s[1].toUpperCase()}:${s.slice(2) || '/'}`;
  s = path.posix.normalize(s);
  return s.length > 1 ? s.replace(/\/+$/, '') : s;
}

function joinFrom(base, p, platform) {
  const s = toPosix(p);
  if (isAbs(s) || (platform === 'win32' && /^\/[A-Za-z](\/|$)/.test(s))) return normAbs(s, platform);
  return normAbs(`${toPosix(base).replace(/\/+$/, '')}/${s}`, platform);
}

function realish(p, fsImpl) {
  const real = fsImpl?.realpathSync?.native ?? fsImpl?.realpathSync;
  if (typeof real !== 'function') return p;
  const tail = [];
  let cur = p;
  for (let i = 0; i < 64; i += 1) {
    try {
      const r = toPosix(real.call(fsImpl.realpathSync, cur));
      return tail.length ? `${r.replace(/\/+$/, '')}/${tail.reverse().join('/')}` : r;
    } catch {
      const parent = path.posix.dirname(cur);
      if (parent === cur) return p;
      tail.push(path.posix.basename(cur));
      cur = parent;
    }
  }
  return p;
}

const foldFor = (platform) => (platform === 'win32' || platform === 'darwin'
  ? (s) => s.toLowerCase()
  : (s) => s);

// ─── git: the main checkout of a directory ───

const SCRUBBED_GIT_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY', 'GIT_NAMESPACE', 'GIT_PREFIX'];

export function defaultGitRunner(args, cwd) {
  const env = { ...process.env };
  for (const k of SCRUBBED_GIT_ENV) delete env[k];
  return execFileSync('git', args, {
    cwd, env, encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** The main checkout's root for `dir`, or null (not a repo, bare, submodule, any error). */
export function mainRepoOf(dir, ctx = {}) {
  try {
    const platform = ctx.platform ?? process.platform;
    const out = (ctx.gitRunner ?? defaultGitRunner)(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir);
    const raw = String(out ?? '').trim();
    if (!raw) return null;
    const common = joinFrom(dir, raw, platform);
    if (!/\/\.git$/i.test(common)) return null;
    return common.slice(0, -'/.git'.length) || null;
  } catch {
    return null;
  }
}

/** Is `target` strictly inside `<repo>/.claude/worktrees/`? Both sides realpath'd best-effort. */
function insideFolder(target, repo, ctx) {
  const platform = ctx.platform ?? process.platform;
  const fold = foldFor(platform);
  const root = `${realish(repo, ctx.fsImpl ?? fs)}/${WORKTREE_FOLDER}/`;
  const t = realish(target, ctx.fsImpl ?? fs);
  return fold(t).startsWith(fold(root)) && t.length > root.length;
}

// ─── command scanning ───

/** Drop an unquoted `#` (at line start or after whitespace) through the end of the line. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Drop heredoc bodies and PowerShell here-strings: prose that merely names the command. */
function stripHeredocs(command) {
  const out = [];
  let pending = null;
  for (const line of command.split('\n')) {
    if (pending) {
      const t = line.trim();
      if (pending.ps ? t.startsWith(pending.term) : t === pending.term) pending = null;
      continue;
    }
    out.push(stripComment(line));
    const h = /(?<!<)<<-?[ \t]*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_]\w*))/.exec(line);
    if (h) { pending = { term: h[1] ?? h[2] ?? h[3], ps: false }; continue; }
    const t = line.trimEnd();
    if (t.endsWith("@'")) pending = { term: "'@", ps: true };
    else if (t.endsWith('@"')) pending = { term: '"@', ps: true };
  }
  return out.join('\n');
}

const SEPARATORS = new Set([';', '&', '|', '\n', '\r']);

/** For each index: whether it sits inside a quote, and where its command segment starts. */
function scanCommand(command) {
  const inQuote = new Uint8Array(command.length);
  const segStart = new Int32Array(command.length);
  let quote = null;
  let seg = 0;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    segStart[i] = seg;
    if (quote) {
      inQuote[i] = 1;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      inQuote[i] = 1;
    } else if (SEPARATORS.has(c)) {
      seg = i + 1;
    }
  }
  return { inQuote, segStart };
}

const DISPLAY_HEAD_RE = /^\s*(?:echo|printf|grep|egrep|fgrep|rg|cat|head|tail|sed|awk|write-output|write-host|select-string|git(?:\.exe)?\s+(?:commit|tag|notes)|gh|note-send)\b/i;
const EXECUTOR_HEAD_RE = /^\s*(?:(?:sudo|env|time|nohup)\s+)*(?:bash|sh|zsh|dash|pwsh|powershell|cmd|eval)\b/i;

const QUOTED_GIT_HEAD_RE = /^\s*(?:&|\.)?\s*["'][^"']*$/;

const VAL = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;
const WORKTREE_ADD_RE = new RegExp(
  String.raw`\b[Gg][Ii][Tt](?:\.[Ee][Xx][Ee])?["']?((?:\s+(?:-C\s*${VAL}|-c\s*${VAL}|--(?:git-dir|work-tree|namespace|exec-path|super-prefix|config-env)\s+${VAL}|--[a-zA-Z-]+(?:=\S+)?|-[pP])){0,6})\s+worktree\s+add\b`,
  'g',
);

/** Tokens after `worktree add`, stopping at the first unquoted separator. */
function argTokens(command, from) {
  const tokens = [];
  let cur = null;
  let quote = null;
  for (let i = from; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null; else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur ??= '';
    } else if ((c === '\\' || c === '`') && (command[i + 1] === '\n' || (command[i + 1] === '\r' && command[i + 2] === '\n'))) {
      if (cur !== null) { tokens.push(cur); cur = null; } // a line continuation is whitespace
      i += command[i + 1] === '\r' ? 2 : 1;
    } else if (SEPARATORS.has(c) || c === ')') {
      break;
    } else if (c === ' ' || c === '\t') {
      if (cur !== null) { tokens.push(cur); cur = null; }
    } else {
      cur = (cur ?? '') + c;
    }
  }
  if (cur !== null) tokens.push(cur);
  return tokens;
}

/** A directory change earlier in the same command: git sees the cwd it leaves behind. */
const CD_RE = new RegExp(String.raw`(?:^|[;&|\n(])\s*(?:cd|pushd|chdir|set-location|sl|push-location)(?:\s+(?:-(?:literal)?path\s+)?(?![;&|)])(${VAL}))?(?=\s*(?:$|[;&|\n)]))`, 'gi');

const VALUE_FLAGS = new Set(['-b', '-B', '--reason']);

/** The `<path>` operand of `git worktree add`, or null when there is none. */
function worktreePathOperand(tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === '--') return tokens[i + 1] ?? null;
    if (VALUE_FLAGS.has(t)) { i += 1; continue; }
    if (t.startsWith('-')) continue;
    return t;
  }
  return null;
}

/** `$VAR`, backticks, globs, `%VAR%`, `~user`: not resolvable here, so not judged. */
const UNRESOLVABLE_RE = /[$`*?%]|^~[^/\\]/;

function expandHome(p, home) {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) return `${toPosix(home)}${p.slice(1)}`;
  return p;
}

/**
 * R4, Bash/PowerShell shape. `input.tool_input.command` is the command, `input.cwd` the call's
 * directory. ctx: { home, fsImpl, gitRunner, platform } — tests inject all of them.
 * Returns { id:'R4', type:'deny', text } or null.
 */
export function checkBashWorktreeAdd(input, ctx = {}) {
  try {
    if (input?.tool_name !== 'Bash' && input?.tool_name !== 'PowerShell') return null;
    const raw = input.tool_input?.command;
    if (typeof raw !== 'string' || !/worktree/i.test(raw)) return null;
    const command = stripHeredocs(raw);
    const platform = ctx.platform ?? process.platform;
    const home = ctx.home ?? os.homedir();
    const callCwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const { inQuote, segStart } = scanCommand(command);

    WORKTREE_ADD_RE.lastIndex = 0;
    let m;
    while ((m = WORKTREE_ADD_RE.exec(command))) {
      const head = command.slice(segStart[m.index], m.index);
      if (inQuote[m.index]) {
        // Text inside a quote that nothing executes, unless the quote is a quoted path to git
        // itself: & "C:\Program Files\Git\cmd\git.exe" worktree add ...
        const quotedGit = /^[Gg][Ii][Tt](?:\.[Ee][Xx][Ee])?["']/.test(m[0]) && QUOTED_GIT_HEAD_RE.test(head);
        if (!quotedGit && !EXECUTOR_HEAD_RE.test(head)) continue;
      } else if (DISPLAY_HEAD_RE.test(head)) {
        continue; // echo/grep/git commit -m ...: prose about the command, not the command
      }
      const globals = m[1] ?? '';
      if (/--(?:git-dir|work-tree)\b/.test(globals)) continue; // layout we cannot judge

      let dir = callCwd;
      let ok = true;
      for (const c of command.slice(0, segStart[m.index]).matchAll(CD_RE)) {
        if (inQuote[c.index]) continue; // `echo "x; cd /y"` is text, not a directory change
        const v = (c[1] ?? '~').replace(/^(["'])(.*)\1$/, '$2');
        if (v === '-' || UNRESOLVABLE_RE.test(v)) { ok = false; break; } // `cd -`, `cd $X`: cannot place, allow
        dir = joinFrom(dir, expandHome(v, home), platform);
      }
      if (!ok) continue;
      for (const c of globals.matchAll(new RegExp(String.raw`-C\s*(${VAL})`, 'g'))) {
        const v = c[1].replace(/^(["'])(.*)\1$/, '$2');
        if (UNRESOLVABLE_RE.test(v)) { ok = false; break; }
        dir = joinFrom(dir, expandHome(v, home), platform);
      }
      if (!ok) continue;

      const operand = worktreePathOperand(argTokens(command, m.index + m[0].length));
      if (operand === null || UNRESOLVABLE_RE.test(operand)) continue;
      const target = joinFrom(dir, expandHome(operand, home), platform);
      if (!path.posix.basename(target)) continue; // a root or empty operand is a parse miss, not a placement

      const repo = mainRepoOf(dir, ctx);
      if (!repo) continue; // not a repo we can place: allow
      if (insideFolder(target, repo, { ...ctx, platform })) continue;
      return { id: 'R4', type: 'deny', text: r4Text(repo, path.posix.basename(target)) };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Agent mandate: a `Worktree:` line ───

// A declaration starts a line (bullets and `Your ` allowed) or follows a sentence end, which is
// the shape build-loop-workflow.js writes: `Build territory t1. Brief: b. Worktree: <path>. Gate: g.`
const WORKTREE_LINE_RE = /(?:^|(?<=[.;][ \t]))[ \t>*+-]{0,20}(?:Your[ \t]+)?Worktree:\**[ \t]*([^\n]+)/gmi;

/** First path-ish token of a `Worktree:` value: a quoted/backticked span or up to whitespace. */
function firstValueToken(value) {
  const v = value.trim();
  const q = /^(["'`])(.+?)\1/.exec(v);
  return (q ? q[2] : v.split(/\s+/)[0]).replace(/[,;.]+$/, '');
}

/**
 * R4, Agent shape. Every `Worktree: <path>` declaration in the mandate whose path is clearly a
 * path (an absolute path, or a relative one with a slash) and does not exist yet must have a
 * `/.claude/worktrees/<name>` segment. A path that already exists is not a creation (a reviewer
 * or cleanup mandate may name an existing stray worktree), so it is allowed. `Worktree: none`,
 * `Worktree: <path>` and prose never match. This arm is advisory hygiene: the Bash arm
 * (`checkBashWorktreeAdd`) is the enforcement, since it sees the `git worktree add` itself.
 * Returns a finding or null.
 */
export function checkAgentWorktree(input, ctx = {}) {
  try {
    if (input?.tool_name !== 'Agent') return null;
    const prompt = input.tool_input?.prompt;
    if (typeof prompt !== 'string' || !/Worktree:/i.test(prompt)) return null;
    const platform = ctx.platform ?? process.platform;
    const home = ctx.home ?? os.homedir();
    const callCwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const fsImpl = ctx.fsImpl ?? fs;
    WORKTREE_LINE_RE.lastIndex = 0;
    for (const m of prompt.matchAll(WORKTREE_LINE_RE)) {
      const token = firstValueToken(m[1]);
      if (!token || UNRESOLVABLE_RE.test(token) || /[<>]/.test(token)) continue;
      const pathish = isAbs(toPosix(token)) || /^\/[A-Za-z]\//.test(token) || /^~\//.test(token)
        || /^\.{1,2}[\/]/.test(token);
      if (!pathish) continue; // `none`, a branch name, prose
      const target = joinFrom(callCwd, expandHome(token, home), platform);
      if (foldFor(platform)(target).includes(`/${WORKTREE_FOLDER}/`)) continue; // a name follows (no trailing slash survives normAbs)
      try { if (fsImpl.existsSync(target)) continue; } catch { continue; } // already there: not a creation
      const repo = mainRepoOf(callCwd, ctx);
      return { id: 'R4', type: 'deny', text: r4Text(repo, path.posix.basename(target)) };
    }
    return null;
  } catch {
    return null;
  }
}
