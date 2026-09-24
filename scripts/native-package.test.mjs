// node --test scripts/native-package.test.mjs
// Static package invariants. The live sealed CLI proof is deliberately run as a separate release
// check: it exercises the installed Codex binary without turning a unit test into a host dependency.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

test('Codex 0.156 native manifest exposes shared skills and verified lifecycle hooks', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name, 'delegation');
  assert.equal(manifest.version, readJson('.claude-plugin/plugin.json').version);
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.hooks, './hooks/codex-hooks.json');
  assert.equal(fs.existsSync(path.join(ROOT, 'plugin.json')), false);
  const nativeHooks = readJson('hooks/codex-hooks.json').hooks;
  assert.deepEqual(Object.keys(nativeHooks).sort(), ['Interrupt', 'PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  for (const groups of Object.values(nativeHooks)) {
    for (const group of groups) for (const hook of group.hooks) {
      assert.equal(hook.type, 'command');
      assert.equal(hook.command, 'node "${PLUGIN_ROOT}/hooks/multi-codex-hook.mjs"');
    }
  }
});

test('native marketplace resolves this repository root with complete install policy', () => {
  const catalog = readJson('.agents/plugins/marketplace.json');
  assert.equal(catalog.name, 'delegation');
  assert.equal(catalog.plugins.length, 1);
  const [entry] = catalog.plugins;
  assert.deepEqual(entry, {
    name: 'delegation',
    source: { source: 'local', path: './' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Productivity',
  });
});

test('every bundled skill has a closed frontmatter block with name and description', () => {
  const skills = fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(skills.length > 0);
  assert.deepEqual(skills, ['bearings', 'continue', 'decisions', 'delegate', 'dev-server', 'janitor', 'multi', 'notion-writing', 'team-build']);
  for (const skill of skills) {
    const text = fs.readFileSync(path.join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
    const end = text.indexOf('\n---', 4);
    assert.ok(text.startsWith('---\n') && end !== -1, `${skill} frontmatter is not closed`);
    const frontmatter = text.slice(4, end);
    assert.match(frontmatter, /^name:\s*\S+/m, `${skill} lacks a name`);
    assert.match(frontmatter, /^description:\s*\S+/m, `${skill} lacks a description`);
  }
});
