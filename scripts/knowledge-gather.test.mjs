// node --test scripts/knowledge-gather.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gatherKnowledge, managedNames, reconcileKnowledge, runProcess, sshEnv } from './knowledge-gather.mjs';
import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import {
  fixtureOptions, hostRow, makeExitSshFixture, makeSshFixture, makeTarSshFixture, paxRecord,
  seedVerifiedPublication, sha, tarArchive, tarEntry, tmp, writeRemoteNote,
} from './knowledge-gather.test-fixtures.mjs';

const CHILD_ENV_MODULE = new URL('../skills/multi/scripts/test-child-env.mjs', import.meta.url).href;

function makeHangingSshFixture() {
  const dir = tmp('knowledge-hang-ssh-');
  const script = path.join(dir, 'fake-hang-ssh.mjs');
  const pidFile = path.join(dir, 'grandchild.pid');
  const childHome = path.join(dir, 'grandchild-home');
  fs.mkdirSync(childHome);
  fs.writeFileSync(script, `
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { childEnv } from ${JSON.stringify(CHILD_ENV_MODULE)};
const childHome = ${JSON.stringify(childHome.replaceAll('\\', '/'))};
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', env: childEnv(childHome) });
fs.writeFileSync(${JSON.stringify(pidFile.replaceAll('\\', '/'))}, String(child.pid));
setInterval(() => {}, 1000);
`);
  return { command: [process.execPath, script], pidFile, log: path.join(dir, 'unused'), calls: () => [] };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform !== 'win32' && fs.existsSync(`/proc/${pid}/stat`) && /\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'))) return false;
    return true;
  } catch {
    return false;
  }
}

test('gathers only stable top-level notes, preserves bytes/mtime, and reports pending Mac separately', async () => {
  const localHome = tmp('knowledge-local-');
  const stateDir = path.join(localHome, '.agents', 'knowledge-triage');
  const netcup = tmp('knowledge-netcup-');
  const hetzner = tmp('knowledge-hetzner-');
  const oldBytes = Buffer.from('---\ndate: 2026-08-01\nstatus: pending\n---\nold note\n');
  writeRemoteNote(netcup, '2026-08-01-old note.md', oldBytes, 10);
  writeRemoteNote(netcup, '2026-09-29-still-writing.md', 'fresh\n', 1);
  writeRemoteNote(netcup, '.hidden.md', 'hidden\n', 10);
  writeRemoteNote(netcup, 'plain.txt', 'text\n', 10);
  fs.mkdirSync(path.join(netcup, '.claude', 'knowledge', '_inbox', 'nested'), { recursive: true });
  writeRemoteNote(hetzner, '2026-08-02-hetzner.md', 'hetzner\n', 10);
  const ssh = makeSshFixture({ 'fixture-netcup': netcup, 'fixture-hetzner': hetzner });
  const options = fixtureOptions({
    localHome, stateDir, ssh,
    endpoints: { netcup: 'fixture-netcup', hetzner: 'fixture-hetzner', mac: 'pending' },
  });

  const gathered = await gatherKnowledge(options);
  assert.equal(hostRow(gathered, 'netcup').fetched, 1);
  assert.equal(hostRow(gathered, 'hetzner').fetched, 1);
  assert.deepEqual(
    { status: hostRow(gathered, 'mac').status, reason: hostRow(gathered, 'mac').reason },
    { status: 'skipped', reason: 'awaiting owner-provided ssh alias' },
  );
  assert.equal(gathered.imports.length, 2);
  const imported = gathered.imports.find((item) => item.host === 'netcup');
  assert.equal(imported.originalName, '2026-08-01-old note.md');
  assert.equal(imported.sha256, sha(oldBytes));
  assert.deepEqual(fs.readFileSync(path.join(options.inboxDir, imported.importedName)), oldBytes);
  assert.ok(imported.importedName.startsWith(`netcup-${sha(oldBytes).slice(0, 12)}-`));
  assert.ok(Math.abs(fs.statSync(path.join(options.inboxDir, imported.importedName)).mtimeMs - imported.sourceMtimeMs) < 2000);
});

test('one canonical import accounts for identical bytes across local and both remotes, and repeat gather is idempotent', async () => {
  const localHome = tmp('knowledge-dedup-local-');
  const stateDir = path.join(localHome, '.agents', 'knowledge-triage');
  const netcup = tmp('knowledge-dedup-netcup-');
  const hetzner = tmp('knowledge-dedup-hetzner-');
  const bytes = Buffer.from('same body on every host\n');
  const inbox = path.join(localHome, '.claude', 'knowledge', '_inbox');
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, '2026-08-01-local.md'), bytes);
  writeRemoteNote(netcup, '2026-08-02-remote-a.md', bytes);
  writeRemoteNote(hetzner, '2026-08-03-remote-b.md', bytes);
  const ssh = makeSshFixture({ n: netcup, h: hetzner });
  const options = fixtureOptions({ localHome, stateDir, ssh, endpoints: { netcup: 'n', hetzner: 'h', mac: null } });

  const first = await gatherKnowledge(options);
  assert.equal(first.imports.length, 0, 'existing local content is canonical');
  assert.equal(hostRow(first, 'netcup').alreadyPresent, 1);
  assert.equal(hostRow(first, 'hetzner').alreadyPresent, 1);
  const before = fs.readdirSync(inbox).sort();
  const second = await gatherKnowledge(options);
  assert.deepEqual(fs.readdirSync(inbox).sort(), before);
  assert.equal(second.imports.length, 0);
  assert.equal(hostRow(second, 'netcup').alreadyPresent, 1);
  assert.equal(hostRow(second, 'hetzner').alreadyPresent, 1);
});

test('null endpoint and pending Mac have distinct reasons and spawn no SSH child', async () => {
  const localHome = tmp('knowledge-alias-local-');
  const unused = tmp('knowledge-alias-unused-');
  const ssh = makeSshFixture({ unreachable: unused });
  const gathered = await gatherKnowledge(fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: null, hetzner: null, mac: 'pending' },
  }));
  assert.equal(hostRow(gathered, 'netcup').reason, 'no ssh alias');
  assert.equal(hostRow(gathered, 'hetzner').reason, 'no ssh alias');
  assert.equal(hostRow(gathered, 'mac').reason, 'awaiting owner-provided ssh alias');
  assert.equal(ssh.calls().length, 0);
});

test('unresolved managed-name discovery fails standalone gather closed before SSH', async () => {
  const localHome = tmp('knowledge-managed-unknown-local-');
  const remote = tmp('knowledge-managed-unknown-remote-');
  writeRemoteNote(remote, '2026-08-01-must-not-import.md', 'managed status unknown\n');
  const ssh = makeSshFixture({ n: remote });
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: 'n', hetzner: null, mac: null },
  });
  options.deps.chezmoiSourceInbox = undefined;
  options.deps.chezmoiCommand = makeExitSshFixture(2, 'fixture chezmoi failure\n').command;
  const resolved = await managedNames(options);
  assert.ok(resolved.set instanceof Set);
  assert.equal(resolved.set.size, 0);
  assert.match(resolved.error, /chezmoi source-path/i);
  const gathered = await gatherKnowledge(options);
  assert.equal(gathered.imports.length, 0);
  assert.equal(ssh.calls().length, 0);
  for (const row of gathered.hosts) {
    assert.equal(row.status, 'skipped', row.host);
    assert.match(row.reason, /managed set unresolved.*chezmoi source-path/i, row.host);
  }
});

test('unreachable configured remote is never reported as gathered success', async () => {
  const localHome = tmp('knowledge-unreachable-local-');
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'),
    ssh: makeExitSshFixture(255, 'fixture host unreachable\n'),
    endpoints: { netcup: 'unreachable', hetzner: null, mac: null },
  });
  const gathered = await gatherKnowledge(options);
  const row = hostRow(gathered, 'netcup');
  assert.notEqual(row.status, 'gathered');
  assert.match(row.reason, /unreachable|exit 255/i);
  assert.equal(row.fetched, 0);
  assert.equal(gathered.imports.length, 0);
});

test('real host deadline kills the fake SSH process tree and reports timeout', { timeout: 15_000 }, async () => {
  const localHome = tmp('knowledge-host-timeout-local-');
  const ssh = makeHangingSshFixture();
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: 'timeout-fixture', hetzner: null, mac: null },
  });
  options.deps.hostTimeoutMs = 250;
  const started = Date.now();
  const gathered = await gatherKnowledge(options);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 150 && elapsed < 10_000, `host timeout elapsed ${elapsed}ms`);
  const row = hostRow(gathered, 'netcup');
  assert.notEqual(row.status, 'gathered');
  assert.match(row.reason, /timed out|timeout/i);
  assert.ok(fs.existsSync(ssh.pidFile));
  const pid = Number(fs.readFileSync(ssh.pidFile, 'utf8'));
  const deadline = Date.now() + 4_000;
  while (processIsAlive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(processIsAlive(pid), false, `SSH grandchild ${pid} survived owned process-tree kill`);
});

test('overflow and timeout signal the owned child tree only once in either order', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const realKill = process.kill;
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
    for (const order of ['overflow-first', 'timeout-first']) {
      let timeoutCallback = null; let killCalls = 0; let childPid = null;
      process.kill = (pid, signal) => {
        killCalls++; childPid = Math.abs(pid);
        if (order === 'overflow-first' && killCalls === 1) {
          assert.ok(timeoutCallback, 'parent timeout must already be armed'); timeoutCallback();
          return realKill.call(process, childPid, signal);
        }
        if (order === 'timeout-first' && killCalls === 1) setTimeout(() => { try { realKill.call(process, childPid, signal); } catch {} }, 200);
        return true;
      };
      const pending = runProcess({
        cmd: [process.execPath], args: ['-e', 'setTimeout(() => process.stdout.write("overflow"), 25); setInterval(() => {}, 1000)'],
        maxBytes: 1, timeoutMs: 10_000,
        timers: { setTimeout(callback) { if (!timeoutCallback) timeoutCallback = callback; return { unref() {} }; }, clearTimeout() {} },
      });
      if (order === 'timeout-first') { assert.ok(timeoutCallback); timeoutCallback(); }
      const result = await pending;
      assert.equal(result.overflow, true, order); assert.equal(result.timedOut, true, order);
      assert.equal(killCalls, 1, `${order}: overflow and timeout must share one process-tree signal`);
    }
  } finally {
    process.kill = realKill;
    Object.defineProperty(process, 'platform', platform);
  }
});

test('same origin name with changed bytes becomes a distinct version instead of clobbering the first import', async () => {
  const localHome = tmp('knowledge-version-local-');
  const stateDir = path.join(localHome, '.agents', 'knowledge-triage');
  const remote = tmp('knowledge-version-remote-');
  const source = writeRemoteNote(remote, '2026-08-04-reused.md', 'version one\n');
  const ssh = makeSshFixture({ n: remote });
  const options = fixtureOptions({ localHome, stateDir, ssh, endpoints: { netcup: 'n', hetzner: null, mac: null } });
  const first = await gatherKnowledge(options);
  fs.writeFileSync(source, 'version two\n');
  const old = (Date.now() - 10 * 60_000) / 1000;
  fs.utimesSync(source, old, old);
  const second = await gatherKnowledge(options);
  assert.equal(first.imports.length, 1);
  assert.equal(second.imports.length, 1);
  assert.notEqual(second.imports[0].sha256, first.imports[0].sha256);
  assert.notEqual(second.imports[0].importedName.toLowerCase(), first.imports[0].importedName.toLowerCase());
  assert.ok(fs.existsSync(path.join(options.inboxDir, first.imports[0].importedName)));
  assert.ok(fs.existsSync(path.join(options.inboxDir, second.imports[0].importedName)));
});

test('SSH uses the fixed hardening flags and forwards no caller secret, API key, or Git identity', async () => {
  const localHome = tmp('knowledge-env-local-');
  const remote = tmp('knowledge-env-remote-');
  writeRemoteNote(remote, '2026-08-05-note.md', 'body\n');
  const ssh = makeSshFixture({ n: remote });
  const keys = ['ANTHROPIC_API_KEY', 'LANE40_SECRET', 'GIT_AUTHOR_NAME', 'GIT_COMMITTER_EMAIL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) process.env[key] = `must-not-forward-${key}`;
  try {
    await gatherKnowledge(fixtureOptions({
      localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
      endpoints: { netcup: 'n', hetzner: null, mac: 'pending' },
    }));
  } finally {
    for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
  }
  const call = ssh.calls()[0];
  for (const exact of [
    '-T', 'BatchMode=yes', 'StrictHostKeyChecking=yes', 'ConnectTimeout=15', 'ForwardAgent=no',
    'ForwardX11=no', 'ClearAllForwardings=yes', 'PermitLocalCommand=no', 'RemoteCommand=none', 'RequestTTY=no',
  ]) assert.ok(call.argv.includes(exact) || call.argv.includes(`-o${exact}`), `missing SSH policy ${exact}: ${call.argv}`);
  for (const key of keys) assert.ok(!call.env.includes(key), `${key} reached fake SSH`);
});

const WINDOWS_OPENSSH = 'C:/Windows/System32/OpenSSH/ssh.exe';
const WINDOWS_OPENSSH_SKIP = process.platform !== 'win32'
  ? 'native Windows OpenSSH startup is Windows-only'
  : !fs.existsSync(WINDOWS_OPENSSH)
    ? 'native Windows OpenSSH executable is unavailable'
    : false;

test('production sshEnv starts native Windows OpenSSH and still excludes provider credentials', {
  skip: WINDOWS_OPENSSH_SKIP,
  timeout: 15_000,
}, async () => {
  const fixtureHome = tmp('knowledge-native-openssh-home-');
  const excluded = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_CODE_MESSAGING_TOKEN', 'GIT_AUTHOR_NAME'];
  const sealedBase = childEnv(fixtureHome, Object.fromEntries(excluded.map((name) => [name, `sealed-${name}`])));
  const env = sshEnv(sealedBase);
  const result = await runProcess({
    cmd: [WINDOWS_OPENSSH], args: ['-V'], env, timeoutMs: 10_000, maxBytes: 1024 * 1024,
  });

  assert.equal(result.timedOut, false, 'native Windows OpenSSH startup exceeded its loose process bound');
  assert.equal(result.error, null, 'native Windows OpenSSH failed before returning an exit status');
  assert.equal(result.code, 0, `native Windows OpenSSH did not start with sshEnv names: ${Object.keys(env).sort().join(', ')}`);
  assert.ok(Object.hasOwn(env, 'ProgramData'), 'production sshEnv must retain the Windows OpenSSH OS-data locator');
  for (const name of excluded) assert.equal(Object.hasOwn(env, name), false, `${name} reached native OpenSSH`);
});

test('status-frontmatter mutation does not change original-byte identity during cross-month reconciliation', async () => {
  const localHome = tmp('knowledge-reconcile-local-');
  const remote = tmp('knowledge-reconcile-remote-');
  const sourceBytes = Buffer.from('---\ndate: 2026-08-06\nstatus: pending\n---\nbody\n');
  writeRemoteNote(remote, '2026-08-06-origin.md', sourceBytes);
  const ssh = makeSshFixture({ n: remote });
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: 'n', hetzner: null, mac: null },
    now: new Date('2026-10-02T12:00:00Z'),
  });
  const gathered = await gatherKnowledge(options);
  const item = gathered.imports[0];
  const localArchive = path.join(options.inboxDir, '_archive', '2026-09');
  fs.mkdirSync(localArchive, { recursive: true });
  fs.renameSync(path.join(options.inboxDir, item.importedName), path.join(localArchive, item.importedName));
  fs.writeFileSync(path.join(localArchive, item.importedName), sourceBytes.toString().replace('status: pending', 'status: merged:orca.md'));
  seedVerifiedPublication(options, [item.importedName]);

  const rows = await reconcileKnowledge(options, gathered);
  const row = rows.find((entry) => entry.host === 'netcup');
  assert.equal(row.archived, 1);
  const remoteArchive = path.join(remote, '.claude', 'knowledge', '_inbox', '_archive', '2026-09', '2026-08-06-origin.md');
  assert.deepEqual(fs.readFileSync(remoteArchive), sourceBytes);
  assert.ok(!fs.existsSync(path.join(remote, '.claude', 'knowledge', '_inbox', '2026-08-06-origin.md')));
  assert.ok(!fs.existsSync(item.stagedPath), 'confirmed origin move removes only the staged byte copy');
});

test('changed origin and conflicting archive are preserved and reported unresolved', async () => {
  for (const mode of ['changed-origin', 'conflicting-archive']) {
    const localHome = tmp(`knowledge-${mode}-local-`);
    const remote = tmp(`knowledge-${mode}-remote-`);
    const originalName = `2026-08-07-${mode}.md`;
    const source = writeRemoteNote(remote, originalName, 'original\n');
    const ssh = makeSshFixture({ n: remote });
    const options = fixtureOptions({
      localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
      endpoints: { netcup: 'n', hetzner: null, mac: null },
    });
    const gathered = await gatherKnowledge(options);
    const item = gathered.imports[0];
    const localArchive = path.join(options.inboxDir, '_archive', '2026-09');
    fs.mkdirSync(localArchive, { recursive: true });
    fs.renameSync(path.join(options.inboxDir, item.importedName), path.join(localArchive, item.importedName));
    if (mode === 'changed-origin') {
      fs.writeFileSync(source, 'changed concurrently\n');
    } else {
      const destination = path.join(remote, '.claude', 'knowledge', '_inbox', '_archive', '2026-09', originalName);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, 'different archived bytes\n');
    }
    seedVerifiedPublication(options, [item.importedName]);
    const rows = await reconcileKnowledge(options, gathered);
    const row = rows.find((entry) => entry.host === 'netcup');
    assert.equal(row.archived, 0, mode);
    assert.equal(row.unresolved, 1, mode);
    assert.ok(fs.existsSync(source), `${mode}: source retained`);
    assert.ok(fs.existsSync(item.stagedPath), `${mode}: staged evidence retained`);
  }
});

async function preparedArchiveCase(label, phase = null) {
  const localHome = tmp(`knowledge-claim-${label}-local-`);
  const remote = tmp(`knowledge-claim-${label}-remote-`);
  const name = `2026-08-07-${label}.md`;
  const original = Buffer.from('gathered original bytes\n');
  const replacement = Buffer.from('changed bytes before claim\n');
  const occupied = Buffer.from('new live-name occupant\n');
  const source = writeRemoteNote(remote, name, original);
  const replacementFile = path.join(remote, 'replacement.bin');
  const occupiedFile = path.join(remote, 'occupied.bin');
  fs.writeFileSync(replacementFile, replacement); fs.writeFileSync(occupiedFile, occupied);
  const archiveRace = phase ? { source, replacement: replacementFile, occupied: occupiedFile, phase } : null;
  const ssh = makeSshFixture({ n: remote }, { archiveRace });
  const options = fixtureOptions({ localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh, endpoints: { netcup: 'n', hetzner: null, mac: null } });
  const gathered = await gatherKnowledge(options); const item = gathered.imports[0]; const month = '2026-09';
  const localArchive = path.join(options.inboxDir, '_archive', month);
  fs.mkdirSync(localArchive, { recursive: true });
  fs.renameSync(path.join(options.inboxDir, item.importedName), path.join(localArchive, item.importedName));
  seedVerifiedPublication(options, [item.importedName]);
  return { remote, source, name, original, replacement, occupied, options, gathered, item, month };
}

test('interrupted and busy archive claims remain named unresolved evidence, never terminal missing', async () => {
  for (const mode of ['interrupted', 'busy']) {
    const h = await preparedArchiveCase(mode);
    const claim = path.join(path.dirname(h.source), `.claim-${h.item.sha256}`);
    fs.mkdirSync(claim);
    if (mode === 'interrupted') fs.renameSync(h.source, path.join(claim, 'note'));
    else fs.writeFileSync(path.join(claim, 'owner'), 'existing claim marker\n');
    const rows = await reconcileKnowledge(h.options, h.gathered); const row = hostRow({ hosts: rows }, 'netcup');
    assert.equal(row.terminal, 0, mode); assert.equal(row.unresolved, 1, mode);
    const residue = rows.residue.unresolved.find((item) => item.host === 'netcup' && item.name === h.name);
    assert.match(residue.reason, mode === 'interrupted' ? /remote claim kept.*\.claim-/i : /claim dir already exists.*\.claim-/i);
    if (mode === 'interrupted') assert.deepEqual(fs.readFileSync(path.join(claim, 'note')), h.original);
    else { assert.deepEqual(fs.readFileSync(h.source), h.original); assert.equal(fs.readFileSync(path.join(claim, 'owner'), 'utf8'), 'existing claim marker\n'); }
  }
});

test('changed claim restores to a free name or preserves claim plus a newly occupied live name', async () => {
  for (const phase of ['before-claim', 'before-claim-occupied']) {
    const h = await preparedArchiveCase(phase, phase);
    const rows = await reconcileKnowledge(h.options, h.gathered); const row = hostRow({ hosts: rows }, 'netcup');
    const claim = path.join(path.dirname(h.source), `.claim-${h.item.sha256}`);
    const destination = path.join(path.dirname(h.source), '_archive', h.month, h.name);
    assert.equal(row.terminal, 0, phase); assert.equal(row.unresolved, 1, phase); assert.ok(!fs.existsSync(destination), phase);
    const residue = rows.residue.unresolved.find((item) => item.name === h.name);
    if (phase === 'before-claim') {
      assert.match(residue.reason, /origin changed since gather/i); assert.deepEqual(fs.readFileSync(h.source), h.replacement); assert.ok(!fs.existsSync(claim));
    } else {
      assert.match(residue.reason, /remote claim kept.*\.claim-/i); assert.deepEqual(fs.readFileSync(h.source), h.occupied); assert.deepEqual(fs.readFileSync(path.join(claim, 'note')), h.replacement);
    }
  }
});

test('atomic replacement during archive preserves the claimed original and the live replacement', async () => {
  const localHome = tmp('knowledge-archive-race-local-');
  const remote = tmp('knowledge-archive-race-remote-');
  const name = '2026-08-07-race.md';
  const original = Buffer.from('gathered original bytes\n');
  const replacement = Buffer.from('replacement written during archive\n');
  const source = writeRemoteNote(remote, name, original);
  const replacementFile = path.join(remote, 'race-replacement.bin');
  fs.writeFileSync(replacementFile, replacement);
  const ssh = makeSshFixture({ n: remote }, { archiveRace: { source, replacement: replacementFile } });
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: 'n', hetzner: null, mac: null },
  });
  const gathered = await gatherKnowledge(options);
  const item = gathered.imports[0];
  const month = '2026-09';
  const localArchive = path.join(options.inboxDir, '_archive', month);
  fs.mkdirSync(localArchive, { recursive: true });
  fs.renameSync(path.join(options.inboxDir, item.importedName), path.join(localArchive, item.importedName));
  seedVerifiedPublication(options, [item.importedName]);
  const rows = await reconcileKnowledge(options, gathered);
  const row = rows.find((entry) => entry.host === 'netcup');
  const remoteInbox = path.dirname(source);
  const destination = path.join(remoteInbox, '_archive', month, name);
  assert.equal(row.archived, 1);
  assert.equal(row.unresolved, 0);
  assert.deepEqual(fs.readFileSync(destination), original, 'the owned claim supplies archived bytes');
  assert.deepEqual(fs.readFileSync(source), replacement, 'the replacement remains pending at the live name');
  assert.deepEqual(fs.readdirSync(remoteInbox).sort(), ['_archive', name].sort());
  assert.ok(!fs.existsSync(item.stagedPath), 'successful old-version archive removes only its staged evidence');
});

test('origin missing and superseded versions become one-time terminal outcomes with staged evidence retained', async () => {
  for (const mode of ['origin-missing', 'superseded']) {
    const localHome = tmp(`knowledge-terminal-${mode}-local-`);
    const remote = tmp(`knowledge-terminal-${mode}-remote-`);
    const originalName = '2026-08-13-terminal.md';
    const source = writeRemoteNote(remote, originalName, 'version one\n');
    const ssh = makeSshFixture({ n: remote });
    const options = fixtureOptions({
      localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
      endpoints: { netcup: 'n', hetzner: null, mac: null },
    });
    const first = await gatherKnowledge(options);
    const item = first.imports[0];
    const localArchive = path.join(options.inboxDir, '_archive', '2026-09');
    fs.mkdirSync(localArchive, { recursive: true });
    fs.renameSync(path.join(options.inboxDir, item.importedName), path.join(localArchive, item.importedName));
    let superseding = null;
    if (mode === 'origin-missing') {
      fs.rmSync(source);
    } else {
      fs.writeFileSync(source, 'version two\n');
      const old = (Date.now() - 10 * 60_000) / 1000;
      fs.utimesSync(source, old, old);
      superseding = await gatherKnowledge(options);
      assert.equal(hostRow(superseding, 'netcup').terminal, 1, 'superseded is first reported by the second gather');
    }
    seedVerifiedPublication(options, [item.importedName]);
    const once = await reconcileKnowledge(options, first);
    assert.equal(once.find((row) => row.host === 'netcup').terminal, mode === 'origin-missing' ? 1 : 0, mode);
    assert.ok(fs.existsSync(item.stagedPath), `${mode}: terminal evidence bytes retained`);
    const twice = await reconcileKnowledge(options, first);
    assert.equal(twice.find((row) => row.host === 'netcup').terminal, 0, `${mode}: terminal reported only once`);
  }
});

test('source plus matching archive is resurrected residue, never counted as archive success', async () => {
  const localHome = tmp('knowledge-resurrected-local-');
  const remote = tmp('knowledge-resurrected-remote-');
  const name = '2026-08-14-resurrected.md';
  const bytes = Buffer.from('same bytes\n');
  writeRemoteNote(remote, name, bytes);
  const ssh = makeSshFixture({ n: remote });
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: 'n', hetzner: null, mac: null },
  });
  const gathered = await gatherKnowledge(options);
  const item = gathered.imports[0];
  const localArchive = path.join(options.inboxDir, '_archive', '2026-09');
  fs.mkdirSync(localArchive, { recursive: true });
  fs.renameSync(path.join(options.inboxDir, item.importedName), path.join(localArchive, item.importedName));
  const remoteArchive = path.join(remote, '.claude', 'knowledge', '_inbox', '_archive', '2026-09', name);
  fs.mkdirSync(path.dirname(remoteArchive), { recursive: true });
  fs.writeFileSync(remoteArchive, bytes);
  seedVerifiedPublication(options, [item.importedName]);
  const rows = await reconcileKnowledge(options, gathered);
  const row = rows.find((entry) => entry.host === 'netcup');
  assert.equal(row.archived, 0);
  assert.equal(row.resurrected, 1);
  assert.ok(fs.existsSync(path.join(remote, '.claude', 'knowledge', '_inbox', name)));
  assert.ok(fs.existsSync(remoteArchive));
});

test('accepts per-file PAX from GNU/libarchive producers while ignoring non-semantic metadata', async () => {
  const localHome = tmp('knowledge-pax-local-');
  const pax = [
    paxRecord('path', './2026-08-08-pax note.md'),
    paxRecord('mtime', '1723075200.125'),
    paxRecord('atime', '1723075201.25'),
    paxRecord('ctime', '1723075202.5'),
    paxRecord('SCHILY.xattr.user.fixture', 'gnu'),
    paxRecord('LIBARCHIVE.xattr.user.fixture', 'bGliYXJjaGl2ZQ'),
    paxRecord('hdrcharset', 'BINARY'),
  ].join('');
  const body = Buffer.from('pax body\n');
  const tar = tarArchive([
    tarEntry('./PaxHeaders.31415/2026-08-08-pax note.md', pax, { type: 'x' }),
    tarEntry('./placeholder.md', body),
  ]);
  const ssh = makeTarSshFixture(tar);
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: 'pax-fixture', hetzner: null, mac: null },
  });
  const gathered = await gatherKnowledge(options);
  assert.equal(hostRow(gathered, 'netcup').status, 'gathered');
  assert.equal(gathered.imports.length, 1);
  assert.equal(gathered.imports[0].originalName, '2026-08-08-pax note.md');
  assert.equal(gathered.imports[0].sourceMtimeMs, 1_723_075_200_125);
  assert.deepEqual(fs.readFileSync(path.join(options.inboxDir, gathered.imports[0].importedName)), body);
});

test('parses actual GNU tar and libarchive pax streams, including a pax-only long path', {
  skip: process.platform === 'win32' ? false : 'the sealed Windows gate pins both producer binaries',
}, async () => {
  const producers = [
    ['gnu', 'C:/Program Files/Git/usr/bin/tar.exe'],
    ['libarchive', 'C:/Windows/System32/tar.exe'],
  ];
  for (const [label, executable] of producers) {
    assert.ok(fs.existsSync(executable), `${label} producer missing: ${executable}`);
    const source = tmp(`knowledge-real-${label}-source-`);
    const longName = `2026-08-15-${'p'.repeat(105)}-${label}.md`;
    const body = Buffer.from(`${label} pax body\n`);
    fs.writeFileSync(path.join(source, longName), body);
    const made = spawnSync(executable, ['--format=pax', '-cf', '-', longName], {
      cwd: source,
      encoding: null,
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(made.status, 0, `${label}: ${made.stderr?.toString()}`);
    assert.ok(made.stdout.includes(Buffer.from('path=')), `${label} fixture did not contain a pax path record`);
    const localHome = tmp(`knowledge-real-${label}-local-`);
    const options = fixtureOptions({
      localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'),
      ssh: makeTarSshFixture(made.stdout), endpoints: { netcup: `${label}-fixture`, hetzner: null, mac: null },
    });
    const gathered = await gatherKnowledge(options);
    assert.equal(hostRow(gathered, 'netcup').status, 'gathered', label);
    assert.equal(gathered.imports.length, 1, label);
    assert.equal(gathered.imports[0].originalName, longName, label);
    assert.deepEqual(fs.readFileSync(path.join(options.inboxDir, gathered.imports[0].importedName)), body, label);
  }
});

test('rejects unsafe tar paths, links, global PAX, and malformed/truncated streams before import', async () => {
  const hostile = [
    ['absolute', tarArchive([tarEntry('/absolute.md', 'x')])],
    ['traversal', tarArchive([tarEntry('../escape.md', 'x')])],
    ['nested', tarArchive([tarEntry('dir/nested.md', 'x')])],
    ['symlink', tarArchive([tarEntry('2026-08-09-link.md', '', { type: '2', linkname: 'target' })])],
    ['global-pax', tarArchive([tarEntry('GlobalHead.1', paxRecord('mtime', '1'), { type: 'g' })])],
    ['truncated', tarEntry('2026-08-09-cut.md', Buffer.alloc(700)).subarray(0, 700)],
  ];
  for (const [label, tar] of hostile) {
    const localHome = tmp(`knowledge-hostile-${label}-`);
    const ssh = makeTarSshFixture(tar);
    const options = fixtureOptions({
      localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
      endpoints: { netcup: label, hetzner: null, mac: null },
    });
    const gathered = await gatherKnowledge(options);
    assert.equal(hostRow(gathered, 'netcup').status, 'failed', label);
    assert.equal(gathered.imports.length, 0, label);
    assert.deepEqual(fs.readdirSync(options.inboxDir).filter((name) => !name.startsWith('.')), [], label);
  }
});

test('POSIX backslash and drive-like names are named residue while a sibling valid note imports', async () => {
  const backslash = '2026-08-09-back\\slash.md';
  const driveLike = 'C:2026-08-09-drive.md';
  const valid = '2026-08-09-valid.md';
  const tar = tarArchive([
    tarEntry(backslash, 'unsupported backslash\n'),
    tarEntry(driveLike, 'unsupported drive-like\n'),
    tarEntry(valid, 'valid sibling\n'),
  ]);
  const localHome = tmp('knowledge-unsupported-path-local-');
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'),
    ssh: makeTarSshFixture(tar), endpoints: { netcup: 'mixed-names', hetzner: null, mac: null },
  });
  const gathered = await gatherKnowledge(options);
  assert.equal(hostRow(gathered, 'netcup').status, 'gathered');
  assert.deepEqual(gathered.imports.map((item) => item.originalName), [valid]);
  assert.deepEqual(
    gathered.residue.unsupportedName.filter((item) => item.host === 'netcup').map((item) => item.name),
    [backslash, driveLike],
  );
  assert.deepEqual(
    fs.readdirSync(options.inboxDir).filter((name) => name.endsWith('.md')),
    [gathered.imports[0].importedName],
  );
});

test('skips a named oversize note but imports a later valid entry; entry-count exhaustion fails the host', async () => {
  const oversizedName = '2026-08-10-too-large.md';
  const safeName = '2026-08-10-safe.md';
  const tar = tarArchive([
    tarEntry(oversizedName, Buffer.alloc(1024 * 1024 + 1, 0x61)),
    tarEntry(safeName, 'safe\n'),
  ]);
  const localHome = tmp('knowledge-oversize-local-');
  const ssh = makeTarSshFixture(tar);
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'), ssh,
    endpoints: { netcup: 'oversize', hetzner: null, mac: null },
  });
  const gathered = await gatherKnowledge(options);
  assert.equal(hostRow(gathered, 'netcup').status, 'gathered');
  assert.deepEqual(gathered.imports.map((item) => item.originalName), [safeName]);
  assert.ok(!fs.readdirSync(options.inboxDir).some((name) => name.includes('too-large')));

  const tooMany = tarArchive(Array.from({ length: 1001 }, (_, index) => tarEntry(`2026-08-11-${String(index).padStart(4, '0')}.md`, '')));
  const localHome2 = tmp('knowledge-entry-limit-local-');
  const options2 = fixtureOptions({
    localHome: localHome2, stateDir: path.join(localHome2, '.agents', 'knowledge-triage'),
    ssh: makeTarSshFixture(tooMany), endpoints: { netcup: 'entry-limit', hetzner: null, mac: null },
  });
  const limited = await gatherKnowledge(options2);
  assert.equal(hostRow(limited, 'netcup').status, 'failed');
  assert.equal(limited.imports.length, 0);
});

test('Windows-invalid and case-only origin names cannot silently collide', async () => {
  const tar = tarArchive([
    tarEntry('CON.md', 'device\n'),
    tarEntry('bad:name.md', 'ads\n'),
    tarEntry('2026-08-12-Case.md', 'upper\n'),
    tarEntry('2026-08-12-case.md', 'lower\n'),
  ]);
  const localHome = tmp('knowledge-windows-name-local-');
  const options = fixtureOptions({
    localHome, stateDir: path.join(localHome, '.agents', 'knowledge-triage'),
    ssh: makeTarSshFixture(tar), endpoints: { netcup: 'names', hetzner: null, mac: null },
  });
  const gathered = await gatherKnowledge(options);
  const names = gathered.imports.map((item) => item.importedName);
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length, 'no case-insensitive collision');
  for (const name of names) {
    assert.doesNotMatch(name, /[:<>"|?*]/);
    assert.doesNotMatch(path.parse(name).name, /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i);
  }
});
