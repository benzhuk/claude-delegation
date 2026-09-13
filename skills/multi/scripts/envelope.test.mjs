// node --test "skills/multi/scripts/*.test.mjs"
// Grammar only: build, parse, validate, id derivation, time, packet template. No I/O of any kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ENVELOPE_RE, DETAILS_RE, MAX_LINE, NoteError,
  buildEnvelope, parseEnvelope, terminate,
  validateDetails, validateKindNeeds, assertFieldSafe, assertLowercase,
  highestCounter, nextCounter, timeParts, packetTemplate, firstSentence,
} from './envelope.mjs';

const BASE = {
  from: 'taxonomy', to: 'nucleus', date: '9.13.26', time: '10:05', tz: 'NYC',
  id: 'taxonomy-pr132-review-1', kind: 'ASK', body: 'Please review my PR #132',
};

function build(over = {}) { return buildEnvelope({ ...BASE, ...over }); }

function throwsWith(fn, exitCode, re) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof NoteError, `expected NoteError, got ${err}`);
    assert.equal(err.exitCode, exitCode, `exit code: ${err.message}`);
    if (re) assert.match(err.message, re);
    return err;
  }
  assert.fail('expected a throw');
}

// ─────────────────────────────────────────────────────────────────────────────
// The pinned example
// ─────────────────────────────────────────────────────────────────────────────

test('builds the contract example line', () => {
  const line = build({ goal: 'faster wall clock, better batch orchestration', details: 'docs/notes/taxonomy-pr132-review-1.md', needs: 'review', by: '15:00' });
  assert.equal(
    line,
    'taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: Please review my PR #132. Goal: faster wall clock, better batch orchestration. Details: docs/notes/taxonomy-pr132-review-1.md Needs: review by 15:00',
  );
  const g = parseEnvelope(line);
  assert.equal(g.details, 'docs/notes/taxonomy-pr132-review-1.md');
  assert.equal(g.by, '15:00');
  assert.equal(g.kind, 'ASK');
  assert.equal(g.goal, 'faster wall clock, better batch orchestration.');
});

test('H3: a hand-written line with a sentence period after the path still yields a usable path', () => {
  const literal = 'taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: Please review my PR #132. Goal: faster wall clock. Details: docs/notes/taxonomy-pr132-review-1.md. Needs: review by 15:00';
  assert.equal(parseEnvelope(literal).details, 'docs/notes/taxonomy-pr132-review-1.md');
});

test('terminate() closes substance and Goal but never Details or by', () => {
  assert.equal(terminate('done'), 'done.');
  assert.equal(terminate('done.'), 'done.');
  assert.equal(terminate('done?'), 'done?');
  assert.match(build({ kind: 'RESULT', body: 'done', needs: 'none' }), /RESULT: done\. Needs: none$/);
});

test('every built line matches the pinned regex', () => {
  for (const over of [
    {},
    { kind: 'FYI', body: 'Batch finished, 413 films' },
    { kind: 'ACK', body: 'Taking it now', needs: 'none' },
    { kind: 'BLOCKED', body: 'Cannot run the suite, node_modules missing', goal: 'unblock the gate' },
    { kind: 'RESULT', body: 'Reviewed', details: 'docs/notes/taxonomy-pr132-review-2.md', needs: 'none' },
    { re: 'nucleus-pr132-review-1' },
    { supersedes: 'taxonomy-pr132-review-1', id: 'taxonomy-pr132-review-4' },
  ]) {
    assert.ok(ENVELOPE_RE.test(build(over)), `no match: ${build(over)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Details — v3 grammar
// ─────────────────────────────────────────────────────────────────────────────

test('v3: DETAILS_RE has no host-prefix alternative', () => {
  assert.equal(String(DETAILS_RE), String(/^[A-Za-z0-9._/-]+$/));
  assert.equal(validateDetails('docs/notes/taxonomy-ping-1.md'), 'docs/notes/taxonomy-ping-1.md');
});

test('v3: a <host>: prefix is rejected and points at the ssh form', () => {
  throwsWith(() => validateDetails('netcup:/home/ben/code/x/docs/notes/a-1.md'), 1, /host.*prefix.*ssh/is);
});

test('H2: a path with a space is rejected, not silently swallowed', () => {
  throwsWith(() => validateDetails('docs/notes/ping 5.md'), 1, /must not contain spaces/);
  throwsWith(() => build({ details: 'docs/notes/ping 5.md' }), 1, /spaces/);
});

test("H2: Ben's Windows path anchor is rejected with a reason, not a silent no-match", () => {
  throwsWith(() => validateDetails('C:\\Users\\benzh\\Code\\Zhuk Projects\\docs\\notes\\x.md'), 1, /spaces|backslashes|drive letter/);
  throwsWith(() => validateDetails('C:/Users/benzh/Code/x.md'), 1, /drive letter/);
  throwsWith(() => validateDetails('docs\\notes\\x.md'), 1, /backslashes/);
});

test('Details must be repo-relative and must not escape the repo', () => {
  throwsWith(() => validateDetails('/etc/passwd'), 1, /repo-relative/);
  throwsWith(() => validateDetails('../../../etc/passwd'), 1, /\.\./);
  throwsWith(() => validateDetails('docs/../../secrets.md'), 1, /\.\./);
});

test('H3: Details must not end with a period', () => {
  throwsWith(() => validateDetails('docs/notes/x.md.'), 1, /must not end with a period/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Ids
// ─────────────────────────────────────────────────────────────────────────────

test('H4: an id must carry the sender prefix', () => {
  throwsWith(() => build({ id: 'pr132-review-1' }), 1, /must start with the sender slug "taxonomy-"/);
});

test('M4 / ruling 3: uppercase is rejected with the lowercase form shown', () => {
  throwsWith(() => assertLowercase('topic', 'PR132-review'), 1, /use "pr132-review"/);
  throwsWith(() => build({ id: 'taxonomy-PR132-review-1' }), 1, /taxonomy-pr132-review-1/);
  throwsWith(() => build({ from: 'Taxonomy', id: 'Taxonomy-pr132-review-1' }), 1, /lowercase/);
});

test('an id without a counter is rejected', () => {
  throwsWith(() => build({ id: 'taxonomy-pr132-review' }), 1, /<slug>-<counter>/);
});

test('M5: supersedes and re live inside the brackets', () => {
  const line = build({ id: 'taxonomy-pr132-review-4', supersedes: 'taxonomy-pr132-review-2' });
  assert.match(line, /\[taxonomy-pr132-review-4 supersedes taxonomy-pr132-review-2\]/);
  assert.equal(parseEnvelope(line).sup, 'taxonomy-pr132-review-2');

  const reply = buildEnvelope({ ...BASE, from: 'nucleus', to: 'taxonomy', id: 'nucleus-pr132-review-1', re: 'taxonomy-pr132-review-1', kind: 'ACK', body: 'Taking it', needs: 'none' });
  assert.equal(parseEnvelope(reply).re, 'taxonomy-pr132-review-1');
});

// ─────────────────────────────────────────────────────────────────────────────
// Kind / needs
// ─────────────────────────────────────────────────────────────────────────────

test('M3: only ASK may carry decision/review/ack', () => {
  for (const kind of ['ACK', 'RESULT', 'BLOCKED', 'FYI']) {
    for (const needs of ['decision', 'review', 'ack']) throwsWith(() => validateKindNeeds(kind, needs), 1, /ASK-only/);
    validateKindNeeds(kind, 'none');
    validateKindNeeds(kind, undefined);
  }
  for (const needs of ['decision', 'review', 'ack', 'none']) validateKindNeeds('ASK', needs);
});

test("M3: the red-team's exact counter-example is rejected", () => {
  throwsWith(() => build({ kind: 'FYI', body: 'fyi only', needs: 'decision', by: '15:00' }), 1, /ASK-only/);
});

test('an unknown kind or need is rejected', () => {
  throwsWith(() => validateKindNeeds('PING', undefined), 1, /--kind must be one of/);
  throwsWith(() => validateKindNeeds('ASK', 'maybe'), 1, /--needs must be one of/);
});

test('--by without --needs is rejected', () => {
  throwsWith(() => build({ by: '15:00' }), 1, /--by requires --needs/);
});

// ─────────────────────────────────────────────────────────────────────────────
// One line, no shell payload
// ─────────────────────────────────────────────────────────────────────────────

test('H1: newlines, carriage returns and tabs are rejected in every field', () => {
  for (const bad of ['a\nb', 'a\rb', 'a\tb']) {
    throwsWith(() => assertFieldSafe('text', bad), 1, /one physical line/);
    throwsWith(() => build({ body: bad }), 1, /one physical line/);
    throwsWith(() => build({ goal: bad }), 1, /one physical line/);
  }
});

test('H1: the 500-char cap is enforced with an actionable message', () => {
  const err = throwsWith(() => build({ body: 'x'.repeat(600) }), 1, /over the 500 cap/);
  assert.match(err.message, /detail packet/);
  assert.ok(build({ body: 'x'.repeat(MAX_LINE - 80) }).length <= MAX_LINE);
});

test('reserved words inside a field are rejected', () => {
  throwsWith(() => build({ body: 'see this Details: /etc/passwd now' }), 1, /reserved word "Details:"/);
  throwsWith(() => build({ goal: 'a Needs: b' }), 1, /reserved word "Needs:"/);
});

test('review H2: every shell metacharacter that could chain a command is rejected', () => {
  for (const bad of [
    'run `whoami` please',
    'run $(whoami) please',
    'pipeline fixed; rm -rf build',
    'grep x | sh',
    'make && deploy',
  ]) {
    throwsWith(() => build({ body: bad }), 1, /never be able to execute/);
  }
});

test('review H2: ordinary prose with & or > still passes', () => {
  for (const ok of ['A & B shipped', 'latency > 200ms on the p95', 'cost/benefit is fine']) {
    assert.ok(ENVELOPE_RE.test(build({ body: ok })), ok);
  }
});

test('M7 / ruling 4: quotes and bare $ survive — argv transport makes them inert', () => {
  const line = build({ body: 'the "batch" flag costs $5 and breaks' });
  assert.match(line, /the "batch" flag costs \$5 and breaks\./);
  assert.ok(ENVELOPE_RE.test(line));
});

// ─────────────────────────────────────────────────────────────────────────────
// Id derivation, time, packet
// ─────────────────────────────────────────────────────────────────────────────

test('the next counter is one past the highest already in the ledgers', () => {
  const ledgers = [
    'taxonomy → nucleus, 9.13.26 10:05 NYC [taxonomy-pr132-review-1] ASK: a.\n' +
    'taxonomy → nucleus, 9.13.26 11:05 NYC [taxonomy-pr132-review-3] FYI: b.\n',
    'nucleus → taxonomy, 9.13.26 12:00 NYC [nucleus-pr132-review-9] ACK: c. Needs: none\n',
  ];
  assert.equal(highestCounter(ledgers, 'taxonomy-pr132-review'), 3);
  assert.equal(nextCounter(ledgers, 'taxonomy-pr132-review'), 4);
  assert.equal(nextCounter(ledgers, 'taxonomy-other-topic'), 1);
  assert.equal(nextCounter([], 'taxonomy-x'), 1);
});

test('a counter mentioned as a parent id still reserves that number', () => {
  const ledger = ['nucleus → taxonomy, 9.13.26 12:00 NYC [nucleus-x-1 re taxonomy-pr132-review-7] ACK: c. Needs: none\n'];
  assert.equal(nextCounter(ledger, 'taxonomy-pr132-review'), 8);
});

test('a longer prefix is not matched by a shorter one', () => {
  assert.equal(highestCounter(['a → b, 9.13.26 10:00 NYC [taxonomy-pr132-review-extra-5] FYI: x.\n'], 'taxonomy-pr132-review'), 0);
});

test("times are rendered in Ben's zone whatever the box clock says", () => {
  const p = timeParts(new Date(Date.UTC(2026, 8, 13, 3, 5)));
  assert.equal(p.date, '9.12.26');
  assert.equal(p.time, '23:05');
  assert.equal(p.ymd, '2026-09-12');
});

test('L5: the packet template carries a Received / acted section', () => {
  const t = packetTemplate({ id: 'a-1', title: 't', from: 'a', to: 'b', date: '9.13.26', time: '10:00', tz: 'NYC', body: 'x' });
  assert.match(t, /## Received \/ acted/);
  assert.match(t, /supersedes: none/);
  assert.equal(firstSentence('Please review PR #132. It is green.'), 'Please review PR #132');
});

// ─────────────────────────────────────────────────────────────────────────────
// The docs must stay parseable
// ─────────────────────────────────────────────────────────────────────────────

function envelopesIn(url) {
  return fs.readFileSync(url, 'utf8').split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[a-z0-9-]+ → [a-z0-9-]+, \d/.test(l));
}

test('every envelope printed in references/examples.md parses', () => {
  const lines = envelopesIn(new URL('../references/examples.md', import.meta.url));
  assert.ok(lines.length >= 8, `expected at least 8 example envelopes, found ${lines.length}`);
  for (const line of lines) {
    const g = parseEnvelope(line);
    assert.ok(g, `does not match the pinned regex:\n${line}`);
    assert.ok(line.length <= MAX_LINE, `over the ${MAX_LINE} cap:\n${line}`);
    assert.ok(g.id.startsWith(`${g.from}-`), `id is not sender-prefixed:\n${line}`);
    if (g.kind !== 'ASK' && g.needs) assert.equal(g.needs, 'none', `non-ASK with a real need:\n${line}`);
    if (g.details) assert.doesNotThrow(() => validateDetails(g.details), `bad Details path:\n${line}`);
  }
});

test('no documented envelope shows a substance note-send would refuse to build', () => {
  // The docs must never teach a line the tool rejects — review H2 widened the shell-payload
  // guard, and six examples carried a `;` until this test caught them.
  for (const rel of ['../references/examples.md', '../SKILL.md', '../references/envelope.md']) {
    for (const line of envelopesIn(new URL(rel, import.meta.url))) {
      const g = parseEnvelope(line);
      assert.ok(g, `does not parse (${rel}):\n${line}`);
      assert.doesNotThrow(() => assertFieldSafe('text', g.body), `unsendable substance (${rel}):\n${line}`);
      if (g.goal) assert.doesNotThrow(() => assertFieldSafe('goal', g.goal), `unsendable goal (${rel}):\n${line}`);
    }
  }
});

test('every envelope in the pinned envelope.md and in SKILL.md parses too', () => {
  for (const rel of ['../references/envelope.md', '../SKILL.md']) {
    const lines = envelopesIn(new URL(rel, import.meta.url));
    assert.ok(lines.length >= 1, `no envelopes found in ${rel}`);
    for (const line of lines) assert.ok(parseEnvelope(line), `does not match (${rel}):\n${line}`);
  }
});
