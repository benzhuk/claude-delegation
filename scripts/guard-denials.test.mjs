// node --test scripts/guard-denials.test.mjs
// Lane 68 (census68): the secret guard's denial-log reader. Every test builds a fake home with
// scripts/test-home.mjs and injects it; nothing here opens the real home or the real log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeTempHome } from './test-home.mjs';
import { denialsLogPath, guardLogOffSwitchPath, readGuardDenials, formatGuardDenials, guardDenialsValue } from './guard-denials.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_REL = path.join('.local', 'state', 'secret-guard', 'denials.log');
const T = (iso) => Date.parse(iso);
const FROM = T('2026-10-01T10:00:00.000Z');
const TO = T('2026-10-01T12:00:00.000Z');
// A sentinel that only field 5 carries: it must never surface in any result or text.
const SECRET_TEXT = 'cat ~/.config/claude/SENTINEL-FIELD-FIVE-TEXT';
const line = (iso, phase, tool, name, text = SECRET_TEXT) => [iso, phase, tool, name, text].join('\t');

function homeWith(files) {
  const { home } = makeTempHome({ files, gitIdentity: false });
  return home;
}

test('counts denials inside the window by pattern name, inclusive at both ends, one rotated generation included', () => {
  const home = homeWith({
    [LOG_REL]: [
      line('2026-10-01T09:59:59.999Z', 'PreToolUse', 'Bash', 'before_window'),
      line('2026-10-01T10:00:00.000Z', 'PreToolUse', 'Bash', 'secret_path_default_deny'),
      line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', 'secret_path_default_deny'),
      line('2026-10-01T11:00:00.000Z', 'PostToolUse', 'Bash', 'env_dump'),
      line('2026-10-01T12:00:00.000Z', 'PreToolUse', 'Read', 'secret_path_default_deny'),
      line('2026-10-01T12:00:00.001Z', 'PreToolUse', 'Bash', 'after_window'),
      '',
    ].join('\n'),
    [`${LOG_REL}.1`]: [
      line('2026-10-01T10:15:00.000Z', 'PreToolUse', 'Bash', 'env_dump'),
      line('2026-09-01T10:15:00.000Z', 'PreToolUse', 'Bash', 'last_month'),
      '',
    ].join('\n'),
  });
  const r = readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'box-1' });
  assert.equal(r.available, true);
  assert.equal(r.total, 5);
  assert.deepEqual(r.byPattern, { secret_path_default_deny: 3, env_dump: 2 });
  assert.equal(r.skipped, 0);
  assert.equal(formatGuardDenials(r), '5 on box-1 (secret_path_default_deny 3, env_dump 2)');
});

test('field 5 (the command text) is never returned, stored or printed', () => {
  const home = homeWith({ [LOG_REL]: `${line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', 'env_dump')}\n${line('2026-10-01T10:31:00Z', 'PreToolUse', 'Bash', 'env_dump', `a\tb\tc ${SECRET_TEXT}`)}\n` });
  const r = readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'box-1' });
  const everything = JSON.stringify(r) + formatGuardDenials(r) + guardDenialsValue({ home, env: {}, host: 'box-1', openedMs: FROM, lastAcceptedMs: TO });
  assert.ok(!everything.includes('SENTINEL-FIELD-FIVE-TEXT'), everything);
  assert.ok(!everything.includes('.config'), everything);
  assert.equal(r.total, 2);
});

test('a line that is not the guard\'s shape is skipped and counted in a "skipped N" suffix', () => {
  const home = homeWith({
    [LOG_REL]: [
      line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', 'env_dump'),
      'not a log line at all',
      '2026-10-01T10:30:00Z\tPreToolUse\tBash', // only three fields
      line('yesterday at noon', 'PreToolUse', 'Bash', 'env_dump'), // timestamp not UTC ISO
      line('2026-10-01T10:30:00+02:00', 'PreToolUse', 'Bash', 'env_dump'), // offset, not Z
      line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', 'cat /some/secret file'), // field 4 is not a pattern name
      line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', ''),
      '\r',
      '',
    ].join('\n'),
  });
  const r = readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'box-1' });
  assert.equal(r.total, 1);
  assert.equal(r.skipped, 6);
  assert.equal(formatGuardDenials(r), '1 on box-1 (env_dump 1), skipped 6');
});

test('CRLF line endings and a four-field line (no command text) still count', () => {
  const home = homeWith({ [LOG_REL]: '2026-10-01T10:30:00Z\tPreToolUse\tBash\tenv_dump\r\n2026-10-01T10:31:00Z\tPreToolUse\tBash\tenv_dump\n' });
  assert.equal(readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'h' }).total, 2);
});

test('an empty log is a real zero, said with the host', () => {
  const home = homeWith({ [LOG_REL]: '' });
  assert.equal(formatGuardDenials(readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'box-1' })), '0 on box-1');
});

test('a missing log reads unavailable, never 0', () => {
  const home = homeWith({});
  const r = readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'box-1' });
  assert.equal(r.available, false);
  assert.equal(formatGuardDenials(r), 'unavailable (no denials log on this host)');
});

test('an unreadable log, and an unreadable rotated generation, read unavailable with the error code', () => {
  const home = homeWith({ [LOG_REL]: `${line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', 'env_dump')}\n` });
  const denyAll = { existsSync: () => false, readFileSync: () => { const e = new Error('no'); e.code = 'EACCES'; throw e; } };
  assert.equal(formatGuardDenials(readGuardDenials({ fsImpl: denyAll, home, env: {}, fromMs: FROM, toMs: TO })), 'unavailable (denials log unreadable (EACCES))');
  const denyRotated = { existsSync: fs.existsSync, readFileSync: (f, enc) => { if (String(f).endsWith('.1')) { const e = new Error('no'); e.code = 'EPERM'; throw e; } return fs.readFileSync(f, enc); } };
  assert.equal(formatGuardDenials(readGuardDenials({ fsImpl: denyRotated, home, env: {}, fromMs: FROM, toMs: TO })), 'unavailable (rotated denials log unreadable (EPERM))');
});

test('the guard\'s own off switch (~/.agents/ws-off-guard-log) makes the count unavailable, never 0', () => {
  const home = homeWith({ [LOG_REL]: '', [path.join('.agents', 'ws-off-guard-log')]: '' });
  assert.equal(fs.existsSync(guardLogOffSwitchPath(home)), true);
  const r = readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'box-1' });
  assert.equal(r.available, false);
  assert.match(formatGuardDenials(r), /^unavailable \(guard log off switch .*ws-off-guard-log is present\)$/);
});

test('$XDG_STATE_HOME wins over <home>/.local/state when set', () => {
  const home = homeWith({
    [LOG_REL]: `${line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', 'from_home')}\n`,
    [path.join('xdg', 'secret-guard', 'denials.log')]: `${line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', 'from_xdg')}\n${line('2026-10-01T10:31:00Z', 'PreToolUse', 'Bash', 'from_xdg')}\n`,
  });
  const env = { XDG_STATE_HOME: path.join(home, 'xdg') };
  assert.equal(denialsLogPath(home, env), path.join(home, 'xdg', 'secret-guard', 'denials.log'));
  assert.equal(denialsLogPath(home, {}), path.join(home, LOG_REL));
  assert.equal(denialsLogPath(home, { XDG_STATE_HOME: '  ' }), path.join(home, LOG_REL));
  assert.equal(denialsLogPath(home, { XDG_STATE_HOME: 'rel/dir' }), path.join(home, LOG_REL), 'a relative value is ignored, as the guard ignores it');
  assert.deepEqual(readGuardDenials({ home, env, fromMs: FROM, toMs: TO, host: 'h' }).byPattern, { from_xdg: 2 });
  assert.deepEqual(readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'h' }).byPattern, { from_home: 1 });
});

test('no home or no window reads unavailable', () => {
  assert.match(formatGuardDenials(readGuardDenials({ env: {}, fromMs: FROM, toMs: TO })), /^unavailable \(no home directory\)$/);
  const home = homeWith({ [LOG_REL]: '' });
  assert.equal(formatGuardDenials(readGuardDenials({ home, env: {}, fromMs: NaN, toMs: TO })), 'unavailable (no build window)');
  assert.equal(guardDenialsValue({ home, env: {}, host: 'h', openedMs: null, lastAcceptedMs: TO }), 'unavailable (no Opened:)');
  assert.equal(guardDenialsValue({ home, env: {}, host: 'h', openedMs: FROM, lastAcceptedMs: null, reason: 'no accepted Log: entry' }), 'unavailable (no accepted Log: entry)');
  assert.equal(guardDenialsValue({ home, env: {}, host: 'h', openedMs: FROM, lastAcceptedMs: TO }), '0 on h');
});

test('ties in a pattern count sort by name, so the text is deterministic', () => {
  const home = homeWith({ [LOG_REL]: ['b_pat', 'a_pat', 'b_pat', 'a_pat', 'c_pat'].map((n) => line('2026-10-01T10:30:00Z', 'PreToolUse', 'Bash', n)).join('\n') });
  assert.equal(formatGuardDenials(readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'h' })), '5 on h (a_pat 2, b_pat 2, c_pat 1)');
});

test('the reader adds no switch, flag or environment variable of its own and does nothing at import', () => {
  const source = fs.readFileSync(path.join(HERE, 'guard-denials.mjs'), 'utf8');
  assert.ok(!/process\.env|process\.argv|os\.homedir|os\.hostname/.test(source), 'home, env and host are all injected');
  assert.ok(!/writeFile|appendFile|mkdir|unlink|rmSync|renameSync/.test(source), 'read-only');
  assert.deepEqual([...source.matchAll(/ws-off-[a-z-]+/g)].map((m) => m[0]), ['ws-off-guard-log', 'ws-off-guard-log']);
});

test('a rotation copies the newer half of .1 into the new log; those lines count once', () => {
  const L = (m, n) => line(`2026-10-01T10:${String(m).padStart(2, '0')}:00Z`, 'PreToolUse', 'Bash', n);
  const before = [L(1, 'a'), L(2, 'a'), L(3, 'b'), L(4, 'b')];
  const home = homeWith({
    [`${LOG_REL}.1`]: `${before.join('\n')}\n`,
    [LOG_REL]: `${[...before.slice(2), L(5, 'c')].join('\n')}\n`,
  });
  assert.equal(formatGuardDenials(readGuardDenials({ home, env: {}, fromMs: FROM, toMs: TO, host: 'h' })), '5 on h (a 2, b 2, c 1)');
});
