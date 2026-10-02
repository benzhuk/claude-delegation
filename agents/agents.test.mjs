// node --test agents/agents.test.mjs
// Contract checks on the agent definitions themselves (not on any runtime): every agent declares an
// explicit tools list and omitClaudeMd, the four safety blocks stay byte-identical, no agent's tools
// list can spawn another agent, and the two execution agents (builder, runner) stay off the top tiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENT_FILES = fs
  .readdirSync(HERE)
  .filter((f) => f.endsWith('.md'))
  .sort();

const SAFETY_START = '<!-- safety-block:start -->';
const SAFETY_END = '<!-- safety-block:end -->';

/** Splits a `key: value` frontmatter block (plain strings, no yaml lib) from the body below it. */
function parseAgentFile(text) {
  const lines = text.split(/\r?\n/);
  assert.equal(lines[0].trim(), '---', 'agent file must open with a --- frontmatter fence');
  const frontmatter = {};
  let i = 1;
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '---') break;
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) frontmatter[m[1]] = m[2].trim();
  }
  const body = lines.slice(i + 1).join('\n');
  return { frontmatter, body };
}

function safetyBlock(body, label) {
  const start = body.indexOf(SAFETY_START);
  const end = body.indexOf(SAFETY_END);
  assert.ok(start !== -1 && end !== -1 && end > start, `${label}: safety block markers not found`);
  return body.slice(start, end + SAFETY_END.length);
}

function loadAgent(file) {
  const text = fs.readFileSync(path.join(HERE, file), 'utf8');
  const { frontmatter, body } = parseAgentFile(text);
  return { file, text, frontmatter, body };
}

const agents = AGENT_FILES.map(loadAgent);

test('found the four expected agent files', () => {
  assert.deepEqual(AGENT_FILES, ['builder.md', 'integrator.md', 'reviewer.md', 'runner.md']);
});

for (const agent of agents) {
  test(`${agent.file}: has an explicit tools list`, () => {
    assert.ok(agent.frontmatter.tools && agent.frontmatter.tools.length > 0, `${agent.file} missing tools:`);
  });

  test(`${agent.file}: omitClaudeMd is true`, () => {
    assert.equal(agent.frontmatter.omitClaudeMd, 'true', `${agent.file} missing omitClaudeMd: true`);
  });

  test(`${agent.file}: declares a model`, () => {
    assert.ok(agent.frontmatter.model && agent.frontmatter.model.length > 0, `${agent.file} missing model:`);
  });

  test(`${agent.file}: tools list never names Agent or Task`, () => {
    const tools = agent.frontmatter.tools
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''));
    assert.ok(!tools.includes('Agent'), `${agent.file} tools list includes Agent`);
    assert.ok(!tools.includes('Task'), `${agent.file} tools list includes Task`);
  });
}

test('safety blocks are byte-identical across all four agent files', () => {
  const builder = agents.find((a) => a.file === 'builder.md');
  const builderBlock = safetyBlock(builder.body, 'builder.md');
  for (const agent of agents) {
    if (agent.file === 'builder.md') continue;
    const block = safetyBlock(agent.body, agent.file);
    assert.equal(block, builderBlock, `${agent.file} safety block differs from builder.md's`);
  }
});

test('builder and runner ship a model that is neither opus nor fable', () => {
  for (const name of ['builder.md', 'runner.md']) {
    const agent = agents.find((a) => a.file === name);
    const model = agent.frontmatter.model.toLowerCase();
    assert.ok(!model.includes('opus'), `${name} model must not be opus`);
    assert.ok(!model.includes('fable'), `${name} model must not be fable`);
  }
});

test('builder body names all six state file sections, in order', () => {
  const builder = agents.find((a) => a.file === 'builder.md');
  const sections = ['Territory', 'Contracts I rely on', 'Done', 'Next', 'Open questions', 'How to run my gate'];
  let cursor = -1;
  for (const section of sections) {
    const marker = `\`${section}\``;
    const at = builder.body.indexOf(marker);
    assert.ok(at !== -1, `builder.md body does not name state file section "${section}"`);
    assert.ok(at > cursor, `builder.md body names "${section}" out of order`);
    cursor = at;
  }
});

const SAFETY_ANCHORS = [
  '~/.agents/lean-rules.md', 'pkill node', 'dev server', 'git reset --hard',
  'GIT_AUTHOR_', 'secret', 'OCR', 'in flight', 'scratch folder', 'VERDICT: <word>',
  'byline',
];

test('the safety block still carries every rule it is there to carry', () => {
  const block = safetyBlock(agents.find((a) => a.file === 'builder.md').body, 'builder.md');
  const bullets = block.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(bullets.length, 11, 'safety block bullet count changed - change this test deliberately');
  for (const anchor of SAFETY_ANCHORS) {
    assert.ok(block.includes(anchor), `safety block no longer mentions "${anchor}"`);
  }
});

test('the safety block stays under the 2100-character token-cost ceiling', () => {
  const block = safetyBlock(agents.find((a) => a.file === 'builder.md').body, 'builder.md');
  // raised from 2000 in package-build/P3 — see spec.md PB-C3
  assert.ok(block.length < 2100, `safety block is ${block.length} chars, over the 2100-char ceiling`);
});

test('builder.md states it never writes the work record', () => {
  const builder = agents.find((a) => a.file === 'builder.md');
  assert.match(builder.body, /never write the\s+work record/i);
  assert.match(builder.body, /docs\/work\/<work-id>\.record\.md/);
});

test('reviewer.md states a bug-fix review carries the four C4 fields', () => {
  const reviewer = agents.find((a) => a.file === 'reviewer.md');
  assert.match(reviewer.body, /bug-fix review carries the four C4 fields/i);
  for (const field of ['Cause:', 'Discriminating check:', 'Fix location:', 'Simplification:']) {
    assert.ok(reviewer.body.includes(field), `reviewer.md missing review field "${field}"`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 36 / C2 seam: the pinned scratch sentence, byte-identical, on its own line in all
// eight role files (the four Claude agents/*.md files above, plus the four Codex
// codex/agents/*.toml files C1's docs/work-record.md may also quote it from).
// ─────────────────────────────────────────────────────────────────────────────

const PINNED_SCRATCH_SENTENCE = "Temp files go only under the directory named by the "
  + "record's `Scratch:` line (`<scratch root>/<lead session id>/<lane>/`); never write "
  + 'temp files into the repo and never delete them yourself: the lead\'s '
  + "`work-record.mjs close --closeout` removes that directory.";

const CODEX_TOML_DIR = path.join(HERE, '..', 'codex', 'agents');
const CODEX_TOML_FILES = ['builder.toml', 'integrator.toml', 'reviewer.toml', 'runner.toml'];

test('the pinned scratch sentence appears, verbatim and on its own line, in all eight role files', () => {
  const mdFiles = AGENT_FILES.map((f) => ({ label: f, text: fs.readFileSync(path.join(HERE, f), 'utf8') }));
  const tomlFiles = CODEX_TOML_FILES.map((f) => ({
    label: `codex/agents/${f}`,
    text: fs.readFileSync(path.join(CODEX_TOML_DIR, f), 'utf8'),
  }));
  const eight = [...mdFiles, ...tomlFiles];
  assert.equal(eight.length, 8, 'expected exactly eight role files');
  for (const { label, text } of eight) {
    const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^-\s*/, ''));
    assert.ok(
      lines.includes(PINNED_SCRATCH_SENTENCE),
      `${label} does not carry the pinned scratch sentence verbatim on its own line`,
    );
  }
});

// Lane 65 item 4 (docs/specs/worktree-location-65/spec.md): the worktree location is stated once in
// each of team-build, delegate, builder, runner and pane-setup, and for the two agents it sits OUTSIDE
// the safety block (that block is pinned byte-identical and under its character cap).
test('the worktree location rule is stated exactly once in each of the five places, outside any safety block', () => {
  const SENTENCE = 'Every worktree lives at `<repo>/.claude/worktrees/<name>`, never as a sibling in Code or anywhere else.';
  const ROOT = path.join(HERE, '..');
  const places = ['agents/builder.md', 'agents/runner.md', 'skills/team-build/SKILL.md', 'skills/delegate/SKILL.md', 'docs/pane-setup.md'];
  for (const rel of places) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(text.split(SENTENCE).length - 1, 1, `${rel} must carry the sentence exactly once`);
    if (rel.startsWith('agents/')) {
      assert.ok(!safetyBlock(text, rel).includes('.claude/worktrees'), `${rel}: the rule must sit outside the safety block`);
    }
  }
});

// Lane 68 item 3 (docs/specs/reliability-68/spec.md): "a PostToolUse guard report is a report, not a
// block" is in every shipped brief template, once, on its own line. For the four agents it sits OUTSIDE
// the safety block (pinned byte-identical, 11 bullets, under its character cap).
test('the guard-report sentence is on its own line, exactly once, in each of the eleven places, outside any safety block', () => {
  const SENTENCE = 'If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; '
    + 'never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.';
  const ROOT = path.join(HERE, '..');
  const places = [
    'agents/builder.md', 'agents/reviewer.md', 'agents/runner.md', 'agents/integrator.md',
    'codex/agents/builder.toml', 'codex/agents/reviewer.toml', 'codex/agents/runner.toml', 'codex/agents/integrator.toml',
    'skills/team-build/SKILL.md', 'skills/delegate/SKILL.md', 'docs/mandate-template.md',
  ];
  assert.equal(places.length, 11);
  for (const rel of places) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(text.split(SENTENCE).length - 1, 1, `${rel} must carry the sentence exactly once`);
    const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^-\s*/, ''));
    assert.ok(lines.includes(SENTENCE), `${rel}: the sentence must be on its own line`);
    if (rel.startsWith('agents/')) {
      assert.ok(!safetyBlock(text, rel).includes('A PostToolUse guard report'), `${rel}: the sentence must sit outside the safety block`);
    }
  }
});
