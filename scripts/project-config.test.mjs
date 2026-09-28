import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as root from './project-config.mjs';
import * as canonical from '../skills/decisions/scripts/project-config.mjs';
import { loadProjectConfig, DEFAULTS } from './project-config.mjs';

test('root project-config remains a compatibility re-export of the skill-local canonical module', () => {
  assert.deepEqual(Object.keys(root).sort(), ['DEFAULTS', 'findProjectRoot', 'loadProjectConfig', 'switchedOff']);
  assert.equal(root.DEFAULTS, canonical.DEFAULTS);
  assert.equal(root.findProjectRoot, canonical.findProjectRoot);
  assert.equal(root.loadProjectConfig, canonical.loadProjectConfig);
  assert.equal(root.switchedOff, canonical.switchedOff);
});

// ---------------------------------------------------------------------------
// Lane 43 (cross-host nudge): the new `owner_hosts` key. Every fixture below is a fresh mkdtemp'd
// directory holding its own `.git` (so findProjectRoot stops there, never bleeding into the real
// repo's own `.agents/project.json`), the same fixture convention collect-status.test.mjs uses.
// ---------------------------------------------------------------------------

const tracked = [];
function mkProjectDir(projectJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pconfig-owner-hosts-'));
  tracked.push(dir);
  fs.mkdirSync(path.join(dir, '.git'));
  if (projectJson !== undefined) {
    fs.mkdirSync(path.join(dir, '.agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agents', 'project.json'), projectJson);
  }
  return dir;
}

test('owner_hosts: DEFAULTS carries an empty table, and a project.json with no owner_hosts key gets the same empty default', () => {
  assert.deepEqual(DEFAULTS.owner_hosts, {});
  const dir = mkProjectDir(JSON.stringify({ decisions_url: 'x' }));
  const { config } = loadProjectConfig(dir);
  assert.deepEqual(config.owner_hosts, {});
});

test('owner_hosts: a well-formed table passes through unchanged', () => {
  const dir = mkProjectDir(JSON.stringify({ owner_hosts: { 'skills-h': 'zhuk-vps32', 'skills-n': 'zhuk-netcup' } }));
  const { config } = loadProjectConfig(dir);
  assert.deepEqual(config.owner_hosts, { 'skills-h': 'zhuk-vps32', 'skills-n': 'zhuk-netcup' });
});

// Malformed owner_hosts is IGNORED (falls back to `{}`), never refused/thrown - the loader's own
// "a broken .agents/project.json degrades to safe defaults, never a crash" contract, applied to this
// key too. Three malformed shapes: a non-object value, a non-string value inside an otherwise
// object-shaped table, and the whole project.json file being unparseable JSON.
test('owner_hosts: a malformed table (wrong shape, or a non-string value) is ignored, not refused - loadProjectConfig never throws', () => {
  const notAnObject = mkProjectDir(JSON.stringify({ owner_hosts: 'skills-h' }));
  assert.deepEqual(loadProjectConfig(notAnObject).config.owner_hosts, {});

  const nonStringValue = mkProjectDir(JSON.stringify({ owner_hosts: { 'skills-h': 12345 } }));
  assert.deepEqual(loadProjectConfig(nonStringValue).config.owner_hosts, {});

  const unparseableFile = mkProjectDir('{ not valid json');
  assert.doesNotThrow(() => loadProjectConfig(unparseableFile));
  assert.deepEqual(loadProjectConfig(unparseableFile).config.owner_hosts, {});
});

// F5 (review r1): a project.json whose top-level JSON value is the literal `null` must not throw
// inside `sanitizeOwnerHosts(raw?.owner_hosts)` - before the fix, `raw.owner_hosts` on a `null` raw
// threw a TypeError and the loader fell into its catch, reporting `source: "unreadable"` /
// `vcs: "none"` instead of the file's real (if useless) presence.
test('owner_hosts: a top-level `null` project.json does not throw and is treated as readable, not "unreadable"', () => {
  const nullFile = mkProjectDir('null');
  assert.doesNotThrow(() => loadProjectConfig(nullFile));
  const { config, source } = loadProjectConfig(nullFile);
  assert.deepEqual(config.owner_hosts, {});
  assert.notEqual(source, 'unreadable');
  assert.notEqual(config.vcs, 'none');
});

after(() => {
  for (const dir of tracked) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
});
