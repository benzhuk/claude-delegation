// review-run — unit tests. Uses a fake `claude` through --claude-bin (a node script driven by
// FAKE_MODE), never a real network call. Every test here must fail without the code it covers
// (S4). The live probes (P1-P7, real `claude -p`) are run separately and reported in
// docs/specs/review-run-53/build.md — they are not part of this gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  EXIT, RECURSION_ENV_VAR, VERDICT_RE, DISALLOWED_TOOLS,
  parseArgs, normalizeFirstLine, validateVerdict, parseRoleFile, sha256Hex,
  buildAgentsJson, buildArgv, buildChildEnv, validateReportPath, resolvePluginRoot,
  stripGitLocatingEnv, sweepStaleRuns, isProcessAlive, runReviewRun, writeSidecarAtomic,
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

// ─────────────────────────────────────────────────────────────────────────────
// Finding 10: missing sidecar/stdout fields — roleBodySha256, installedRoleSha256 (independent
// of roleSource), the resolved absolute claudeBin, resolvedModel from the init event, and
// cleanup/wtDir surfaced on the stdout-shaped output too, not just the sidecar.
// ─────────────────────────────────────────────────────────────────────────────

test('finding 10: the sidecar carries roleBodySha256, an absolute claudeBin, resolvedModel from the init event, and installedRoleSha256 (null when nothing is installed)', async () => {
  const claudeBin = writeFakeClaude(scratchDir('review-run-f10-claude-'));
  const pluginRoot = makePluginRoot();
  const expectedBody = parseRoleFile(fs.readFileSync(path.join(pluginRoot, 'agents', 'reviewer.md'))).body;
  const { reportPath } = await run({ mode: 'approve', claudeBin, pluginRoot });
  const identity = JSON.parse(fs.readFileSync(`${reportPath}.identity.json`, 'utf8'));
  assert.equal(identity.roleBodySha256, sha256Hex(Buffer.from(expectedBody, 'utf8')));
  assert.ok(path.isAbsolute(identity.claudeBin), `claudeBin must be absolute, got ${identity.claudeBin}`);
  assert.equal(path.resolve(identity.claudeBin), path.resolve(claudeBin));
  assert.equal(identity.resolvedModel, 'fake-opus', 'resolvedModel must come from the init event\'s own model field');
  assert.equal(identity.installedRoleSha256, null, 'no installed_plugins.json exists in this fixture HOME');
});

test('finding 10: installedRoleSha256 is computed independently of roleSource — a --plugin-root flag run still reports what is actually installed', async () => {
  const home = scratchDir('review-run-f10-home-');
  fs.mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
  const installedRoot = makePluginRoot(); // a DIFFERENT plugin root than the one used via --plugin-root below
  fs.writeFileSync(
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'delegation@benzhuk': [{ scope: 'user', installPath: installedRoot }] } }),
  );
  const flagRoot = makePluginRoot(); // resolved via --plugin-root (roleSource: 'flag')
  const { reportPath } = await run({ mode: 'approve', home, pluginRoot: flagRoot });
  const identity = JSON.parse(fs.readFileSync(`${reportPath}.identity.json`, 'utf8'));
  const expectedInstalledSha = sha256Hex(fs.readFileSync(path.join(installedRoot, 'agents', 'reviewer.md')));
  assert.equal(identity.roleSource, 'flag');
  assert.equal(identity.installedRoleSha256, expectedInstalledSha, 'installedRoleSha256 must reflect the actually-installed entry, even when a different source was used to run');
});

test('finding 10: a failed cleanup is surfaced on the stdout-shaped output too (cleanup + wtDir), not just the sidecar', async () => {
  const { output } = await run({ mode: 'approve' });
  assert.equal(output.cleanup, 'ok', 'the ordinary success path must report cleanup:"ok" on stdout');
  assert.equal(output.wtDir, undefined, 'wtDir must only appear on stdout when cleanup failed');
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

test('finding 14: validateReportPath atomically claims the sidecar, so two concurrent runs given the same --report can never both pass', () => {
  const scratch = scratchDir('review-run-scratch-');
  const outDir = scratchDir('review-run-race-out-');
  const reportPath = path.join(outDir, 'report.md');
  // Run 1 "wins the race": passes validation, which must leave behind an (empty) claimed sidecar.
  assert.doesNotThrow(() => validateReportPath(reportPath, scratch));
  assert.ok(fs.existsSync(`${reportPath}.identity.json`), 'the sidecar must be claimed (even empty) as soon as validation passes');
  // Run 2, given the identical --report a moment later, must be refused outright.
  assert.throws(() => validateReportPath(reportPath, scratch), /identity sidecar already exists/);
});

test('finding 14 (N3): writeSidecarAtomic never writes through a planted symlink', () => {
  const dir = scratchDir('review-run-sidecar-symlink-');
  const canary = path.join(dir, 'canary.json');
  fs.writeFileSync(canary, '{"safe":true}');
  const sidecar = path.join(dir, 'report.md.identity.json');
  fs.symlinkSync(canary, sidecar);
  writeSidecarAtomic(sidecar, '{"forged":"through the link"}', fs);
  assert.equal(fs.readFileSync(canary, 'utf8'), '{"safe":true}', 'the symlink target must never be written through');
  assert.ok(!fs.lstatSync(sidecar).isSymbolicLink(), 'the sidecar path itself must now be a regular file, not the old symlink');
  assert.equal(fs.readFileSync(sidecar, 'utf8'), '{"forged":"through the link"}', 'the sidecar path must carry the new contents');
});

test('finding 14 (N3): writeSidecarAtomic never writes through a hard link', () => {
  const dir = scratchDir('review-run-sidecar-hardlink-');
  const victim = path.join(dir, 'victim.json');
  fs.writeFileSync(victim, '{"safe":true}');
  const sidecar = path.join(dir, 'report.md.identity.json');
  fs.linkSync(victim, sidecar);
  writeSidecarAtomic(sidecar, '{"forged":"through the hard link"}', fs);
  assert.equal(fs.readFileSync(victim, 'utf8'), '{"safe":true}', 'the hard-linked victim must never be written through');
  assert.equal(fs.readFileSync(sidecar, 'utf8'), '{"forged":"through the hard link"}', 'the sidecar path must carry the new contents');
});

test('M4: --report inside --scratch is refused', () => {
  const scratch = scratchDir('review-run-scratch-');
  assert.throws(() => validateReportPath(path.join(scratch, 'report.md'), scratch));
});

test('N6: SKILL.md documents that a failed run leaves an empty sidecar behind, and that a fresh --report is required', () => {
  const skillMd = fs.readFileSync(path.join(HERE, '..', 'SKILL.md'), 'utf8');
  assert.match(
    skillMd,
    /leaves that sidecar empty[\s\S]{0,80}fresh `--report` path/,
    'SKILL.md must document that a run stopping on exit 1, 4 or 7 leaves an empty sidecar, and that a retry needs a fresh --report path',
  );
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
// Finding 6 / N1 (ruling r3): a recorded childPid is never proof of identity — pid reuse or a
// forged owner.json could name any process. The sweep never signals anything. A live childPid
// (whatever its age) means "leave this dir alone"; only a dead or absent childPid lets the sweep
// reclaim a stale run's wt/.
// ─────────────────────────────────────────────────────────────────────────────

function makeRunDirWithOwner(scratch, owner) {
  const runId = 'review-run-abc1234-' + Math.random().toString(36).slice(2, 10);
  const runDir = path.join(scratch, runId);
  fs.mkdirSync(path.join(runDir, 'wt'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'wt', 'marker.txt'), 'present');
  fs.writeFileSync(path.join(runDir, 'owner.json'), JSON.stringify(owner));
  return runDir;
}

test('finding 6: a live orphaned child still within its own timeout is left alone — its wt/ survives', () => {
  const scratch = scratchDir('review-run-orphan-scratch-');
  const runDir = makeRunDirWithOwner(scratch, {
    pid: 424242, startedAt: new Date(Date.now() - 1000).toISOString(), childPid: 555555, timeoutMin: 45,
  });
  // review-run's own pid (424242) is dead; the child (555555) is alive and young (age ~1s << 45min).
  sweepStaleRuns(scratch, 45, fs, (pid) => pid === 555555);
  assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')), 'a young orphan\'s wt/ must survive');
});

test('N1 (ruling r3): a live childPid PAST its own recorded timeout is still left alone — the sweep never signals anything, so its wt/ survives', () => {
  const scratch = scratchDir('review-run-orphan-scratch-');
  const runDir = makeRunDirWithOwner(scratch, {
    pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: 555555, timeoutMin: 1,
  });
  sweepStaleRuns(scratch, 45, fs, (pid) => pid === 555555);
  assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')), 'a childPid that still answers kill(pid,0) is never proof of identity — it must never be killed, and its wt/ must be left in place, however old the run');
});

test('N1 (ruling r3): an unrelated live process recorded as childPid survives the sweep, non-detached', async () => {
  const scratch = scratchDir('review-run-orphan-real-nd-');
  const victim = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    const runDir = makeRunDirWithOwner(scratch, {
      pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
    });
    sweepStaleRuns(scratch, 45);
    assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')), 'an unrelated live pid must never be signalled, and its wt/ must be left in place');
    assert.equal(isProcessAlive(victim.pid), true, 'the sweep must never have sent the victim any signal');
  } finally {
    victim.kill('SIGTERM');
  }
});

test('N1 (ruling r3): an unrelated live process recorded as childPid survives the sweep, detached (its own process group leader)', async () => {
  const scratch = scratchDir('review-run-orphan-real-d-');
  const victim = spawn('sleep', ['30'], { stdio: 'ignore', detached: true });
  try {
    const runDir = makeRunDirWithOwner(scratch, {
      pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
    });
    sweepStaleRuns(scratch, 45);
    assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')), 'a detached group-leader pid must never be signalled either, and its wt/ must be left in place');
    assert.equal(isProcessAlive(victim.pid), true, 'the sweep must never have sent the victim any signal, group leader or not');
  } finally {
    try { process.kill(-victim.pid, 'SIGTERM'); } catch { victim.kill('SIGTERM'); }
  }
});

test('N1 (ruling r3): a dead childPid still gets the existing cleanup', () => {
  const scratch = scratchDir('review-run-orphan-dead-');
  const deadPid = spawnSync('true', [], {}).pid; // already exited: kill(pid,0) now throws ESRCH
  const runDir = makeRunDirWithOwner(scratch, {
    pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: deadPid, timeoutMin: 1,
  });
  sweepStaleRuns(scratch, 45);
  assert.equal(fs.existsSync(path.join(runDir, 'wt')), false, 'a dead (or absent) childPid must still let the stale run be reclaimed');
});

test('N1 (ruling r3): the sweep prints one line naming a stale run it left in place, and sends no signal', () => {
  const scratch = scratchDir('review-run-orphan-print-');
  const victim = spawn('sleep', ['30'], { stdio: 'ignore' });
  const runDir = makeRunDirWithOwner(scratch, {
    pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString(), childPid: victim.pid, timeoutMin: 1,
  });
  const origWrite = process.stderr.write;
  let captured = '';
  process.stderr.write = (chunk, ...rest) => { captured += chunk; return true; };
  try {
    sweepStaleRuns(scratch, 45);
  } finally {
    process.stderr.write = origWrite;
    victim.kill('SIGTERM');
  }
  assert.match(captured, new RegExp(String(victim.pid)), 'the printed line must name the childPid it left alone');
  assert.match(captured, new RegExp(runDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the printed line must name the run dir it left in place');
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

// ─────────────────────────────────────────────────────────────────────────────
// N5: the sweep tests r1 finding 5 required but never got — a live run's wt/ survives, a young
// dead run's wt/ survives, and the cutoff is the dead run's OWN owner.timeoutMin, not the
// sweeping run's. These still pass with the N1 patch: no childPid, so the identity check above is
// never reached.
// ─────────────────────────────────────────────────────────────────────────────

test('finding 5: the sweep never touches a run whose review-run pid is alive, however old', () => {
  const scratch = scratchDir('review-run-sweep-live-');
  const runDir = makeRunDirWithOwner(scratch, { pid: 424242, startedAt: new Date(Date.now() - 999_999_999).toISOString() });
  sweepStaleRuns(scratch, 1, fs, (pid) => pid === 424242);
  assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')));
});

test('finding 5: a dead run younger than its timeout keeps its wt/', () => {
  const scratch = scratchDir('review-run-sweep-young-');
  const runDir = makeRunDirWithOwner(scratch, { pid: 424242, startedAt: new Date(Date.now() - 60_000).toISOString(), timeoutMin: 45 });
  sweepStaleRuns(scratch, 45, fs, () => false);
  assert.ok(fs.existsSync(path.join(runDir, 'wt', 'marker.txt')));
});

test("finding 6: the cutoff is the dead run's own owner.timeoutMin, not the sweeping run's", () => {
  const scratch = scratchDir('review-run-sweep-owntimeout-');
  const runDir = makeRunDirWithOwner(scratch, { pid: 424242, startedAt: new Date(Date.now() - 5 * 60_000).toISOString(), timeoutMin: 1 });
  sweepStaleRuns(scratch, 45, fs, () => false);
  assert.equal(fs.existsSync(path.join(runDir, 'wt')), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding 8: a symlinked --repo must not get past the "plugin root inside the reviewed repo"
// exit-4 check (measured in the review: direct path exits 4, a symlink to the same repo exits 7
// having reached clone).
// ─────────────────────────────────────────────────────────────────────────────

test('finding 8: a symlinked --repo pointing at the resolved plugin root still trips the inside-repo exit-4 check, before any clone', async () => {
  if (process.platform === 'win32') return; // symlink creation needs elevation on some win32 setups
  // A PLAIN (non-worktree) git repo: `git rev-parse --git-common-dir` returns the RELATIVE
  // string ".git" here (unlike this suite's own linked-worktree checkout, where it's already an
  // absolute, symlink-resolved path) — that relative form is exactly what makes
  // path.resolve(pluginRoot, rootCommon) sensitive to which literal string pluginRoot/repoTop
  // is, symlink or not.
  // Under a sealed run (scripts/run-tests.mjs), FIXTURE_ROOT is the one directory whose
  // `includeIf "gitdir/i:…/**"` already seeds a fixture identity (test-home.mjs) — a repo
  // created there needs no explicit `git config user.*` at all. Outside a seal, FIXTURE_ROOT is
  // unset and the repo just inherits the machine's own already-configured identity, same as
  // every other real `git init` on this host.
  const pluginAndRepoDir = fs.mkdtempSync(
    path.join(process.env.FIXTURE_ROOT || os.tmpdir(), 'review-run-plainrepo-'),
  );
  execFileSync('git', ['init', '-q'], { cwd: pluginAndRepoDir });
  fs.mkdirSync(path.join(pluginAndRepoDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(pluginAndRepoDir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.0.0-plain' }));
  fs.mkdirSync(path.join(pluginAndRepoDir, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(pluginAndRepoDir, 'agents', 'reviewer.md'), ROLE_FIXTURE);
  execFileSync('git', ['add', '-A'], { cwd: pluginAndRepoDir });
  // Never -c user.email/-c user.name, --author, or GIT_AUTHOR_*/GIT_COMMITTER_* — the
  // git-identity-guard hook and this project's own hard rules forbid all four, test fixtures
  // included. No explicit identity is set here at all: the FIXTURE_ROOT placement above already
  // gets this repo a seeded identity under a seal, and the real machine identity otherwise.
  execFileSync('git', ['commit', '-q', '-m', 'x'], { cwd: pluginAndRepoDir });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: pluginAndRepoDir, encoding: 'utf8' }).trim();

  const repoLink = path.join(scratchDir('review-run-repolink-'), 'repo-link');
  fs.symlinkSync(pluginAndRepoDir, repoLink, 'dir');

  const home = scratchDir('review-run-symrepo-home-');
  fs.mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'delegation@benzhuk': [{ scope: 'user', installPath: pluginAndRepoDir }] } }),
  );

  const calls = [];
  const gitRunner = (args, cwd) => {
    calls.push(args[0]);
    if (args[0] === 'clone') throw new Error('must not reach clone: the inside-repo check must fire first');
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
  };
  const scratch = scratchDir('review-run-symrepo-scratch-');
  const reportPath = path.join(scratchDir('review-run-symrepo-out-'), 'report.md');
  const briefPath = path.join(scratchDir('review-run-symrepo-brief-'), 'brief.md');
  fs.writeFileSync(briefPath, 'x');

  const { exitCode } = await runReviewRun([
    // --repo is a SYMLINK to the very directory installed_plugins.json resolves as the plugin root.
    '--sha', sha, '--brief', briefPath, '--report', reportPath, '--repo', repoLink,
    '--scratch', scratch, '--claude-bin', 'irrelevant-claude-bin',
  ], { env: { HOME: home, PATH: process.env.PATH }, home, gitRunner });
  assert.equal(exitCode, EXIT.HOST, 'a symlinked --repo pointing at the resolved plugin root must still exit 4');
  assert.ok(!calls.includes('clone'), 'clone must never be reached once the check correctly fires');
});

test('finding 7: isProcessAlive treats EPERM (a process owned by another user) as alive, not dead', () => {
  // pid 1 (init/systemd) exists but is not signalable by a non-root user: process.kill(1, 0)
  // raises EPERM on every POSIX host this runs on. On win32 this test is skipped: there is no
  // pid-1-equivalent EPERM case to probe the same way.
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  assert.equal(isProcessAlive(1), true, 'EPERM must count as alive, never as dead');
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding 5: the tests were passing because they weren't looking. Each test below is named after
// the mutation (from the review's own 15-mutation table) it must kill.
// ─────────────────────────────────────────────────────────────────────────────

test('finding 5 (kills M4/M5/M6): the real spawn-boundary argv is byte-identical to buildArgv\'s own output, and agents.json is byte-identical to buildAgentsJson(parseRoleFile(roleBytes))', async () => {
  let capturedArgv = null;
  let capturedCwd = null;
  const spawnSpy = (cmd, argv, opts) => { capturedArgv = argv; capturedCwd = opts.cwd; return spawn(cmd, argv, opts); };
  const pluginRoot = makePluginRoot();
  const roleBytes = fs.readFileSync(path.join(pluginRoot, 'agents', 'reviewer.md'));
  const role = parseRoleFile(roleBytes);
  const { exitCode, scratch, reportPath } = await run({ mode: 'approve', spawnSpy, pluginRoot });
  assert.equal(exitCode, EXIT.OK);
  const runDirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
  assert.equal(runDirs.length, 1);
  const agentsPath = path.join(scratch, runDirs[0], 'agents.json');
  const expectedArgv = buildArgv({
    model: 'opus', effort: role.effort, tools: role.tools, sessionId: 'IGNORED', agentsPath, reportPath,
  });
  // sessionId is a fresh randomUUID per run and can't be predicted — compare everything else
  // positionally, and separately assert the fixed pairs the mutation table needs killed.
  const sessionIdx = capturedArgv.indexOf('--session-id');
  const withoutSession = [...capturedArgv];
  withoutSession.splice(sessionIdx, 2);
  const expectedWithoutSession = [...expectedArgv];
  const expSessionIdx = expectedWithoutSession.indexOf('--session-id');
  expectedWithoutSession.splice(expSessionIdx, 2);
  assert.deepEqual(withoutSession, expectedWithoutSession, 'the real spawn argv must equal buildArgv\'s own output (minus the random session id)');
  assert.deepEqual(capturedArgv.slice(sessionIdx, sessionIdx + 2)[0], '--session-id');
  for (const [flag, value] of [['--agent', 'review-run-reviewer'], ['--setting-sources', 'user']]) {
    const idx = capturedArgv.indexOf(flag);
    assert.ok(idx >= 0, `${flag} must be present`);
    assert.equal(capturedArgv[idx + 1], value);
  }
  assert.ok(capturedArgv.includes('--permission-mode'));
  // Independent of buildArgv's own output (which could itself be mutated to drop these) — these
  // flags must be hardcoded-present on the real spawn argv, not merely self-consistent with
  // whatever buildArgv happens to currently produce.
  assert.ok(capturedArgv.includes('--allowedTools'), '--allowedTools must be present on the real spawn argv');
  assert.ok(capturedArgv.includes('--tools'), '--tools must be present on the real spawn argv');
  assert.ok(capturedArgv.includes('--disallowedTools'), '--disallowedTools must be present on the real spawn argv');
  assert.ok(capturedArgv.includes('--agents'), '--agents must be present on the real spawn argv');
  assert.equal(capturedCwd, path.join(scratch, runDirs[0], 'wt'));
  const agentsJsonOnDisk = JSON.parse(fs.readFileSync(agentsPath, 'utf8'));
  assert.deepEqual(agentsJsonOnDisk, buildAgentsJson(role), 'agents.json must be byte-derived from parseRoleFile, not hand-assembled at the call site');
});

test('finding 5 (kills M12): buildChildEnv always sets KNOWLEDGE_DIR under the run dir (m2: distill-session.sh\'s SessionEnd capture goes to scratch, not the real ~/.claude/knowledge/_inbox)', () => {
  const env = buildChildEnv({ HOME: '/h', PATH: '/p' }, { runDir: '/tmp/run-dir-k' });
  assert.equal(env.KNOWLEDGE_DIR, path.join('/tmp/run-dir-k', 'knowledge'));
});

test('finding 5 (kills M10): an installed_plugins.json with a real user-scope entry gives roleSource: "installed"', () => {
  const home = scratchDir('review-run-home-installed2-');
  const installedRoot = makePluginRoot();
  fs.mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'delegation@benzhuk': [{ scope: 'user', installPath: installedRoot }] } }),
  );
  const result = resolvePluginRoot({ repoTop: REPO_TOP, home, fsImpl: fs, scriptDir: HERE });
  assert.equal(result.roleSource, 'installed');
  assert.equal(path.resolve(result.root), path.resolve(installedRoot));
});

test('finding 5 (kills M11): a gitRunner that throws on checkout, after a real clone, leaves no wt/ behind (catch-path cleanup)', async () => {
  const scratch = scratchDir('review-run-catchpath-scratch-');
  const outDir = scratchDir('review-run-catchpath-out-');
  const reportPath = path.join(outDir, 'report.md');
  const briefPath = path.join(scratchDir('review-run-catchpath-brief-'), 'brief.md');
  fs.writeFileSync(briefPath, 'x');
  const pluginRoot = makePluginRoot();
  const home = scratchDir('review-run-catchpath-home-');
  const realGit = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const gitRunner = (args, cwd) => {
    if (args.includes('checkout')) throw new Error('simulated checkout failure');
    return realGit(args, cwd);
  };
  const { exitCode, scratch: outScratch } = await runReviewRun([
    '--sha', FULLSHA, '--brief', briefPath, '--report', reportPath, '--repo', REPO_TOP,
    '--scratch', scratch, '--claude-bin', 'irrelevant', '--plugin-root', pluginRoot,
  ].map((v) => v), { env: { HOME: home, PATH: process.env.PATH }, home, gitRunner }).then((r) => ({ ...r, scratch }));
  assert.equal(exitCode, EXIT.INTERNAL);
  const runDirs = fs.readdirSync(scratch).filter((d) => d.startsWith('review-run-'));
  assert.equal(runDirs.length, 1);
  assert.equal(fs.existsSync(path.join(scratch, runDirs[0], 'wt')), false, 'wt/ must be gone even when the failure happens mid-clone, after the directory was created');
});

// N5: SIGTERM without killTree makes this file HANG (not fail) rather than fail — a 30s test
// timeout turns a future regression into a fail in 30s instead of a stalled CI run.
test('finding 5 (kills M13): SIGTERM to review-run itself actually kills the fake\'s real OS process, not just its own child handle', { timeout: 30_000 }, async () => {
  const scratch = scratchDir('review-run-scratch-sigterm2-');
  const outDir = scratchDir('review-run-out-sigterm2-');
  const claudeBin = writeFakeClaude(scratchDir('review-run-claude-sigterm2-'));
  const pluginRoot = makePluginRoot();
  const briefPath = path.join(scratchDir('review-run-brief-sigterm2-'), 'brief.md');
  fs.writeFileSync(briefPath, 'Review the fixture diff.\n');
  const reportPath = path.join(outDir, 'report.md');
  const home = scratchDir('review-run-home-sigterm2-');
  const pidFile = path.join(scratchDir('review-run-sigterm2-pid-'), 'pid');

  const child = spawn(process.execPath, [
    SCRIPT, '--sha', FULLSHA, '--brief', briefPath, '--report', reportPath, '--repo', REPO_TOP,
    '--scratch', scratch, '--claude-bin', claudeBin, '--plugin-root', pluginRoot, '--timeout-min', '5',
  ], {
    env: { HOME: home, PATH: process.env.PATH, FAKE_MODE: 'timeout', FAKE_PID_FILE: pidFile },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  await new Promise((resolveWait) => {
    const check = setInterval(() => {
      if (fs.existsSync(pidFile)) { clearInterval(check); resolveWait(); }
    }, 50);
  });
  const fakePid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  child.kill('SIGTERM');
  await new Promise((resolveExit) => { child.once('exit', () => resolveExit()); });
  await new Promise((r) => setTimeout(r, 200)); // let SIGKILL actually land
  let alive = true;
  try { process.kill(fakePid, 0); } catch { alive = false; }
  assert.equal(alive, false, 'the fake\'s real OS process must be gone, not just review-run\'s own handle to it');
});

test('finding 5: cleanup never follows a symlink inside wt/ out to a canary file elsewhere', async () => {
  const canaryDir = scratchDir('review-run-canary-');
  fs.writeFileSync(path.join(canaryDir, 'canary.txt'), 'must survive');
  const claudeBin = writeFakeClaude(scratchDir('review-run-symcleanup-claude-'));
  const pluginRoot = makePluginRoot();
  // A fake mode that plants a symlink inside the worktree pointing at the canary dir, then
  // approves normally — review-run's own cleanup (rmSync on wtDir) must remove only the link.
  const symlinkFakeSource = FAKE_CLAUDE_SOURCE.replace(
    "emit({ type: 'system', subtype: 'init', claude_code_version: '0.0.0-fake', model: 'fake-opus' });",
    "emit({ type: 'system', subtype: 'init', claude_code_version: '0.0.0-fake', model: 'fake-opus' });\n"
    + "  fs.symlinkSync(process.env.CANARY_DIR, process.cwd() + '/link-to-canary', 'dir');",
  );
  const dir = scratchDir('review-run-symcleanup-fake-');
  const p = path.join(dir, 'fake-claude.mjs');
  fs.writeFileSync(p, symlinkFakeSource, { mode: 0o755 });
  const { exitCode } = await run({ mode: 'approve', claudeBin: p, pluginRoot, extraEnv: { CANARY_DIR: canaryDir } });
  assert.equal(exitCode, EXIT.OK);
  assert.ok(fs.existsSync(path.join(canaryDir, 'canary.txt')), 'the canary file itself must survive wt/ cleanup — only the symlink (inside wt/) may be removed');
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

test('finding 1(a)/(b)/1(c): the spawn-boundary argv never grants a tool-wide Write or Bash, the Write rule is scoped to --report, and git\'s global-option forms are disallowed', () => {
  const argv = buildArgv({
    model: 'opus', effort: 'high', tools: ['Read', 'Grep', 'Glob', 'Write', 'Bash'],
    sessionId: 'fixture-session', agentsPath: '/tmp/agents.json', reportPath: '/abs/out/report.md',
  });
  const allowed = argv[argv.indexOf('--allowedTools') + 1].split(',');
  assert.ok(!allowed.includes('Write'), '--allowedTools must never carry a bare, tool-wide Write');
  assert.ok(!allowed.includes('Bash'), '--allowedTools must never carry a bare, tool-wide Bash');
  // N4 (ruling r3): Write(path) rules are never matched by the CLI's file permission checks;
  // Edit(path) covers the Write tool, and "//" roots it at "/" (a single "/" would be relative to
  // the child's own cwd, per the CLI's own settings docs and validator).
  assert.ok(allowed.includes('Edit(//abs/out/report.md)'), 'the report rule must be Edit(//<abs path>)');
  assert.ok(!allowed.some((r) => r.startsWith('Write(')), 'never emit an inert Write(path) rule');
  const disallowed = argv[argv.indexOf('--disallowedTools') + 1];
  assert.ok(disallowed.includes('Bash(git -C:*)'), 'git -C must be disallowed (finding 1(b))');
  assert.ok(disallowed.includes('Bash(git -c:*)'));
  assert.ok(disallowed.includes('Bash(git --git-dir:*)'));
  assert.ok(disallowed.includes('Bash(git --work-tree:*)'));
  assert.ok(disallowed.includes('Bash(git --exec-path:*)'));
});

test('ruling r2: git global options are denied in their equals-joined spelling too, as wildcard (not :* prefix) rules', () => {
  const argv = buildArgv({ model: 'opus', effort: 'high', tools: ['Read', 'Bash'], sessionId: 's', agentsPath: '/tmp/a.json' });
  const denied = argv[argv.indexOf('--disallowedTools') + 1].split(',');
  for (const rule of ['Bash(git --git-dir=*)', 'Bash(git --work-tree=*)', 'Bash(git --exec-path=*)',
    'Bash(git -C:*)', 'Bash(git --git-dir:*)', 'Bash(git --work-tree:*)']) {
    assert.ok(denied.includes(rule), `${rule} must be disallowed`);
  }
  for (const rule of denied) {
    // The CLI treats "*" mixed with a trailing ":*" as an unexpanded literal prefix (never matches).
    const body = rule.slice(rule.indexOf('(') + 1, -1);
    if (body.endsWith(':*')) assert.ok(!body.slice(0, -2).includes('*'), `${rule} mixes * with :* and would never match`);
  }
});

test('finding 1(a): --report containing a comma or a close-paren is refused (it would break the Write allow-rule syntax)', () => {
  const scratch = scratchDir('review-run-scratch-');
  assert.throws(() => validateReportPath(path.join(scratch, '..', 'report,with,comma.md'), scratch));
  assert.throws(() => validateReportPath(path.join(scratch, '..', 'report)paren.md'), scratch));
});

test('finding 3: PowerShell is dropped from both --tools and --allowedTools on every platform, even when the role frontmatter grants it (agents/reviewer.md lists it for win32)', () => {
  const argv = buildArgv({
    model: 'opus', effort: 'high', tools: ['Read', 'Grep', 'Glob', 'Write', 'Bash', 'PowerShell'],
    sessionId: 'fixture-session', agentsPath: '/tmp/agents.json',
  });
  const toolsIdx = argv.indexOf('--tools');
  const allowedIdx = argv.indexOf('--allowedTools');
  assert.ok(!argv[toolsIdx + 1].split(',').includes('PowerShell'), '--tools must never carry PowerShell');
  assert.ok(!argv[allowedIdx + 1].split(',').includes('PowerShell'), '--allowedTools must never carry PowerShell');
  for (const tok of argv) assert.ok(!String(tok).includes('PowerShell'), `PowerShell must be absent from argv entirely, found in: ${tok}`);
});

test("finding 1(c): permission mode defaults to auto (the ruling's default, re-decided this round by live probe once 1(a)/1(b) close the Write/git-global escapes) — see build-r1.md's mode table for the decision and its reason", () => {
  const argv = buildArgv({
    model: 'opus', effort: 'high', tools: ['Read', 'Bash'], sessionId: 'fixture-session',
    agentsPath: '/tmp/agents.json',
  });
  const i = argv.indexOf('--permission-mode');
  assert.ok(i >= 0);
  assert.equal(argv[i + 1], 'auto');
});

test('finding 1(c): an explicit dontAsk mode gets the read-only Bash allowlist instead of a tool-wide Bash', () => {
  const argv = buildArgv({
    model: 'opus', effort: 'high', tools: ['Read', 'Bash'], sessionId: 'fixture-session',
    agentsPath: '/tmp/agents.json', permissionMode: 'dontAsk',
  });
  const allowed = argv[argv.indexOf('--allowedTools') + 1].split(',');
  assert.ok(!allowed.includes('Bash'), 'dontAsk must never carry a bare, tool-wide Bash either');
  assert.ok(allowed.includes('Bash(git status:*)'), 'dontAsk needs an explicit read-only allowlist to do any work at all');
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

// N5: same reasoning as the M13 test above — a 30s cap turns a hang into a fail.
test('M5: SIGTERM to review-run while the fake is running exits with the timeout code and the clone dir is gone', { timeout: 30_000 }, async () => {
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
