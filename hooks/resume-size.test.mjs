// node --test "hooks/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readTail, readContextTokens, TAIL_BYTES } from './resume-size.mjs';

function scratchHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'resume-size-'));
}

function assistantLine(usage) {
  return JSON.stringify({ type: 'assistant', message: { role: 'assistant', usage } });
}

test('readContextTokens: sums the three pinned fields from the last assistant usage line', () => {
  const dir = scratchHome();
  const file = path.join(dir, 't.jsonl');
  const lines = [
    assistantLine({ input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 1 }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
    assistantLine({ input_tokens: 100, cache_creation_input_tokens: 20000, cache_read_input_tokens: 150000, output_tokens: 400 }),
  ];
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  assert.equal(readContextTokens(fs, file), 170100);
});

test('readContextTokens: missing usage fields count as 0', () => {
  const dir = scratchHome();
  const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, assistantLine({ input_tokens: 42 }) + '\n', 'utf8');
  assert.equal(readContextTokens(fs, file), 42);
});

test('readContextTokens: a malformed line is skipped, not fatal to the rest', () => {
  const dir = scratchHome();
  const file = path.join(dir, 't.jsonl');
  const lines = [
    'not json at all {{{',
    assistantLine({ input_tokens: 7, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }),
  ];
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  assert.equal(readContextTokens(fs, file), 7);
});

test('readContextTokens: no assistant usage anywhere returns null', () => {
  const dir = scratchHome();
  const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, JSON.stringify({ type: 'user', message: { content: 'hi' } }) + '\n', 'utf8');
  assert.equal(readContextTokens(fs, file), null);
});

test('readContextTokens: a missing file returns null, never throws', () => {
  const dir = scratchHome();
  const file = path.join(dir, 'does-not-exist.jsonl');
  assert.doesNotThrow(() => readContextTokens(fs, file));
  assert.equal(readContextTokens(fs, file), null);
});

test('readContextTokens: an empty file returns null', () => {
  const dir = scratchHome();
  const file = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(file, '', 'utf8');
  assert.equal(readContextTokens(fs, file), null);
});

// The pinned contract: a huge transcript is never read whole. Faked entirely through an
// injected fsImpl (no real 50 MB fixture on disk) — the assertion is on the byte length
// `readSync` is actually asked for, not on wall-clock time.
test('readContextTokens: a 50 MB fixture is not read whole (injected fs records the requested read size)', () => {
  const FAKE_SIZE = 50 * 1024 * 1024;
  const payload = assistantLine({ input_tokens: 9, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  let requestedLength = null;
  let requestedPosition = null;
  const fakeFs = {
    statSync() { return { size: FAKE_SIZE }; },
    openSync() { return 99; },
    readSync(fd, buffer, offset, length, position) {
      requestedLength = length;
      requestedPosition = position;
      // Simulate the real tail: garbage up front (a line cut mid-record by the tail read),
      // then one clean valid line at the very end, right-padded to fill the buffer exactly
      // like a real pread would.
      const tail = `garbage-mid-line\n${payload}\n`;
      const padded = tail.padStart(length, ' ');
      buffer.write(padded, 0, 'utf8');
      return length;
    },
    closeSync() {},
  };
  const tokens = readContextTokens(fakeFs, '/fake/huge-transcript.jsonl');
  assert.equal(tokens, 9);
  assert.ok(requestedLength <= TAIL_BYTES, `expected a bounded read, got length ${requestedLength}`);
  assert.equal(requestedPosition, FAKE_SIZE - TAIL_BYTES, 'must seek to the last TAIL_BYTES, not read from the start');
});

test('readTail: a file smaller than maxBytes is read in full, from position 0', () => {
  const dir = scratchHome();
  const file = path.join(dir, 'small.jsonl');
  fs.writeFileSync(file, 'hello world', 'utf8');
  assert.equal(readTail(fs, file, TAIL_BYTES), 'hello world');
});
