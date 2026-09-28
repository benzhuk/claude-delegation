// node --test scripts/build-census.completeness.test.mjs
//
// census-completeness (lane 38): wakes, Stop-blocks and stall nudges received.
// scripts/build-census.fixtures/completeness/ holds one lead transcript with exactly one of each
// marker (one note-flush wake, one Done-tick wake, one Stop-block that Claude Code records three
// times) followed by text that only RESEMBLES a marker, and a ledger holding one stall nudge to
// skills-o among lines that must not count. Every count below is exact.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseArgs, runCensus, formatText, formatJson,
  classifyWake, classifyStopBlock, classifyCodexWake, classifyCodexStopBlock, WAKE_PREFIX, STOP_BLOCK_REASON, STOP_FEEDBACK_PREFIX,
} from './build-census.mjs';
import { buildEnvelope } from '../skills/multi/scripts/envelope.mjs';
import { inboxFrames, DEFAULT_FROM } from '../skills/multi/scripts/inbox-claude.mjs';
import { STOP_REASON } from '../hooks/multi-hook-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEAD = path.join(HERE, 'build-census.fixtures', 'completeness', 'lead.jsonl');
const LEDGER = path.join(HERE, 'build-census.fixtures', 'completeness', 'ledger');
const base = { lead: LEAD, tasksDirs: [], marker: null, ledgerDir: LEDGER };

const tracked = [];
after(() => { for (const d of tracked) fs.rmSync(d, { recursive: true, force: true }); });
function mkTmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

test('one of each marker counts exactly once: wakes 1 note-flush + 1 Done-tick, 1 Stop-block, 1 stall nudge', async () => {
  const report = await runCensus({ ...base, leadSlug: 'skills-o' });
  assert.equal(report.lead.wakesNoteFlush, 1);
  assert.equal(report.lead.wakesDoneTick, 1);
  assert.equal(report.lead.wakes, 2);
  assert.equal(report.lead.wakesTotal, 2);
  assert.equal(report.lead.stopBlocks, 1);
  assert.equal(report.lead.stopBlocksTotal, 1);
  assert.equal(report.stallNudges.count, 1);
  assert.deepEqual(report.stallNudges.ids, ['collect-netcup-stall-build-fixture-1-abc1234-1']);
  assert.equal(report.stallNudges.slug, 'skills-o');
  assert.equal(report.stallNudges.slugSource, 'option');
});

test('the slug is inferred from the transcript when --lead-slug is not given', async () => {
  const report = await runCensus(base);
  assert.equal(report.stallNudges.slug, 'skills-o');
  assert.equal(report.stallNudges.slugSource, 'inferred');
  assert.equal(report.stallNudges.count, 1);
});

test('a stall nudge to another slug is not this lead\'s; an unreadable ledger is unavailable, never zero', async () => {
  const other = await runCensus({ ...base, leadSlug: 'skills-a' });
  assert.equal(other.stallNudges.count, 1);
  assert.deepEqual(other.stallNudges.ids, ['collect-netcup-stall-build-other-1-def5678-1']);
  const nobody = await runCensus({ ...base, leadSlug: 'nobody' });
  assert.equal(nobody.stallNudges.count, 0);
  const missing = await runCensus({ ...base, ledgerDir: path.join(LEDGER, 'no-such-dir'), leadSlug: 'skills-o' });
  assert.equal(missing.stallNudges.count, null);
  assert.match(missing.stallNudges.reason, /ledger dir unreadable/);
  assert.match(formatText(missing), /^- stallNudges: unavailable \(ledger dir unreadable\)$/m);
});

test('the window narrows wakes, Stop-blocks and the nudge window; the whole-file totals stay', async () => {
  // 12:10Z on excludes the note-flush wake (12:05) but not the Done-tick (12:25) or the Stop-block (12:30).
  const late = await runCensus({ ...base, from: '2026-09-27T12:10:00Z', leadSlug: 'skills-o' });
  assert.equal(late.lead.wakes, 1);
  assert.equal(late.lead.wakesDoneTick, 1);
  assert.equal(late.lead.wakesNoteFlush, 0);
  assert.equal(late.lead.wakesTotal, 2);
  assert.equal(late.lead.stopBlocks, 1);
  assert.equal(late.stallNudges.count, 1);
  // 12:00Z..12:10Z holds only the note-flush wake; the 12:20Z stall nudge is outside it.
  const early = await runCensus({ ...base, from: '2026-09-27T12:00:00Z', to: '2026-09-27T12:10:00Z', leadSlug: 'skills-o' });
  assert.equal(early.lead.wakes, 1);
  assert.equal(early.lead.wakesNoteFlush, 1);
  assert.equal(early.lead.stopBlocks, 0);
  assert.equal(early.lead.stopBlocksTotal, 1);
  assert.equal(early.stallNudges.count, 0);
});

test('a transcript that keeps only one of the two Stop-block records still counts the block once', async () => {
  const dir = mkTmp('census-stop-forms-');
  const lines = fs.readFileSync(LEAD, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const isFeedback = (o) => o.type === 'user' && typeof o.message.content === 'string' && o.message.content.startsWith(STOP_FEEDBACK_PREFIX + '1 new peer note');
  const isAttachment = (o) => o.type === 'attachment' && o.attachment.hookEvent === 'Stop' && String(o.attachment.blockingError.command).includes('multi-inbox');
  assert.ok(lines.some(isFeedback) && lines.some(isAttachment), 'fixture holds both records');
  for (const [name, drop] of [['attachment-only.jsonl', isFeedback], ['feedback-only.jsonl', isAttachment]]) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, lines.filter((o) => !drop(o)).map((o) => JSON.stringify(o)).join('\n') + '\n');
    const report = await runCensus({ ...base, lead: p, leadSlug: 'skills-o' });
    assert.equal(report.lead.stopBlocks, 1, name);
  }
});

test('text that only resembles a marker is not counted (negative cases)', () => {
  const at = { date: '9.27.26', time: '08:05', tz: 'NYC' };
  const env = buildEnvelope({ from: 'skills-fable', to: 'skills-o', id: 'skills-fable-neg-1', kind: 'ASK', body: 'Negative case note', ...at });
  const peer = { origin: { kind: 'peer', from: 'note-flush' } };
  const user = (content, extra = {}) => ({ type: 'user', message: { role: 'user', content }, ...extra });

  // positive control: the same text, delivered the way note-flush delivers it
  assert.deepEqual(classifyWake(user(`${WAKE_PREFIX}\n${env}`, peer)), { to: 'skills-o', doneTick: false });
  // quoted mid-message, not opening the turn
  assert.equal(classifyWake(user(`Explain this:\n${WAKE_PREFIX}\n${env}`, peer)), null);
  // the prefix with no envelope behind it, an envelope-shaped line with the wrong arrow, no newline after the prefix
  assert.equal(classifyWake(user(`${WAKE_PREFIX}\nplease look at the build`, peer)), null);
  assert.equal(classifyWake(user(`${WAKE_PREFIX}\n${env.replace('→', '->')}`, peer)), null);
  assert.equal(classifyWake(user(`${WAKE_PREFIX} ${env}`, peer)), null);
  // a human-origin turn, a tool_result carrying the text, an assistant message carrying it
  assert.equal(classifyWake(user(`${WAKE_PREFIX}\n${env}`, { origin: { kind: 'human' } })), null);
  assert.equal(classifyWake(user([{ type: 'tool_result', tool_use_id: 't', content: `${WAKE_PREFIX}\n${env}` }])), null);
  assert.equal(classifyWake({ type: 'assistant', message: { content: `${WAKE_PREFIX}\n${env}` } }), null);
  // a pickup-looking note whose id is not the decisions id, and the pickup id with another body: wakes, not Done ticks
  const notPickup = buildEnvelope({ from: 'skills-o', to: 'skills-o', id: 'skills-o-decisions-notes-3', kind: 'ASK', body: 'Owner decisions pickup round 3 is ready', ...at });
  assert.equal(classifyWake(user(`${WAKE_PREFIX}\n${notPickup}`, peer)).doneTick, false);
  const pickupId = `skills-o-decisions-${'b'.repeat(64)}-3`;
  const wrongBody = buildEnvelope({ from: 'skills-o', to: 'skills-o', id: pickupId, kind: 'ASK', body: 'Something else entirely', ...at });
  assert.equal(classifyWake(user(`${WAKE_PREFIX}\n${wrongBody}`, peer)).doneTick, false);
  // the real pickup note
  const pickup = buildEnvelope({ from: 'skills-o', to: 'skills-o', id: pickupId, kind: 'ASK', body: 'Owner decisions pickup round 3 is ready', ...at });
  assert.equal(classifyWake(user(`${WAKE_PREFIX}\n${pickup}`, peer)).doneTick, true);

  const stopAtt = (reason, hookEvent = 'Stop', command = 'node "x/hooks/multi-inbox.js" Stop') => ({ type: 'attachment', attachment: { type: 'hook_blocking_error', hookEvent, blockingError: { blockingError: reason, command } } });
  const header = '1 new peer note for skills-o (the multi skill; the ledger is the channel):';
  assert.deepEqual(classifyStopBlock(stopAtt(`${header}\n${STOP_BLOCK_REASON}`)), { form: 'attachment', slug: 'skills-o' });
  // another Stop hook, another event, another command, another attachment kind
  assert.equal(classifyStopBlock(stopAtt('Some other Stop hook wants more.', 'Stop', 'node other.js Stop')), null);
  assert.equal(classifyStopBlock(stopAtt(STOP_BLOCK_REASON, 'PreToolUse')), null);
  assert.equal(classifyStopBlock(stopAtt(STOP_BLOCK_REASON, 'Stop', 'node other.js Stop')), null);
  assert.equal(classifyStopBlock({ type: 'attachment', attachment: { type: 'hook_success', hookEvent: 'Stop', content: STOP_BLOCK_REASON } }), null);
  // the sentence in assistant prose, in a human prompt, in a tool_result, and a near-miss wording
  assert.equal(classifyStopBlock({ type: 'assistant', message: { content: [{ type: 'text', text: STOP_BLOCK_REASON }] } }), null);
  assert.equal(classifyStopBlock(user(`Please read: ${STOP_BLOCK_REASON}`)), null);
  assert.equal(classifyStopBlock(user([{ type: 'tool_result', tool_use_id: 't', content: `${STOP_FEEDBACK_PREFIX}${STOP_BLOCK_REASON}` }])), null);
  assert.equal(classifyStopBlock(user(`${STOP_FEEDBACK_PREFIX}Handle these before you stop: ACK what you are taking.`)), null);
  assert.deepEqual(classifyStopBlock(user(`${STOP_FEEDBACK_PREFIX}${STOP_BLOCK_REASON}`)), { form: 'feedback', slug: null });
});

test('the marker strings are pinned to what the plugin itself prints', () => {
  assert.equal(STOP_BLOCK_REASON, STOP_REASON, 'multi-hook-core.mjs STOP_REASON changed: update build-census.mjs and docs/census.md');
  // an envelope built by the plugin's own builder satisfies the wake reader
  const line = buildEnvelope({ from: 'a-b', to: 'c-d', id: 'a-b-topic-7', re: 'c-d-topic-6', kind: 'RESULT', body: 'Body text', details: 'docs/x.md', needs: 'none', date: '1.2.26', time: '03:04', tz: 'NYC' });
  assert.equal(classifyWake({ type: 'user', origin: { kind: 'peer', from: 'note-flush' }, message: { content: `${WAKE_PREFIX}\n${line}` } }).to, 'c-d');
  // and the frame note-flush posts names the sender the reader expects in the transcript origin
  assert.equal(JSON.parse(inboxFrames('tok', line, DEFAULT_FROM)[1]).from, 'note-flush');
});

test('the markdown and JSON report the three numbers, deterministically', async () => {
  const report = await runCensus({ ...base, leadSlug: 'skills-o' });
  const text = formatText(report);
  assert.match(text, /^- wakes: 2 \(1 note-flush, 1 Done-tick\)$/m);
  assert.match(text, /^- stopBlocks: 1$/m);
  assert.match(text, /^- stallNudges: 1 to skills-o .*collect-netcup-stall-build-fixture-1-abc1234-1$/m);
  const json = JSON.parse(formatJson(report));
  assert.equal(json.lead.wakes, 2);
  assert.equal(json.lead.stopBlocks, 1);
  assert.equal(json.stallNudges.count, 1);
  assert.equal(formatJson(report), formatJson(await runCensus({ ...base, leadSlug: 'skills-o' })));
});

test('parseArgs takes --ledger-dir and --lead-slug', () => {
  const opts = parseArgs(['--lead', 'a.jsonl', '--ledger-dir', 'docs/ledger', '--lead-slug', 'skills-o']);
  assert.equal(opts.ledgerDir, 'docs/ledger');
  assert.equal(opts.leadSlug, 'skills-o');
});

test('a note-flush delivery queued into a running turn joins that turn and is not a wake', () => {
  const lines = fs.readFileSync(LEAD, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const queued = lines.filter((o) => o.type === 'attachment' && o.attachment.type === 'queued_command');
  assert.equal(queued.length, 1, 'the fixture holds the queued_command shape');
  assert.equal(queued[0].attachment.origin.from, 'note-flush');
  assert.equal(classifyWake(queued[0]), null);
  assert.equal(classifyStopBlock(queued[0]), null);
});

// ── Codex leads: wakes and stall nudges are read; wakes, Stop-blocks and stall nudges are all read ──
// The wake record shape was read on a live rollout that received a queued note
// (01a0dab2-065e-7a31-bff4-9aecfe1fa833, 2026-09-25T22:32:53Z): a response_item / message / user whose one
// input_text part is exactly the envelope line. codex-lead.jsonl reproduces that shape.
const CODEX_LEAD = path.join(HERE, 'build-census.fixtures', 'completeness', 'codex-lead.jsonl');
const codexBase = () => ({ lead: CODEX_LEAD, tasksDirs: [], marker: null, ledgerDir: LEDGER, leadSlug: 'skills-o', codexHome: mkTmp('census-codex-home-') });

test('codex lead: one note-flush wake and one Done-tick wake, one Stop-block, and one stall nudge', async () => {
  const report = await runCensus(codexBase());
  assert.equal(report.lead.host, 'codex');
  assert.equal(report.lead.wakesNoteFlush, 1);
  assert.equal(report.lead.wakesDoneTick, 1);
  assert.equal(report.lead.wakes, 2);
  assert.equal(report.lead.wakesTotal, 2);
  assert.equal(report.lead.stopBlocks, 1);
  assert.equal(report.lead.stopBlocksTotal, 1);
  assert.equal('stopBlocksUnavailable' in report.lead, false);
  assert.equal(report.stallNudges.count, 1);
  assert.deepEqual(report.stallNudges.ids, ['collect-netcup-stall-build-fixture-1-abc1234-1']);
  const text = formatText(report);
  assert.match(text, /^- wakes: 2 \(1 note-flush, 1 Done-tick\)$/m);
  assert.match(text, /^- stopBlocks: 1$/m);
  assert.match(text, /^- stallNudges: 1 to skills-o/m);
});

test('codex lead: the slug is inferred from the rollout, and the window narrows the wakes', async () => {
  const inferred = await runCensus({ ...codexBase(), leadSlug: null });
  assert.equal(inferred.stallNudges.slug, 'skills-o');
  assert.equal(inferred.stallNudges.slugSource, 'inferred');
  const late = await runCensus({ ...codexBase(), from: '2026-09-27T12:10:00Z' });
  assert.equal(late.lead.wakes, 1);
  assert.equal(late.lead.wakesDoneTick, 1);
  assert.equal(late.lead.wakesTotal, 2);
  assert.equal(late.lead.stopBlocks, 1, 'the block at 12:30 is inside a window from 12:10');
  const after = await runCensus({ ...codexBase(), from: '2026-09-27T12:35:00Z' });
  assert.equal(after.lead.stopBlocks, 0);
  assert.equal(after.lead.stopBlocksTotal, 1);
});

test('codex lead: only a HookPrompt item from a stop: hook that holds the multi-inbox reason is a Stop-block', () => {
  const item = (hookRunId, text, type = 'HookPrompt') => ({ type: 'event_msg', payload: { type: 'item_completed', item: { type, fragments: [{ text, hookRunId }] } } });
  const block = `1 new peer note for skills-o (the multi skill; the ledger is the channel):\n  x\n\n${STOP_BLOCK_REASON}`;
  assert.deepEqual(classifyCodexStopBlock(item('stop:12:C:\\hooks.json', block)), { slug: 'skills-o' });
  assert.deepEqual(classifyCodexStopBlock(item('stop:1:x', STOP_BLOCK_REASON)), { slug: null });
  assert.equal(classifyCodexStopBlock(item('stop:11:x', 'Continuation accounting for the bound selected work: none.')), null, 'another Stop hook');
  assert.equal(classifyCodexStopBlock(item('userpromptsubmit:3:x', block)), null, 'not a stop: hook run');
  assert.equal(classifyCodexStopBlock(item('stop:12:x', block, 'CommandExecution')), null, 'tool output is another item type');
  assert.equal(classifyCodexStopBlock({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `<hook_prompt hook_run_id="stop:12:x">${block}</hook_prompt>` }] } }), null, 'the paired user message would double the count');
  assert.equal(classifyCodexStopBlock({ type: 'response_item', payload: { type: 'custom_tool_call_output', output: block } }), null);
  assert.equal(classifyCodexStopBlock(null), null);
});

test('codex lead: text that only resembles a wake is not counted', () => {
  const env = buildEnvelope({ from: 'skills-fable', to: 'skills-o', id: 'skills-fable-neg-2', kind: 'ASK', body: 'Codex negative case', date: '9.27.26', time: '08:05', tz: 'NYC' });
  const msg = (role, content) => ({ type: 'response_item', payload: { type: 'message', role, content } });
  const part = (text, type = 'input_text') => ({ type, text });
  assert.deepEqual(classifyCodexWake(msg('user', [part(env)])), { to: 'skills-o', doneTick: false });
  assert.equal(classifyCodexWake(msg('user', [part(`Explain:\n${env}`)])), null);
  assert.equal(classifyCodexWake(msg('user', [part(`${env}\nmore text`)])), null);
  assert.equal(classifyCodexWake(msg('user', [part(env), part('second part')])), null);
  assert.equal(classifyCodexWake(msg('user', [part('please look at the build')])), null);
  assert.equal(classifyCodexWake(msg('assistant', [part(env, 'output_text')])), null);
  assert.equal(classifyCodexWake(msg('developer', [part(env)])), null);
  assert.equal(classifyCodexWake({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: env }] } } }), null);
  assert.equal(classifyCodexWake({ type: 'response_item', payload: { type: 'function_call_output', output: env } }), null);
});
