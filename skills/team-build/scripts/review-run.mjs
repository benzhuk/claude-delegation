#!/usr/bin/env node
// review-run — run the high-tier reviewer role as a real `claude -p` child, so a Codex-led
// lane can get an Opus review without asking a Claude lead to spawn one (lane 53, wr-2026-09-29).
//
// Spec: docs/work/wr-2026-09-29-review-run.record.md "## Spec", amended by every finding's
// replacement text in docs/specs/review-run-53/redteam.md and
// docs/specs/review-run-53/lead-ruling-redteam.md (including its "Decisions received").
//
// m5: this file imports ONLY node: builtins — never scripts/ or skills/multi/scripts/ — because
// the mirror publishes skills/ wholesale and review-run.mjs must work from the mirrored copy alone.
// review-run.test.mjs asserts this mechanically.
//
// Usage:
//   node review-run.mjs --sha <commit> --brief <path> --report <path> --scratch <dir>
//     [--repo <checkout>] [--model opus] [--timeout-min 45] [--claude-bin <path>] [--plugin-root <dir>]
//
// Exit codes: 0 well-formed report (whatever its verdict) · 1 usage error · 2 malformed/missing
// report · 3 timeout or signal · 4 unsupported host / no claude / no plugin root · 5 kill switch ·
// 6 recursion refused · 7 internal error.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const EXIT = Object.freeze({
  OK: 0, USAGE: 1, BAD_REPORT: 2, TIMEOUT: 3, HOST: 4, KILL_SWITCH: 5, RECURSION: 6, INTERNAL: 7,
});

/** decision 2(a)/B3(a): the marker a review-run child runs under. delete-guard.mjs and
 * multi-inbox.js both key off this the same way they key off agent_id. */
export const RECURSION_ENV_VAR = 'DELEGATION_REVIEW_RUN';

/**
 * B1: matches the reviewer role's own report contract (agents/reviewer.md), NOT the packet's
 * original stricter form. Normalized the same way accept's own VERDICT_RE is (work-record.mjs:571,
 * :1335): BOM stripped, text before the first line break, trimmed.
 */
export const VERDICT_RE = /^VERDICT:[ \t]*(APPROVE|NEEDS_FIXES)(?:[ \t]+\(\d{1,4}\))?[ \t]+(?:—[ \t]+)?([0-9a-fA-F]{7,40})[ \t]*$/;

/** M1: always disallowed, in every permission mode. Prefix-rule syntax pinned by probe P7. */
export const DISALLOWED_TOOLS = [
  'Bash(git push:*)', 'Bash(git commit:*)', 'Bash(git config:*)', 'Bash(git update-ref:*)',
  'Bash(git branch:*)', 'Bash(git tag:*)', 'Bash(git reset:*)', 'Bash(git checkout:*)',
  'Bash(git switch:*)', 'Bash(git worktree:*)', 'Bash(git clean:*)', 'Bash(git stash:*)',
  'Bash(gh:*)', 'Bash(vercel:*)', 'Bash(npm publish:*)', 'Bash(claude:*)', 'Bash(note-send:*)',
  'Bash(rm -r:*)', 'Bash(rm -fr:*)', 'Bash(find * -delete*)',
];

/** M2: removed from the caller's env before it reaches the child. Exact names. */
const ENV_DENYLIST_EXACT = new Set([
  'NOTE_SLUG', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_ENV_FILE',
  'TMUX', 'TMUX_PANE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'AGENTS_HOME',
]);
/** M2: removed by prefix (every ORCA_* and CODEX_*). */
const ENV_DENYLIST_PREFIX = ['ORCA_', 'CODEX_'];
/** M2: removed by pattern (any *_SESSION_ID, any CLAUDE_CODE_SESSION_*). decision 2's
 * "the runner strips NOTE_SLUG and ORCA_TERMINAL_HANDLE" is covered by the exact/prefix sets above. */
const ENV_DENYLIST_PATTERN = [/^CLAUDE_CODE_SESSION_/, /_SESSION_ID$/];

/** m5: repo-locating git env vars, stripped from every git call this script makes (same set
 * transport.mjs's withoutRepoLocatingGitEnv strips — inlined here per the import restriction). */
const REPO_LOCATING_GIT_ENV = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
];

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Small pure helpers
// ─────────────────────────────────────────────────────────────────────────────

class ExitSignal extends Error {
  constructor(code, message) { super(message); this.exitCode = code; }
}

function usageError(message) { throw new ExitSignal(EXIT.USAGE, message); }
function hostError(message) { throw new ExitSignal(EXIT.HOST, message); }

export function parseArgs(argv) {
  const out = {
    repo: null, model: 'opus', timeoutMin: 45, claudeBin: 'claude', pluginRoot: null,
  };
  const known = new Set([
    '--sha', '--brief', '--report', '--repo', '--model', '--timeout-min', '--scratch',
    '--claude-bin', '--plugin-root',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!known.has(flag)) usageError(`unknown option: ${flag}`);
    const value = argv[i + 1];
    if (value === undefined) usageError(`missing value for ${flag}`);
    i += 1;
    switch (flag) {
      case '--sha': out.sha = value; break;
      case '--brief': out.brief = value; break;
      case '--report': out.report = value; break;
      case '--repo': out.repo = value; break;
      case '--model': out.model = value; break;
      case '--timeout-min': out.timeoutMin = Number(value); break;
      case '--scratch': out.scratch = value; break;
      case '--claude-bin': out.claudeBin = value; break;
      case '--plugin-root': out.pluginRoot = value; break;
      default: break;
    }
  }
  if (!out.sha) usageError('--sha is required');
  if (!/^[0-9a-fA-F]{7,40}$/.test(out.sha)) usageError('--sha must be 7 to 40 hex characters (m5)');
  if (!out.brief) usageError('--brief is required');
  if (!out.report) usageError('--report is required');
  if (!out.scratch) usageError('--scratch is required (m3: the record\'s Scratch: dir)');
  if (!Number.isFinite(out.timeoutMin) || out.timeoutMin <= 0) usageError('--timeout-min must be a positive number');
  return out;
}

/** Strip a BOM, take the text before the first line break, trim — the same normalization
 * accept's own VERDICT_RE reader uses (work-record.mjs:1335), so a CRLF or BOM report still
 * validates (B1). */
export function normalizeFirstLine(text) {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const firstLine = t.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.trim();
}

/** B1: the captured hex, lowercased, must be a PREFIX of fullsha, lowercased. */
export function validateVerdict(firstLine, fullsha) {
  const m = VERDICT_RE.exec(firstLine);
  if (!m) return null;
  const sha = m[2].toLowerCase();
  if (!fullsha.toLowerCase().startsWith(sha)) return null;
  return { verdict: m[1], sha };
}

/** S1 step 3 frontmatter parser for agents/reviewer.md — a small controlled format, not general
 * YAML. Returns the role's fields plus its raw bytes (for the byte-exact sha256, M7) and the body
 * text after the closing `---` (byte-exact prompt text, M3). */
export function parseRoleFile(rawBuffer) {
  const raw = rawBuffer.toString('utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('role file has no frontmatter');
  const [, frontmatter, body] = m;
  const fields = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const fm = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (fm) fields[fm[1]] = fm[2].trim();
  }
  const tools = (fields.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    name: fields.name ?? null,
    description: fields.description ?? null,
    model: fields.model ?? null,
    effort: fields.effort ?? null,
    tools,
    omitClaudeMd: fields.omitClaudeMd === 'true',
    body,
    raw,
    sha256: sha256Hex(rawBuffer),
  };
}

export function sha256Hex(bufferOrString) {
  return createHash('sha256').update(bufferOrString).digest('hex');
}

/** M3: the JSON the child's --agents flag receives. Named review-run-reviewer (never "reviewer")
 * so no user or plugin agent config of that name can shadow it. */
export function buildAgentsJson(role) {
  return {
    'review-run-reviewer': {
      description: role.description,
      prompt: role.body,
      tools: role.tools,
      model: role.model,
      effort: role.effort,
      omitClaudeMd: role.omitClaudeMd,
    },
  };
}

/**
 * S2/B2/M1/M3: the pinned `claude -p` argv (P1, P2a, P2b, P4, P5, P6, P7 on d7625e0 and its
 * decoys — see docs/specs/review-run-53/build.md's probe table for the pass/fail evidence this
 * shape is pinned against).
 */
export function buildArgv({ model, effort, tools, sessionId, agentsPath, permissionMode }) {
  const toolList = tools.join(',');
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-hook-events',
    '--setting-sources', 'user', '--strict-mcp-config',
    '--model', model, '--effort', effort ?? 'high',
    '--session-id', sessionId,
    // M1's ruling: "auto first, and dontAsk only by probe, with a reason." Probe P7 supplied
    // the reason — under `auto` + `--permission-prompts none`, a Write to an absolute path
    // outside the reviewed worktree was ALLOWED (a real file landed on disk outside wtDir),
    // even though the git push/git config Bash escapes in the same run were correctly denied
    // by --disallowedTools. `dontAsk` is the escalation this ruling names for exactly this case.
    '--permission-mode', permissionMode ?? 'dontAsk', '--permission-prompts', 'none',
    '--tools', toolList,
    '--allowedTools', toolList,
    '--disallowedTools', DISALLOWED_TOOLS.join(','),
    '--agents', agentsPath,
    '--agent', 'review-run-reviewer',
  ];
}

/** M2: the caller's env minus the denylist, plus the review-run markers. Never `-n`/`--name` on
 * the argv (M2), and the session is never named through the environment either. */
export function buildChildEnv(callerEnv, { runDir }) {
  const out = {};
  for (const [key, value] of Object.entries(callerEnv)) {
    if (ENV_DENYLIST_EXACT.has(key)) continue;
    if (ENV_DENYLIST_PREFIX.some((p) => key.startsWith(p))) continue;
    if (ENV_DENYLIST_PATTERN.some((r) => r.test(key))) continue;
    out[key] = value;
  }
  out[RECURSION_ENV_VAR] = '1';
  out.AGENTS_HOME = path.join(runDir, 'agents-home');
  // m2: distill-session.sh's SessionEnd capture is honored, redirected into scratch.
  out.KNOWLEDGE_DIR = path.join(runDir, 'knowledge');
  return out;
}

function stripGitLocatingEnv(env) {
  const copy = { ...env };
  for (const key of Object.keys(copy)) if (REPO_LOCATING_GIT_ENV.includes(key)) delete copy[key];
  return copy;
}

/** Default git shell-out. Tests inject their own `gitRunner` through deps. */
function defaultGitRunner(args, cwd) {
  return execFileSync('git', args, {
    cwd, env: stripGitLocatingEnv(process.env), encoding: 'utf8', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** M4: --report must be absolute, its directory must exist, and it and its sidecar must not
 * already exist, and it must sit outside --scratch (which covers the run dir the clone lives
 * under too — a stronger, simpler check than "outside the worktree" alone). */
export function validateReportPath(reportPath, scratchDir, fsImpl = fs) {
  if (!path.isAbsolute(reportPath)) usageError('--report must be absolute');
  const dir = path.dirname(reportPath);
  if (!fsImpl.existsSync(dir)) usageError(`--report's directory does not exist: ${dir}`);
  const resolvedReport = path.resolve(reportPath);
  const resolvedScratch = path.resolve(scratchDir);
  if (resolvedReport === resolvedScratch || resolvedReport.startsWith(resolvedScratch + path.sep)) {
    usageError('--report must be outside --scratch');
  }
  if (fsImpl.existsSync(reportPath)) throw new ExitSignal(EXIT.USAGE, 'report path exists; pick a new one');
  if (fsImpl.existsSync(`${reportPath}.identity.json`)) {
    throw new ExitSignal(EXIT.USAGE, 'identity sidecar already exists; pick a new report path');
  }
}

function isProcessAlive(pid, fsImpl = fs) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** M5: before a new run starts, remove the clone of any prior run whose owner pid is dead and
 * whose startedAt is older than the timeout. Only ever removes a `wt/` under a `review-run-*`
 * dir this script itself created. */
export function sweepStaleRuns(scratchDir, timeoutMin, fsImpl = fs, isAliveFn = isProcessAlive) {
  let entries;
  try { entries = fsImpl.readdirSync(scratchDir); } catch { return; }
  const cutoffMs = timeoutMin * 60 * 1000;
  for (const entry of entries) {
    if (!/^review-run-[0-9a-f]{7}-[a-z0-9]+$/.test(entry)) continue;
    const runDir = path.join(scratchDir, entry);
    const ownerPath = path.join(runDir, 'owner.json');
    let owner;
    try { owner = JSON.parse(fsImpl.readFileSync(ownerPath, 'utf8')); } catch { continue; }
    if (!owner || typeof owner.pid !== 'number' || typeof owner.startedAt !== 'string') continue;
    if (isAliveFn(owner.pid, fsImpl)) continue;
    const age = Date.now() - Date.parse(owner.startedAt);
    if (!(age > cutoffMs)) continue;
    removeDirWithRetry(path.join(runDir, 'wt'), fsImpl);
  }
}

function removeDirWithRetry(dir, fsImpl = fs, attempts = 3, delayMs = 2000) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      fsImpl.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch {
      if (i === attempts - 1) return false;
      const until = Date.now() + delayMs;
      while (Date.now() < until) { /* synchronous backoff — this path only runs on cleanup failure */ }
    }
  }
  return false;
}

/** M7: plugin root order — --plugin-root, then the installed user (else matching project) entry,
 * then walk-up from this script's own realpath. Never scans the plugin cache directory itself. */
export function resolvePluginRoot({
  pluginRootFlag, repoTop, home, claudeConfigDir, fsImpl = fs, scriptDir = HERE,
}) {
  if (pluginRootFlag) return { root: path.resolve(pluginRootFlag), roleSource: 'flag' };

  const configDir = claudeConfigDir || path.join(home, '.claude');
  const installedPath = path.join(configDir, 'plugins', 'installed_plugins.json');
  try {
    const data = JSON.parse(fsImpl.readFileSync(installedPath, 'utf8'));
    const entries = data?.plugins?.['delegation@benzhuk'] ?? [];
    const userEntries = entries.filter((e) => e.scope === 'user');
    const candidates = userEntries.length > 0
      ? userEntries
      : entries.filter((e) => e.scope === 'project' && e.projectPath
        && path.resolve(e.projectPath).toLowerCase() === path.resolve(repoTop ?? '').toLowerCase());
    if (candidates.length > 1) {
      hostError(`ambiguous installed plugin entries: ${candidates.map((c) => c.installPath).join(', ')}`);
    }
    if (candidates.length === 1) return { root: candidates[0].installPath, roleSource: 'installed' };
  } catch (err) {
    if (err instanceof ExitSignal) throw err;
    // fall through to walk-up: no readable installed_plugins.json is not itself a HOST error.
  }

  let dir = scriptDir;
  for (let i = 0; i < 25; i += 1) {
    if (fsImpl.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) {
      return { root: dir, roleSource: 'walk-up' };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The core run — async, all side effects behind injectable deps for tests.
// ─────────────────────────────────────────────────────────────────────────────

export async function runReviewRun(argv, deps = {}) {
  const fsImpl = deps.fsImpl ?? fs;
  const spawnImpl = deps.spawn ?? spawn;
  const env = deps.env ?? process.env;
  const home = deps.home ?? os.homedir();
  const gitRunner = deps.gitRunner ?? ((args, cwd) => defaultGitRunner(args, cwd));
  const nowFn = deps.now ?? (() => new Date());
  const isAliveFn = deps.isAliveFn ?? isProcessAlive;
  const signal = deps.signal;

  let options;
  let runDir = null;
  let wtDir = null;
  const startedAt = nowFn();
  const sessionId = deps.sessionId ?? randomUUID();

  try {
    options = parseArgs(argv);

    // Step 1 (kill switch) and step 2 (recursion) run before ANY side effect — no exceptions.
    const agentsHomeBase = env.AGENTS_HOME || path.join(home, '.agents');
    if (fsImpl.existsSync(path.join(agentsHomeBase, 'no-review-run'))) {
      process.stderr.write('review-run is switched off (no-review-run); ask a Claude lead to run the reviewer\n');
      return { exitCode: EXIT.KILL_SWITCH, output: null };
    }
    if (env[RECURSION_ENV_VAR] === '1') {
      process.stderr.write('review-run refuses to run inside a review-run child\n');
      return { exitCode: EXIT.RECURSION, output: null };
    }

    // M4: report path validated before any side effect (worktree/clone add, step 5).
    validateReportPath(options.report, options.scratch, fsImpl);

    const repoTop = options.repo
      ? path.resolve(options.repo)
      : String(gitRunner(['rev-parse', '--show-toplevel'], process.cwd())).trim();

    let fullsha;
    try {
      fullsha = String(gitRunner(['rev-parse', '--verify', `${options.sha}^{commit}`], repoTop)).trim();
    } catch {
      usageError(`--sha does not resolve to a commit in ${repoTop}: ${options.sha}`);
    }

    const pluginRootResult = resolvePluginRoot({
      pluginRootFlag: options.pluginRoot, repoTop, home, claudeConfigDir: env.CLAUDE_CONFIG_DIR, fsImpl,
    });
    if (!pluginRootResult) hostError('no plugin root found (no --plugin-root, no installed entry, no walk-up match)');
    const { root: pluginRoot, roleSource } = pluginRootResult;

    // M7: a root inside the reviewed repo's own worktree set is refused, unless given explicitly.
    if (roleSource !== 'flag') {
      try {
        const rootCommon = String(gitRunner(['-C', pluginRoot, 'rev-parse', '--git-common-dir'], pluginRoot)).trim();
        const repoCommon = String(gitRunner(['-C', repoTop, 'rev-parse', '--git-common-dir'], repoTop)).trim();
        if (path.resolve(pluginRoot, rootCommon) === path.resolve(repoTop, repoCommon)) {
          hostError('resolved plugin root is inside the reviewed repo\'s own worktree set');
        }
      } catch (err) {
        if (err instanceof ExitSignal) throw err;
        // neither side is a git repo (e.g. a bare fixture) — not this check's problem.
      }
    }

    const roleFilePath = path.join(pluginRoot, 'agents', 'reviewer.md');
    let roleBuffer;
    try { roleBuffer = fsImpl.readFileSync(roleFilePath); } catch { hostError(`no role file at ${roleFilePath}`); }
    const role = parseRoleFile(roleBuffer);
    if (!role.model || role.tools.length === 0) hostError(`role file at ${roleFilePath} is missing model/tools`);

    let claudeBinResolved = options.claudeBin;
    if (path.isAbsolute(claudeBinResolved) && !fsImpl.existsSync(claudeBinResolved)) {
      hostError(`no claude at ${claudeBinResolved}`);
    }
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(claudeBinResolved)) {
      hostError('claude.cmd shim unsupported; install the native claude.exe');
    }

    // M5: sweep stale runs from prior crashes before creating this one.
    try { fsImpl.mkdirSync(options.scratch, { recursive: true }); } catch { /* best effort */ }
    sweepStaleRuns(options.scratch, options.timeoutMin, fsImpl, isAliveFn);

    const sha7 = fullsha.slice(0, 7);
    const runId = `review-run-${sha7}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    runDir = path.join(options.scratch, runId);
    wtDir = path.join(runDir, 'wt');
    fsImpl.mkdirSync(runDir, { recursive: true });
    fsImpl.writeFileSync(path.join(runDir, 'owner.json'), JSON.stringify({
      pid: process.pid, startedAt: startedAt.toISOString(),
    }));

    // M1 preferred isolation: a shared clone with its origin removed, never `worktree add` —
    // cleanup is then "remove one directory", and the reviewed tree never shares refs/config/hooks
    // with the repo being reviewed from.
    gitRunner(['clone', '--shared', '--no-checkout', '--quiet', repoTop, wtDir], repoTop);
    gitRunner(['-C', wtDir, 'remote', 'remove', 'origin'], wtDir);
    gitRunner(['-C', wtDir, 'checkout', '--quiet', '--detach', fullsha], wtDir);

    const agentsJson = buildAgentsJson(role);
    const agentsPath = path.join(runDir, 'agents.json');
    fsImpl.writeFileSync(agentsPath, JSON.stringify(agentsJson));

    const argvForChild = buildArgv({
      model: options.model, effort: role.effort, tools: role.tools, sessionId, agentsPath,
    });
    const childEnv = buildChildEnv(env, { runDir });

    let brief;
    try { brief = fsImpl.readFileSync(options.brief, 'utf8'); } catch { usageError(`cannot read --brief: ${options.brief}`); }
    const prompt = `${brief}\n\nWrite your report to ${options.report}. Its first line must be exactly `
      + `"VERDICT: APPROVE ${fullsha}" or "VERDICT: NEEDS_FIXES (<n>) ${fullsha}", where <n> is your `
      + 'finding count.\n';

    const result = await runChild({
      claudeBin: claudeBinResolved, argv: argvForChild, cwd: wtDir, env: childEnv, prompt,
      timeoutMin: options.timeoutMin, spawnImpl, runDir, fsImpl, signal,
    });

    let exitCode;
    let verdict = null;
    let identity = {
      sha: fullsha, verdict: null, exit: null, session: sessionId, model: options.model,
      role: { path: roleFilePath, sha256: role.sha256 }, pluginVersion: readPluginVersion(pluginRoot, fsImpl),
      claudeVersion: result.claudeVersion ?? null, host: os.hostname(),
      startedAt: startedAt.toISOString(), endedAt: nowFn().toISOString(),
      roleSource, pluginRoot,
      transcriptGlob: '<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<mangled run wt path>/<session>.jsonl',
      usage: result.usage ?? null, modelUsage: result.modelUsage ?? null,
      totalCostUsd: result.totalCostUsd ?? null, numTurns: result.numTurns ?? null,
      durationMs: result.durationMs ?? null, permissionDenials: result.permissionDenials ?? 0,
      cleanup: null, replyFallback: false,
      // lane 53 diagnostics fix (found by probe P3's Call #5): a spawn failure or an
      // early, no-stdout child exit both used to collapse into EXIT.BAD_REPORT with nothing
      // to tell them apart from "the reviewer ran fine and just didn't write a report". These
      // three fields, plus runDir/stderr.txt, are what a human reads instead of a 9th `claude -p`
      // call.
      childExitCode: result.childExitCode ?? null, childSignal: result.childSignal ?? null,
      stderrCaptured: Boolean(result.stderrTail && result.stderrTail.length > 0),
    };

    if (result.timedOut) {
      exitCode = EXIT.TIMEOUT;
    } else if (result.spawnError) {
      exitCode = EXIT.HOST;
      process.stderr.write(
        `review-run: failed to start ${claudeBinResolved}: ${result.spawnErrorMessage ?? 'unknown spawn error'}\n`,
      );
    } else if (!fsImpl.existsSync(options.report)) {
      exitCode = EXIT.BAD_REPORT;
      if (result.finalResultText) {
        fsImpl.writeFileSync(path.join(runDir, 'reply.txt'), result.finalResultText);
        identity.replyFallback = true;
      }
    } else {
      const raw = fsImpl.readFileSync(options.report, 'utf8');
      const firstLine = normalizeFirstLine(raw);
      const verdictMatch = validateVerdict(firstLine, fullsha);
      if (!verdictMatch) {
        exitCode = EXIT.BAD_REPORT;
      } else {
        exitCode = EXIT.OK;
        verdict = verdictMatch.verdict;
      }
    }

    identity.exit = exitCode;
    identity.verdict = verdict;
    identity.endedAt = nowFn().toISOString();

    const cleanupOk = removeDirWithRetry(wtDir, fsImpl);
    identity.cleanup = cleanupOk ? 'ok' : 'failed';

    const identityPath = `${options.report}.identity.json`;
    fsImpl.writeFileSync(identityPath, JSON.stringify(identity, null, 2));

    const output = { exit: exitCode, report: options.report, identity: identityPath, verdict, sha: fullsha, session: sessionId };
    return { exitCode, output };
  } catch (err) {
    if (runDir && wtDir) removeDirWithRetry(wtDir, fsImpl);
    if (err instanceof ExitSignal) {
      process.stderr.write(`${err.message}\n`);
      return { exitCode: err.exitCode, output: null };
    }
    process.stderr.write(`review-run internal error: ${err?.stack ?? err}\n`);
    return { exitCode: EXIT.INTERNAL, output: null };
  }
}

function readPluginVersion(pluginRoot, fsImpl) {
  try {
    const raw = JSON.parse(fsImpl.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    return typeof raw.version === 'string' ? raw.version : null;
  } catch { return null; }
}

/** Spawn the child, feed it the prompt on stdin, collect the stream-json result telemetry, and
 * enforce the timeout by killing the whole process tree (M5). */
function runChild({ claudeBin, argv, cwd, env, prompt, timeoutMin, spawnImpl, runDir, fsImpl, signal }) {
  return new Promise((resolve) => {
    const child = spawnImpl(claudeBin, argv, {
      cwd, env, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let settled = false;
    let stdoutBuf = '';
    let pending = '';
    let usage = null;
    let modelUsage = null;
    let totalCostUsd = null;
    let numTurns = null;
    let durationMs = null;
    let permissionDenials = 0;
    let finalResultText = null;
    let claudeVersion = null;

    child.stdout?.on('data', (chunk) => {
      stdoutBuf += chunk;
      pending += chunk;
      for (;;) {
        const at = pending.indexOf('\n');
        if (at < 0) break;
        const line = pending.slice(0, at);
        pending = pending.slice(at + 1);
        try {
          const row = JSON.parse(line);
          // lane 53: the live CLI's init event names this field claude_code_version, not
          // claude_version — found in probe evidence (identity.json's claudeVersion was always
          // null across every real P1/P2a/P2b/P6/P7 run). claude_version is kept as a fallback
          // in case an older CLI build used that name.
          if (row.type === 'system' && row.subtype === 'init') {
            claudeVersion = row.claude_code_version ?? row.claude_version ?? claudeVersion;
          }
          if (Array.isArray(row.permission_denials)) permissionDenials += row.permission_denials.length;
          if (row.type === 'result') {
            usage = row.usage ?? usage;
            modelUsage = row.modelUsage ?? modelUsage;
            totalCostUsd = row.total_cost_usd ?? totalCostUsd;
            numTurns = row.num_turns ?? numTurns;
            durationMs = row.duration_ms ?? durationMs;
            if (typeof row.result === 'string') finalResultText = row.result;
          }
        } catch { /* not every stdout line is JSON we care about */ }
      }
    });
    // lane 53 diagnostics fix: a swallowed stderr made every early child failure (bad flag,
    // ENOENT on claudeBin, a host rejecting a flag) indistinguishable from "the reviewer just
    // didn't write a report" — both surfaced as EXIT.BAD_REPORT with zero information (found via
    // probe P3's own Call #5: exit 2, an empty stream.jsonl, ~0.3s). Kept to a tail so a runaway
    // child can't grow this unbounded; written to runDir/stderr.txt for a human to read, never to
    // this script's own stdout/stderr (that would be printing the child's output, which the
    // no-transcript-content rule this script itself exists under also binds its own diagnostics to).
    let stderrBuf = '';
    child.stderr?.on('data', (chunk) => {
      stderrBuf += chunk;
      if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
    });

    try { fsImpl.mkdirSync(runDir, { recursive: true }); } catch { /* already exists */ }
    child.stdin?.write(prompt, () => { try { child.stdin.end(); } catch { /* already closed */ } });

    let timedOut = false;
    async function killTree() {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* already gone */ }
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
      }
    }

    const timer = setTimeout(async () => {
      if (settled) return;
      timedOut = true;
      await killTree();
    }, Math.max(0.001, timeoutMin) * 60 * 1000);
    timer.unref?.();

    // M5: SIGINT/SIGTERM/SIGHUP to review-run itself kills the child tree the same way a
    // timeout does, and is reported as EXIT.TIMEOUT (3) — "review-run was cut off" either way.
    const onAbort = () => {
      if (settled) return;
      timedOut = true;
      killTree();
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });

    function cleanupListeners() {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
    }

    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      try { fsImpl.writeFileSync(path.join(runDir, 'stream.jsonl'), stdoutBuf); } catch { /* best effort */ }
      try { fsImpl.writeFileSync(path.join(runDir, 'stderr.txt'), stderrBuf); } catch { /* best effort */ }
      resolve({
        timedOut: false, usage, modelUsage, totalCostUsd, numTurns, durationMs, permissionDenials,
        finalResultText, claudeVersion, spawnError: true, spawnErrorMessage: err?.message ?? String(err),
        stderrTail: stderrBuf,
      });
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      try { fsImpl.writeFileSync(path.join(runDir, 'stream.jsonl'), stdoutBuf); } catch { /* best effort */ }
      try { fsImpl.writeFileSync(path.join(runDir, 'stderr.txt'), stderrBuf); } catch { /* best effort */ }
      resolve({
        timedOut, usage, modelUsage, totalCostUsd, numTurns, durationMs, permissionDenials,
        finalResultText, claudeVersion, childExitCode: code, childSignal: signal, stderrTail: stderrBuf,
      });
    });
  });
}

/** Exposed so a caller (or a test) can wire process signals to a running review-run — kept out
 * of runReviewRun() itself so in-process tests never install a real process-wide signal handler. */
export function installSignalHandlers(onSignal) {
  const signals = process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGBREAK'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = signals.map((sig) => {
    const handler = () => onSignal(sig);
    process.on(sig, handler);
    return [sig, handler];
  });
  return () => { for (const [sig, handler] of handlers) process.removeListener(sig, handler); };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI wrapper
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const controller = new AbortController();
  const uninstall = installSignalHandlers((sig) => {
    process.stderr.write(`review-run interrupted by ${sig}\n`);
    controller.abort();
  });
  const { exitCode, output } = await runReviewRun(process.argv.slice(2), { signal: controller.signal });
  uninstall();
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = exitCode;
}

const isMain = (() => {
  try { return import.meta.url === pathToFileURL(process.argv[1] ?? '').href; } catch { return false; }
})();

if (isMain) {
  main();
}
