// Independent public behavioral contract for registered Done pickup.
// All fixtures are sealed: no reader, transport, Notion, or peer endpoint is real.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { makeTempHome } from '../../../scripts/test-home.mjs';
import { childEnv } from '../../multi/scripts/test-child-env.mjs';
import { pickupOnce, receiptPaths, runRegisteredPickup } from './decisions-pickup.mjs';
import { runPostFlushPickup } from '../../multi/scripts/note-flush.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FLUSH = path.resolve(HERE, '../../multi/scripts/note-flush.mjs');
const PAGE = '0123456789abcdef0123456789abcdef';
const CANARY = 'PRIVATE_PICKUP_CANARY_4c1a5';
const RECORDED_PAGE = `<summary>Choose transport</summary>
- [x] Keep the existing transport
No default: owner action is required
\\*\\*Please preserve the capture
- [x] Done
`;
function fixture(t) {
  const sealed = makeTempHome();
  t.after(sealed.cleanup);
  const repo = fs.mkdtempSync(path.join(sealed.fixtureRoot, 'registered-project-'));
  fs.mkdirSync(path.join(repo, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: PAGE }));
  // A reader is deliberately outside the project checkout. It only marks its sealed invocation.
  const reader = path.join(sealed.fixtureRoot, 'sealed-reader.mjs');
  fs.writeFileSync(reader, `import fs from 'node:fs';\nfs.writeFileSync(process.env.PICKUP_MARKER, 'ran');\nprocess.stdout.write('<summary>Choice</summary>\\n- [ ] no action\\nNo default: owner action is required\\n- [x] Done\\n');\n`);
  const registrationPath = path.join(sealed.agentsHome, 'ws', 'decisions-pickup', 'registrations.json');
  const entry = { repo, page: PAGE, from: 'pickup-host', owner: 'maintainer', reader };
  const writeRegistration = (entries = [entry], extra = {}) => {
    fs.mkdirSync(path.dirname(registrationPath), { recursive: true });
    fs.writeFileSync(registrationPath, JSON.stringify({ version: 1, entries, ...extra }));
  };
  return { ...sealed, repo, reader, entry, registrationPath, writeRegistration };
}

function resultContext(home, overrides = {}) {
  return { result: { ok: true, exitCode: 0, drained: 0, attempted: 0, remaining: 0, results: [], home }, elapsedMs: 10, ...overrides };
}

function privateText(value) { return JSON.stringify(value); }

async function registered(fx, overrides = {}) {
  return runRegisteredPickup({ registrationPath: fx.registrationPath }, {
    agentsHome: fx.agentsHome,
    env: fx.env,
    selectIndex: () => 0,
    ...overrides,
  });
}

test('registered pickup is inert without explicit registration and switches precede any selection', async (t) => {
  const fx = fixture(t);
  let calls = 0;
  const none = await registered(fx, { pickupOnce: async () => { calls += 1; } });
  assert.deepEqual(none, { code: 'PICKUP_UNCONFIGURED', ordinal: null });
  assert.equal(calls, 0);

  fx.writeRegistration();
  fs.writeFileSync(path.join(fx.agentsHome, 'ws-off-decisions'), '');
  const off = await registered(fx, { pickupOnce: async () => { calls += 1; } });
  assert.deepEqual(off, { code: 'PICKUP_DISABLED', ordinal: null });
  assert.equal(calls, 0, 'off switch must prevent registration entry execution');
});

test('all registration validation completes before reader/pickup and does not leak private fields', async (t) => {
  const fx = fixture(t);
  // A valid first entry followed by an invalid one catches select-first false greens.
  fx.writeRegistration([fx.entry, { ...fx.entry, page: 'not-a-page', reader: `${CANARY}/relative` }]);
  let calls = 0;
  const summary = await registered(fx, { pickupOnce: async () => { calls += 1; } });
  assert.deepEqual(summary, { code: 'PICKUP_CONFIG_INVALID', ordinal: null });
  assert.equal(calls, 0, 'invalid later entry must reject the entire registry before pickup');
  assert.equal(privateText(summary).includes(CANARY), false);
});

test('duplicate normalized pages and project-page binding mismatches are rejected before pickup', async (t) => {
  const fx = fixture(t);
  const other = fs.mkdtempSync(path.join(fx.fixtureRoot, 'duplicate-page-project-'));
  fs.mkdirSync(path.join(other, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(other, '.agents', 'project.json'), JSON.stringify({ decisions_url: PAGE }));
  let calls = 0;
  fx.writeRegistration([fx.entry, { ...fx.entry, repo: other, page: `https://www.notion.so/${PAGE}` }]);
  assert.deepEqual(await registered(fx, { pickupOnce: async () => { calls += 1; } }), { code: 'PICKUP_CONFIG_INVALID', ordinal: null });
  assert.equal(calls, 0, 'duplicate normalized page must reject before either entry runs');

  fs.writeFileSync(path.join(fx.repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }));
  fx.writeRegistration();
  assert.deepEqual(await registered(fx, { pickupOnce: async () => { calls += 1; } }), { code: 'PICKUP_CONFIG_INVALID', ordinal: null });
  assert.equal(calls, 0, 'registered project binding mismatch must not reach pickup');
});
test('one injected selection invokes exactly one bound entry and maps lifecycle states to safe summaries', async (t) => {
  const fx = fixture(t);
  const second = { ...fx.entry, page: 'fedcba9876543210fedcba9876543210' };
  fs.writeFileSync(path.join(fx.repo, '.agents', 'project.json'), JSON.stringify({ decisions_url: PAGE }));
  // The second needs its own canonical project binding.
  const repo2 = fs.mkdtempSync(path.join(fx.fixtureRoot, 'registered-project-two-'));
  fs.mkdirSync(path.join(repo2, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(repo2, '.agents', 'project.json'), JSON.stringify({ decisions_url: second.page }));
  second.repo = repo2;
  fx.writeRegistration([fx.entry, second]);
  const canonical = [fx.entry, second].sort((a, b) => path.resolve(a.repo).localeCompare(path.resolve(b.repo)) || a.page.localeCompare(b.page));
  const seen = [];
  const recorded = await registered(fx, {
    selectIndex: (count) => { assert.equal(count, 2); return 1; },
    pickupOnce: async (entry) => { seen.push(entry); return { status: 'RECORDED' }; },
  });
  assert.deepEqual(recorded, { code: 'PICKUP_RECORDED', ordinal: 1 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].page, canonical[1].page, 'ordinal selects canonical repo/page order, not fixture creation order');

  for (const [outcome, code] of [
    [{ status: 'UNKNOWN', manualReconciliationRequired: true }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'PENDING_MANUAL_HANDOFF' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'WAITING_OWNER' }, 'PICKUP_PENDING_OWNER'],
    [{ status: 'NEEDS_RECONCILIATION' }, 'PICKUP_RECONCILIATION_REQUIRED'],
    [{ status: 'UNCHANGED' }, 'PICKUP_NO_ACTION'],
    [{ status: 'NOT_A_REAL_PICKUP_STATUS' }, 'PICKUP_FAILED'],
  ]) {
    const summary = await registered(fx, { pickupOnce: async () => ({ ...outcome, reason: CANARY }) });
    assert.deepEqual(summary, { code, ordinal: 0 });
    assert.equal(privateText(summary).includes(CANARY), false, `${outcome.status} leaked private detail`);
  }
  const paths = receiptPaths({ agentsHome: fx.agentsHome, project: fs.realpathSync(fx.repo), page: PAGE });
  fs.mkdirSync(paths.claim, { recursive: true });
  const marker = path.join(fx.home, 'reader-must-not-run-for-held-claim');
  const claim = await registered(fx, { env: { ...fx.env, PICKUP_MARKER: marker } });
  assert.deepEqual(claim, { code: 'PICKUP_CLAIM_HELD', ordinal: 0 });
  assert.equal(fs.existsSync(marker), false, 'a held claim must return before reading the page');
});

test('real recorded receipt with a changed registered owner reconciles without resend', async (t) => {
  const fx = fixture(t);
  const ownerA = { ...fx.entry, owner: 'owner-a' };
  let sends = 0;
  const realDeps = {
    agentsHome: fx.agentsHome,
    env: fx.env,
    now: '2026-09-24T12:00:00.000Z',
    readPage: async () => RECORDED_PAGE,
    send: async () => { sends += 1; return { id: 'sealed-note' }; },
  };
  const initial = await pickupOnce(ownerA, realDeps);
  assert.equal(initial.status, 'RECORDED');
  assert.equal(initial.receipt.owner, 'owner-a');
  assert.equal(sends, 1, 'fixture must create one real recorded dispatch');

  fx.writeRegistration([{ ...fx.entry, owner: 'owner-b' }]);
  const useRealPickup = async (options, deps) => pickupOnce(options, { ...realDeps, ...deps });
  const changed = await registered(fx, { pickupOnce: useRealPickup });
  assert.deepEqual(changed, { code: 'PICKUP_RECONCILIATION_REQUIRED', ordinal: 0 });
  assert.equal(sends, 1, 'owner mismatch must not send a second wake');

  fx.writeRegistration([ownerA]);
  const restored = await registered(fx, { pickupOnce: useRealPickup });
  assert.deepEqual(restored, { code: 'PICKUP_RECORDED', ordinal: 0 });
  assert.equal(sends, 1, 'restoring the saved owner must not resend or remain falsely reconciled');
});
test('post-flush boundary excludes help/status/dry-run/targeted and preserves normal failure/budget', async (t) => {
  const fx = fixture(t);
  let imports = 0;
  const deps = { homedir: fx.home, fsImpl: fs, env: fx.env, pid: process.pid, importer: async () => { imports += 1; } };
  for (const argv of [['--help'], ['--status'], ['--status=json'], ['--dry-run'], ['--to', 'someone'], ['--to=someone'], ['--home', fx.home], ['--home=' + fx.home]]) {
    const value = await runPostFlushPickup(argv, resultContext(fx.home), deps);
    assert.equal(value, null, `${argv.join(' ')} must not activate pickup`);
  }
  assert.equal(imports, 0);
  assert.equal(await runPostFlushPickup([], resultContext(fx.home, { result: { ok: false, exitCode: 1 }, elapsedMs: 1 }), deps), null);
  assert.equal(await runPostFlushPickup([], resultContext(fx.home, { elapsedMs: 30_000 }), deps), null, 'absent registration remains an inert budget skip');
  fx.writeRegistration();
  assert.deepEqual(await runPostFlushPickup([], resultContext(fx.home, { elapsedMs: 30_000 }), deps), { code: 'PICKUP_SKIPPED_BUDGET', ordinal: null });
  const alternate = path.join(fx.fixtureRoot, 'alternate-home');
  assert.equal(await runPostFlushPickup(['--home', alternate], resultContext(fx.home), deps), null, '--home is always excluded');
  assert.equal(await runPostFlushPickup(['--home=' + alternate], resultContext(fx.home), deps), null, '--home= is always excluded');
  const nonDefaultAgents = path.join(fx.fixtureRoot, 'other-agents');
  assert.deepEqual(await runPostFlushPickup([], resultContext(fx.home), { ...deps, env: { ...fx.env, AGENTS_HOME: nonDefaultAgents } }), { code: 'PICKUP_CONFIG_INVALID', ordinal: null });
  assert.equal(imports, 0, 'failed, excluded, budget, and alternate-AGENTS_HOME paths must not import pickup');
});

test('post-flush pickup preserves its observed heartbeat and declines an observed replacement', async (t) => {
  const fx = fixture(t);
  fx.writeRegistration();
  const heartbeat = path.join(fx.agentsHome, 'notes', 'flush-last.json');
  fs.mkdirSync(path.dirname(heartbeat), { recursive: true });
  const ours = { at: '2026-09-24T12:00:00.000Z', timer_at: '2026-09-24T12:00:00.000Z', pid: process.pid, queued: 3, delivered: 1 };
  fs.writeFileSync(heartbeat, JSON.stringify(ours));
  const summary = await runPostFlushPickup([], resultContext(fx.home), {
    homedir: fx.home, fsImpl: fs, env: fx.env, pid: process.pid,
    now: () => Date.parse('2026-09-24T12:00:03.000Z'),
    importer: async () => ({ runRegisteredPickup: async () => ({ code: 'PICKUP_NO_ACTION', ordinal: 0 }) }),
  });
  assert.deepEqual(summary, { code: 'PICKUP_NO_ACTION', ordinal: 0 });
  const annotated = JSON.parse(fs.readFileSync(heartbeat, 'utf8'));
  assert.deepEqual(annotated.pickup, { at: '2026-09-24T12:00:03.000Z', code: 'PICKUP_NO_ACTION', ordinal: 0 });
  assert.equal(annotated.queued, 3, 'annotation must preserve normal-flush accounting');

  const newer = { at: '2026-09-24T12:01:00.000Z', timer_at: '2026-09-24T12:01:00.000Z', pid: process.pid + 1, queued: 9, delivered: 2 };
  fs.writeFileSync(heartbeat, JSON.stringify(ours));
  await runPostFlushPickup([], resultContext(fx.home), {
    homedir: fx.home, fsImpl: fs, env: fx.env, pid: process.pid,
    now: () => Date.parse('2026-09-24T12:00:04.000Z'),
    importer: async () => {
      fs.writeFileSync(heartbeat, JSON.stringify(newer));
      return { runRegisteredPickup: async () => ({ code: 'PICKUP_RECORDED', ordinal: 0 }) };
    },
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(heartbeat, 'utf8')), newer, 'an observed replacement heartbeat must not be overwritten by this diagnostic annotation');
});

test('real standalone CLI uses relative dynamic import, runs sealed registered reader, and exits zero', (t) => {
  const fx = fixture(t);
  fx.writeRegistration();
  const marker = path.join(fx.home, 'pickup-reader-ran');
  const child = spawnSync(process.execPath, [FLUSH, '--json'], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
    env: childEnv(fx.home, { ...fx.env, AGENTS_HOME: fx.agentsHome, PICKUP_MARKER: marker }),
  });
  assert.equal(child.error, undefined, String(child.error?.message ?? ''));
  assert.equal(child.status, 0, `exit=${child.status}; stderr=${child.stderr}`);
  assert.notEqual(child.status, 13, 'top-level-await import-cycle exit is forbidden');
  assert.equal(fs.existsSync(marker), true, `pickup reader never ran; stdout=${child.stdout}`);
  const combined = `${child.stdout}\n${child.stderr}`;
  assert.equal(combined.includes(CANARY), false, 'subprocess emitted private fixture marker');
});
