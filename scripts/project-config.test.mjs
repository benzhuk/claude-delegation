import test from 'node:test';
import assert from 'node:assert/strict';

import * as root from './project-config.mjs';
import * as canonical from '../skills/decisions/scripts/project-config.mjs';

test('root project-config remains a compatibility re-export of the skill-local canonical module', () => {
  assert.deepEqual(Object.keys(root).sort(), ['DEFAULTS', 'findProjectRoot', 'loadProjectConfig', 'switchedOff']);
  assert.equal(root.DEFAULTS, canonical.DEFAULTS);
  assert.equal(root.findProjectRoot, canonical.findProjectRoot);
  assert.equal(root.loadProjectConfig, canonical.loadProjectConfig);
  assert.equal(root.switchedOff, canonical.switchedOff);
});
