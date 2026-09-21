// node --test "hooks/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  decide, checkR1, checkR1b, checkR2, checkR3, checkRoundMention,
  R1_TEXT, R1B_TEXT, R2_TEXT_BASE, R3_NEG_TEXT, R3_REPORT_TEXT,
} from './agent-dispatch-guard.mjs';
// Shared with skills/multi/scripts: a CLI-subprocess test must never spread process.env
// itself (that is how the running session's own messaging token leaked into a fixture on
// 2026-09-17 — see test-child-env.mjs). childEnv() is the one sanctioned way to build one.
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD_PATH = path.join(HERE, 'agent-dispatch-guard.mjs');
const TEMPLATE_PATH = path.join(HERE, '..', 'docs', 'mandate-template.md');

function scratchHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-guard-'));
}

/** A scratch home with no switch files at all: the round-1 default — observe-only. */
function ctxFor(home, fsImpl = fs) {
  return { home, fsImpl };
}

/** A scratch home with the enforce-gate file present (and no ws-off): enforced:true. */
function enforcedHome() {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'dispatch-guard-enforce'), '', 'utf8');
  return home;
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
// R2 — a DECLARED round of 3+ needs a research line (round-1 rewrite: BLOCKER 1,
// BLOCKER 2, MAJOR 1, MAJOR 5, MINOR N1). A prompt that merely MENTIONS a round number
// in prose is never denied — see the roundMention section below.
// ─────────────────────────────────────────────────────────────────────────────

test('R2: "Round: 2" is declared but below the threshold — no research required', () => {
  const input = AGENT({ tool_input: { prompt: 'Round: 2\nStill iterating.' } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: "Round: 3" declared requires research, and denies without it', () => {
  const input = AGENT({ tool_input: { prompt: 'Round: 3\nNo research line here.' } });
  const finding = checkR2(input, fs);
  assert.ok(finding);
  assert.equal(finding.type, 'deny');
  assert.equal(finding.text, R2_TEXT_BASE);
});

test('R2: "Round: 12" declared also requires one', () => {
  const input = AGENT({ tool_input: { prompt: 'Round: 12\nNo research line here.' } });
  assert.ok(checkR2(input, fs));
});

test('R2: a bulleted declaration ("- Round: 4") fires the same as a bare one', () => {
  const input = AGENT({ tool_input: { prompt: '- Round: 4\nNo research line here.' } });
  assert.ok(checkR2(input, fs));
});

test('R2: a bold-markdown declaration ("**Round:** 5") fires', () => {
  const input = AGENT({ tool_input: { prompt: '**Round:** 5\nNo research line here.' } });
  assert.ok(checkR2(input, fs));
});

test('R2: a blockquoted declaration ("> Round: 6") fires', () => {
  const input = AGENT({ tool_input: { prompt: '> Round: 6\nNo research line here.' } });
  assert.ok(checkR2(input, fs));
});

test('R2: "around 3" must NOT trigger the round rule (unchanged from round 0)', () => {
  const input = AGENT({ tool_input: { prompt: 'The bug happened around 3 times in the log.' } });
  assert.equal(checkR2(input, fs), null);
});

// BLOCKER 2 / MINOR N1 — the whole point of the rewrite: prose that merely mentions a
// round number, including a report heading with no colon, must never deny.
test('R2 (BLOCKER 2): a prose sentence quoting "Round 3" (no colon) never denies', () => {
  const input = AGENT({ tool_input: { prompt: 'This is Round 3 of the fix.' } });
  assert.equal(checkR2(input, fs), null);
});

test('R2 (BLOCKER 2): "This is round 12 of the fix." (prose) never denies', () => {
  const input = AGENT({ tool_input: { prompt: 'This is round 12 of the fix.' } });
  assert.equal(checkR2(input, fs), null);
});

test('R2 (BLOCKER 2): a pasted report heading "Round 3 findings" (no colon) never denies', () => {
  const input = AGENT({ tool_input: { prompt: 'Round 3 findings\n\nEverything passed.' } });
  assert.equal(checkR2(input, fs), null);
});

test('R2 (BLOCKER 2): a code fence containing "fix round 3" never denies', () => {
  const input = AGENT({ tool_input: { prompt: 'See the log:\n```\nfix round 3 reintroduced the bug\n```' } });
  assert.equal(checkR2(input, fs), null);
});

test('R2 (BLOCKER 2): applies to SendMessage — a declared round denies, prose mentioning one does not', () => {
  const declared = SEND({ tool_input: { message: 'Round: 3\nNo research line here.' } });
  assert.ok(checkR2(declared, fs), 'a declared round-3 SendMessage must still require research');
  const prose = SEND({ tool_input: { message: 'Round 3 update, no research line here.' } });
  assert.equal(checkR2(prose, fs), null, 'prose mentioning a round must never deny a SendMessage');
});

test('R2 (BLOCKER 2): the R2 deny text itself, pasted into a retry prompt, does not re-trigger R2', () => {
  const prompt = `Retrying after this error from the previous attempt:\n\n${R2_TEXT_BASE}\n\nPlease proceed.`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2 (MAJOR 1): the "not needed" example quoted inside the deny text itself passes the length check', () => {
  const match = /Research: not needed, ([^"]+)"/.exec(R2_TEXT_BASE);
  assert.ok(match, 'expected to find the not-needed example inside R2_TEXT_BASE');
  assert.ok(match[1].length >= 10, 'the shipped example itself must clear its own minimum');
  const prompt = `Round: 3\nResearch: not needed, ${match[1]}\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: an existing absolute research path passes', () => {
  const home = scratchHome();
  const reportPath = path.join(home, 'report.md');
  fs.writeFileSync(reportPath, 'GREEN', 'utf8');
  const prompt = `Round: 3.\nResearch: ${reportPath}\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a missing path denies with a "report not found" suffix', () => {
  const home = scratchHome();
  const missing = path.join(home, 'does-not-exist.md');
  const prompt = `Round: 3.\nResearch: ${missing}\n`;
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
  const prompt = `Round: 3.\nResearch: \`${reportPath}\`\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a quoted path is stripped before the existence check', () => {
  const home = scratchHome();
  const reportPath = path.join(home, 'report.md');
  fs.writeFileSync(reportPath, 'GREEN', 'utf8');
  const prompt = `Round: 3.\nResearch: "${reportPath}"\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a relative path resolves against the hook input cwd', () => {
  const home = scratchHome();
  fs.writeFileSync(path.join(home, 'report.md'), 'GREEN', 'utf8');
  const prompt = 'Round: 3.\nResearch: report.md\n';
  const input = AGENT({ tool_input: { prompt }, cwd: home });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a relative path that does not exist under cwd denies', () => {
  const home = scratchHome();
  const prompt = 'Round: 3.\nResearch: report.md\n';
  const input = AGENT({ tool_input: { prompt }, cwd: home });
  assert.ok(checkR2(input, fs));
});

test('R2: "not needed, <reason>" with a reason of 10+ characters passes', () => {
  const prompt = 'Round: 3.\nResearch: not needed, already covered by prior audit\n';
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: "not needed, <reason>" with a short reason (< 10 chars) still denies', () => {
  const prompt = 'Round: 3.\nResearch: not needed, short\n';
  const input = AGENT({ tool_input: { prompt } });
  assert.ok(checkR2(input, fs));
});

test('R2 (MAJOR 5): a bulleted Research line ("- Research: path") is accepted', () => {
  const home = scratchHome();
  const reportPath = path.join(home, 'report.md');
  fs.writeFileSync(reportPath, 'GREEN', 'utf8');
  const prompt = `Round: 3\n- Research: ${reportPath}\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2 (MAJOR 5): a bold-markdown Research line ("**Research:** path") is accepted', () => {
  const home = scratchHome();
  const reportPath = path.join(home, 'report.md');
  fs.writeFileSync(reportPath, 'GREEN', 'utf8');
  const prompt = `Round: 3\n**Research:** ${reportPath}\n`;
  const input = AGENT({ tool_input: { prompt } });
  assert.equal(checkR2(input, fs), null);
});

test('R2: a non-string SendMessage.message (a protocol object) never fires and never throws', () => {
  const input = SEND({ tool_input: { message: { round: 3, kind: 'ASK' } } });
  assert.doesNotThrow(() => checkR2(input, fs));
  assert.equal(checkR2(input, fs), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// roundMention — measurement without action (round-1 ruling): the OLD free-text
// pattern, recorded in the log only, never denies and never notes.
// ─────────────────────────────────────────────────────────────────────────────

test('roundMention: true for prose that mentions a round without declaring one', () => {
  const input = AGENT({ tool_input: { prompt: 'This is Round 3 of the fix.' } });
  assert.equal(checkRoundMention(input), true);
});

test('roundMention: false for "around 3" (never a mention, never a declaration)', () => {
  const input = AGENT({ tool_input: { prompt: 'The bug happened around 3 times.' } });
  assert.equal(checkRoundMention(input), false);
});

test('roundMention: false once a round is actually declared (the declaration IS the signal, not a bare mention)', () => {
  const input = AGENT({ tool_input: { prompt: 'Round: 3\nResearch: not needed, delta review only, no new class' } });
  assert.equal(checkRoundMention(input), false);
});

test('roundMention: false below the round-3 threshold', () => {
  const input = AGENT({ tool_input: { prompt: 'This is round 2 of the fix.' } });
  assert.equal(checkRoundMention(input), false);
});

test('roundMention: works for SendMessage too, string message only', () => {
  const stringMsg = SEND({ tool_input: { message: 'Round 3 update, still going.' } });
  assert.equal(checkRoundMention(stringMsg), true);
  const objectMsg = SEND({ tool_input: { message: { round: 3 } } });
  assert.equal(checkRoundMention(objectMsg), false);
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
// The mandate template must survive the WHOLE guard, through decide() — not just R3
// (round-1 fix for BLOCKER 1: the round-0 test called checkR3 directly and was
// structurally blind to the R2 deny the template's own fix-round hint text used to
// cause).
// ─────────────────────────────────────────────────────────────────────────────

const FILLED_ROUND1 = [
  'Task: Audit the growth-rate calculation in reports/monthly.py for an off-by-one',
  'against the spec.',
  '',
  'Inputs (by path):',
  '- reports/monthly.py',
  '- docs/growth-rate-spec.md',
  '',
  'NOT (out of scope, stated explicitly):',
  '- Do not touch reports/weekly.py',
  '- Do not change the spec itself',
  '',
  'Evidence format: cite file:line for every claim, quote the exact spec sentence you',
  'are checking against',
  '',
  'Report: docs/findings/growth-rate-audit.md. Line 1 is the verdict, first word.',
  '',
  NEG_SENTENCE,
  '',
  'Autonomy: may read any file in the repo; ask before editing anything',
  '',
  'Un-agent-able steps: none, this is a read-only audit',
  'ETA: 30 minutes; report or park by then',
  '',
  'Termination: report to the path above, verdict on line 1, then stop.',
].join('\n');

test('decide: mandate-template.md, used verbatim as an Agent prompt, is never denied and never gets an R3 note', () => {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  assert.ok(template.length > 400, 'the template should be long enough for R3 to actually be exercised');
  const home = scratchHome();
  const input = AGENT({ tool_input: { prompt: template, subagent_type: 'general-purpose' } });
  const result = decide(input, ctxFor(home));
  assert.notEqual(result.action, 'deny', `the template must never be denied: ${result.text}`);
  assert.ok(!result.rule.some((r) => r.startsWith('R3')), 'the template authorizes a negative result and names a report file');
  // The template's own JUDGMENT: placeholder is a legitimate example of the required
  // 10+ character form, so it fires R1b (a note) when left un-deleted — verified
  // directly, and the correct outcome per the review: a note, never a deny.
});

test('decide: the template filled in as a plausible round-1 mandate (JUDGMENT and Round/Research deleted, as the template instructs) allows cleanly', () => {
  assert.ok(FILLED_ROUND1.length > 400);
  const home = scratchHome();
  const input = AGENT({ tool_input: { prompt: FILLED_ROUND1, subagent_type: 'general-purpose' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'allow');
  assert.deepEqual(result.rule, []);
});

test('decide: the same mandate declared Round: 3 with a valid Research line is allowed', () => {
  const home = scratchHome();
  const prompt = `${FILLED_ROUND1}\n\nRound: 3\nResearch: not needed, delta review only, no new class of bug\n`;
  const input = AGENT({ tool_input: { prompt, subagent_type: 'general-purpose' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'allow');
});

test('decide: the same mandate declared Round: 3 WITHOUT a Research line is denied', () => {
  const home = scratchHome();
  const prompt = `${FILLED_ROUND1}\n\nRound: 3\n`;
  const input = AGENT({ tool_input: { prompt, subagent_type: 'general-purpose' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'deny');
  assert.equal(result.rule[0], 'R2');
});

// ─────────────────────────────────────────────────────────────────────────────
// decide() — ordering, and enforced defaults to false (round-1 ruling on MAJOR 2)
// ─────────────────────────────────────────────────────────────────────────────

test('decide: a plain call with nothing to flag allows silently', () => {
  const home = scratchHome();
  const input = AGENT({ tool_input: { prompt: 'do a small thing', subagent_type: 'general-purpose' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'allow');
  assert.deepEqual(result.rule, []);
  assert.equal(result.text, null);
  assert.equal(result.skip, false);
});

test('decide: with NOTHING configured (no switch files at all), enforced defaults to false', () => {
  const home = scratchHome();
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'deny');
  assert.equal(result.enforced, false, 'a missing enforce file must never turn enforcement on');
});

test('decide: R1 deny wins outright even if R2 would also deny on the same call', () => {
  const home = enforcedHome();
  const prompt = 'Round: 3 of the fix, no research line included here at all.';
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.action, 'deny');
  assert.deepEqual(result.rule, ['R1']);
  assert.equal(result.text, R1_TEXT);
});

test('decide: notes accumulate (R1b + R3) into one additionalContext when nothing denies', () => {
  const home = enforcedHome();
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
  const home = enforcedHome();
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
// Switches (round-1 rewrite of MAJOR 2): no-dispatch-guard unchanged; the enforce/
// observe split is now gated by TWO files, and their "fail toward doing nothing" is
// opposite polarity for each (see agent-dispatch-guard.mjs's comments).
// ─────────────────────────────────────────────────────────────────────────────

test('switch: ~/.agents/no-dispatch-guard present skips everything, even with the enforce file present', () => {
  const home = enforcedHome();
  fs.writeFileSync(path.join(home, '.agents', 'no-dispatch-guard'), '', 'utf8');
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.skip, true);
  assert.equal(result.action, 'allow');
});

test('switch: neither file present — observe-only (the default)', () => {
  const home = scratchHome();
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.skip, false);
  assert.equal(result.enforced, false);
  assert.equal(result.action, 'deny');
});

test('switch: enforce file present, ws-off absent — enforced', () => {
  const home = enforcedHome();
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.enforced, true);
});

test('switch: enforce file absent, ws-off present — observe-only (ws-off is moot but explicit)', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.enforced, false);
});

test('switch: BOTH files present — ws-off overrides the enforce file, observe-only', () => {
  const home = enforcedHome();
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home));
  assert.equal(result.enforced, false);
});

test('switch: an unreadable no-dispatch-guard path counts as PRESENT (fail toward doing nothing = skip)', () => {
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

test('switch: an unreadable ws-off path counts as PRESENT (fail toward doing nothing = observe-only)', () => {
  const home = enforcedHome();
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

test('switch: an unreadable dispatch-guard-enforce path counts as ABSENT (fail toward doing nothing = observe-only)', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'dispatch-guard-enforce'), '', 'utf8');
  const throwingFs = {
    ...fs,
    existsSync(p) {
      if (String(p).endsWith('dispatch-guard-enforce')) throw new Error('EACCES simulated');
      return fs.existsSync(p);
    },
  };
  const input = AGENT({ tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'x' } });
  const result = decide(input, ctxFor(home, throwingFs));
  assert.equal(result.enforced, false, 'unlike the two off switches, an unreadable enforce file must NOT turn enforcement on');
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

function lastLogLine(home) {
  const logPath = path.join(home, '.agents', 'ws', 'dispatch-guard.log');
  return JSON.parse(fs.readFileSync(logPath, 'utf8').trim().split('\n').pop());
}

const OPUS_PAYLOAD = (over = {}) => JSON.stringify({
  tool_name: 'Agent',
  tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: 'do the thing' },
  cwd: process.cwd(),
  session_id: 'e2e-session-id',
  ...over,
});

test('CLI: garbage stdin exits 0 with empty stdout', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: 'not json at all {{{' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('CLI: default home (no switch files) — opus spawn prints nothing, logs enforced:false', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: OPUS_PAYLOAD() });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  const logLine = lastLogLine(home);
  assert.equal(logLine.action, 'deny');
  assert.equal(logLine.enforced, false);
  assert.deepEqual(logLine.rules, ['R1']);
});

test('CLI: enforce file present — opus spawn prints the deny JSON and logs enforced:true', () => {
  const home = enforcedHome();
  const result = runCliProcess({ home, input: OPUS_PAYLOAD() });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /dispatch-guard R1/);
  const logLine = lastLogLine(home);
  assert.equal(logLine.action, 'deny');
  assert.equal(logLine.enforced, true);
  assert.deepEqual(logLine.rules, ['R1']);
});

test('CLI: enforce file plus ws-off — prints nothing, logs enforced:false', () => {
  const home = enforcedHome();
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '', 'utf8');
  const result = runCliProcess({ home, input: OPUS_PAYLOAD() });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  const logLine = lastLogLine(home);
  assert.equal(logLine.enforced, false);
  assert.equal(logLine.action, 'deny');
});

test('CLI: with no-dispatch-guard present, prints nothing and writes no log file at all', () => {
  const home = enforcedHome();
  fs.writeFileSync(path.join(home, '.agents', 'no-dispatch-guard'), '', 'utf8');
  const result = runCliProcess({ home, input: OPUS_PAYLOAD() });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'ws', 'dispatch-guard.log')), false);
});

test('CLI: a prose round mention is recorded as round_mention:true in the log, without changing the action', () => {
  const home = scratchHome();
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { subagent_type: 'general-purpose', prompt: 'This report covers Round 3 of the review, nothing else.' },
    cwd: process.cwd(),
    session_id: 'e2e-mention',
  });
  runCliProcess({ home, input: payload });
  const logLine = lastLogLine(home);
  assert.equal(logLine.round_mention, true);
  assert.equal(logLine.action, 'allow');
});

test('CLI: no round mention means the log has no round_mention key at all', () => {
  const home = scratchHome();
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { subagent_type: 'general-purpose', prompt: 'do a small thing' },
    cwd: process.cwd(),
    session_id: 'e2e-no-mention',
  });
  runCliProcess({ home, input: payload });
  const logLine = lastLogLine(home);
  assert.equal('round_mention' in logLine, false);
});

test('CLI: the log line never contains prompt text, even when the prompt has a unique marker', () => {
  const home = enforcedHome();
  const marker = 'UNIQUE-MARKER-STRING-7f3a9';
  const payload = OPUS_PAYLOAD({
    tool_input: { model: 'opus', subagent_type: 'general-purpose', prompt: `do the thing ${marker}` },
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
  const payload = OPUS_PAYLOAD({ session_id: 'abcdefghijklmnopqrstuvwxyz' });
  runCliProcess({ home, input: payload });
  const logLine = lastLogLine(home);
  assert.equal(logLine.session, 'abcdefgh');
});

test('CLI (N4): an oversized subagent_type is capped at 64 characters in the log, never stored raw', () => {
  const home = scratchHome();
  const payload = OPUS_PAYLOAD({ tool_input: { model: 'opus', subagent_type: 'A'.repeat(1000), prompt: 'x' } });
  runCliProcess({ home, input: payload });
  const logLine = lastLogLine(home);
  assert.equal(logLine.subagent_type.length, 64);
});
