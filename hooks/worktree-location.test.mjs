// node --test hooks/worktree-location.test.mjs
//
// R4 (lane 65, docs/specs/worktree-location-65/spec.md item 1): a worktree outside
// `<repo>/.claude/worktrees/` is refused, for `git worktree add` (Bash/PowerShell) and for an
// Agent mandate that names a `Worktree:` path. Hard deny: ignores the enforce file.
// Fixture repos and fixture homes only (mkdtempSync under os.tmpdir()); never the real home.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { decide } from './agent-dispatch-guard.mjs';
import { r4Text, checkBashWorktreeAdd, checkAgentWorktree } from './worktree-location.mjs';
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD_PATH = path.join(HERE, 'agent-dispatch-guard.mjs');

function scratchHome() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'r4-home-')));
}

/** A fixture repo (`git init` only: no commit, so no identity is needed). The path is
 * realpath'd so a symlinked tmpdir cannot make the expected text differ from git's answer. */
function fixtureRepo() {
  const parent = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'r4-')));
  const repo = path.join(parent, 'Code', 'repo').replace(/\\/g, '/');
  fs.mkdirSync(repo, { recursive: true });
  const res = spawnSync('git', ['init', '-q', repo], { env: childEnv(parent), encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  return repo;
}

const ctxFor = (home, extra = {}) => ({ home, fsImpl: fs, ...extra });
const BASH = (command, cwd, tool = 'Bash') => ({ tool_name: tool, tool_input: { command }, cwd, session_id: 'r4-session' });
const AGENT = (cwd, prompt, extra = {}) => ({ tool_name: 'Agent', tool_input: { prompt, ...extra }, cwd, session_id: 'r4-session' });

function runCliProcess(home, input) {
  return spawnSync(process.execPath, [GUARD_PATH], { input, env: childEnv(home), encoding: 'utf8' });
}

test('R4: git worktree add as a sibling of the repo is a hard deny that names the right path', () => {
  const repo = fixtureRepo();
  const home = scratchHome(); // observe-only home: no enforce file
  for (const [cmd, leaf] of [
    ['git worktree add ../wt-x -b build/x', 'wt-x'],
    [`git worktree add ${repo}/../elsewhere/wt-y`, 'wt-y'],
    ['git worktree add -b feat ../wt-z origin/main', 'wt-z'],
    ['git worktree add "../wt q"', 'wt q'],
    ['git worktree add --detach ../wt-d', 'wt-d'],
  ]) {
    const r = decide(BASH(cmd, repo), ctxFor(home));
    assert.equal(r.action, 'deny', cmd);
    assert.deepEqual(r.rule, ['R4']);
    assert.equal(r.hardDeny, true, 'R4 refuses; the enforce file does not gate it');
    assert.equal(r.text, r4Text(repo, leaf), cmd);
    assert.match(r.text, /<repo>\/\.claude\/worktrees\/<name>/);
    assert.ok(r.text.includes(`${repo}/.claude/worktrees/${leaf}`), 'names the corrected path');
  }
});

test('R4: PowerShell is covered the same way, and `git -C <dir>` re-bases a relative path', () => {
  const repo = fixtureRepo();
  const home = scratchHome();
  const ps = decide(BASH('git worktree add ..\\wt-ps', repo, 'PowerShell'), ctxFor(home));
  assert.deepEqual(ps.rule, ['R4']);
  // From an unrelated cwd, `-C <repo>` makes `../x` relative to the repo: still a sibling.
  const other = scratchHome();
  const viaC = decide(BASH(`git -C ${repo} worktree add ../wt-c`, other), ctxFor(home));
  assert.deepEqual(viaC.rule, ['R4']);
  // ... while `-C <repo>` with a path inside the folder is fine.
  const ok = decide(BASH(`git -C ${repo} worktree add .claude/worktrees/wt-c`, other), ctxFor(home));
  assert.equal(ok.action, 'allow');
});

test('R4: a worktree under <repo>/.claude/worktrees/ is allowed, relative or absolute', () => {
  const repo = fixtureRepo();
  const home = scratchHome();
  for (const cmd of [
    'git worktree add .claude/worktrees/wt-a -b build/a',
    `git worktree add ${repo}/.claude/worktrees/wt-b`,
    'git worktree add -b x ./.claude/worktrees/wt-c origin/main',
    `git worktree add "${repo}/.claude/worktrees/wt d" HEAD`,
    'git status && git worktree list',
    'git worktree remove .claude/worktrees/old',
  ]) {
    const r = decide(BASH(cmd, repo), ctxFor(home));
    assert.equal(r.action, 'allow', cmd);
    assert.equal(r.hardDeny, false);
  }
});

test('R4: <repo> is the MAIN checkout, so a call made from inside a linked worktree is judged against it', () => {
  const home = scratchHome();
  const repo = fixtureRepo();
  // A linked worktree's `git rev-parse --git-common-dir` answers with the main repo's .git.
  const gitRunner = () => `${repo}/.git\n`;
  const lane = `${repo}/.claude/worktrees/lane-1`;
  const sibling = decide(BASH('git worktree add ../wt-next', lane), ctxFor(home, { gitRunner }));
  assert.equal(sibling.action, 'allow', '../ from a lane under the folder lands in the folder');
  const escape = decide(BASH('git worktree add ../../../wt-out', lane), ctxFor(home, { gitRunner }));
  assert.deepEqual(escape.rule, ['R4']);
  assert.equal(escape.text, r4Text(repo, 'wt-out'), 'names the MAIN checkout, not the linked worktree');
});

test('R4: unresolvable or non-git cases fail open', () => {
  const home = scratchHome();
  const repo = fixtureRepo();
  const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-nogit-'));
  assert.equal(decide(BASH('git worktree add ../x', notRepo), ctxFor(home)).action, 'allow', 'not a git repo');
  assert.equal(decide(BASH('git worktree add $WT -b x', repo), ctxFor(home)).action, 'allow', 'shell variable');
  assert.equal(decide(BASH('git worktree add "$(mktemp -d)"', repo), ctxFor(home)).action, 'allow', 'substitution');
  assert.equal(decide(BASH('git --git-dir=/x/.git worktree add ../y', repo), ctxFor(home)).action, 'allow', '--git-dir');
  const boom = { gitRunner: () => { throw new Error('git missing'); } };
  assert.equal(decide(BASH('git worktree add ../x', repo), ctxFor(home, boom)).action, 'allow', 'git throws');
  assert.equal(decide(BASH('git worktree add', repo), ctxFor(home)).action, 'allow', 'no path operand');
  assert.equal(checkBashWorktreeAdd({ tool_name: 'Bash', tool_input: {}, cwd: repo }), null, 'no command');
  assert.equal(checkBashWorktreeAdd(null), null);
});

test('R4: prose about the command (echo, grep, commit message, heredoc, here-string) is not the command', () => {
  const home = scratchHome();
  const repo = fixtureRepo();
  for (const cmd of [
    'echo "git worktree add ../x"',
    'grep -rn "git worktree add ../x" docs',
    'git commit -m "docs: say git worktree add ../x is refused; git worktree add ../y too"',
    "cat > note.md <<'EOF'\nuse git worktree add ../x\nEOF",
    'gh pr create --body "never git worktree add ../x"',
    "@'\ngit worktree add ../x\n'@ | Set-Content n.md",
  ]) {
    assert.equal(decide(BASH(cmd, repo), ctxFor(home)).action, 'allow', cmd);
  }
  // ... but a quote that an executor runs is the command.
  assert.deepEqual(decide(BASH('bash -c "git worktree add ../x"', repo), ctxFor(home)).rule, ['R4']);
  // And a heredoc does not hide a real command that follows it.
  assert.deepEqual(decide(BASH("cat <<'EOF'\nhi\nEOF\ngit worktree add ../x", repo), ctxFor(home)).rule, ['R4']);
});

test('R4: ~/.agents/no-dispatch-guard turns it off entirely', () => {
  const home = scratchHome();
  const repo = fixtureRepo();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-dispatch-guard'), '');
  const r = decide(BASH('git worktree add ../x', repo), ctxFor(home));
  assert.equal(r.skip, true);
  assert.equal(r.action, 'allow');
});

test('R4: an Agent mandate that names a Worktree: outside the folder is refused', () => {
  const repo = fixtureRepo();
  const home = scratchHome();
  const mandate = (line) => AGENT(repo, `Task: build it.\n${line}\nReport: r.md`);
  for (const [line, leaf] of [
    [`Worktree: ${repo}/../wt-lane`, 'wt-lane'],
    ['Worktree: ../wt-lane', 'wt-lane'],
    ['Worktree: ..\\wt-back', 'wt-back'],
    ['Worktree: .\\wt-dot', 'wt-dot'],
    [`- **Worktree:** \`${path.posix.dirname(repo)}/wt-lane\` (branch build/x)`, 'wt-lane'],
    ['Worktree: C:/Users/someone/Code/wt-lane', 'wt-lane'],
  ]) {
    const r = decide(mandate(line), ctxFor(home));
    assert.deepEqual(r.rule, ['R4'], line);
    assert.equal(r.hardDeny, true);
    assert.match(r.text, /<repo>\/\.claude\/worktrees\/<name>/);
    assert.ok(r.text.endsWith('Off switch: ~/.agents/no-dispatch-guard'));
    assert.ok(r.text.includes(`/.claude/worktrees/${leaf}`), line);
  }
  assert.equal(decide(mandate('Worktree: ../wt-lane'), ctxFor(home)).text,
    r4Text(repo, 'wt-lane'), 'resolved against the call cwd');
});

test('R4: an Agent mandate inside the folder, with no path, or with a non-path value is allowed', () => {
  const repo = fixtureRepo();
  const home = scratchHome();
  const mandate = (line) => AGENT(repo, `Task.\n${line}\n`);
  for (const line of [
    `Worktree: ${repo}/.claude/worktrees/wt-lane`,
    'Worktree: `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-x-wtloc65`',
    'Worktree: ./.claude/worktrees/wt-lane',
    'Worktree: none',
    'Worktree: <path>',
    'Worktree: build/some-branch',
    'a line that merely mentions Worktree: ../not-a-declaration, mid-sentence',
  ]) {
    assert.equal(decide(mandate(line), ctxFor(home)).action, 'allow', line);
  }
  // `isolation: worktree` carries no path: Claude Code creates it in the right place.
  assert.equal(decide(AGENT(repo, 'do the thing', { isolation: 'worktree' }), ctxFor(home)).action, 'allow');
  const send = { tool_name: 'SendMessage', tool_input: { message: 'Worktree: ../x' }, cwd: repo };
  assert.equal(checkAgentWorktree(send), null, 'SendMessage is not an Agent spawn');
});

test('R4 CLI: a refused git worktree add prints a deny (no enforce file) and logs hard_deny; other Bash calls leave no trace', () => {
  const repo = fixtureRepo();
  const home = scratchHome();
  assert.equal(fs.existsSync(path.join(home, '.agents', 'dispatch-guard-enforce')), false);
  const res = runCliProcess(home, JSON.stringify(BASH('git worktree add ../wt-cli -b build/cli', repo)));
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, r4Text(repo, 'wt-cli'));
  const logPath = path.join(home, '.agents', 'ws', 'dispatch-guard.log');
  const logged = JSON.parse(fs.readFileSync(logPath, 'utf8').trim().split('\n').pop());
  assert.deepEqual(logged.rules, ['R4']);
  assert.equal(logged.hard_deny, true);
  assert.equal(logged.tool, 'Bash');

  const quiet = scratchHome();
  const res2 = runCliProcess(quiet, JSON.stringify(BASH('ls -la && git status', repo)));
  assert.equal(res2.status, 0);
  assert.equal(res2.stdout, '', 'an ordinary Bash call prints nothing');
  assert.equal(fs.existsSync(path.join(quiet, '.agents', 'ws', 'dispatch-guard.log')), false, 'and is not logged');
  const res3 = runCliProcess(quiet, JSON.stringify(BASH('git worktree add .claude/worktrees/ok', repo)));
  assert.equal(res3.stdout, '');
});

test('R4: hooks.json routes Bash and PowerShell to this guard, and delete-guard keeps its own group', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'hooks.json'), 'utf8'));
  const groups = cfg.hooks.PreToolUse;
  const dispatch = groups.find((g) => g.hooks.some((h) => h.command.includes('agent-dispatch-guard.mjs')));
  assert.deepEqual(dispatch.matcher.split('|').sort(), ['Agent', 'Bash', 'PowerShell', 'SendMessage']);
  const del = groups.find((g) => g.hooks.some((h) => h.command.includes('delete-guard.mjs')));
  assert.equal(del.matcher, 'Bash|PowerShell');
});

// ─── review round 1 fixes ───

test('R4: a cd / pushd / Set-Location earlier in the same command moves the base the path is judged against', () => {
  const home = scratchHome();
  const repo = fixtureRepo();
  const gitRunner = (args, cwd) => { if (!fs.existsSync(cwd)) throw new Error('no such cwd'); return `${repo}/.git\n`; }; // as real git: a missing cwd fails
  fs.mkdirSync(`${repo}/.claude/worktrees`, { recursive: true });
  const lane = `${repo}/.claude/worktrees/lane`;
  for (const [cmd, tool, leaf] of [
    [`cd ${repo} && git worktree add ../cd-escape -b y`, 'Bash', 'cd-escape'],
    [`Set-Location ${repo}; git worktree add ../sl-escape`, 'PowerShell', 'sl-escape'],
    [`pushd ${repo} && git worktree add ../pd-escape`, 'Bash', 'pd-escape'],
    [`cd "${repo}"\ngit worktree add ../q-escape`, 'Bash', 'q-escape'],
    [`cd ${repo};git worktree add ../semi-escape`, 'Bash', 'semi-escape'],
    [`bash -c "cd ${repo} && git worktree add ../bashc-escape"`, 'Bash', 'bashc-escape'],
  ]) {
    const r = decide(BASH(cmd, lane, tool), ctxFor(home, { gitRunner }));
    assert.deepEqual(r.rule, ['R4'], cmd);
    assert.equal(r.text, r4Text(repo, leaf), cmd);
  }
  // A cd that stays inside the folder is fine, and a cd that cannot be placed is not judged.
  for (const cmd of [
    'cd .claude/worktrees && git worktree add wt-legit',
    'cd -- .claude/worktrees && git worktree add wt-dd',
    'bash -c "cd .claude/worktrees && git worktree add wt-bashc-legit"',
    `echo "x; cd ${repo}/.." ; git worktree add .claude/worktrees/ok`,
    'cd - && git worktree add ../wt-x',
    'cd $WT && git worktree add ../wt-x',
  ]) {
    assert.equal(decide(BASH(cmd, repo), ctxFor(home, { gitRunner })).action, 'allow', cmd);
  }
  // `cd ..` out of the repo lands in a non-repo directory: nothing to judge (real git refuses it).
  assert.equal(decide(BASH('cd .. && git worktree add wt-cd', repo), ctxFor(home)).action, 'allow');
});

test('R4: a Bash line continuation is whitespace, not the path operand', () => {
  const home = scratchHome();
  const repo = fixtureRepo();
  for (const [cmd, tool] of [
    ['git worktree add \\\n  .claude/worktrees/cont -b y', 'Bash'],
    ['git worktree add -b y \\\n  .claude/worktrees/cont2', 'Bash'],
    ['git worktree add \\\r\n  .claude/worktrees/cont3', 'Bash'],
    ['git worktree add `\n  .claude/worktrees/ps-cont -b y', 'PowerShell'],
  ]) {
    assert.equal(decide(BASH(cmd, repo, tool), ctxFor(home)).action, 'allow', JSON.stringify(cmd));
  }
  for (const [cmd, tool] of [
    ['git worktree add \\\n  ../cont-out', 'Bash'],
    ['git worktree add -b y \\\n  ../cont-out', 'Bash'],
    ['git worktree add `\n  ../cont-out', 'PowerShell'],
  ]) {
    const r = decide(BASH(cmd, repo, tool), ctxFor(home));
    assert.equal(r.text, r4Text(repo, 'cont-out'), JSON.stringify(cmd));
  }
  // A bare root operand is a parse miss, not a placement.
  assert.equal(checkBashWorktreeAdd(BASH('git worktree add /', repo), ctxFor(home)), null);
});

test('R4 Agent: the build-loop mid-line mandate, a second Worktree: line and a brief-style bullet are judged; an existing path is not', () => {
  const repo = fixtureRepo();
  const home = scratchHome();
  const outside = `${path.posix.dirname(repo)}/wt-sib`;
  for (const prompt of [
    `Build territory t1. Brief: b.md. Worktree: ${outside}. Gate: node --test x.`,
    `Worktree: none\nWorktree: ${outside}\nReport: r.md`,
    `- Your worktree: ${outside}, branch build/x\n`,
  ]) {
    const r = decide(AGENT(repo, prompt), ctxFor(home));
    assert.deepEqual(r.rule, ['R4'], prompt);
    assert.equal(r.text, r4Text(repo, 'wt-sib'), prompt);
  }
  assert.equal(decide(AGENT(repo, `Build territory t1. Brief: b.md. Worktree: ${repo}/.claude/worktrees/wt-t1. Gate: g.`),
    ctxFor(home)).action, 'allow');
  // A reviewer or cleanup mandate that names a stray worktree which already exists creates nothing.
  fs.mkdirSync(outside, { recursive: true });
  assert.equal(decide(AGENT(repo, `Review it.\nWorktree: ${outside}\n`), ctxFor(home)).action, 'allow');
});

test('R4: executable spellings (Git, a quoted full path to git.exe) are judged, and a # comment is not a command', () => {
  const home = scratchHome();
  const repo = fixtureRepo();
  assert.deepEqual(decide(BASH('Git worktree add ../capital', repo, 'PowerShell'), ctxFor(home)).rule, ['R4']);
  assert.deepEqual(decide(BASH('& "C:\\Program Files\\Git\\cmd\\git.exe" worktree add ../fullpath', repo, 'PowerShell'),
    ctxFor(home)).rule, ['R4']);
  assert.deepEqual(decide(BASH("& 'C:/Program Files/Git/cmd/git.exe' worktree add ../fullpath2", repo, 'PowerShell'),
    ctxFor(home)).rule, ['R4']);
  assert.equal(decide(BASH('& "C:\\Program Files\\Git\\cmd\\git.exe" worktree add .claude/worktrees/ok', repo, 'PowerShell'),
    ctxFor(home)).action, 'allow');
  for (const cmd of [
    'git worktree add .claude/worktrees/x -b y # then later git worktree add ../z',
    '# git worktree add ../z\ngit status',
    'echo "a quoted & path to \\"C:\\Git\\git.exe\\" worktree add ../x"',
  ]) {
    assert.equal(decide(BASH(cmd, repo), ctxFor(home)).action, 'allow', cmd);
  }
  // A multi-line quoted string holding ` #` keeps its closing quote: the git after it is still judged.
  for (const [cmd, leaf] of [
    ['git commit -m "fix: x\nRefs #12"\ngit worktree add ../escape-a', 'escape-a'],
    ['git commit -m "fix: x\nRefs #12" && git worktree add ../escape-b', 'escape-b'],
    ['git commit -m "a\nb # c" && git worktree add ../escape-c', 'escape-c'],
  ]) {
    assert.equal(decide(BASH(cmd, repo), ctxFor(home)).text, r4Text(repo, leaf), cmd);
  }
  // A `#` with no space before it is part of a word, not a comment.
  assert.deepEqual(decide(BASH('git worktree add ../x#frag', repo), ctxFor(home)).rule, ['R4']);
});
