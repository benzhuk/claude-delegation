// Tests for the P4 fold: notion-writing and dev-server move from CLAUDE_SKILLS (sourced from
// ~/.claude/skills/<name>, silently skipped if absent) into PLUGIN_SKILLS (sourced from
// <repo>/skills/<name>, hard-refused if SKILL.md is missing).
//
// `HOME` in mirror-shared-skills.mjs is `os.homedir()` resolved at module load — no environment
// variable can redirect it (v1.1 red-team finding 12). So this file never runs the CLI (guarded
// behind isMainModule() anyway) and never runs the script without --dry-run (common.md ban); it
// imports the exported `collectSources()` and inspects the plain data it returns, which is the
// only way to prove the two skills ACTUALLY resolve under <repo>/skills/ rather than merely
// having their names present in the right array (the failure class this build watches for: a
// copy-paste into the wrong array, or a typo in the directory name under skills/, would leave the
// string present in PLUGIN_SKILLS but the mirror silently sourcing nothing or the wrong path).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLUGIN_SKILLS, CLAUDE_SKILLS, collectSources } from './mirror-shared-skills.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

test('PLUGIN_SKILLS includes notion-writing and dev-server', () => {
  assert.ok(PLUGIN_SKILLS.includes('notion-writing'), 'notion-writing must be in PLUGIN_SKILLS');
  assert.ok(PLUGIN_SKILLS.includes('dev-server'), 'dev-server must be in PLUGIN_SKILLS');
});

test('CLAUDE_SKILLS no longer includes dev-server', () => {
  assert.ok(!CLAUDE_SKILLS.includes('dev-server'), 'dev-server must be removed from CLAUDE_SKILLS');
});

test('notion-writing and dev-server actually resolve to a source under <repo>/skills/, not ~/.claude/skills/', () => {
  const sources = collectSources();
  const byName = Object.fromEntries(sources.filter((s) => s.kind === 'skill').map((s) => [s.name, s]));

  for (const name of ['notion-writing', 'dev-server']) {
    const entry = byName[name];
    assert.ok(entry, `${name} did not resolve to any skill source at all`);
    const expected = path.join(REPO, 'skills', name);
    assert.equal(
      path.resolve(entry.src),
      path.resolve(expected),
      `${name} source must be ${expected}, got ${entry.src}`,
    );
    assert.ok(
      entry.src.startsWith(path.join(REPO, 'skills')),
      `${name} source must start with <repo>/skills/, got ${entry.src}`,
    );
    assert.ok(
      !entry.src.includes(path.join('.claude', 'skills')),
      `${name} source must not come from ~/.claude/skills/, got ${entry.src}`,
    );
  }
});
