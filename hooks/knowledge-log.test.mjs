// node --test "hooks/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { decide } from './knowledge-log.mjs';
// Shared with skills/multi/scripts and hooks/delete-guard.test.mjs: a CLI-subprocess test
// must never spread process.env itself — childEnv() is the one sanctioned way to build a
// child environment (see test-child-env.mjs for why).
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.join(HERE, 'knowledge-log.mjs');

function scratchHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-log-'));
  fs.mkdirSync(path.join(home, '.claude', 'knowledge'), { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'knowledge', '_inbox'), { recursive: true });
  return home;
}

function ctxFor(home, fsImpl = fs) {
  return { home, fsImpl };
}

const PAYLOAD = (toolName, filePath, over = {}) => ({
  tool_name: toolName,
  tool_input: { file_path: filePath },
  cwd: process.cwd(),
  session_id: 'sess-abc123',
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
// decide() — spec item 4's four numbered test shapes, plus the others it names
// ─────────────────────────────────────────────────────────────────────────────

test('decide: a Read under the knowledge store logs to read.log', () => {
  const home = scratchHome();
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home));
  assert.equal(result.skip, false);
  assert.equal(result.target, 'read');
  assert.match(result.line, /^\S+ Read \S+css\.md sess-abc123$/);
});

test('decide: a Read under _inbox logs to inbox.log, not read.log', () => {
  const home = scratchHome();
  const filePath = path.join(home, '.claude', 'knowledge', '_inbox', 'note.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home));
  assert.equal(result.target, 'inbox');
  assert.match(result.line, /^\S+ Read \S+note\.md sess-abc123$/);
});

test('decide: a Write under _inbox logs to inbox.log', () => {
  const home = scratchHome();
  const filePath = path.join(home, '.claude', 'knowledge', '_inbox', 'new-note.md');
  const result = decide(PAYLOAD('Write', filePath), ctxFor(home));
  assert.equal(result.target, 'inbox');
  assert.match(result.line, /^\S+ Write \S+new-note\.md sess-abc123$/);
});

test('decide: an Edit under the knowledge store (not _inbox) logs to read.log', () => {
  const home = scratchHome();
  const filePath = path.join(home, '.claude', 'knowledge', 'macos-automation.md');
  const result = decide(PAYLOAD('Edit', filePath), ctxFor(home));
  assert.equal(result.target, 'read');
});

test('decide: a path outside the store logs nothing', () => {
  const home = scratchHome();
  const filePath = path.join(home, 'Code', 'knowledge-base', 'x.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home));
  assert.equal(result.skip, false);
  assert.equal(result.target, null);
  assert.equal(result.line, null);
});

test('decide: a path that merely contains the word "knowledge" outside the real store logs nothing', () => {
  const home = scratchHome();
  const filePath = path.join(home, 'Code', 'knowledge-base', 'notes.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home));
  assert.equal(result.target, null);
});

test('decide: kill switch ~/.agents/no-knowledge-log skips entirely', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-knowledge-log'), '');
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home));
  assert.equal(result.skip, true);
  assert.equal(result.target, null);
});

test('decide: shared kill switch ~/.agents/ws-off skips entirely', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'ws-off'), '');
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home));
  assert.equal(result.skip, true);
});

test('decide: a kill-switch stat error still counts as present (fail toward doing nothing)', () => {
  const home = scratchHome();
  const throwingFs = {
    ...fs,
    existsSync(p) {
      if (String(p).includes('no-knowledge-log')) throw new Error('boom');
      return fs.existsSync(p);
    },
  };
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home, throwingFs));
  assert.equal(result.skip, true);
});

test('decide: missing knowledge dir writes nothing', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-log-nodir-'));
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home));
  assert.equal(result.skip, false);
  assert.equal(result.target, null);
});

test('decide: a knowledge-dir stat error is treated as absent (writes nothing)', () => {
  const home = scratchHome();
  const throwingFs = {
    ...fs,
    existsSync(p) {
      if (String(p).endsWith(path.join('.claude', 'knowledge'))) throw new Error('boom');
      return fs.existsSync(p);
    },
  };
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const result = decide(PAYLOAD('Read', filePath), ctxFor(home, throwingFs));
  assert.equal(result.target, null);
});

test('decide: a Windows path with backslashes and a drive letter, mixed case, matches the store', { skip: process.platform !== 'win32' && 'Windows path semantics only' }, () => {
  const home = scratchHome();
  // Build the same absolute path decide() would see from a real Windows Read call: the
  // scratch home's drive letter, backslashes, and upper-cased path segments.
  const resolved = path.resolve(home, '.claude', 'knowledge', 'analytics.md');
  const drive = resolved.slice(0, 1).toUpperCase();
  const rest = resolved.slice(2).toUpperCase(); // drop the original drive letter + colon
  const winPath = `${drive}:${rest}`; // e.g. C:\USERS\X\...\.CLAUDE\KNOWLEDGE\ANALYTICS.MD
  assert.ok(winPath.includes('\\'), 'expected a backslash-separated absolute Windows path');
  const result = decide(PAYLOAD('Read', winPath), ctxFor(home));
  assert.equal(result.target, 'read');
});

test('decide: a payload with no file_path logs nothing and never throws', () => {
  const home = scratchHome();
  const input = { tool_name: 'Read', tool_input: {}, session_id: 'sess-1' };
  assert.doesNotThrow(() => decide(input, ctxFor(home)));
  const result = decide(input, ctxFor(home));
  assert.equal(result.target, null);
});

test('decide: a malformed non-object input never throws and logs nothing', () => {
  const home = scratchHome();
  for (const bad of [null, undefined, 42, 'a string', [], true]) {
    assert.doesNotThrow(() => decide(bad, ctxFor(home)));
    const result = decide(bad, ctxFor(home));
    assert.equal(result.target, null);
  }
});

test('decide: a `~` file_path expands against ctx.home, not the real os.homedir()', () => {
  const home = scratchHome();
  const result = decide(PAYLOAD('Read', '~/.claude/knowledge/INDEX.md'), ctxFor(home));
  assert.equal(result.target, 'read');
  assert.match(result.line, /INDEX\.md/);
});

test('decide: a relative file_path resolves against the payload cwd', () => {
  const home = scratchHome();
  const cwd = path.join(home, '.claude', 'knowledge');
  const input = { tool_name: 'Read', tool_input: { file_path: 'css.md' }, cwd, session_id: 's1' };
  const result = decide(input, ctxFor(home));
  assert.equal(result.target, 'read');
});

test('decide: line length is capped at 400 characters', () => {
  const home = scratchHome();
  const longSession = 'x'.repeat(2000);
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const result = decide(PAYLOAD('Read', filePath, { session_id: longSession }), ctxFor(home));
  assert.equal(result.target, 'read');
  assert.ok(result.line.length <= 400);
});

// ─────────────────────────────────────────────────────────────────────────────
// Symlinks: the comparison is lexical, by decision (header comment). Both directions
// pinned, skipped if this host cannot create a symlink/junction (EPERM).
// ─────────────────────────────────────────────────────────────────────────────

function trySymlink(target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) return false;
    throw err;
  }
}

test('decide: store itself is a link — a Read via the ~/.claude/knowledge path counts, the same file via the link\'s real target path does not', (t) => {
  // home/.claude/knowledge is made a junction to a real dir elsewhere, instead of using
  // scratchHome()'s own real store dir, so this exercises the "store is a link" case (2a).
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-log-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const realTargetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-log-realtarget-'));
  const storePath = path.join(home, '.claude', 'knowledge');
  if (!trySymlink(realTargetDir, storePath)) {
    t.skip('symlink/junction creation not permitted on this host');
    return;
  }
  fs.writeFileSync(path.join(realTargetDir, 'linked.md'), 'x');

  const viaStorePath = decide(PAYLOAD('Read', path.join(storePath, 'linked.md')), ctxFor(home));
  assert.equal(viaStorePath.target, 'read', 'a Read via the ~/.claude/knowledge link path counts');

  const viaRealTargetPath = decide(PAYLOAD('Read', path.join(realTargetDir, 'linked.md')), ctxFor(home));
  assert.equal(viaRealTargetPath.target, null, 'the same file via the link\'s real target path does not count (lexical comparison)');
});

test('decide: a link inside the store pointing outside it still counts as a store read (lexical, by decision)', (t) => {
  const home = scratchHome();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-log-outside-'));
  fs.writeFileSync(path.join(outside, 'elsewhere.md'), 'x');
  const linkInsideStore = path.join(home, '.claude', 'knowledge', 'escape-link');
  if (!trySymlink(outside, linkInsideStore)) {
    t.skip('symlink/junction creation not permitted on this host');
    return;
  }

  const viaStoreLexicalPath = decide(
    PAYLOAD('Read', path.join(linkInsideStore, 'elsewhere.md')),
    ctxFor(home),
  );
  assert.equal(viaStoreLexicalPath.target, 'read', 'the store-lexical path counts even though the link resolves outside the store');
});

// ─────────────────────────────────────────────────────────────────────────────
// The CLI wrapper (subprocess-level checks; everything above is unit-level via decide())
// ─────────────────────────────────────────────────────────────────────────────

function runCliProcess({ home, input }) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: input === undefined ? '' : input,
    env: childEnv(home),
    encoding: 'utf8',
  });
}

function readLastLine(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const text = fs.readFileSync(logPath, 'utf8').trim();
  return text.length === 0 ? null : text.split('\n').pop();
}

test('CLI: a Read under the store appends the exact read.log line shape', () => {
  const home = scratchHome();
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const payload = JSON.stringify(PAYLOAD('Read', filePath, { session_id: 'e2e-session' }));
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  const line = readLastLine(path.join(home, '.agents', 'knowledge', 'read.log'));
  assert.ok(line, 'expected a read.log line to be written');
  assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z Read \S+css\.md e2e-session$/);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'knowledge', 'inbox.log')), false);
});

test('CLI: a Read under _inbox appends the exact inbox.log line shape', () => {
  const home = scratchHome();
  const filePath = path.join(home, '.claude', 'knowledge', '_inbox', 'pending-note.md');
  const payload = JSON.stringify(PAYLOAD('Read', filePath, { session_id: 'e2e-session' }));
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  const line = readLastLine(path.join(home, '.agents', 'knowledge', 'inbox.log'));
  assert.ok(line, 'expected an inbox.log line to be written');
  assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z Read \S+pending-note\.md e2e-session$/);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'knowledge', 'read.log')), false);
});

test('CLI: launched through a junctioned/symlinked hook path still logs (survives the entry-point check)', (t) => {
  const home = scratchHome();
  const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-log-link-parent-'));
  const linkedHooksDir = path.join(linkDir, 'hooks-link');
  if (!trySymlink(HERE, linkedHooksDir)) {
    t.skip('symlink/junction creation not permitted on this host');
    return;
  }
  const linkedHookPath = path.join(linkedHooksDir, 'knowledge-log.mjs');
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const payload = JSON.stringify(PAYLOAD('Read', filePath, { session_id: 'via-junction' }));
  const result = spawnSync(process.execPath, [linkedHookPath], {
    input: payload,
    env: childEnv(home),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  const line = readLastLine(path.join(home, '.agents', 'knowledge', 'read.log'));
  assert.ok(line, 'expected a read.log line to be written when launched via a linked path');
  assert.match(line, /via-junction$/);
});

test('CLI: garbage stdin exits 0 and writes no log', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: 'not json at all {{{' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(path.join(home, '.agents', 'knowledge')), false);
});

test('CLI: empty stdin exits 0 with empty stdout', () => {
  const home = scratchHome();
  const result = runCliProcess({ home, input: '' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('CLI: a path outside the store exits 0 and writes no log', () => {
  const home = scratchHome();
  const filePath = path.join(home, 'Code', 'knowledge-base', 'x.md');
  const payload = JSON.stringify(PAYLOAD('Read', filePath));
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'knowledge')), false);
});

test('CLI: kill switch present exits 0 and writes no log', () => {
  const home = scratchHome();
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'no-knowledge-log'), '');
  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const payload = JSON.stringify(PAYLOAD('Read', filePath));
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(home, '.agents', 'knowledge', 'read.log')), false);
});

test('CLI: a log at or over 1 MiB with no prior .1 rotates to .1, and the live log keeps only the new line', () => {
  const home = scratchHome();
  const logDir = path.join(home, '.agents', 'knowledge');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'read.log');
  fs.writeFileSync(logPath, 'OLD-CURRENT\n'.repeat(90000)); // > 1 MiB
  assert.equal(fs.existsSync(`${logPath}.1`), false);

  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const payload = JSON.stringify(PAYLOAD('Read', filePath, { session_id: 'after-rotate' }));
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);

  const rotated = fs.readFileSync(`${logPath}.1`, 'utf8');
  assert.match(rotated, /OLD-CURRENT/);

  const current = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(current.length, 1);
  assert.match(current[0], /after-rotate$/);
});

test('CLI: a log at or over 1 MiB with an EXISTING .1 does not rotate again — the .1 history is never overwritten or deleted', () => {
  const home = scratchHome();
  const logDir = path.join(home, '.agents', 'knowledge');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'read.log');
  fs.writeFileSync(logPath, 'OLD-CURRENT\n'.repeat(90000)); // > 1 MiB
  fs.writeFileSync(`${logPath}.1`, 'OLD-BACKUP\n');

  const filePath = path.join(home, '.claude', 'knowledge', 'css.md');
  const payload = JSON.stringify(PAYLOAD('Read', filePath, { session_id: 'after-rotate' }));
  const result = runCliProcess({ home, input: payload });
  assert.equal(result.status, 0);

  const backup = fs.readFileSync(`${logPath}.1`, 'utf8');
  assert.match(backup, /OLD-BACKUP/, 'the existing .1 backup must never be overwritten');

  const current = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.match(current[0], /OLD-CURRENT/, 'the live log must never be deleted, only appended to');
  assert.match(current[current.length - 1], /after-rotate$/);
});
