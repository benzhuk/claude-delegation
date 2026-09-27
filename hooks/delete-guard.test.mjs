// node --test "hooks/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { decide, detectDelete, reasonText } from './delete-guard.mjs';
// Shared with skills/multi/scripts and hooks/agent-dispatch-guard.test.mjs: a CLI-subprocess
// test must never spread process.env itself — childEnv() is the one sanctioned way to build
// a child environment (see test-child-env.mjs for why).
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD_PATH = path.join(HERE, 'delete-guard.mjs');

function scratchHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'delete-guard-'));
}

function ctxFor(home, fsImpl = fs) {
  return { home, fsImpl };
}

const LEAD = (command, over = {}) => ({
  tool_name: 'Bash',
  tool_input: { command },
  cwd: process.cwd(),
  session_id: 'abcdefghijklmnop',
  ...over,
});

const SUBAGENT = (command, over = {}) => ({
  tool_name: 'Bash',
  tool_input: { command },
  cwd: process.cwd(),
  session_id: 'abcdefghijklmnop',
  agent_id: 'sub-123',
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// Every verb form (spec item 3 / acceptance attack brief)
// ─────────────────────────────────────────────────────────────────────────────

const RM_FORMS = [
  'rm -rf SCRATCH/dg',
  'rm -r -f SCRATCH/dg',
  'rm -fr SCRATCH/dg',
  'rm --recursive SCRATCH/dg',
  '\\rm -rf SCRATCH/dg',
  'command rm -rf SCRATCH/dg',
  'sudo rm -rf SCRATCH/dg',
  'xargs rm -rf SCRATCH/dg',
  'sh -c "rm -rf x"',
  'mkdir -p SCRATCH/dg && rm -rf SCRATCH/dg',
];

for (const command of RM_FORMS) {
  test(`detectDelete: rm form matches — ${command}`, () => {
    const found = detectDelete(command);
    assert.ok(found, `expected a match for: ${command}`);
    assert.equal(found.verb, 'rm -r');
  });
}

test('detectDelete: rmdir /s matches', () => {
  const found = detectDelete('rmdir /s /q C:\\scratch\\dg');
  assert.ok(found);
  assert.equal(found.verb, 'rmdir /s');
});

test('detectDelete: rd /s matches', () => {
  const found = detectDelete('rd /s /q C:\\scratch\\dg');
  assert.ok(found);
  assert.equal(found.verb, 'rd /s');
});

test('detectDelete: PowerShell "ri -r" matches (unambiguous -Recurse abbreviation)', () => {
  const found = detectDelete('ri -r SCRATCH/dg');
  assert.ok(found);
  assert.match(found.verb, /ri -Recurse/);
});

test('detectDelete: PowerShell "Remove-Item -Recurse:$true" matches', () => {
  const found = detectDelete('Remove-Item -Recurse:$true SCRATCH/dg');
  assert.ok(found);
  assert.match(found.verb, /Remove-Item -Recurse/);
});

test('detectDelete: "gci | ri -r" matches through a pipe', () => {
  const found = detectDelete('gci SCRATCH/dg | ri -r');
  assert.ok(found);
});

test('detectDelete: "del -Recurse" matches', () => {
  const found = detectDelete('del -Recurse SCRATCH/dg');
  assert.ok(found);
});

test('detectDelete: "erase -r" matches', () => {
  const found = detectDelete('erase -r SCRATCH/dg');
  assert.ok(found);
});

test('detectDelete: git clean -fd matches', () => {
  const found = detectDelete('git clean -fd');
  assert.ok(found);
  assert.equal(found.verb, 'git clean');
});

test('detectDelete: git clean -xdf matches', () => {
  const found = detectDelete('git clean -xdf');
  assert.ok(found);
});

test('detectDelete: git clean --force matches', () => {
  const found = detectDelete('git clean --force');
  assert.ok(found);
});

test('detectDelete: git worktree remove --force matches', () => {
  const found = detectDelete('git worktree remove --force ../wt-old');
  assert.ok(found);
  assert.equal(found.verb, 'git worktree remove --force');
});

test('detectDelete: git worktree remove -f (short form of --force) matches — review r1 MAJOR 1', () => {
  const found = detectDelete('git worktree remove -f ../wt-old');
  assert.ok(found);
  assert.equal(found.verb, 'git worktree remove --force');
});

test('allowance: "git worktree remove ../wt-fix" (hyphenated path, no flag) still passes — review r1 MAJOR 1', () => {
  assert.equal(detectDelete('git worktree remove ../wt-fix'), null);
});

test('detectDelete: git worktree prune matches', () => {
  const found = detectDelete('git worktree prune');
  assert.ok(found);
  assert.equal(found.verb, 'git worktree prune');
});

// ─────────────────────────────────────────────────────────────────────────────
// `git -C <path>` / global-option prefixes (review r1 MAJOR 2)
// ─────────────────────────────────────────────────────────────────────────────

test('detectDelete: "git -C ../wt clean -fdx" matches through a -C prefix', () => {
  const found = detectDelete('git -C ../wt clean -fdx');
  assert.ok(found);
  assert.equal(found.verb, 'git clean');
});

test('detectDelete: "git -c core.x=y clean -fd" matches through a -c prefix', () => {
  const found = detectDelete('git -c core.x=y clean -fd');
  assert.ok(found);
});

test('detectDelete: \'git -C "C:/a b" worktree remove --force x\' matches through a quoted -C path', () => {
  const found = detectDelete('git -C "C:/a b" worktree remove --force x');
  assert.ok(found);
  assert.equal(found.verb, 'git worktree remove --force');
});

test('detectDelete: "git --no-pager -C x worktree prune" matches through stacked global options', () => {
  const found = detectDelete('git --no-pager -C x worktree prune');
  assert.ok(found);
  assert.equal(found.verb, 'git worktree prune');
});

test('allowance: "git -C x status" passes (no delete verb at all)', () => {
  assert.equal(detectDelete('git -C x status'), null);
});

test('detectDelete: find -delete matches', () => {
  const found = detectDelete('find . -type f -name "*.tmp" -delete');
  assert.ok(found);
  assert.equal(found.verb, 'find -delete');
});

test('detectDelete: a here-doc-shaped "rm -rf" still matches literally (regex sees the string, not execution semantics)', () => {
  const found = detectDelete('cat <<EOF > script.sh\nrm -rf SCRATCH/dg\nEOF\nbash script.sh');
  assert.ok(found);
});

// ─────────────────────────────────────────────────────────────────────────────
// Line-continuation normalization (review r1 m3) — a backslash- or backtick-newline
// must not hide a flag on the next physical line.
// ─────────────────────────────────────────────────────────────────────────────

test('detectDelete: a bash backslash line continuation before -rf still matches', () => {
  const found = detectDelete('rm \\\n  -rf SCRATCH/dg');
  assert.ok(found, 'the flag on the continuation line must still be seen');
});

test('detectDelete: a bash backslash line continuation before --force still matches', () => {
  const found = detectDelete('git worktree remove \\\n --force ../wt-old');
  assert.ok(found);
});

test('detectDelete: a PowerShell backtick line continuation still matches', () => {
  const found = detectDelete('Remove-Item -Path ./SCRATCH/dg `\n -Recurse');
  assert.ok(found);
});

// ─────────────────────────────────────────────────────────────────────────────
// Every verb form, matched in a COMPOUND command (spec item 6 / review r1 m6) — only
// the `rm` forms and one other case exercised this above; every remaining verb gets its
// own compound-command test here (`git status && <form>`), same command shape that bit
// the real incidents.
// ─────────────────────────────────────────────────────────────────────────────

const COMPOUND_FORMS = [
  ['rmdir /s /q C:\\scratch\\dg', 'rmdir /s'],
  ['rd /s /q C:\\scratch\\dg', 'rd /s'],
  ['ri -r SCRATCH/dg', /ri -Recurse/],
  ['Remove-Item -Recurse:$true SCRATCH/dg', /Remove-Item -Recurse/],
  ['del -Recurse SCRATCH/dg', /del -Recurse/],
  ['erase -r SCRATCH/dg', /erase -Recurse/],
  ['git clean -fd', 'git clean'],
  ['git clean -xdf', 'git clean'],
  ['git clean --force', 'git clean'],
  ['git worktree remove --force ../wt-old', 'git worktree remove --force'],
  ['git worktree prune', 'git worktree prune'],
  ['find . -type f -name "*.tmp" -delete', 'find -delete'],
];

for (const [form, expectedVerb] of COMPOUND_FORMS) {
  test(`detectDelete: compound command still matches — git status && ${form}`, () => {
    const found = detectDelete(`git status && ${form}`);
    assert.ok(found, `expected a match for: git status && ${form}`);
    if (expectedVerb instanceof RegExp) {
      assert.match(found.verb, expectedVerb);
    } else {
      assert.equal(found.verb, expectedVerb);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowances (spec item 3, pinned by tests)
// ─────────────────────────────────────────────────────────────────────────────

test('allowance: "git worktree remove <path>" without --force passes', () => {
  assert.equal(detectDelete('git worktree remove ../wt-old'), null);
});

test('allowance: "git branch -d" passes', () => {
  assert.equal(detectDelete('git branch -d feature/x'), null);
});

test('allowance: "git branch -D" passes', () => {
  assert.equal(detectDelete('git branch -D feature/x'), null);
});

test('allowance: "rm -f file" (no recursive flag) passes', () => {
  assert.equal(detectDelete('rm -f file.txt'), null);
});

test('allowance: "git clean -n" (dry run only) passes', () => {
  assert.equal(detectDelete('git clean -n'), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Flag must start a token, not appear mid-word (review r1 MAJOR 3) — a hyphenated
// PATH must never be mistaken for a flag group containing "r".
// ─────────────────────────────────────────────────────────────────────────────

test('allowance: "rm -f hooks/delete-guard.log" passes (hyphenated path, not a flag)', () => {
  assert.equal(detectDelete('rm -f hooks/delete-guard.log'), null);
});

test('allowance: "rm -f /tmp/test-results.json" passes (hyphenated scratch path)', () => {
  assert.equal(detectDelete('rm -f /tmp/test-results.json'), null);
});

test('allowance: "docker rm -f my-container" passes ("rm" here is the docker subcommand word, but the guard has no docker context and this is still not recursive)', () => {
  assert.equal(detectDelete('docker rm -f my-container'), null);
});

test('allowance: "npm rm react-router" passes', () => {
  assert.equal(detectDelete('npm rm react-router'), null);
});

test('allowance: "rm --force file.txt" (long form, no recursive) passes', () => {
  assert.equal(detectDelete('rm --force file.txt'), null);
});

test('allowance: "cat docs/rm-report.md" passes (no rm word boundary match at all)', () => {
  assert.equal(detectDelete('cat docs/rm-report.md'), null);
});

test('allowance: "git clean --dry-run" passes ("-dry" is not a real flag group; -n/--dry-run only)', () => {
  assert.equal(detectDelete('git clean --dry-run'), null);
});

test('detectDelete: a quote-split flag rm -r"f" x still denies (evasion attempt)', () => {
  const found = detectDelete('rm -r"f" x');
  assert.ok(found, 'a bare -r flag group must still deny even if a later quote follows it');
});

test('detectDelete: "rm x -Recurse:$true" (PowerShell alias abuse of the word rm) still denies', () => {
  const found = detectDelete('rm x -Recurse:$true');
  assert.ok(found);
});

// ─────────────────────────────────────────────────────────────────────────────
// PowerShell rmdir/rd -Recurse (review r1 MAJOR 4)
// ─────────────────────────────────────────────────────────────────────────────

test('detectDelete: "rmdir C:\\scratch\\dg -Recurse -Force" matches (PowerShell Remove-Item alias)', () => {
  const found = detectDelete('rmdir C:\\scratch\\dg -Recurse -Force');
  assert.ok(found);
  assert.match(found.verb, /rmdir -Recurse/);
});

test('detectDelete: "rd C:\\x -Recurse" matches (PowerShell Remove-Item alias)', () => {
  const found = detectDelete('rd C:\\x -Recurse');
  assert.ok(found);
  assert.match(found.verb, /rd -Recurse/);
});

test('detectDelete: "rmdir /s /q x" still labeled as the Windows-cmd verb, not the PowerShell one', () => {
  const found = detectDelete('rmdir /s /q C:\\scratch\\dg');
  assert.ok(found);
  assert.equal(found.verb, 'rmdir /s');
});

// ─────────────────────────────────────────────────────────────────────────────
// Quoted-argument exceptions (spec item 3 / acceptance false-refusal list)
// ─────────────────────────────────────────────────────────────────────────────

test('quoted: grep -n "rm -rf" file passes (never a delete)', () => {
  assert.equal(detectDelete('grep -n "rm -rf" file'), null);
});

test('quoted: echo "rm -rf /" passes', () => {
  assert.equal(detectDelete('echo "rm -rf /"'), null);
});

test('quoted: printf "%s" "rm -rf /" passes', () => {
  assert.equal(detectDelete('printf "%s" "rm -rf /"'), null);
});

test('quoted: a commit message quoting it passes', () => {
  assert.equal(detectDelete('git commit -m "fix: never run rm -rf again"'), null);
});

test('quoted: note-send --text "..." passes', () => {
  assert.equal(detectDelete('note-send --text "warned peer about rm -rf incident"'), null);
});

test('quoted: single-quoted form also passes', () => {
  assert.equal(detectDelete("echo 'rm -rf /'"), null);
});

test('quoted: sh -c "rm -rf x" is NOT exempted (sh is not on the safe-command list, and it really executes it)', () => {
  const found = detectDelete('sh -c "rm -rf x"');
  assert.ok(found, 'sh -c is not a safe display/commit command; the quoted content is a real delete');
});

test('quoted: echo "rm -rf x" piped into sh is NOT exempted — it really executes (review r1 m1)', () => {
  const found = detectDelete('echo "rm -rf SCRATCH/dg" | sh');
  assert.ok(found, 'a safe-command quote piped into an interpreter really executes');
});

test('quoted: echo \'rm -rf x\' piped into bash is NOT exempted (review r1 m1)', () => {
  const found = detectDelete("echo 'rm -rf x' | bash");
  assert.ok(found);
});

test('quoted: a command substitution inside a safe double-quoted arg is NOT exempted — it really executes (review r1 m2)', () => {
  const found = detectDelete('echo "cleaning $(rm -rf build)"');
  assert.ok(found, 'a $(...) substitution inside a double-quoted echo argument really runs');
});

test('quoted: a command substitution inside a quoted commit message is NOT exempted (review r1 m2)', () => {
  const found = detectDelete('git commit -m "x $(rm -rf build)"');
  assert.ok(found);
});

// ─────────────────────────────────────────────────────────────────────────────
// decide() — agent_id scoping (spec item 4), kill switches, log verbs
// ─────────────────────────────────────────────────────────────────────────────

test('decide: a subagent Bash call with a recursive delete denies', () => {
  const home = scratchHome();
  const input = SUBAGENT('rm -rf SCRATCH/dg');
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'deny');
  assert.equal(result.logVerb, 'denied');
  assert.match(result.text, /delete-guard: recursive delete refused for an agent \(rm -r\)/);
});

test('decide: the lead session (no agent_id) with the same command passes, logged as passed-lead', () => {
  const home = scratchHome();
  const input = LEAD('rm -rf SCRATCH/dg');
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'allow');
  assert.equal(result.logVerb, 'passed-lead');
});

test('decide: a command that matches nothing is never logged, from either caller', () => {
  const home = scratchHome();
  assert.equal(decide(LEAD('ls -la'), ctxFor(home)).logVerb, null);
  assert.equal(decide(SUBAGENT('ls -la'), ctxFor(home)).logVerb, null);
});

test('decide: reason text names the matched verb', () => {
  const home = scratchHome();
  const result = decide(SUBAGENT('git worktree prune'), ctxFor(home));
  assert.equal(result.action, 'deny');
  assert.equal(result.text, reasonText('git worktree prune'));
  assert.match(result.text, /\(git worktree prune\)/);
});

test('decide: kill switch ~/.agents/no-delete-guard skips everything', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-delete-guard'), '', 'utf8');
  const result = decide(SUBAGENT('rm -rf SCRATCH/dg'), ctxFor(home));
  assert.equal(result.skip, true);
  assert.equal(result.action, 'allow');
  assert.equal(result.logVerb, null);
});

test('decide: shared kill switch ~/.agents/ws-off also skips everything', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
  const result = decide(SUBAGENT('rm -rf SCRATCH/dg'), ctxFor(home));
  assert.equal(result.skip, true);
  assert.equal(result.logVerb, null);
});

test('decide: an unreadable kill-switch path counts as PRESENT (fail toward doing nothing = skip)', () => {
  const home = scratchHome();
  const throwingFs = {
    ...fs,
    existsSync(p) {
      if (String(p).endsWith('no-delete-guard')) throw new Error('EACCES simulated');
      return fs.existsSync(p);
    },
  };
  const result = decide(SUBAGENT('rm -rf SCRATCH/dg'), ctxFor(home, throwingFs));
  assert.equal(result.skip, true);
});

test('decide: agent_id: null or "" still counts as present and denies (review r1 NIT — a decision, not an accident: `!== undefined` refuses more)', () => {
  const home = scratchHome();
  const command = 'rm -rf SCRATCH/dg';
  for (const agentId of [null, '']) {
    const result = decide({ tool_name: 'Bash', tool_input: { command }, agent_id: agentId }, ctxFor(home));
    assert.equal(result.action, 'deny');
  }
});

test('decide: a missing/non-string command allows with no log, never throws', () => {
  const home = scratchHome();
  assert.doesNotThrow(() => decide(SUBAGENT(undefined), ctxFor(home)));
  const result = decide({ tool_name: 'Bash', tool_input: {}, agent_id: 'x' }, ctxFor(home));
  assert.equal(result.action, 'allow');
  assert.equal(result.logVerb, null);
});

test('decide: a PowerShell-shaped input (tool_name PowerShell) never throws, matches the same field', () => {
  const home = scratchHome();
  const input = { tool_name: 'PowerShell', tool_input: { command: 'Remove-Item -Recurse ./x' }, agent_id: 'sub-1' };
  assert.doesNotThrow(() => decide(input, ctxFor(home)));
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'deny');
});

test('decide: a malformed non-object input never throws and allows', () => {
  const home = scratchHome();
  for (const bad of [null, undefined, 42, 'a string', [], true]) {
    assert.doesNotThrow(() => decide(bad, ctxFor(home)));
    const result = decide(bad, ctxFor(home));
    assert.equal(result.action, 'allow');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// The CLI wrapper (subprocess-level checks; everything above is unit-level via decide())
// ─────────────────────────────────────────────────────────────────────────────

function runCliProcess({ home, input }) {
  return spawnSync(process.execPath, [GUARD_PATH], {
    input: input === undefined ? '' : input,
    env: childEnv(home),
    encoding: 'utf8',
  });
}

function readLog(home) {
  const logPath = path.join(home, '.agents', 'notes', 'delete-guard.log');
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, 'utf8').trim().split('\n').pop();
}

const SUBAGENT_PAYLOAD = (command, over = {}) => JSON.stringify({
  tool_name: 'Bash',
  tool_input: { command },
  cwd: process.cwd(),
  session_id: 'e2e-session-id',
  agent_id: 'sub-e2e',
  ...over,
});

const LEAD_PAYLOAD = (command, over = {}) => JSON.stringify({
  tool_name: 'Bash',
  tool_input: { command },
  cwd: process.cwd(),
  session_id: 'e2e-session-id',
  ...over,
});

test('CLI: garbage stdin exits 0 with empty stdout and writes no log', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: 'not json at all {{{' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(readLog(home), null);
});

test('CLI: empty stdin exits 0 with empty stdout', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: '' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('CLI: a subagent recursive delete prints the deny JSON and logs "denied"', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: SUBAGENT_PAYLOAD('rm -rf SCRATCH/dg') });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /delete-guard: recursive delete refused for an agent \(rm -r\)/);
  const logLine = readLog(home);
  assert.match(logLine, /^\S+ denied \[rm -r\] rm -rf SCRATCH\/dg$/);
});

test('CLI: the lead session (no agent_id) prints nothing and logs "passed-lead"', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: LEAD_PAYLOAD('rm -rf SCRATCH/dg') });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  const logLine = readLog(home);
  assert.match(logLine, /^\S+ passed-lead \[rm -r\] rm -rf SCRATCH\/dg$/);
});

test('CLI: a non-matching command prints nothing and writes no log at all', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: SUBAGENT_PAYLOAD('ls -la') });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes', 'delete-guard.log')), false);
});

test('CLI: kill switch ~/.agents/no-delete-guard prints nothing and writes no log', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-delete-guard'), '', 'utf8');
  const result = runCliProcess({ home, input: SUBAGENT_PAYLOAD('rm -rf SCRATCH/dg') });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes', 'delete-guard.log')), false);
});

test('CLI: shared kill switch ~/.agents/ws-off prints nothing and writes no log', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
  const result = runCliProcess({ home, input: SUBAGENT_PAYLOAD('rm -rf SCRATCH/dg') });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes', 'delete-guard.log')), false);
});

test('CLI (review r1 m4): a multi-line command produces a single log line, no embedded newline', () => {
  const home = scratchHome();
  const multiline = 'rm \\\n  -rf SCRATCH/dg';
  const result = runCliProcess({ home, input: SUBAGENT_PAYLOAD(multiline) });
  assert.equal(result.status, 0);
  const raw = fs.readFileSync(path.join(home, '.agents', 'notes', 'delete-guard.log'), 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 1, 'a multi-line command must still be exactly one log line');
});

test('CLI (log-leak cap): a long command is capped at 80 characters in the log, never logged whole', () => {
  const home = scratchHome();
  const longSecretish = `rm -rf SCRATCH/dg --token=${'S'.repeat(200)}`;
  const result = runCliProcess({ home, input: SUBAGENT_PAYLOAD(longSecretish) });
  assert.equal(result.status, 0);
  const logLine = readLog(home);
  assert.ok(!logLine.includes('S'.repeat(200)), 'the log must never carry the full command');
  // "<stamp> denied [rm -r] " prefix, then at most 80 chars of the command.
  const snippet = logLine.replace(/^\S+ denied \[rm -r\] /, '');
  assert.ok(snippet.length <= 80, `expected snippet <= 80 chars, got ${snippet.length}`);
});

test('CLI: a PowerShell-shaped payload (tool_name PowerShell) is denied the same way', () => {
  const home = scratchHome();
  const payload = JSON.stringify({
    tool_name: 'PowerShell',
    tool_input: { command: 'Remove-Item -Recurse:$true ./SCRATCH/dg' },
    cwd: process.cwd(),
    session_id: 'e2e-ps',
    agent_id: 'sub-ps',
  });
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('CLI: an allowed git worktree remove (no --force) from a subagent prints nothing and logs nothing (allowance)', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: SUBAGENT_PAYLOAD('git worktree remove ../wt-old') });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'notes', 'delete-guard.log')), false);
});
