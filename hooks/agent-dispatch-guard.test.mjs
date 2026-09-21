// node --test "hooks/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  decide, checkR1, checkR1b, checkR2, checkR3,
  R1_TEXT, R1B_TEXT, R2_TEXT_BASE, R3_NEG_TEXT, R3_REPORT_TEXT,
} from './agent-dispatch-guard.mjs';
// Shared with skills/multi/scripts: a CLI-subprocess test must never spread process.env
// itself (that is how the running session's own messaging token leaked into a fixture on
// 2026-09-17 — see test-child-env.mjs). childEnv() is the one sanctioned way to build one.
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD_PATH = path.join(HERE, 'agent-dispatch-guard.mjs');

function scratchHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-guard-'));
}

/** Real fs, scratch home with no switch files: enforced:true, skip:false. */
function ctxFor(home, fsImpl = fs) {
  return { home, fsImpl };
}

const AGENT = (over = {}) => ({
  tool_name: 'Agent',
  tool_input: {},
  cwd: process.cwd(),
  session_id: 'abcdefghijklmnop',
  ...over,
});

const SEND = (over = {}) => ({
  tool_name: 'SendMessage',
  tool_input: {},
  cwd: process.cwd(),
  session_id: 'abcdefghijklmnop',
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// R1 — top-tier model on a spawn that is not a review or a stated judgment
// ─────────────────────────────────────────────────────────────────────────────

test('R1: no model key at all does not fire', () => {
  const input = AGENT({ tool_input: { prompt: 'do a thing', subagent_type: 'general-purpose' } });
  assert.equal(checkR1(input), null);
});

test('R1: model sonnet does not fire', () => {
  const input = AGENT({ tool_input: { model: 'sonnet', prompt: 'do a thing' } });
  assert.equal(checkR1(input), null);
});

test('R1: model opus with no review and no judgment denies', () => {
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'do a thing' } });
  const finding = checkR1(input);
  assert.ok(finding);
  assert.equal(finding.type, 'deny');
  assert.equal(finding.text, R1_TEXT);
});

test('R1: a concrete opus id (claude-opus-5) also denies — substring match, not exact "opus"', () => {
  const input = AGENT({ tool_input: { model: 'claude-opus-5', subagent_type: 'general-purpose', prompt: 'x' } });
  assert.ok(checkR1(input));
});

test('R1: model fable denies the same way', () => {
  const input = AGENT({ tool_input: { model: 'fable', subagent_type: 'general-purpose', prompt: 'x' } });
  assert.ok(checkR1(input));
});

test('R1: subagent_type "reviewer" is exempt', () => {
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'reviewer', prompt: 'x' } });
  assert.equal(checkR1(input), null);
});

test('R1: subagent_type "delegation:reviewer" is exempt (namespaced reviewer)', () => {
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'delegation:reviewer', prompt: 'x' } });
  assert.equal(checkR1(input), null);
});

test('R1: subagent_type "reviewer-adjacent" is NOT exempt (must end in ":reviewer" or be exactly "reviewer")', () => {
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'reviewer-adjacent', prompt: 'x' } });
  assert.ok(checkR1(input));
});

test('R1: a JUDGMENT line with 10+ characters of verdict exempts an opus spawn', () => {
  const prompt = 'Some task.\nJUDGMENT: is the new prose voice better than the baseline\nMore text.';
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt } });
  assert.equal(checkR1(input), null);
});

test('R1: a JUDGMENT line that is too short does NOT exempt (boundary)', () => {
  const prompt = 'Some task.\nJUDGMENT: x\nMore text.';
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt } });
  assert.ok(checkR1(input), 'a one-character verdict must not satisfy the 10+ character requirement');
});

test('R1: does not apply to SendMessage', () => {
  const input = SEND({ tool_input: { model: 'opus', message: 'hello' } });
  assert.equal(checkR1(input), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// R1b — states a JUDGMENT but will not run on opus
// ─────────────────────────────────────────────────────────────────────────────

const JUDGMENT_PROMPT = 'Task.\nJUDGMENT: is this draft first-class enough to ship\nMore.';

test('R1b: JUDGMENT line + no model key notes', () => {
  const input = AGENT({ tool_input: { subagent_type: 'general-purpose', prompt: JUDGMENT_PROMPT } });
  const finding = checkR1b(input);
  assert.ok(finding);
  assert.equal(finding.type, 'note');
  assert.equal(finding.text, R1B_TEXT);
});

test('R1b: JUDGMENT line + model sonnet notes', () => {
  const input = AGENT({ tool_input: { model: 'sonnet', subagent_type: 'general-purpose', prompt: JUDGMENT_PROMPT } });
  assert.ok(checkR1b(input));
});

test('R1b: JUDGMENT line + model haiku notes', () => {
  const input = AGENT({ tool_input: { model: 'haiku', subagent_type: 'general-purpose', prompt: JUDGMENT_PROMPT } });
  assert.ok(checkR1b(input));
});

test('R1b: reviewer subagent_type is exempt even with a JUDGMENT line and no model', () => {
  const input = AGENT({ tool_input: { subagent_type: 'reviewer', prompt: JUDGMENT_PROMPT } });
  assert.equal(checkR1b(input), null);
});

test('R1b: does not fire when model is opus (that is R1 territory)', () => {
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: JUDGMENT_PROMPT } });
  assert.equal(checkR1b(input), null);
});

test('R1b: does not fire without a JUDGMENT line', () => {
  const input = AGENT({ tool_input: { prompt: 'Task with no judgment line at all.' } });
  assert.equal(checkR1b(input), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// R2 — round 3+ needs a research line
// ─────────────────────────────────────────────────────────────────────────────

test('R2: "round 2" does not require a research line', () => {
  const input = AGENT({ tool_input: { prompt: 'This is round 2 of the fix.' } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: "Round 3" (capitalized) requires one, and denies without it', () => {
  const input = AGENT({ tool_input: { prompt: 'This is Round 3 of the fix.' } });
  const finding = checkR2(input, fs);
  assert.ok(finding);
  assert.equal(finding.type, 'deny');
  assert.equal(finding.text, R2_TEXT_BASE);
});

test('R2: "round 12" also requires one', () => {
  const input = AGENT({ tool_input: { prompt: 'This is round 12 of the fix.' } });
  assert.ok(checkR2(input, fs));
});

test('R2: "around 3" must NOT trigger the round rule', () => {
  const input = AGENT({ tool_input: { prompt: 'The bug happened around 3 times in the log.' } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: an existing absolute research path passes', () => {
  const home = scratchHome();
  const reportPath = path.join(home, 'report.md');
  fs.writeFileSync(reportPath, 'GREEN', 'utf8');
  const prompt = `Round 3.\nResearch: ${reportPath}\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a missing path denies with a "report not found" suffix', () => {
  const home = scratchHome();
  const missing = path.join(home, 'does-not-exist.md');
  const prompt = `Round 3.\nResearch: ${missing}\n`;
  const input = AGENT({ tool_input: { prompt } });
  const finding = checkR2(input, fs);
  assert.ok(finding);
  assert.match(finding.text, /report not found/);
  assert.ok(finding.text.includes(missing));
});

test('R2: a backticked path is stripped before the existence check', () => {
  const home = scratchHome();
  const reportPath = path.join(home, 'report.md');
  fs.writeFileSync(reportPath, 'GREEN', 'utf8');
  const prompt = `Round 3.\nResearch: \`${reportPath}\`\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a quoted path is stripped before the existence check', () => {
  const home = scratchHome();
  const reportPath = path.join(home, 'report.md');
  fs.writeFileSync(reportPath, 'GREEN', 'utf8');
  const prompt = `Round 3.\nResearch: "${reportPath}"\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a relative path resolves against the hook input cwd', () => {
  const home = scratchHome();
  fs.writeFileSync(path.join(home, 'report.md'), 'GREEN', 'utf8');
  const prompt = 'Round 3.\nResearch: report.md\n';
  const input = AGENT({ tool_input: { prompt }, cwd: home });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a relative path that does not exist under cwd denies', () => {
  const home = scratchHome();
  const prompt = 'Round 3.\nResearch: report.md\n';
  const input = AGENT({ tool_input: { prompt }, cwd: home });
  assert.ok(checkR2(input, fs));
});

test('R2: "not needed, <reason>" with a reason of 10+ characters passes', () => {
  const prompt = 'Round 3.\nResearch: not needed, already covered by prior audit\n';
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: "not needed, <reason>" with a short reason (< 10 chars) still denies', () => {
  const prompt = 'Round 3.\nResearch: not needed, short\n';
  const input = AGENT({ tool_input: { prompt } });
  assert.ok(checkR2(input, fs));
});

test('R2: applies to SendMessage when message is a round-3+ string', () => {
  const input = SEND({ tool_input: { message: 'Round 3 update, no research line here.' } });
  assert.ok(checkR2(input, fs));
});

test('R2: a non-string SendMessage.message (a protocol object) never fires and never throws', () => {
  const input = SEND({ tool_input: { message: { round: 3, kind: 'ASK' } } });
  assert.doesNotThrow(() => checkR2(input, fs));
  assert.equal(checkR2(input, fs), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// R3 — thin mandate: no negative-result authorization, or no report file named
// ─────────────────────────────────────────────────────────────────────────────

const NEG_SENTENCE = 'A result of zero, "not found" or "could not determine" is a good answer.';

test('R3: a prompt of 399 characters never fires, whatever it contains', () => {
  const prompt = 'x'.repeat(399);
  assert.equal(prompt.length, 399);
  const input = AGENT({ tool_input: { prompt } });
  assert.deepEqual(checkR3(input), []);
});

test('R3: a prompt of 401 characters with neither authorization fires both notes', () => {
  const prompt = `${'x'.repeat(401)}`;
  assert.equal(prompt.length, 401);
  const input = AGENT({ tool_input: { prompt } });
  const findings = checkR3(input);
  const ids = findings.map((f) => f.id);
  assert.ok(ids.includes('R3-neg'));
  assert.ok(ids.includes('R3-report'));
  assert.ok(findings.find((f) => f.id === 'R3-neg').text === R3_NEG_TEXT);
  assert.ok(findings.find((f) => f.id === 'R3-report').text === R3_REPORT_TEXT);
});

test('R3: negative-result sentence present suppresses the R3-neg note', () => {
  const prompt = `${NEG_SENTENCE} ${'padding '.repeat(60)}`;
  assert.ok(prompt.length > 400);
  const input = AGENT({ tool_input: { prompt } });
  const ids = checkR3(input).map((f) => f.id);
  assert.ok(!ids.includes('R3-neg'));
});

test('R3: a .md path in the prompt suppresses the R3-report note', () => {
  const prompt = `Report to docs/findings.md. ${'padding '.repeat(60)}`;
  assert.ok(prompt.length > 400);
  const input = AGENT({ tool_input: { prompt } });
  const ids = checkR3(input).map((f) => f.id);
  assert.ok(!ids.includes('R3-report'));
});

test('R3: a fully authorized long prompt fires no notes at all', () => {
  const prompt = `${NEG_SENTENCE} Report: docs/findings.md. ${'padding '.repeat(60)}`;
  assert.ok(prompt.length > 400);
  const input = AGENT({ tool_input: { prompt } });
  assert.deepEqual(checkR3(input), []);
});

test('R3: does not apply to SendMessage', () => {
  const input = SEND({ tool_input: { message: 'x'.repeat(500) } });
  assert.deepEqual(checkR3(input), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// The template must pass R3
// ─────────────────────────────────────────────────────────────────────────────

test('mandate-template.md, used verbatim as an Agent prompt, fires no R3 note', () => {
  const templatePath = path.join(HERE, '..', 'docs', 'mandate-template.md');
  const template = fs.readFileSync(templatePath, 'utf8');
  assert.ok(template.length > 400, 'the template should be long enough for R3 to actually be exercised');
  const input = AGENT({ tool_input: { prompt: template } });
  assert.deepEqual(checkR3(input), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// decide() — ordering, switches, and the full assembled call
// ─────────────────────────────────────────────────────────────────────────────

test('decide: a plain call with nothing to flag allows silently', () => {
  const home = scratchHome();
  const input = AGENT({ tool_input: { prompt: 'do a small thing', subagent_type: 'general-purpose' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'allow');
  assert.deepEqual(result.rule, []);
  assert.equal(result.text, null);
  assert.equal(result.skip, false);
  assert.equal(result.enforced, true);
});

test('decide: R1 deny wins outright even if R2 would also deny on the same call', () => {
  const home = scratchHome();
  const prompt = 'Round 3 of the fix, no research line included here at all.';
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'deny');
  assert.deepEqual(result.rule, ['R1']);
  assert.equal(result.text, R1_TEXT);
});

test('decide: notes accumulate (R1b + R3) into one additionalContext when nothing denies', () => {
  const home = scratchHome();
  const prompt = `Task.\nJUDGMENT: is this good enough to ship as-is\n${'padding '.repeat(60)}`;
  assert.ok(prompt.length > 400);
  const input = AGENT({ tool_input: { subagent_type: 'general-purpose', prompt } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'note');
  assert.ok(result.rule.includes('R1b'));
  assert.ok(result.rule.includes('R3-neg'));
  assert.ok(result.rule.includes('R3-report'));
  assert.ok(result.text.includes(R1B_TEXT));
  assert.ok(result.text.includes(R3_NEG_TEXT));
});

test('decide: rules apply the same for a call issued from inside a subagent (agent_id present)', () => {
  const home = scratchHome();
  const input = AGENT({
    agent_id: 'sub-123',
    agent_type: 'general-purpose',
    tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' },
  });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'deny');
  assert.equal(result.rule[0], 'R1');
});

// ─────────────────────────────────────────────────────────────────────────────
// Switches
// ─────────────────────────────────────────────────────────────────────────────

test('switch: ~/.agents/no-dispatch-guard present skips everything', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-dispatch-guard'), '', 'utf8');
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.skip, true);
  assert.equal(result.action, 'allow');
});

test('switch: ~/.agents/ws-off evaluates and logs as normal but marks enforced:false', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.skip, false);
  assert.equal(result.enforced, false);
  assert.equal(result.action, 'deny');
  assert.equal(result.rule[0], 'R1');
});

test('switch: an unreadable switch path counts as PRESENT (fail toward doing nothing)', () => {
  const home = scratchHome();
  const throwingFs = {
    ...fs,
    existsSync(p) {
      if (String(p).endsWith('no-dispatch-guard')) throw new Error('EACCES simulated');
      return fs.existsSync(p);
    },
  };
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home, throwingFs));
  assert.equal(result.skip, true, 'an unreadable no-dispatch-guard path must be treated as present');
});

test('switch: an unreadable ws-off path counts as PRESENT (observe-only, fails toward doing nothing)', () => {
  const home = scratchHome();
  const throwingFs = {
    ...fs,
    existsSync(p) {
      if (String(p).endsWith('ws-off')) throw new Error('EACCES simulated');
      return fs.existsSync(p);
    },
  };
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home, throwingFs));
  assert.equal(result.enforced, false);
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

test('CLI: garbage stdin exits 0 with empty stdout', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: 'not json at all {{{' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('CLI: a denying Agent input, piped through the real wrapper, prints the deny JSON', () => {
  const home = scratchHome();
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'do the thing' },
    cwd: process.cwd(),
    session_id: 'e2e-session-id',
  });
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /dispatch-guard R1/);

  const logPath = path.join(home, '.agents', 'ws', 'dispatch-guard.log');
  const logLine = JSON.parse(fs.readFileSync(logPath, 'utf8').trim().split('\n').pop());
  assert.equal(logLine.action, 'deny');
  assert.equal(logLine.enforced, true);
  assert.deepEqual(logLine.rules, ['R1']);
});

test('CLI: with ws-off present, the same denying input prints nothing but logs enforced:false', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'do the thing' },
    cwd: process.cwd(),
    session_id: 'e2e-session-id-2',
  });
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');

  const logPath = path.join(home, '.agents', 'ws', 'dispatch-guard.log');
  const logLine = JSON.parse(fs.readFileSync(logPath, 'utf8').trim().split('\n').pop());
  assert.equal(logLine.enforced, false);
  assert.equal(logLine.action, 'deny');
});

test('CLI: with no-dispatch-guard present, prints nothing and writes no log file at all', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-dispatch-guard'), '', 'utf8');
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'do the thing' },
    cwd: process.cwd(),
    session_id: 'e2e-session-id-3',
  });
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'ws', 'dispatch-guard.log')), false);
});

test('CLI: the log line never contains prompt text, even when the prompt has a unique marker', () => {
  const home = scratchHome();
  const marker = 'UNIQUE-MARKER-STRING-7f3a9';
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: `do the thing ${marker}` },
    cwd: process.cwd(),
    session_id: 'e2e-session-id-4',
  });
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  const logPath = path.join(home, '.agents', 'ws', 'dispatch-guard.log');
  const logText = fs.readFileSync(logPath, 'utf8');
  assert.ok(!logText.includes(marker), 'the log must never carry prompt text');
});

test('CLI: session id is truncated to its first 8 characters in the log', () => {
  const home = scratchHome();
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' },
    cwd: process.cwd(),
    session_id: 'abcdefghijklmnopqrstuvwxyz',
  });
  runCliProcess({ home, input: payload });
  const logPath = path.join(home, '.agents', 'ws', 'dispatch-guard.log');
  const logLine = JSON.parse(fs.readFileSync(logPath, 'utf8').trim().split('\n').pop());
  assert.equal(logLine.session, 'abcdefgh');
});
