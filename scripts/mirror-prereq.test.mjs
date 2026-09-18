// node --test "scripts/*.test.mjs"
// The installer's one PREREQUISITE CHECK (review C14).
//
// Peer notes are delivered into a Claude session's own inbox socket (multi 0.5.0). A session that
// bypasses permission prompts HOLDS an arriving note behind a modal approval dialog unless its settings
// say `crossSessionInbound: "accept"` - a failure worse than no delivery, and invisible to the sender.
// The installer says so on the machine that is missing it, and changes nothing: the settings are Ben's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkCrossSessionInbound } from './mirror-shared-skills.mjs';

function homeWith(settings) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-prereq-'));
  if (settings !== undefined) {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), settings);
  }
  return home;
}

test('C14: "accept" is the only value that passes', () => {
  assert.equal(checkCrossSessionInbound({ home: homeWith('{"crossSessionInbound":"accept"}') }).ok, true);
  for (const value of ['hold', 'refuse']) {
    const state = checkCrossSessionInbound({ home: homeWith(`{"crossSessionInbound":"${value}"}`) });
    assert.equal(state.ok, false);
    assert.equal(state.value, value, 'and the warning can name what it found');
  }
});

test('C14: an absent setting, a missing file and a corrupt one are all reported, never thrown', () => {
  assert.deepEqual(
    [checkCrossSessionInbound({ home: homeWith('{}') }).value, checkCrossSessionInbound({ home: homeWith() }).value],
    [null, null],
  );
  const corrupt = checkCrossSessionInbound({ home: homeWith('{ not json') });
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.value, null, 'an unparseable settings file is not a claim either way');
  assert.match(corrupt.path, /\.claude\/settings\.json$/);
});

test('C14: the check only READS - an installer must never make a permissions decision for Ben', () => {
  const home = homeWith('{"crossSessionInbound":"hold"}');
  const file = path.join(home, '.claude', 'settings.json');
  const before = fs.readFileSync(file, 'utf8');
  checkCrossSessionInbound({ home });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('N6: settings.local.json counts, and wins - warning at a correctly configured machine is worse than silence', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-prereq-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.local.json'), '{"crossSessionInbound":"accept"}');
  const onlyLocal = checkCrossSessionInbound({ home });
  assert.equal(onlyLocal.ok, true);
  assert.match(onlyLocal.path, /settings\.local\.json$/);

  // Local wins over the shared file, as it does for Claude Code itself.
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{"crossSessionInbound":"hold"}');
  assert.equal(checkCrossSessionInbound({ home }).ok, true);

  // And a local file that says nothing falls through to the shared one rather than masking it.
  fs.writeFileSync(path.join(home, '.claude', 'settings.local.json'), '{"theme":"dark"}');
  const fellThrough = checkCrossSessionInbound({ home });
  assert.equal(fellThrough.value, 'hold');
  assert.match(fellThrough.path, /[^.]settings\.json$/);
});
