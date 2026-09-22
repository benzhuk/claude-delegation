// node --test skills/decisions/scripts/skill-text.test.mjs
// Test 7 (spec.md "Tests (mechanical, named)"): no file in the skill dir contains the
// stale chat-restatement wording, and SKILL.md contains the literal command strings
// the spec pins so the skill text cannot drift from the scripts it describes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_MD_PATH = fileURLToPath(new URL('../SKILL.md', import.meta.url));
const skillText = fs.readFileSync(SKILL_MD_PATH, 'utf8');

const STALE = 'in chat ' + 'too'; // built, so a grep of the skill dir stays clean
test('no file in the skill dir contains the stale chat wording', () => {
  const dir = fileURLToPath(new URL('..', import.meta.url));
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.md'));
  for (const f of files) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8').includes(STALE), false, f);
});

test('SKILL.md pins the full hand-back and publish flag sequences', () => {
  assert.match(skillText, /decisions-handback\.mjs --decisions \S+ --goals \S+ --repo \S+/);
  assert.match(skillText, /goals-mirror\.mjs publish --repo \. --parent \S+ --current \S+/);
});

test('SKILL.md contains "notion.js read"', () => {
  assert.equal(skillText.includes('notion.js read'), true);
});

test('SKILL.md contains "decisions-read.mjs"', () => {
  assert.equal(skillText.includes('decisions-read.mjs'), true);
});

test('SKILL.md contains "decisions-handback.mjs --decisions"', () => {
  assert.equal(skillText.includes('decisions-handback.mjs --decisions'), true);
});

test('SKILL.md contains "goals-mirror.mjs publish"', () => {
  assert.equal(skillText.includes('goals-mirror.mjs publish'), true);
});
