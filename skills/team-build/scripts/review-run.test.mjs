// review-run — unit tests. Uses a fake `claude` through --claude-bin (a node script driven by
// FAKE_MODE), never a real network call. Every test here must fail without the code it covers
// (S4). The live probes (P1-P7, real `claude -p`) are run separately and reported in
// docs/specs/review-run-53/build.md — they are not part of this gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  EXIT, RECURSION_ENV_VAR, VERDICT_RE, DISALLOWED_TOOLS,
  parseArgs, normalizeFirstLine, validateVerdict, parseRoleFile, sha256Hex,
  buildAgentsJson, buildArgv, buildChildEnv, validateReportPath, resolvePluginRoot,
  stripGitLocatingEnv, sweepStaleRuns, isProcessAlive, runReviewRun,
} from './review-run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'review-run.mjs');
const REPO_TOP = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: HERE, encoding: 'utf8' }).trim();
const FULLSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).trim();

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_FIXTURE = [
  '---',
  'name: reviewer',
  'description: fixture reviewer role for review-run.test.mjs',
  'model: opus',
  'effort: high',
  'tools: Read, Grep, Glob, Write, Bash',
  'omitClaudeMd: true',
  '---',
  '',
  'You are a fixture reviewer role body. Never modify code.',
  '',
].join('\n');

function scratchDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makePluginRoot() {
  const dir = scratchDir('review-run-plugin-');
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.0.0-fixture' }));
  fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'agents', 'reviewer.md'), ROLE_FIXTURE);
  return dir;
}

// A real node script standing in for `claude -p`: reads the whole prompt from stdin, extracts
// the report path and expected sha from it (review-run always embeds both — see the prompt
// template in review-run.mjs), and behaves per FAKE_MODE. Marked executable so spawn() can run
// it directly (shebang), matching how `claude` itself is resolved off PATH.
const FAKE_CLAUDE_SOURCE = `#!/usr/bin/env node
import fs from 'node:fs';
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const reportMatch = /Write your report to (\\S+)\\./.exec(raw);
  const shaMatch = /VERDICT: APPROVE ([0-9a-fA-F]{7,40})"/.exec(raw);
  const reportPath = reportMatch ? reportMatch[1] : null;
  const sha = shaMatch ? shaMatch[1] : 'deadbeef';
  const mode = process.env.FAKE_MODE || 'approve';
  function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }
  function writeReport(text) { if (reportPath) fs.writeFileSync(reportPath, text); }
  emit({ type: 'system', subtype: 'init', claude_code_version: '0.0.0-fake', model: 'fake-opus' });
  if (mode === 'timeout') {
    if (process.env.FAKE_PID_FILE) fs.writeFileSync(process.env.FAKE_PID_FILE, String(process.pid));
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1_000_000);
    return;
  }
  if (mode === 'crash') { process.exit(17); }
  if (mode === 'reply-fallback') {
    emit({ type: 'result', subtype: 'success', result: 'inline fallback text, no report written', permission_denials: [] });
    process.exit(0);
  }
  switch (mode) {
    case 'approve': writeReport('VERDICT: APPROVE ' + sha + '\\nfake approve report\\n'); break;
    case 'needs_fixes': writeReport('VERDICT: NEEDS_FIXES (3) ' + sha + '\\nfake needs-fixes report\\n'); break;
    case 'approve-emdash': writeReport('VERDICT: APPROVE \\u2014 ' + sha + '\\nfake emdash\\n'); break;
    case 'approve-crlf': writeReport('VERDICT: APPROVE ' + sha + '\\r\\nfake crlf\\r\\n'); break;
    case 'approve-bom': writeReport('\\uFEFFVERDICT: APPROVE ' + sha + '\\nfake bom\\n'); break;
    case 'malformed': writeReport('NOT A VERDICT LINE AT ALL\\nfake\\n'); break;
    case 'missing': break;
    case 'wrong-sha': writeReport('VERDICT: APPROVE 0000000000000000000000000000000000000000\\nfake wrong sha\\n'); break;
    case 'nosha': writeReport('VERDICT: APPROVE\\nfake no sha\\n'); break;
    default: writeReport('VERDICT: APPROVE ' + sha + '\\nfake default\\n');
  }
  emit({ type: 'result', subtype: 'success', usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0.001, num_turns: 1, duration_ms: 5, permission_denials: [] });
  process.exit(0);
});
`;

function writeFakeClaude(dir) {
  const p = path.join(dir, 'fake-claude.mjs');
  fs.writeFileSync(p, FAKE_CLAUDE_SOURCE, { mode: 0o755 });
  return p;
}

/** Runs review-run.mjs's core in-process (no CLI subprocess), against the real local repo (this
 * worktree) as the source to clone — read-only (`clone --shared --no-checkout`), never a commit,
 * never a git identity of any kind. Returns {exitCode, output, runDirGuess}. */
async function run({
  mode = 'approve', sha = FULLSHA, extraEnv = {}, reportExists = false, timeoutMin = 5,
  pluginRoot: givenPluginRoot, home, spawnSpy, sessionId, claudeBin: givenClaudeBin,
} = {}) {
  const scratch = scratchDir('review-run-scratch-');
  const outDir = scratchDir('review-run-out-');
  const claudeBin = givenClaudeBin ?? writeFakeClaude(scratchDir('review-run-claude-'));
  const pluginRoot = givenPluginRoot ?? makePluginRoot();
  const briefPath = path.join(scratchDir('review-run-brief-'), 'brief.md');
  fs.writeFileSync(briefPath, 'Review the fixture diff for one obvious defect.\n');
  const reportPath = path.join(outDir, 'report.md');
  if (reportExists) fs.writeFileSync(reportPath, 'VERDICT: APPROVE deadbeef\npre-existing\n');

  const argv = [
    '--sha', sha, '--brief', briefPath, '--report', reportPath, '--repo', REPO_TOP,
    '--scratch', scratch, '--claude-bin', claudeBin, '--plugin-root', pluginRoot,
    '--timeout-min', String(timeoutMin),
  ];
  const resolvedHome = home ?? scratchDir('review-run-home-');
  const env = { HOME: resolvedHome, PATH: process.env.PATH, FAKE_MODE: mode, ...extraEnv };
  const deps = { env, home: resolvedHome };
  if (spawnSpy) deps.spawn = spawnSpy;
  const result = await runReviewRun(argv, deps);
  return { ...result, scratch, outDir, reportPath, pluginRoot };
}

// ─────────────────────────────────────────────────────────────────────────────
// S4 required tests
// ─────────────────────────────────────────────────────────────────────────────

test('a malformed first line exits 2', async () => {
  const { exitCode } = await run({ mode: 'malformed' });
  assert.equal(exitCode, EXIT.BAD_REPORT);
});

test('lane 53 diagnostics fix (found by probe P3): a child that fails to spawn exits 4 (HOST), not 2 (BAD_REPORT), and its stderr is captured to runDir/stderr.txt', async () => {
  // A file that exists (passes the earlier --claude-bin existsSync check) but has no execute
  // permission: spawn() itself then fails at the exec syscall (EACCES), which is exactly the
  // 'error' event path this test covers — indistinguishable, before this fix, from a reviewer
  // that ran fine and simply wrote nothing.
  const dir = scratchDir('review-run-badclaude-');
  const badClaudeBin = path.join(dir, 'not-executable.mjs');
  fs.writeFileSync(badClaudeBin, '#!/usr/bin/env node\nprocess.exit(0);\n', { mode: 0o644 });
  const { exitCode, scratch } = await run({ claudeBin: badClaudeBin });
  assert.equal(exitCode, EXIT.HOST, 'a spawn failure must be reported as EXIT.HOST, not EXIT.BAD_REPORT');
  const runDirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
  assert.equal(runDirs.length, 1);
  assert.ok(fs.existsSync(path.join(scratch, runDirs[0], 'stderr.txt')), 'stderr.txt must exist even on a spawn failure');
});

test('a missing report exits 2, and (m8) the inline reply is saved to reply.txt, never to --report', async () => {
  const { exitCode, scratch } = await run({ mode: 'reply-fallback' });
  assert.equal(exitCode, EXIT.BAD_REPORT);
  const runDirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
  assert.equal(runDirs.length, 1);
  const reply = fs.readFileSync(path.join(scratch, runDirs[0], 'reply.txt'), 'utf8');
  assert.match(reply, /inline fallback text/);
});

test('a report for a different sha exits 2', async () => {
  const { exitCode } = await run({ mode: 'wrong-sha' });
  assert.equal(exitCode, EXIT.BAD_REPORT);
});

test("a timeout exits 3, and the fake's process is gone (process-tree kill, M5)", async () => {
  const pidFile = path.join(scratchDir('review-run-pid-'), 'pid');
  const { exitCode } = await run({ mode: 'timeout', timeoutMin: 0.01, extraEnv: { FAKE_PID_FILE: pidFile } });
  assert.equal(exitCode, EXIT.TIMEOUT);
  await new Promise((r) => setTimeout(r, 200)); // let SIGKILL actually land
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  assert.equal(alive, false, "the fake claude's process must be gone after the timeout kill");
});

test('the kill switch exits 5, and the fake is never started', async () => {
  const home = scratchDir('review-run-home-killswitch-');
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-review-run'), '');
  let spawned = false;
  const spawnSpy = (...args) => { spawned = true; return spawn(...args); };
  const { exitCode } = await run({ home, spawnSpy });
  assert.equal(exitCode, EXIT.KILL_SWITCH);
  assert.equal(spawned, false, 'the kill switch must short-circuit before any spawn');
});

test('the recursion marker exits 6, and the fake is never started', async () => {
  let spawned = false;
  const spawnSpy = (...args) => { spawned = true; return spawn(...args); };
  const { exitCode } = await run({ extraEnv: { [RECURSION_ENV_VAR]: '1' }, spawnSpy });
  assert.equal(exitCode, EXIT.RECURSION);
  assert.equal(spawned, false, 'recursion refusal must short-circuit before any spawn');
});

test('APPROVE passes through with exit 0; the verdict is in the stdout-shaped output and the sidecar', async () => {
  const { exitCode, output, reportPath } = await run({ mode: 'approve' });
  assert.equal(exitCode, EXIT.OK);
  assert.equal(output.verdict, 'APPROVE');
  assert.equal(output.sha, FULLSHA);
  const identity = JSON.parse(fs.readFileSync(`${reportPath}.identity.json`, 'utf8'));
  assert.equal(identity.verdict, 'APPROVE');
  assert.equal(identity.exit, 0);
  assert.equal(identity.sha, FULLSHA);
  assert.equal(identity.claudeVersion, '0.0.0-fake', 'the init event field is claude_code_version, not claude_version (found via probe evidence)');
});

test('NEEDS_FIXES (n) also passes through with exit 0 (B1: the reviewer role\'s own contract, not the packet\'s stricter regex)', async () => {
  const { exitCode, output, reportPath } = await run({ mode: 'needs_fixes' });
  assert.equal(exitCode, EXIT.OK);
  assert.equal(output.verdict, 'NEEDS_FIXES');
  const identity = JSON.parse(fs.readFileSync(`${reportPath}.identity.json`, 'utf8'));
  assert.equal(identity.verdict, 'NEEDS_FIXES');
});

test('B1: APPROVE with an em dash, a CRLF report, and a BOM report all pass with exit 0', async () => {
  for (const mode of ['approve-emdash', 'approve-crlf', 'approve-bom']) {
    const { exitCode, output } = await run({ mode });
    assert.equal(exitCode, EXIT.OK, `mode ${mode}`);
    assert.equal(output.verdict, 'APPROVE', `mode ${mode}`);
  }
});

test('B1: APPROVE with no sha exits 2', async () => {
  const { exitCode } = await run({ mode: 'nosha' });
  assert.equal(exitCode, EXIT.BAD_REPORT);
});

test('the run\'s clone directory (wt/) is removed on every path — approve, malformed, missing, timeout, kill switch never even creates one', async () => {
  for (const mode of ['approve', 'malformed', 'missing', 'wrong-sha']) {
    const { scratch } = await run({ mode });
    const runDirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
    assert.equal(runDirs.length, 1, `mode ${mode}`);
    assert.equal(fs.existsSync(path.join(scratch, runDirs[0], 'wt')), false, `mode ${mode}: wt/ must be gone`);
  }
});

test("the child's environment carries DELEGATION_REVIEW_RUN=1 and a scratch AGENTS_HOME, and never NOTE_SLUG/ORCA_*/the messaging socket, even when the caller's env sets them all", async () => {
  let capturedEnv = null;
  let capturedArgv = null;
  const spawnSpy = (cmd, argv, opts) => { capturedEnv = opts.env; capturedArgv = argv; return spawn(cmd, argv, opts); };
  const { exitCode } = await run({
    mode: 'approve',
    spawnSpy,
    extraEnv: {
      NOTE_SLUG: 'should-never-reach-the-child',
      ORCA_TERMINAL_HANDLE: 'term_should_not_leak',
      ORCA_ANYTHING_ELSE: 'also-stripped',
      CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/should-not-leak.sock',
      CLAUDE_CODE_MESSAGING_TOKEN: 'super-secret-should-not-leak',
      GIT_DIR: '/should/not/leak',
      CODEX_HOME: '/should/not/leak',
    },
  });
  assert.equal(exitCode, EXIT.OK);
  assert.ok(capturedEnv, 'spawn must have been called');
  assert.equal(capturedEnv[RECURSION_ENV_VAR], '1');
  assert.ok(capturedEnv.AGENTS_HOME, 'a scratch AGENTS_HOME must be set');
  assert.ok(capturedEnv.HOME, 'HOME must still be present');
  assert.ok(capturedEnv.PATH, 'PATH must still be present');
  for (const leaked of [
    'NOTE_SLUG', 'ORCA_TERMINAL_HANDLE', 'ORCA_ANYTHING_ELSE',
    'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'GIT_DIR', 'CODEX_HOME',
  ]) {
    assert.equal(capturedEnv[leaked], undefined, `${leaked} must never reach the child`);
  }
  assert.ok(!capturedArgv.includes('-n'), 'argv must never carry -n');
  assert.ok(!capturedArgv.includes('--name'), 'argv must never carry --name');
});

test('the role passed to the child is byte-derived from the resolved reviewer.md: its sha256 is in the sidecar', async () => {
  const pluginRoot = makePluginRoot();
  const roleBytes = fs.readFileSync(path.join(pluginRoot, 'agents', 'reviewer.md'));
  const expected = sha256Hex(roleBytes);
  const { reportPath } = await run({ mode: 'approve', pluginRoot });
  const identity = JSON.parse(fs.readFileSync(`${reportPath}.identity.json`, 'utf8'));
  assert.equal(identity.role.sha256, expected);
  assert.equal(identity.role.path, path.join(pluginRoot, 'agents', 'reviewer.md'));
});

// ─────────────────────────────────────────────────────────────────────────────
// M4: report path hygiene
// ─────────────────────────────────────────────────────────────────────────────

test('M4: an existing report path exits 1, and the fake is never started', async () => {
  let spawned = false;
  const spawnSpy = (...args) => { spawned = true; return spawn(...args); };
  const { exitCode } = await run({ reportExists: true, spawnSpy });
  assert.equal(exitCode, EXIT.USAGE);
  assert.equal(spawned, false);
});

test('M4: --report must be absolute and its directory must exist', () => {
  const scratch = scratchDir('review-run-scratch-');
  assert.throws(() => validateReportPath('relative/report.md', scratch));
  assert.throws(() => validateReportPath(path.join(scratch, 'nope', 'report.md'), scratch));
});

test('M4: --report inside --scratch is refused', () => {
  const scratch = scratchDir('review-run-scratch-');
  assert.throws(() => validateReportPath(path.join(scratch, 'report.md'), scratch));
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding 4: a relative --scratch must never leak a clone into the caller's cwd
// (measured: it resolved against repoTop once and the run's own cwd a second time).
// ─────────────────────────────────────────────────────────────────────────────

test('finding 4: a relative --scratch is resolved against the CLI process cwd, not left relative (so repoTop/wtDir never re-resolve it twice)', () => {
  const scratchParent = scratchDir('review-run-relscratch-parent-');
  const savedCwd = process.cwd();
  process.chdir(scratchParent);
  try {
    const parsed = parseArgs([
      '--sha', FULLSHA, '--brief', 'b.md', '--report', '/abs/report.md', '--scratch', 'relscratch',
    ]);
    assert.equal(parsed.scratch, path.join(scratchParent, 'relscratch'), '--scratch must be resolved to an absolute path at parse time');
  } finally {
    process.chdir(savedCwd);
  }
});

test('finding 4: a run given a relative --scratch never writes anything into the reviewed repo (git status stays clean), and still succeeds', async () => {
  const scratchParent = scratchDir('review-run-relscratch-run-');
  const workDir = path.join(scratchParent, 'work');
  fs.mkdirSync(workDir, { recursive: true });
  const outDir = scratchDir('review-run-relscratch-out-');
  const claudeBin = writeFakeClaude(scratchDir('review-run-relscratch-claude-'));
  const pluginRoot = makePluginRoot();
  const briefPath = path.join(scratchDir('review-run-relscratch-brief-'), 'brief.md');
  fs.writeFileSync(briefPath, 'Review the fixture diff.\n');
  const reportPath = path.join(outDir, 'report.md');
  const home = scratchDir('review-run-relscratch-home-');

  const before = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_TOP, encoding: 'utf8' });
  const savedCwd = process.cwd();
  process.chdir(workDir);
  let exitCode;
  try {
    ({ exitCode } = await runReviewRun([
      '--sha', FULLSHA, '--brief', briefPath, '--report', reportPath, '--repo', REPO_TOP,
      '--scratch', 'relscratch', '--claude-bin', claudeBin, '--plugin-root', pluginRoot,
      '--timeout-min', '5',
    ], { env: { HOME: home, PATH: process.env.PATH, FAKE_MODE: 'approve' }, home }));
  } finally {
    process.chdir(savedCwd);
  }
  assert.equal(exitCode, EXIT.OK, 'a relative --scratch must not break the run');
  assert.ok(fs.existsSync(path.join(workDir, 'relscratch')), 'the clone must land under the CLI process cwd, once resolved');
  const after = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_TOP, encoding: 'utf8' });
  assert.equal(after, before, 'the reviewed repo must never gain an untracked clone from a relative --scratch');
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding 7: the sweep must not follow a symlinked run dir, and EPERM must count as alive
// ─────────────────────────────────────────────────────────────────────────────

test('finding 7: sweepStaleRuns does not follow a symlinked review-run-* entry into a foreign directory', () => {
  const scratch = scratchDir('review-run-sweep-scratch-');
  const canary = scratchDir('review-run-sweep-canary-');
  fs.mkdirSync(path.join(canary, 'wt'), { recursive: true });
  fs.writeFileSync(path.join(canary, 'wt', 'canary.txt'), 'still here');
  fs.writeFileSync(path.join(canary, 'owner.json'), JSON.stringify({
    pid: 999999, startedAt: new Date(Date.now() - 999_999_999).toISOString(),
  }));
  const linkName = 'review-run-abc1234-deadbeef';
  fs.symlinkSync(canary, path.join(scratch, linkName), 'dir');

  sweepStaleRuns(scratch, 1, fs, () => false);

  assert.ok(fs.existsSync(path.join(canary, 'wt', 'canary.txt')), 'a symlinked review-run-* entry must never have its target\'s wt/ removed');
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding 6: an orphaned detached child (the claude session) must survive a SIGKILL of
// review-run, and a later sweep must reap IT, not just silently reclaim its live wt/.
// ─────────────────────────────────────────────────────────────────────────────

function makeRunDirWithOwner(scratch, owner) {
  const runId = 'review-run-abc1234-' + Math.random().toString(36).slice(2, 10);
  const runDir = path.join(scratch, runId);
  fs.mkdirSync(path.join(runDir, 'wt'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'wt', 'marker.txt'), 'present');
  fs.writeFileSync(path.join(runDir, 'owner.json'), JSON.stringify(owner));
  return runDir;
}

test('finding 6: a live orphaned child still within its own timeout is left alone — its wt/ survives, and it is never killed', () => {
  const scratch = scratchDir('review-run-orphan-scratch-');
  const runDir = makeRunDirWithOwner(scratch, {
    pid: 424242, startedAt: new Date(Date.now() - 1000).toISOString(), childPid: 555555, timeoutMin: 45,
  });
  let killed = null;
  // review-run's own pid (424242) is dead; the child (555555) is alive and young (age ~1s << 45min).
  sweepStaleRuns(scratch, 45, fs, (pid) => pid === 555555, (pid) => { killed = pid; });
  assert.equal(killed, null, 'a young orphan must never be killed');
  assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')), 'a young orphan\'s wt/ must survive');
});

test('finding 6: a live orphaned child PAST its own timeout is killed, then its wt/ is reclaimed', () => {
  const scratch = scratchDir('review-run-orphan-scratch-');
  const runDir = makeRunDirWithOwner(scratch, {
    pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: 555555, timeoutMin: 1,
  });
  let killed = null;
  sweepStaleRuns(scratch, 45, fs, (pid) => pid === 555555, (pid) => { killed = pid; });
  assert.equal(killed, 555555, 'an orphan past its own owner.timeoutMin must be killed');
  assert.equal(fs.existsSync(path.join(runDir, 'wt')), false, 'its wt/ must then be reclaimed');
});

test('finding 6: owner.json is rewritten with the real childPid and timeoutMin right after spawn', async () => {
  const pidFile = path.join(scratchDir('review-run-childpid-'), 'pid');
  const { scratch } = await run({ mode: 'timeout', timeoutMin: 0.05, extraEnv: { FAKE_PID_FILE: pidFile } });
  const runDirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
  assert.equal(runDirs.length, 1);
  // The run only ever removes wt/, never runDir itself, so owner.json must still be readable.
  const ownerPath = path.join(scratch, runDirs[0], 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  const fakePid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  assert.equal(owner.childPid, fakePid, 'owner.json must carry the real spawned child pid');
  assert.equal(owner.timeoutMin, 0.05);
});

test('finding 7: isProcessAlive treats EPERM (a process owned by another user) as alive, not dead', () => {
  // pid 1 (init/systemd) exists but is not signalable by a non-root user: process.kill(1, 0)
  // raises EPERM on every POSIX host this runs on. On win32 this test is skipped: there is no
  // pid-1-equivalent EPERM case to probe the same way.
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  assert.equal(isProcessAlive(1), true, 'EPERM must count as alive, never as dead');
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure unit coverage: argv, env, verdict regex, role parsing, plugin root
// ─────────────────────────────────────────────────────────────────────────────

test('parseArgs: --sha must be 7-40 hex chars', () => {
  assert.throws(() => parseArgs(['--sha', 'zz', '--brief', 'b', '--report', 'r', '--scratch', 's']));
  assert.doesNotThrow(() => parseArgs(['--sha', 'abcdef1', '--brief', 'b', '--report', 'r', '--scratch', 's']));
});

test('parseArgs: every required flag is enforced', () => {
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(['--sha', FULLSHA]));
});

test('finding 13: --timeout-min above 35000 is rejected (Node clamps a bigger setTimeout delay to 1ms, killing the child immediately)', () => {
  assert.throws(() => parseArgs([
    '--sha', FULLSHA, '--brief', 'b', '--report', '/abs/r.md', '--scratch', '/abs/s', '--timeout-min', '35001',
  ]), /at most 35000/);
  assert.doesNotThrow(() => parseArgs([
    '--sha', FULLSHA, '--brief', 'b', '--report', '/abs/r.md', '--scratch', '/abs/s', '--timeout-min', '35000',
  ]));
});

test('buildArgv: carries --effort and --tools always, disallows the M1 list, never -n/--name', () => {
  const argv = buildArgv({
    model: 'opus', effort: 'high', tools: ['Read', 'Bash'], sessionId: 'fixture-session',
    agentsPath: '/tmp/agents.json',
  });
  assert.ok(argv.includes('--effort'));
  assert.ok(argv.includes('high'));
  assert.ok(argv.includes('--tools'));
  assert.ok(argv.includes('Read,Bash'));
  assert.ok(argv.includes('--disallowedTools'));
  assert.ok(argv.includes(DISALLOWED_TOOLS.join(',')));
  assert.ok(argv.includes('--setting-sources'));
  assert.ok(argv.includes('user'));
  assert.ok(argv.includes('--strict-mcp-config'));
  assert.ok(!argv.includes('-n'));
  assert.ok(!argv.includes('--name'));
});

test("buildArgv: permission mode defaults to dontAsk (M1's ruling, escalated by probe P7's Write-tool escape finding)", () => {
  const argv = buildArgv({
    model: 'opus', effort: 'high', tools: ['Read', 'Bash'], sessionId: 'fixture-session',
    agentsPath: '/tmp/agents.json',
  });
  const i = argv.indexOf('--permission-mode');
  assert.ok(i >= 0);
  assert.equal(argv[i + 1], 'dontAsk');
});

test('buildChildEnv: strips the full M2 denylist and adds the two markers', () => {
  const env = buildChildEnv({
    HOME: '/home/fixture', PATH: '/usr/bin', NOTE_SLUG: 'x', ORCA_TERMINAL_HANDLE: 'y',
    CLAUDE_CODE_MESSAGING_SOCKET: 's', CLAUDE_CODE_MESSAGING_TOKEN: 't', CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_PROJECT_DIR: '/p', CLAUDE_PLUGIN_ROOT: '/r',
    TMUX: 'a', TMUX_PANE: 'b', CODEX_HOME: '/c', GIT_DIR: '/g', GIT_WORK_TREE: '/w',
    SOME_SESSION_ID: 'zzz', CLAUDE_CODE_SESSION_FOO: 'zzz',
  }, { runDir: '/tmp/run-dir' });
  assert.equal(env.HOME, '/home/fixture');
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env[RECURSION_ENV_VAR], '1');
  assert.equal(env.AGENTS_HOME, path.join('/tmp/run-dir', 'agents-home'));
  assert.equal(env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, '1', "finding 2: omitClaudeMd applies only to subagents, but under --agent the child IS the main thread; this env var is the only real switch");
  for (const key of [
    'NOTE_SLUG', 'ORCA_TERMINAL_HANDLE', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
    'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'TMUX', 'TMUX_PANE',
    'CODEX_HOME', 'GIT_DIR', 'GIT_WORK_TREE', 'SOME_SESSION_ID', 'CLAUDE_CODE_SESSION_FOO',
  ]) {
    assert.equal(env[key], undefined, key);
  }
});

test('finding 9: buildChildEnv strips every GIT_* variable, not just the six repo-locating names (measured: GIT_CONFIG_PARAMETERS, GIT_AUTHOR_*, GIT_SSH_COMMAND etc reached the child)', () => {
  const env = buildChildEnv({
    HOME: '/home/fixture', PATH: '/usr/bin',
    GIT_CONFIG_PARAMETERS: "'core.hooksPath=/tmp/x'", GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: '/tmp/x',
    GIT_CONFIG_GLOBAL: '/tmp/evil.gitconfig', GIT_CONFIG_SYSTEM: '/tmp/evil-system.gitconfig',
    GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x',
    GIT_NAMESPACE: 'x', GIT_CEILING_DIRECTORIES: '/tmp', GIT_SSH_COMMAND: 'evil', GIT_ASKPASS: 'evil',
    GIT_EXEC_PATH: '/tmp/evil-exec', GIT_TEMPLATE_DIR: '/tmp/evil-template', GIT_QUARANTINE_PATH: '/tmp/q',
  }, { runDir: '/tmp/run-dir' });
  for (const key of Object.keys(env)) {
    assert.ok(!key.startsWith('GIT_'), `${key} must never reach the child`);
  }
  assert.equal(env.HOME, '/home/fixture');
});

test('finding 9: stripGitLocatingEnv (used for every git call the script makes) strips every GIT_* name, not just the six repo-locating ones', () => {
  const stripped = stripGitLocatingEnv({
    HOME: '/home/fixture', PATH: '/usr/bin', GIT_DIR: '/x', GIT_AUTHOR_NAME: 'x',
    GIT_CONFIG_PARAMETERS: "'core.hooksPath=/tmp/x'", GIT_SSH_COMMAND: 'evil',
  });
  for (const key of Object.keys(stripped)) {
    assert.ok(!key.startsWith('GIT_'), `${key} must be stripped from every git call's env`);
  }
  assert.equal(stripped.HOME, '/home/fixture');
});

test('normalizeFirstLine + validateVerdict: B1 table', () => {
  const sha = FULLSHA;
  const cases = [
    [`VERDICT: NEEDS_FIXES (3) ${sha}`, true],
    [`VERDICT: APPROVE — ${sha}`, true],
    [`VERDICT: APPROVE ${sha}\r`, true],
    [`﻿VERDICT: APPROVE ${sha}`, true],
    ['VERDICT: APPROVE', false],
    ['VERDICT: MAYBE ' + sha, false],
  ];
  for (const [line, shouldPass] of cases) {
    const normalized = normalizeFirstLine(line);
    const result = validateVerdict(normalized, sha);
    assert.equal(Boolean(result), shouldPass, JSON.stringify(line));
  }
});

test('parseRoleFile: extracts frontmatter fields, tools list, byte-exact body, and a sha256 of the raw bytes', () => {
  const buf = Buffer.from(ROLE_FIXTURE, 'utf8');
  const role = parseRoleFile(buf);
  assert.equal(role.model, 'opus');
  assert.equal(role.effort, 'high');
  assert.deepEqual(role.tools, ['Read', 'Grep', 'Glob', 'Write', 'Bash']);
  assert.equal(role.omitClaudeMd, true);
  assert.match(role.body, /fixture reviewer role body/);
  assert.equal(role.sha256, sha256Hex(buf));
});

test('buildAgentsJson: carries effort and omitClaudeMd (M3), named review-run-reviewer', () => {
  const role = parseRoleFile(Buffer.from(ROLE_FIXTURE, 'utf8'));
  const json = buildAgentsJson(role);
  assert.ok(json['review-run-reviewer']);
  assert.equal(json['review-run-reviewer'].effort, 'high');
  assert.equal(json['review-run-reviewer'].omitClaudeMd, true);
  assert.deepEqual(json['review-run-reviewer'].tools, ['Read', 'Grep', 'Glob', 'Write', 'Bash']);
});

test('resolvePluginRoot: --plugin-root wins outright (roleSource: flag)', () => {
  const dir = makePluginRoot();
  const result = resolvePluginRoot({ pluginRootFlag: dir, repoTop: REPO_TOP, home: os.homedir(), fsImpl: fs });
  assert.equal(result.roleSource, 'flag');
  assert.equal(path.resolve(result.root), path.resolve(dir));
});

test('resolvePluginRoot: never scans the plugin cache — an installed_plugins.json with only a cache-shaped entry outside scope is ignored, falling through to walk-up', () => {
  const home = scratchDir('review-run-home-installed-');
  fs.mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'delegation@benzhuk': [{ scope: 'project', installPath: '/nope', projectPath: '/somewhere-else' }] } }),
  );
  const result = resolvePluginRoot({ repoTop: '/not-somewhere-else', home, fsImpl: fs, scriptDir: HERE });
  assert.notEqual(result?.roleSource, 'installed');
});

// ─────────────────────────────────────────────────────────────────────────────
// m5: this file's own source must import only node: builtins (the mirror publishes skills/
// wholesale; review-run.mjs must run from the mirrored copy alone).
// ─────────────────────────────────────────────────────────────────────────────

test('m5: review-run.mjs imports only node: builtins', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const specifiers = [...source.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.ok(specifiers.length > 0, 'sanity: the regex must find the real imports');
  for (const spec of specifiers) {
    assert.ok(spec.startsWith('node:'), `import "${spec}" is not a node: builtin`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// M5: SIGTERM to the review-run process itself (real subprocess, not in-process)
// ─────────────────────────────────────────────────────────────────────────────

test('M5: SIGTERM to review-run while the fake is running exits with the timeout code and the clone dir is gone', async () => {
  const scratch = scratchDir('review-run-scratch-sigterm-');
  const outDir = scratchDir('review-run-out-sigterm-');
  const claudeBin = writeFakeClaude(scratchDir('review-run-claude-sigterm-'));
  const pluginRoot = makePluginRoot();
  const briefPath = path.join(scratchDir('review-run-brief-sigterm-'), 'brief.md');
  fs.writeFileSync(briefPath, 'Review the fixture diff.\n');
  const reportPath = path.join(outDir, 'report.md');
  const home = scratchDir('review-run-home-sigterm-');

  const child = spawn(process.execPath, [
    SCRIPT, '--sha', FULLSHA, '--brief', briefPath, '--report', reportPath, '--repo', REPO_TOP,
    '--scratch', scratch, '--claude-bin', claudeBin, '--plugin-root', pluginRoot,
    '--timeout-min', '5',
  ], {
    env: { HOME: home, PATH: process.env.PATH, FAKE_MODE: 'timeout' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  // Give it time to get past cloning and into the child spawn, then interrupt the whole thing.
  await new Promise((resolveWait) => {
    const check = setInterval(() => {
      const dirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
      if (dirs.length > 0 && fs.existsSync(path.join(scratch, dirs[0], 'wt'))) {
        clearInterval(check);
        resolveWait();
      }
    }, 50);
  });
  child.kill('SIGTERM');

  const exitCode = await new Promise((resolveExit) => { child.once('exit', (code) => resolveExit(code)); });
  assert.equal(exitCode, EXIT.TIMEOUT);
  const dirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
  assert.equal(dirs.length, 1);
  assert.equal(fs.existsSync(path.join(scratch, dirs[0], 'wt')), false, 'wt/ must be cleaned up on SIGTERM too');
});
