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

test('SKILL.md pins the hand-back and attended renderer sequences', () => {
  assert.match(skillText, /decisions-handback\.mjs --decisions \S+ --goals \S+ --repo \S+/);
  assert.match(skillText, /goals-mirror\.mjs render --repo \. > <scratch>\/goals-render\.md/);
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

test('SKILL.md names disabled publication and targeted writer edits', () => {
  assert.match(skillText, /goals-mirror\.mjs publish` is intentionally disabled/);
  assert.match(skillText, /fresh read and targeted edits of agent-owned sections/);
});

test('no SKILL.md line starts with ** (a pasted wrap would read back as an owner note)', () => {
  assert.doesNotMatch(skillText, /^[ \t]*\*\*/m);
});

// Round-2 F2 ruling (docs/notes/skills-fable-decisions-current-4.md): the hand-back check's
// exit 3 tells the lead to stop, not hand back, and fix the read.
test('SKILL.md says exit 3 from the hand-back check means do not hand back, fix the read first', () => {
  assert.match(skillText, /Exit 3 means a page could not be read: do not hand back, fix the\nread first/);
});

// Item e (docs/notes/skills-fable-decisions-current-2.md addendum, restated in the round-2
// ruling): human pages are written only with anchored `edit --safe`; publish and replace-md are
// banned there; exit 3 or 4 stops the pass.
test('SKILL.md bans publish/replace-md on the decisions and goals pages, anchored edits only', () => {
  assert.match(skillText, /write only with anchored edits, `notion\.js edit\n--safe`/);
  assert.equal(skillText.includes('never `publish` or `replace-md`'), true);
});

test('SKILL.md says exit 3 or exit 4 from that edit stops the pass', () => {
  assert.equal(skillText.includes('Exit 3 or exit 4 from that edit stops the'), true);
});
