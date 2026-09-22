// node --test skills/decisions/scripts/skill-text.test.mjs
// Test 7 (spec.md "Tests (mechanical, named)"): SKILL.md does not contain the stale
// "in chat too" wording, and does contain the literal command strings the spec pins
// so the skill text cannot drift from the scripts it describes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_MD_PATH = fileURLToPath(new URL('../SKILL.md', import.meta.url));
const skillText = fs.readFileSync(SKILL_MD_PATH, 'utf8');

test('SKILL.md does not contain "in chat too"', () => {
  assert.equal(skillText.includes('in chat too'), false);
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
