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

// P3 (contracts.md C2/C3/C5): the retitle-on-last-edit rule in Page rules, and the `meta` read
// plus `--title-meta` flag in the hand-back section.
test('SKILL.md\'s Page rules says every runner or session retitles the page as the last step of its own edit', () => {
  assert.match(skillText, /runs\n`node <skill-dir>\/scripts\/decisions-title\.mjs set --page <decisions-page-id>` as the last step/);
  assert.equal(skillText.includes('no call to `decisions-title.mjs` is added there'), true);
});

// Round-2 review MINOR-3: a session must know what to do when its own retitle fails.
test('SKILL.md\'s Page rules says what to do when the retitle exits 2, 3, or 4', () => {
  assert.equal(skillText.includes('Pass `--topic <Topic>` when neither'), true);
  assert.equal(skillText.includes('exit 2 names this'), true);
  assert.match(skillText, /Exit 3 or exit 4 means the\ntitle was not changed/);
});

test('SKILL.md\'s hand-back section reads decisions-title.mjs meta and passes --title-meta', () => {
  assert.match(skillText, /decisions-title\.mjs meta --page <decisions-page-id> > <scratch>\/title-meta\.json/);
  assert.match(skillText, /decisions-handback\.mjs --decisions \S+ --goals \S+ --repo \. --title-meta \S+/);
});

test('SKILL.md names all four --title-meta output lines and that only "title ok" does not block', () => {
  assert.equal(skillText.includes('title ok: <title>'), true);
  assert.equal(skillText.includes('TITLE off-pattern: <title>'), true);
  assert.equal(skillText.includes('TITLE stale: <title> vs last edit <ISO>'), true);
  assert.match(skillText, /TITLE unchecked: run decisions-title\.mjs meta\n--page <id> and pass --title-meta/);
});

// Lane 64 (decisions-wedge): clearing Done and accounting the round are one step, the attestation
// follows the lead that runs the accounting, and a history-quoted stuck round is closable.
test('SKILL.md says publish --clear-done accounts the round in the same step and takes --owner', () => {
  assert.match(skillText, /clearing Done and accounting the round\nare ONE step \(Lane 64\): `publish --clear-done` accounts the round itself/);
  assert.equal(skillText.includes('--owner\n<your-session-name>'), true);
  assert.equal(skillText.includes('`publish --clear-done --owner <your-session-name>`, which also accounts the round'), true);
  assert.equal(skillText.includes('the order is the reverse'), false, 'the clear-then-account order is gone');
});

test('SKILL.md pins account --owner, accountedBy, and the history-quoted stuck-round admission', () => {
  assert.equal(skillText.includes('--outcome <existing-report-path> [--owner <your-session-name>]'), true);
  assert.equal(skillText.includes('recorded as `accountedBy`'), true);
  assert.equal(skillText.includes('quoted in a committed `docs/decisions/history/` file on origin/main'), true);
});

test('SKILL.md pins the fix-round-2 rules: --owner required, counted history quotes, accounted-from-reconciliation', () => {
  const flat = skillText.replace(/\s+/g, ' ');
  assert.equal(flat.includes('(required when the step accounts the round)'), true);
  assert.equal(flat.includes('the history/verbatim check is the proof; the attestation records who ran it'), true);
  assert.equal(flat.includes('an input text that appears N times must be quoted N times'), true);
  assert.equal(flat.includes('for a round accounted from NEEDS_RECONCILIATION'), true);
  assert.equal(flat.includes('If the page changed after the pickup last read it, the step refuses (exit 3); let one tick run and retry.'), true);
});

test('SKILL.md names the pickup rebind verb for a repo move', () => {
  assert.equal(skillText.includes('decisions-pickup.mjs rebind --page <id> --repo <new project root> --from-project <old path> [--owner <lead>]'), true);
});
