import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import { lfLines } from './jsonl-lines.mjs';

async function collect(stream) {
  const rows = [];
  for await (const row of lfLines(stream)) rows.push(row);
  return rows;
}

function decodedByteChunks(text, cutOffsets) {
  const bytes = Buffer.from(text, 'utf8');
  const chunks = [];
  let start = 0;
  for (const end of cutOffsets) {
    chunks.push(bytes.subarray(start, end));
    start = end;
  }
  chunks.push(bytes.subarray(start));
  const stream = Readable.from(chunks);
  stream.setEncoding('utf8');
  return stream;
}

test('lfLines frames only on LF across decoded chunk boundaries and preserves JSON Unicode separators', async () => {
  const expected = [
    { id: 1, text: 'left\u2028right' },
    { id: 2, text: 'left\u2029right' },
    null,
    { id: 3, text: 'unterminated' },
  ];
  const first = JSON.stringify(expected[0]);
  const second = JSON.stringify(expected[1]);
  const final = JSON.stringify(expected[3]);
  const input = `${first}\r\n${second}\n\n${final}\r`;
  const bytes = Buffer.from(input, 'utf8');
  const u2028 = bytes.indexOf(Buffer.from('\u2028'));
  const firstLf = bytes.indexOf(0x0a);
  const stream = decodedByteChunks(input, [u2028 + 1, u2028 + 2, firstLf, firstLf + 1, bytes.length - 1]);

  const rows = await collect(stream);

  assert.deepEqual(rows, [first, second, '', final], 'one trailing CR is stripped while blank rows remain visible');
  assert.equal(rows.some((row) => row.includes('\ufffd')), false, 'decoded Unicode bytes are never replaced');
  assert.deepEqual(rows.filter(Boolean).map((row) => JSON.parse(row)), expected.filter(Boolean), 'every nonblank LF-framed row parses exactly');
});

test('lfLines yields a final non-LF remainder once and does not invent a row after a terminal LF', async () => {
  assert.deepEqual(await collect(Readable.from(['alpha\nbe', 'ta'])), ['alpha', 'beta']);
  assert.deepEqual(await collect(Readable.from(['alpha\n'])), ['alpha']);
  assert.deepEqual(await collect(Readable.from(['\r'])), [''], 'a nonempty final remainder is yielded after stripping its CR');
  assert.deepEqual(await collect(Readable.from(['x\r', '\ny'])), ['x', 'y'], 'CR is stripped after chunks are joined');
});

test('lfLines rejects byte chunks instead of silently decoding a split UTF-8 sequence', async () => {
  await assert.rejects(
    () => collect(Readable.from([Buffer.from('one\n')])),
    (error) => error instanceof TypeError && /utf8-decoded string chunks/i.test(error.message),
  );
});

test('lfLines propagates a source error without yielding its pending partial remainder', async () => {
  const failure = new Error('synthetic stream failure');
  async function* brokenSource() {
    yield 'a\npar';
    throw failure;
  }

  const iterator = lfLines(brokenSource());
  assert.deepEqual(await iterator.next(), { value: 'a', done: false });
  await assert.rejects(() => iterator.next(), (error) => error === failure);
});

test('lfLines closes the source when a consumer exits early', async () => {
  const stream = Readable.from(['first\nsecond\n']);
  for await (const row of lfLines(stream)) {
    assert.equal(row, 'first');
    break;
  }
  assert.equal(stream.destroyed, true);
});
