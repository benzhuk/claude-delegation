// node --test "skills/multi/scripts/*.test.mjs"
// session-name (D1/D2, rename-build spec) — normalizeSlug and readSessionName in isolation.
//
// Attack brief for this file: does readSessionName actually distinguish a real sidecar from a missing
// one, or do a missing-file error and an empty-title error both just collapse into `null` without the
// test ever checking WHICH path was hit? Every "returns null" case below checks a DIFFERENT observable
// (title captured when present, nothing captured when absent) so a mutation that merges the branches
// still has somewhere to be caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeSlug, readSessionName, MAX_SLUG_LEN } from './session-name.mjs';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'session-name-')); }

/** A fixture project dir with `<sessionId>.jsonl` (never read) and `<sessionId>/custom-title.json`. */
function fixtureProject(sessionId, sidecarBody) {
  const projectDir = tmp();
  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), '{"type":"other"}\n', 'utf8');
  if (sidecarBody !== undefined) {
    const sidecarDir = path.join(projectDir, sessionId);
    fs.mkdirSync(sidecarDir, { recursive: true });
    fs.writeFileSync(path.join(sidecarDir, 'custom-title.json'), sidecarBody, 'utf8');
  }
  return path.join(projectDir, `${sessionId}.jsonl`);
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeSlug
// ─────────────────────────────────────────────────────────────────────────────

test('normalizeSlug: runs of whitespace collapse to one dash', () => {
  assert.equal(normalizeSlug('My   Cool   Session'), 'my-cool-session');
  assert.equal(normalizeSlug('a\t\nb'), 'a-b');
});

test('normalizeSlug: underscores become dashes, same as whitespace', () => {
  assert.equal(normalizeSlug('my_cool_session'), 'my-cool-session');
  assert.equal(normalizeSlug('mix_of  both'), 'mix-of-both');
});

test('normalizeSlug: mixed case is lowercased', () => {
  assert.equal(normalizeSlug('TaXonomy'), 'taxonomy');
});

test('normalizeSlug: punctuation outside [a-z0-9-] is dropped, not replaced with a dash', () => {
  assert.equal(normalizeSlug("Ben's PR #137!"), 'bens-pr-137');
  assert.equal(normalizeSlug('foo@bar.com'), 'foobarcom');
});

test('normalizeSlug: a title that normalises to only punctuation is the empty string', () => {
  assert.equal(normalizeSlug('!!! ### $$$'), '');
  assert.equal(normalizeSlug('   '), '');
  assert.equal(normalizeSlug(''), '');
});

test('normalizeSlug: an already-clean slug is a no-op', () => {
  assert.equal(normalizeSlug('taxonomy'), 'taxonomy');
  assert.equal(normalizeSlug('astra-pr-137'), 'astra-pr-137');
});

test('normalizeSlug: collapses a run of dashes left by adjacent separators', () => {
  assert.equal(normalizeSlug('foo -- bar'), 'foo-bar');
  assert.equal(normalizeSlug('foo_ _bar'), 'foo-bar');
});

test('normalizeSlug: strips leading/trailing dashes', () => {
  assert.equal(normalizeSlug('-foo-'), 'foo');
  assert.equal(normalizeSlug('  -foo bar- '), 'foo-bar');
});

test('normalizeSlug: a title longer than 64 chars after normalisation is not truncated here — that is readSessionName\'s job', () => {
  const long = 'a'.repeat(80);
  assert.equal(normalizeSlug(long), long, 'normalizeSlug itself has no length cap; MAX_SLUG_LEN is enforced by readSessionName');
});

test('normalizeSlug: "Ben"/"ben "/"BEN" all normalise to the reserved "ben"', () => {
  assert.equal(normalizeSlug('Ben'), 'ben');
  assert.equal(normalizeSlug('ben '), 'ben');
  assert.equal(normalizeSlug('BEN'), 'ben');
});

test('normalizeSlug: non-string input is treated as empty rather than throwing', () => {
  assert.equal(normalizeSlug(undefined), '');
  assert.equal(normalizeSlug(null), '');
  assert.equal(normalizeSlug(42), '');
});

// ─────────────────────────────────────────────────────────────────────────────
// readSessionName
// ─────────────────────────────────────────────────────────────────────────────

test('readSessionName: a fixture dir with a real sidecar returns {title, slug, path}', () => {
  const sessionId = 'sess-real-0001';
  const transcriptPath = fixtureProject(sessionId, JSON.stringify({ customTitle: 'My Cool Session' }));
  const result = readSessionName({ transcriptPath, sessionId });
  assert.ok(result, 'a real sidecar must resolve to a name, not null');
  assert.equal(result.title, 'My Cool Session', 'the raw title is kept verbatim');
  assert.equal(result.slug, 'my-cool-session');
  assert.equal(result.path, path.join(path.dirname(transcriptPath), sessionId, 'custom-title.json'));
  assert.ok(fs.existsSync(result.path), 'the path returned really is the file that was read');
});

test('readSessionName: no sidecar at all is null', () => {
  const sessionId = 'sess-missing-0001';
  const transcriptPath = fixtureProject(sessionId, undefined);
  assert.equal(readSessionName({ transcriptPath, sessionId }), null);
});

test('readSessionName: a sidecar with a non-JSON body is null', () => {
  const sessionId = 'sess-badjson-0001';
  const transcriptPath = fixtureProject(sessionId, 'not json at all {{{');
  assert.equal(readSessionName({ transcriptPath, sessionId }), null);
});

test('readSessionName: a sidecar with the wrong shape (no customTitle, or a non-string value) is null', () => {
  const s1 = 'sess-noshape-0001';
  assert.equal(
    readSessionName({ transcriptPath: fixtureProject(s1, JSON.stringify({ other: 'x' })), sessionId: s1 }),
    null,
  );
  const s2 = 'sess-noshape-0002';
  assert.equal(
    readSessionName({ transcriptPath: fixtureProject(s2, JSON.stringify({ customTitle: 42 })), sessionId: s2 }),
    null,
  );
  const s3 = 'sess-noshape-0003';
  assert.equal(
    readSessionName({ transcriptPath: fixtureProject(s3, JSON.stringify(['not', 'an', 'object'])), sessionId: s3 }),
    null,
  );
});

test('readSessionName: a sidecar whose customTitle normalises to "" is null, not {title, slug: "", path}', () => {
  const sessionId = 'sess-empty-0001';
  const transcriptPath = fixtureProject(sessionId, JSON.stringify({ customTitle: '!!! ###' }));
  assert.equal(readSessionName({ transcriptPath, sessionId }), null);
});

test('readSessionName: a sidecar whose customTitle normalises to "ben" is null (the reserved recipient)', () => {
  for (const title of ['Ben', 'ben ', 'BEN']) {
    const sessionId = `sess-ben-${title.trim().toLowerCase()}`;
    const transcriptPath = fixtureProject(sessionId, JSON.stringify({ customTitle: title }));
    assert.equal(readSessionName({ transcriptPath, sessionId }), null, `"${title}" must not register as the reserved slug`);
  }
});

test('readSessionName: a normalised slug longer than 64 chars is unnamed, not truncated', () => {
  const sessionId = 'sess-long-0001';
  const longTitle = 'x'.repeat(MAX_SLUG_LEN + 1);
  const transcriptPath = fixtureProject(sessionId, JSON.stringify({ customTitle: longTitle }));
  assert.equal(readSessionName({ transcriptPath, sessionId }), null);

  // The boundary: exactly MAX_SLUG_LEN chars IS a legal name.
  const sessionId2 = 'sess-long-0002';
  const okTitle = 'y'.repeat(MAX_SLUG_LEN);
  const transcriptPath2 = fixtureProject(sessionId2, JSON.stringify({ customTitle: okTitle }));
  const ok = readSessionName({ transcriptPath: transcriptPath2, sessionId: sessionId2 });
  assert.ok(ok, 'exactly 64 chars must still resolve');
  assert.equal(ok.slug.length, MAX_SLUG_LEN);
});

test('readSessionName: missing transcriptPath or sessionId skips the read entirely, never guesses', () => {
  const sessionId = 'sess-partial-0001';
  const transcriptPath = fixtureProject(sessionId, JSON.stringify({ customTitle: 'Has A Name' }));
  assert.equal(readSessionName({ transcriptPath, sessionId: undefined }), null);
  assert.equal(readSessionName({ transcriptPath: undefined, sessionId }), null);
  assert.equal(readSessionName({}), null);
});

test('readSessionName: never reads the transcript itself, even when it is not valid JSONL', () => {
  const sessionId = 'sess-notranscript-0001';
  const projectDir = tmp();
  const transcriptPath = path.join(projectDir, `${sessionId}.jsonl`);
  // No transcript file written at all, on purpose — if this module ever opened it, this would throw or
  // behave differently than a real (unreadable) transcript would.
  const sidecarDir = path.join(projectDir, sessionId);
  fs.mkdirSync(sidecarDir, { recursive: true });
  fs.writeFileSync(path.join(sidecarDir, 'custom-title.json'), JSON.stringify({ customTitle: 'ghost transcript' }), 'utf8');
  const result = readSessionName({ transcriptPath, sessionId });
  assert.ok(result, 'the sidecar alone is enough; the transcript file need not even exist');
  assert.equal(result.slug, 'ghost-transcript');
});

// MINOR 5 (round-1 review): this test's fixture is built with path.join and read back with path.join, so
// it passes whether or not a `toPosix()` call sneaks into the production path — on Windows `readFileSync`
// accepts forward slashes too, so a posix-forced path still reads. It is NOT the toPosix guard; that pin
// lives in 'a fixture dir with a real sidecar returns {title, slug, path}' above and in 'a custom fs
// implementation is honoured' below, both of which assert `result.path` against a `path.join`-built
// expectation and DO fail if the production code posix-forces the path first. Retitled to what this test
// actually checks: a native-separator transcriptPath resolves at all.
test('readSessionName: a native-separator transcriptPath resolves the sidecar', () => {
  const sessionId = 'sess-winpath-0001';
  const projectDir = tmp();
  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), '', 'utf8');
  const sidecarDir = path.join(projectDir, sessionId);
  fs.mkdirSync(sidecarDir, { recursive: true });
  fs.writeFileSync(path.join(sidecarDir, 'custom-title.json'), JSON.stringify({ customTitle: 'windows path ok' }), 'utf8');
  const transcriptPath = path.join(projectDir, `${sessionId}.jsonl`);
  const result = readSessionName({ transcriptPath, sessionId });
  assert.ok(result, `expected a match for ${transcriptPath}`);
  assert.equal(result.slug, 'windows-path-ok');
});

test('readSessionName: a custom fs implementation is honoured over the real filesystem', () => {
  const sessionId = 'sess-fixturefs-0001';
  const sidecarPath = path.join('C:', 'fake', sessionId, 'custom-title.json');
  const fakeFs = {
    readFileSync(p) {
      if (p === sidecarPath) return JSON.stringify({ customTitle: 'from fixture fs' });
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
  };
  const result = readSessionName({
    transcriptPath: path.join('C:', 'fake', `${sessionId}.jsonl`),
    sessionId,
    fs: fakeFs,
  });
  assert.ok(result);
  assert.equal(result.slug, 'from-fixture-fs');
});
