import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const HELPER = path.join(REPO, 'hooks', 'lib', 'goal-context.mjs');
const CARD = [
  'GOAL: Preserve the card when bearings is unavailable.',
  'NOT: couple optional host advice to card rendering.',
  'DONE: the card remains available.',
  'KILL: do not rename shipped source files.',
  'SOURCE: docs/goals/card.md (parent: docs/goals/program.md)',
].join('\n');

test('a copied helper keeps card rendering when its optional bearings module is absent', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-context-copy-'));
  const project = path.join(root, 'project');
  const agentsHome = path.join(root, 'agents');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'hooks', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(project, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(project, 'docs', 'goals'), { recursive: true });
  fs.writeFileSync(path.join(project, '.agents', 'project.json'), '{}');
  fs.writeFileSync(path.join(project, 'docs', 'goals', 'card.md'), CARD);
  fs.copyFileSync(HELPER, path.join(root, 'hooks', 'lib', 'goal-context.mjs'));
  fs.symlinkSync(path.join(REPO, 'scripts'), path.join(root, 'scripts'), 'junction');

  const copied = await import(pathToFileURL(path.join(root, 'hooks', 'lib', 'goal-context.mjs')).href);
  const card = await copied.cardResult(project, undefined, { env: { AGENTS_HOME: agentsHome } });
  assert.equal(card.status, 'ok');
  assert.match(card.text ?? '', /GOAL: Preserve the card/);
  assert.equal(await copied.bearingsNotice(project, { env: { AGENTS_HOME: agentsHome } }), null);
});
