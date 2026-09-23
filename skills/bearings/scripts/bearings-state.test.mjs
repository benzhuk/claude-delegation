import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, complete, receiptLocation } from './bearings-state.mjs';

const SCRIPT = fileURLToPath(new URL('./bearings-state.mjs', import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bearings-state-'));
function project() {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true }); fs.mkdirSync(path.join(root, 'docs', 'goals'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'project.json'), JSON.stringify({ vcs: 'none' })); fs.writeFileSync(path.join(root, 'docs', 'goals', 'card.md'), 'GOAL: fixture\n'); return root;
}
function files(root) { const report = path.join(root, 'report.md'); const response = path.join(root, 'response.md'); fs.writeFileSync(report, 'review\n'); fs.writeFileSync(response, 'lead\n'); return { report, response }; }
function env() { return { ...process.env, AGENTS_HOME: tmp() }; }

test('missing goal is unconfigured and a missing receipt is due', () => {
  const root = project(); const e = env(); fs.unlinkSync(path.join(root, 'docs', 'goals', 'card.md'));
  assert.equal(check({ repo: root, env: e }).status, 'unconfigured'); fs.writeFileSync(path.join(root, 'docs', 'goals', 'card.md'), 'GOAL: fixture\n'); assert.equal(check({ repo: root, env: e }).status, 'due');
});
test('complete creates an attested receipt current for less than 24 hours and due at 24', () => {
  const root = project(); const e = env(); const { report, response } = files(root); const now = Date.UTC(2026, 8, 23, 15);
  assert.equal(complete({ repo: root, report, leadResponse: response, publication: 'https://example.test/decision', env: e, now }).version, 1);
  assert.equal(check({ repo: root, env: e, now: now + 23 * 60 * 60 * 1000 }).status, 'current'); assert.equal(check({ repo: root, env: e, now: now + 24 * 60 * 60 * 1000 }).status, 'due');
});
test('malformed publication URLs are rejected during completion and cannot suppress due', () => {
  const root = project(); const e = env(); const { report, response } = files(root); const now = Date.UTC(2026, 8, 23, 15);
  assert.throws(() => complete({ repo: root, report, leadResponse: response, publication: 'https://', env: e, now }), /http\(s\) URL/);
  complete({ repo: root, report, leadResponse: response, publication: 'https://example.test/decision', env: e, now });
  const receiptPath = receiptLocation(fs.realpathSync(root), e); const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  receipt.publication = 'https://'; fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  assert.equal(check({ repo: root, env: e, now }).status, 'due');
});
test('receipt destination cannot replace report, response, or goal evidence through aliases', () => {
  const root = project(); const e = env(); const { report, response } = files(root); const now = Date.UTC(2026, 8, 23, 15);
  complete({ repo: root, report, leadResponse: response, publication: 'https://example.test/decision', env: e, now });
  const receiptPath = receiptLocation(fs.realpathSync(root), e); const before = fs.readFileSync(receiptPath);
  const aliases = [receiptPath, path.join(path.dirname(receiptPath), '.', path.basename(receiptPath))];
  const caseAlias = receiptPath.toUpperCase();
  if (fs.existsSync(caseAlias) && fs.realpathSync.native(caseAlias) === fs.realpathSync.native(receiptPath)) aliases.push(caseAlias);
  for (const evidence of aliases) {
    assert.throws(() => complete({ repo: root, report: evidence, leadResponse: response, publication: 'https://example.test/decision', env: e, now }), /destination conflicts/);
    assert.deepEqual(fs.readFileSync(receiptPath), before);
    assert.throws(() => complete({ repo: root, report, leadResponse: evidence, publication: 'https://example.test/decision', env: e, now }), /destination conflicts/);
    assert.deepEqual(fs.readFileSync(receiptPath), before);
  }
  const goalRoot = project(); const goalEnv = env(); const goalFiles = files(goalRoot);
  const goalReceipt = receiptLocation(fs.realpathSync(goalRoot), goalEnv); fs.mkdirSync(path.dirname(goalReceipt), { recursive: true }); fs.writeFileSync(goalReceipt, 'goal card\n');
  fs.writeFileSync(path.join(goalRoot, '.agents', 'project.json'), JSON.stringify({ vcs: 'none', goal_card: goalReceipt })); const goalBefore = fs.readFileSync(goalReceipt);
  assert.throws(() => complete({ repo: goalRoot, report: goalFiles.report, leadResponse: goalFiles.response, publication: 'https://example.test/decision', env: goalEnv, now }), /destination conflicts/);
  assert.deepEqual(fs.readFileSync(goalReceipt), goalBefore);
});
test('future, tampered, changed-goal and malformed receipts never suppress due', () => {
  const root = project(); const e = env(); const { report, response } = files(root); const now = Date.UTC(2026, 8, 23, 15);
  complete({ repo: root, report, leadResponse: response, publication: 'https://example.test/decision', env: e, now: now + 1 }); assert.equal(check({ repo: root, env: e, now }).status, 'due');
  complete({ repo: root, report, leadResponse: response, publication: 'https://example.test/decision', env: e, now }); fs.appendFileSync(report, 'tampered\n'); assert.equal(check({ repo: root, env: e, now }).status, 'due');
  complete({ repo: root, report, leadResponse: response, publication: 'https://example.test/decision', env: e, now }); fs.appendFileSync(path.join(root, 'docs', 'goals', 'card.md'), 'changed\n'); assert.equal(check({ repo: root, env: e, now }).status, 'due');
  fs.writeFileSync(receiptLocation(fs.realpathSync(root), e), '{not json'); assert.equal(check({ repo: root, env: e, now }).status, 'due');
});
test('canonical project roots are separate and copied-skill CLI has no checkout dependency', () => {
  const first = project(); const second = project(); const e = env(); const { report, response } = files(first);
  complete({ repo: first, report, leadResponse: response, publication: 'https://example.test/decision', env: e }); assert.equal(check({ repo: first, env: e }).status, 'current'); assert.equal(check({ repo: second, env: e }).status, 'due');
  const copiedSkills = path.join(tmp(), 'skills'); const copy = path.join(copiedSkills, 'bearings');
  fs.cpSync(path.resolve(path.dirname(SCRIPT), '..'), copy, { recursive: true });
  fs.cpSync(path.resolve(path.dirname(SCRIPT), '../../decisions'), path.join(copiedSkills, 'decisions'), { recursive: true });
  const result = spawnSync(process.execPath, [path.join(copy, 'scripts', 'bearings-state.mjs'), 'check', '--repo', first], { env: e, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'current');
});
