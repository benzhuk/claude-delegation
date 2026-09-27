// node scripts/run-tests.mjs skills/decisions/scripts/decisions-title.test.mjs
// decisions-title: retitles the decisions page (C2 format, C3 topic resolution, C5 CLI/API).
// `fetch` is injected everywhere below; no test in this file touches the real network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../../multi/scripts/test-child-env.mjs';
import {
  run, formatTitle, parseTitle, canonicalPageId, lookupRegisteredTopic,
} from './decisions-title.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = path.join(HERE, 'decisions-title.mjs');

function tmpdir(prefix = 'decisions-title-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const PAGE = '3e1da11277a18174bccfea187d5c3972'; // 32 hex chars (contracts.md's own example id)

// ─────────────────────────────────────────────────────────────────────────────
// C2: formatTitle / parseTitle
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_CASES = [
  // [ISO instant (UTC), expected NY wall clock inside the title]
  ['2026-09-22T04:00:00Z', '9/22 12:00AM'], // midnight NY
  ['2026-09-22T04:05:00Z', '9/22 12:05AM'], // 00:05 NY
  ['2026-09-22T15:59:00Z', '9/22 11:59AM'], // 11:59 NY
  ['2026-09-22T16:00:00Z', '9/22 12:00PM'], // noon NY
  ['2026-09-22T16:30:00Z', '9/22 12:30PM'], // 12:30 NY
  ['2026-09-23T03:59:00Z', '9/22 11:59PM'], // 23:59 NY
];

for (const [iso, expected] of FORMAT_CASES) {
  test(`formatTitle: ${iso} UTC -> "${expected}" NY`, () => {
    const title = formatTitle('Skills', new Date(iso));
    assert.equal(title, `Skills: ${expected} Decisions`);
  });
}

test('formatTitle: one space after the colon, one before "Decisions", no other formatting', () => {
  const title = formatTitle('Skills', new Date('2026-09-22T16:00:00Z'));
  assert.equal(title, 'Skills: 9/22 12:00PM Decisions');
});

test('formatTitle/parseTitle round-trip across the fall-back DST hour (1:30AM occurs twice)', () => {
  // Both instants are real, distinct UTC moments an hour apart; both are 1:30AM NY wall time
  // (2026-11-01 is the US fall-back date) -- the title format only encodes wall time, so both
  // format identically. This is the documented behaviour (never a fixed offset), not a bug.
  const before = new Date('2026-11-01T05:30:00Z'); // 1:30AM EDT
  const after = new Date('2026-11-01T06:30:00Z'); // 1:30AM EST (after the clocks fall back)
  const titleBefore = formatTitle('Skills', before);
  const titleAfter = formatTitle('Skills', after);
  assert.equal(titleBefore, 'Skills: 11/1 1:30AM Decisions');
  assert.equal(titleAfter, 'Skills: 11/1 1:30AM Decisions');
  assert.deepEqual(parseTitle(titleBefore), { topic: 'Skills', month: 11, day: 1, hour24: 1, minute: 30 });
});

test('formatTitle: the spring-forward hour jumps straight from 1:xx to 3:xx (2:xx never exists)', () => {
  const beforeJump = formatTitle('Skills', new Date('2026-03-08T06:30:00Z'));
  const afterJump = formatTitle('Skills', new Date('2026-03-08T07:30:00Z'));
  assert.equal(beforeJump, 'Skills: 3/8 1:30AM Decisions');
  assert.equal(afterJump, 'Skills: 3/8 3:30AM Decisions');
});

test('formatTitle: across New Year (Dec 31 23:59 NY -> Jan 1 00:00 NY)', () => {
  const nye = formatTitle('Skills', new Date('2027-01-01T04:59:00Z'));
  const nyd = formatTitle('Skills', new Date('2027-01-01T05:00:00Z'));
  assert.equal(nye, 'Skills: 12/31 11:59PM Decisions');
  assert.equal(nyd, 'Skills: 1/1 12:00AM Decisions');
});

test('parseTitle: the inverse of formatTitle for every format case above, hour24 both ends', () => {
  assert.deepEqual(parseTitle('Skills: 9/22 12:05AM Decisions'), {
    topic: 'Skills', month: 9, day: 22, hour24: 0, minute: 5,
  });
  assert.deepEqual(parseTitle('Skills: 9/22 12:00PM Decisions'), {
    topic: 'Skills', month: 9, day: 22, hour24: 12, minute: 0,
  });
  assert.deepEqual(parseTitle('Skills: 9/22 11:59PM Decisions'), {
    topic: 'Skills', month: 9, day: 22, hour24: 23, minute: 59,
  });
});

test('parseTitle: a topic containing a colon is still recovered (greedy, backtracking match)', () => {
  assert.deepEqual(parseTitle('Foo: Bar: 9/5 1:00PM Decisions'), {
    topic: 'Foo: Bar', month: 9, day: 5, hour24: 13, minute: 0,
  });
});

test('parseTitle: extra internal spaces fail to parse (null, not a loose match)', () => {
  assert.equal(parseTitle('Skills:  9/22 12:00PM Decisions'), null); // two spaces after colon
  assert.equal(parseTitle('Skills: 9/22  12:00PM Decisions'), null); // two spaces before time
  assert.equal(parseTitle('Skills: 9/22 12:00PM  Decisions'), null); // two spaces before Decisions
  assert.equal(parseTitle('Skills: 9/22 12:00PM Decisions '), null); // trailing space
});

test('parseTitle: lower-case am/pm, missing "Decisions", or no title at all all fail to parse', () => {
  assert.equal(parseTitle('Skills: 9/22 12:00pm Decisions'), null);
  assert.equal(parseTitle('Skills: 9/22 12:00PM'), null);
  assert.equal(parseTitle(''), null);
  assert.equal(parseTitle('just some other page title'), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// canonicalPageId
// ─────────────────────────────────────────────────────────────────────────────

test('canonicalPageId: dashes and letter case never matter', () => {
  const dashed = '3e1da112-77a1-8174-bccf-ea187d5c397a';
  const plain = '3e1da11277a18174bccfea187d5c397a';
  assert.equal(canonicalPageId(dashed), canonicalPageId(plain));
  assert.equal(canonicalPageId(dashed.toUpperCase()), canonicalPageId(plain));
});

// ─────────────────────────────────────────────────────────────────────────────
// C3: lookupRegisteredTopic
// ─────────────────────────────────────────────────────────────────────────────

function writeRegistrations(home, entries) {
  const dir = path.join(home, 'ws', 'decisions-pickup');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registrations.json'), JSON.stringify({ version: 1, entries }), 'utf8');
  return home;
}

test('lookupRegisteredTopic: a missing registrations.json is skipped, not fatal', () => {
  const home = tmpdir();
  assert.equal(lookupRegisteredTopic(PAGE, { AGENTS_HOME: home }), null);
});

test('lookupRegisteredTopic: an unparsable registrations.json is skipped, not fatal', () => {
  const home = tmpdir();
  const dir = path.join(home, 'ws', 'decisions-pickup');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registrations.json'), '{ not json', 'utf8');
  assert.equal(lookupRegisteredTopic(PAGE, { AGENTS_HOME: home }), null);
});

test('lookupRegisteredTopic: finds the topic for the matching page, dash/case-insensitive', () => {
  const home = writeRegistrations(tmpdir(), [
    { repo: '/r', page: PAGE.slice(0, 8) + '-' + PAGE.slice(8, 12) + '-' + PAGE.slice(12, 16) + '-'
      + PAGE.slice(16, 20) + '-' + PAGE.slice(20), from: 'a', owner: 'b', reader: '/reader', topic: 'Skills' },
  ]);
  assert.equal(lookupRegisteredTopic(PAGE.toUpperCase(), { AGENTS_HOME: home }), 'Skills');
});

test('lookupRegisteredTopic: a registration for a different page is never used', () => {
  const home = writeRegistrations(tmpdir(), [
    { repo: '/r', page: 'a'.repeat(32), from: 'a', owner: 'b', reader: '/reader', topic: 'Wrong' },
  ]);
  assert.equal(lookupRegisteredTopic(PAGE, { AGENTS_HOME: home }), null);
});

test('lookupRegisteredTopic: an entry whose topic is not a string (e.g. null) is ignored', () => {
  const home = writeRegistrations(tmpdir(), [
    { repo: '/r', page: PAGE, from: 'a', owner: 'b', reader: '/reader', topic: null },
  ]);
  assert.equal(lookupRegisteredTopic(PAGE, { AGENTS_HOME: home }), null);
});

test('lookupRegisteredTopic: an entry whose topic fails the C3 shape is ignored', () => {
  const home = writeRegistrations(tmpdir(), [
    { repo: '/r', page: PAGE, from: 'a', owner: 'b', reader: '/reader', topic: 'has:colon' },
  ]);
  assert.equal(lookupRegisteredTopic(PAGE, { AGENTS_HOME: home }), null);
});

test('lookupRegisteredTopic: an unexpected version or shape is skipped, not fatal', () => {
  const home = tmpdir();
  const dir = path.join(home, 'ws', 'decisions-pickup');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registrations.json'), JSON.stringify({ version: 2, entries: [] }), 'utf8');
  assert.equal(lookupRegisteredTopic(PAGE, { AGENTS_HOME: home }), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// run(): a fake, fully in-memory fetch. Every response is queued in order; a missing queue
// entry throws, so an unexpectedly extra call fails the test loudly instead of hanging.
// ─────────────────────────────────────────────────────────────────────────────

function fakeFetch(responses) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, opts) => {
    calls.push({
      url, method: opts.method, headers: opts.headers,
      body: opts.body === undefined ? undefined : JSON.parse(opts.body),
    });
    if (i >= responses.length) throw new Error(`fakeFetch: no queued response for call ${i + 1} (${url})`);
    const r = responses[i];
    i += 1;
    if (r.throw) throw r.throw;
    return { ok: r.ok !== false, status: r.status ?? 200, json: async () => r.json ?? {} };
  };
  return { calls, fetch: fetchImpl };
}

function titlePropertyPage(title, lastEdited = '2026-09-22T16:00:00.000Z') {
  return {
    properties: { title: { id: 'title', type: 'title', title: title ? [{ type: 'text', plain_text: title }] : [] } },
    last_edited_time: lastEdited,
  };
}

async function runIt(opts) {
  const out = [];
  const err = [];
  const code = await run({
    ...opts,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  });
  return { code, stdout: out.join(''), stderr: err.join('') };
}

test('run: NOTION_TOKEN unset -- exit 3, names the variable, prints no value, no fetch call', async () => {
  const { calls, fetch } = fakeFetch([]);
  const { code, stderr } = await runIt({
    argv: ['set', '--page', PAGE, '--topic', 'Skills'],
    env: {},
    fetch,
  });
  assert.equal(code, 3);
  assert.match(stderr, /NOTION_TOKEN/);
  assert.equal(calls.length, 0);
});

test('run set: --topic given -- one PATCH only, no GET, correct body, prints TITLE line', async () => {
  const { calls, fetch } = fakeFetch([{ json: {} }]);
  const { code, stdout } = await runIt({
    argv: ['set', '--page', PAGE, '--topic', 'Skills', '--now', '2026-09-22T16:00:00Z'],
    env: { NOTION_TOKEN: 'secret' },
    fetch,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].headers.Authorization, 'Bearer secret');
  assert.equal(calls[0].headers['Notion-Version'], '2022-06-28');
  assert.deepEqual(calls[0].body, {
    properties: { title: { title: [{ type: 'text', text: { content: 'Skills: 9/22 12:00PM Decisions' } }] } },
  });
  assert.equal(stdout, 'TITLE Skills: 9/22 12:00PM Decisions\n');
});

test('run set: page has no title at all -- --topic still works with no GET', async () => {
  // C5/spec P3.4: "a page with no title (set still works, topic from flag)".
  const { calls, fetch } = fakeFetch([{ json: {} }]);
  const { code, stdout } = await runIt({
    argv: ['set', '--page', PAGE, '--topic', 'Skills', '--now', '2026-09-22T16:00:00Z'],
    env: { NOTION_TOKEN: 'secret' },
    fetch,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1); // never looked at the page's (nonexistent) title
  assert.match(stdout, /^TITLE Skills: 9\/22 12:00PM Decisions\n$/);
});

test('run set: topic from a registration entry for this page -- no GET either', async () => {
  const home = writeRegistrations(tmpdir(), [
    { repo: '/r', page: PAGE, from: 'a', owner: 'b', reader: '/reader', topic: 'Registered' },
  ]);
  const { calls, fetch } = fakeFetch([{ json: {} }]);
  const { code, stdout } = await runIt({
    argv: ['set', '--page', PAGE, '--now', '2026-09-22T16:00:00Z'],
    env: { NOTION_TOKEN: 'secret', AGENTS_HOME: home },
    fetch,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PATCH');
  assert.match(stdout, /^TITLE Registered: 9\/22 12:00PM Decisions\n$/);
});

test('run set: no --topic and no registration -- topic parsed from the current title (GET then PATCH)', async () => {
  const { calls, fetch } = fakeFetch([
    { json: titlePropertyPage('FromTitle: 9/1 10:00AM Decisions') },
    { json: {} },
  ]);
  const home = tmpdir(); // no registrations.json here
  const { code, stdout } = await runIt({
    argv: ['set', '--page', PAGE, '--now', '2026-09-22T16:00:00Z'],
    env: { NOTION_TOKEN: 'secret', AGENTS_HOME: home },
    fetch,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].method, 'PATCH');
  assert.match(stdout, /^TITLE FromTitle: 9\/22 12:00PM Decisions\n$/);
});

test('run set: no topic anywhere -- exit 2, one GET only, no PATCH sent', async () => {
  const { calls, fetch } = fakeFetch([
    { json: titlePropertyPage('') }, // no title, and no registration, and no --topic
  ]);
  const home = tmpdir();
  const { code, stderr } = await runIt({
    argv: ['set', '--page', PAGE],
    env: { NOTION_TOKEN: 'secret', AGENTS_HOME: home },
    fetch,
  });
  assert.equal(code, 2);
  assert.match(stderr, /no topic/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

test('run set: an HTTP 400 on the PATCH -- exit 4, status and Notion error code only', async () => {
  const { fetch } = fakeFetch([
    { ok: false, status: 400, json: { object: 'error', status: 400, code: 'validation_error', message: 'nope, do not print me' } },
  ]);
  const { code, stderr } = await runIt({
    argv: ['set', '--page', PAGE, '--topic', 'Skills'],
    env: { NOTION_TOKEN: 'secret' },
    fetch,
  });
  assert.equal(code, 4);
  assert.match(stderr, /400/);
  assert.match(stderr, /validation_error/);
  assert.doesNotMatch(stderr, /do not print me/);
});

test('run set: a network failure (fetch rejects) -- exit 4, distinct wording from an HTTP error', async () => {
  const { fetch } = fakeFetch([{ throw: new Error('ECONNRESET') }]);
  const { code, stderr } = await runIt({
    argv: ['set', '--page', PAGE, '--topic', 'Skills'],
    env: { NOTION_TOKEN: 'secret' },
    fetch,
  });
  assert.equal(code, 4);
  assert.match(stderr, /network error/);
  assert.doesNotMatch(stderr, /^decisions-title: HTTP/);
});

test('run meta: one GET, prints page/title/last_edited_time JSON', async () => {
  const { calls, fetch } = fakeFetch([
    { json: titlePropertyPage('Skills: 9/22 12:00PM Decisions', '2026-09-22T16:00:00.000Z') },
  ]);
  const { code, stdout } = await runIt({
    argv: ['meta', '--page', PAGE],
    env: { NOTION_TOKEN: 'secret' },
    fetch,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.deepEqual(JSON.parse(stdout), {
    page: canonicalPageId(PAGE), title: 'Skills: 9/22 12:00PM Decisions', last_edited_time: '2026-09-22T16:00:00.000Z',
  });
});

test('run meta: a page with no title property prints an empty title, never a crash', async () => {
  const { fetch } = fakeFetch([{ json: { properties: {}, last_edited_time: '2026-09-22T16:00:00.000Z' } }]);
  const { code, stdout } = await runIt({ argv: ['meta', '--page', PAGE], env: { NOTION_TOKEN: 'secret' }, fetch });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).title, '');
});

test('run meta: an HTTP error -- exit 4, status and code only', async () => {
  const { fetch } = fakeFetch([{ ok: false, status: 404, json: { code: 'object_not_found', message: 'secret detail' } }]);
  const { code, stderr } = await runIt({ argv: ['meta', '--page', PAGE], env: { NOTION_TOKEN: 'secret' }, fetch });
  assert.equal(code, 4);
  assert.match(stderr, /404/);
  assert.match(stderr, /object_not_found/);
  assert.doesNotMatch(stderr, /secret detail/);
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI usage (exit 2), all of it argv-only -- no fetch call is ever reached.
// ─────────────────────────────────────────────────────────────────────────────

test('run: no subcommand, an unknown subcommand, a missing --page, a malformed --page, and a bad --topic all exit 2', async () => {
  const { calls, fetch } = fakeFetch([]);
  const env = { NOTION_TOKEN: 'secret' };
  for (const argv of [
    [],
    ['bogus', '--page', PAGE],
    ['set'],
    ['set', '--page', 'not-hex'],
    ['set', '--page', PAGE, '--topic', 'has:colon'],
    ['meta', '--page', PAGE, '--topic', 'Skills'], // meta takes no --topic
    ['set', '--page', PAGE, '--topic', 'Skills', '--now', 'not-a-date'],
  ]) {
    const { code } = await runIt({ argv, env, fetch });
    assert.equal(code, 2, `argv=${JSON.stringify(argv)}`);
  }
  assert.equal(calls.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Real process smoke test: usage errors never touch the network and exit before any fetch is
// possible, so this is safe without a live NOTION_TOKEN or network access.
// ─────────────────────────────────────────────────────────────────────────────

test('CLI: real process, no arguments at all -- exits 2, no NOTION_TOKEN needed', () => {
  const home = tmpdir();
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: home, NOTION_TOKEN: '' }),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /decisions-title:/);
});
