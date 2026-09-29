// node --test scripts/knowledge-gather.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gatherKnowledge, reconcileKnowledge } from './knowledge-gather.mjs';

const tracked = [];
function tmp(prefix) {
  const root = process.env.FIXTURE_ROOT || os.tmpdir();
  const dir = fs.mkdtempSync(path.join(root, prefix));
  tracked.push(dir);
  return dir;
}

after(() => {
  for (const dir of tracked.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hostRow(gathered, host) {
  const row = gathered.hosts.find((item) => item.host === host);
  assert.ok(row, `missing host row ${host}`);
  return row;
}

function writeRemoteNote(remoteHome, name, bytes, ageMinutes = 10) {
  const inbox = path.join(remoteHome, '.claude', 'knowledge', '_inbox');
  fs.mkdirSync(inbox, { recursive: true });
  const file = path.join(inbox, name);
  fs.writeFileSync(file, bytes);
  const when = (Date.now() - ageMinutes * 60_000) / 1000;
  fs.utimesSync(file, when, when);
  return file;
}

function shellPath() {
  if (process.platform !== 'win32') return '/bin/sh';
  const gitBash = 'C:/Program Files/Git/bin/bash.exe';
  return fs.existsSync(gitBash) ? gitBash : 'bash.exe';
}

function makeSshFixture(hostHomes) {
  const dir = tmp('knowledge-ssh-');
  const script = path.join(dir, 'fake-ssh.mjs');
  const log = path.join(dir, 'calls.jsonl');
  const homes = Object.fromEntries(Object.entries(hostHomes).map(([key, value]) => [key, value.replaceAll('\\', '/')]));
  fs.writeFileSync(script, `
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const homes = ${JSON.stringify(homes)};
const log = ${JSON.stringify(log.replaceAll('\\', '/'))};
const shell = ${JSON.stringify(shellPath())};
const argv = process.argv.slice(2);
const endpoint = argv.find((arg) => Object.hasOwn(homes, arg));
fs.appendFileSync(log, JSON.stringify({ argv, env: Object.keys(process.env).sort() }) + '\\n');
if (!endpoint) process.exit(91);
const command = argv.at(-1);
const input = fs.readFileSync(0);
const child = spawnSync(shell, ['-c', command], {
  cwd: homes[endpoint], input,
  env: { PATH: process.env.PATH || '', HOME: homes[endpoint], TMP: process.env.TMP || '', TEMP: process.env.TEMP || '' },
  maxBuffer: 80 * 1024 * 1024,
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exit(child.status ?? 92);
`);
  return {
    command: [process.execPath, script],
    log,
    calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
  };
}

function fixtureOptions({ localHome, stateDir, ssh, endpoints, now = new Date('2026-09-29T18:00:00Z') }) {
  const inboxDir = path.join(localHome, '.claude', 'knowledge', '_inbox');
  fs.mkdirSync(inboxDir, { recursive: true });
  return {
    home: localHome,
    stateDir,
    inboxDir,
    now: () => new Date(now),
    deps: {
      sshCommand: ssh.command,
      hostTimeoutMs: 10_000,
      endpoints,
      chezmoiSourceInbox: path.join(localHome, 'managed-source-inbox'),
    },
  };
}

function octalField(buffer, offset, length, value) {
  const text = Math.trunc(value).toString(8).padStart(length - 1, '0') + '\0';
  buffer.write(text.slice(-length), offset, length, 'ascii');
}

function tarEntry(name, data = Buffer.alloc(0), { type = '0', mtime = 1_700_000_000, linkname = '' } = {}) {
  data = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  octalField(header, 100, 8, 0o600);
  octalField(header, 108, 8, 1000);
  octalField(header, 116, 8, 1000);
  octalField(header, 124, 12, data.length);
  octalField(header, 136, 12, mtime);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, 'ascii');
  header.write(linkname, 157, 100, 'utf8');
  header.write('ustar\0', 257, 6, 'binary');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([header, data, padding]);
}

function paxRecord(key, value) {
  const body = `${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 3;
  while (Buffer.byteLength(`${length} ${body}`) !== length) length = Buffer.byteLength(`${length} ${body}`);
  return `${length} ${body}`;
}

function tarArchive(entries) {
  return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

function makeTarSshFixture(tarBytes) {
  const dir = tmp('knowledge-tar-ssh-');
  const script = path.join(dir, 'fake-tar-ssh.mjs');
  const data = path.join(dir, 'stream.tar');
  fs.writeFileSync(data, tarBytes);
  fs.writeFileSync(script, `import fs from 'node:fs'; process.stdout.write(fs.readFileSync(${JSON.stringify(data.replaceAll('\\', '/'))}));\n`);
  return { command: [process.execPath, script], log: path.join(dir, 'unused'), calls: () => [] };
}

function makeExitSshFixture(code, stderr = '') {
  const dir = tmp('knowledge-exit-ssh-');
  const script = path.join(dir, 'fake-exit-ssh.mjs');
  fs.writeFileSync(script, `process.stderr.write(${JSON.stringify(stderr)}); process.exit(${code});\n`);
  return { command: [process.execPath, script], log: path.join(dir, 'unused'), calls: () => [] };
}

function makeHangingSshFixture() {
  const dir = tmp('knowledge-hang-ssh-');
  const script = path.join(dir, 'fake-hang-ssh.mjs');
  const pidFile = path.join(dir, 'grandchild.pid');
  fs.writeFileSync(script, `
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
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
    const rows = await reconcileKnowledge(options, gathered);
    const row = rows.find((entry) => entry.host === 'netcup');
    assert.equal(row.archived, 0, mode);
    assert.equal(row.unresolved, 1, mode);
    assert.ok(fs.existsSync(source), `${mode}: source retained`);
    assert.ok(fs.existsSync(item.stagedPath), `${mode}: staged evidence retained`);
  }
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
    if (mode === 'origin-missing') {
      fs.rmSync(source);
    } else {
      fs.writeFileSync(source, 'version two\n');
      const old = (Date.now() - 10 * 60_000) / 1000;
      fs.utimesSync(source, old, old);
      await gatherKnowledge(options);
    }
    const once = await reconcileKnowledge(options, first);
    assert.equal(once.find((row) => row.host === 'netcup').terminal, 1, mode);
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
