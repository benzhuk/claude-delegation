import { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const tracked = [];
export function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}
after(() => { for (const dir of tracked.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function hostRow(gathered, host) {
  const row = gathered.hosts.find((item) => item.host === host);
  assert.ok(row, `missing host row ${host}`);
  return row;
}

export function writeRemoteNote(remoteHome, name, bytes, ageMinutes = 10) {
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

export function makeSshFixture(hostHomes, { archiveRace = null } = {}) {
  const dir = tmp('knowledge-ssh-');
  const script = path.join(dir, 'fake-ssh.mjs');
  const log = path.join(dir, 'calls.jsonl');
  const homes = Object.fromEntries(Object.entries(hostHomes).map(([key, value]) => [key, value.replaceAll('\\', '/')]));
  const race = archiveRace && {
    name: path.basename(archiveRace.source), phase: archiveRace.phase || 'after-claim',
    replacement: archiveRace.replacement.replaceAll('\\', '/'),
    occupied: archiveRace.occupied?.replaceAll('\\', '/') || '',
  };
  fs.writeFileSync(script, `
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const homes = ${JSON.stringify(homes)};
const race = ${JSON.stringify(race)};
const log = ${JSON.stringify(log.replaceAll('\\', '/'))};
const shell = ${JSON.stringify(shellPath())};
const argv = process.argv.slice(2);
const endpoint = argv.find((arg) => Object.hasOwn(homes, arg));
fs.appendFileSync(log, JSON.stringify({ argv, env: Object.keys(process.env).sort() }) + '\\n');
if (!endpoint) process.exit(91);
const transported = argv.at(-1);
let command = transported.startsWith("'") && transported.endsWith("'") ? transported.slice(1, -1) : transported;
const input = fs.readFileSync(0);
if (race && input.length) {
  command = 'replace(){ command cp "$RACE_REPLACEMENT" "$live.race"; command mv -f "$live.race" "$live"; }; ' +
    'mv(){ live="$HOME/.claude/knowledge/_inbox/$RACE_NAME"; islive=0; [ "$1" = "$live" ] && islive=1; if [ "$islive" -eq 1 ] && { [ "$RACE_PHASE" = before-claim ] || [ "$RACE_PHASE" = before-claim-occupied ]; }; then replace; fi; command mv "$@"; rc=$?; if [ "$rc" -eq 0 ] && [ "$islive" -eq 1 ]; then if [ "$RACE_PHASE" = after-claim ]; then replace; elif [ "$RACE_PHASE" = before-claim-occupied ]; then command cp "$RACE_OCCUPIED" "$live"; fi; fi; return "$rc"; }; ' +
    'ln(){ live="$HOME/.claude/knowledge/_inbox/$RACE_NAME"; if [ "$RACE_PHASE" = after-claim ]; then case " $* " in *" $live "*) replace;; esac; fi; command ln "$@"; }; ' + command;
}
const child = spawnSync(shell, ['-c', command], {
  cwd: homes[endpoint], input,
  env: { PATH: process.env.PATH || '', HOME: homes[endpoint], TMP: process.env.TMP || '', TEMP: process.env.TEMP || '', RACE_NAME: race?.name || '', RACE_PHASE: race?.phase || '', RACE_REPLACEMENT: race?.replacement || '', RACE_OCCUPIED: race?.occupied || '' },
  maxBuffer: 80 * 1024 * 1024,
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exit(child.status ?? 92);
`);
  return { command: [process.execPath, script], log, calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [] };
}

export function fixtureOptions({ localHome, stateDir, ssh, endpoints, now = new Date('2026-09-29T18:00:00Z') }) {
  const inboxDir = path.join(localHome, '.claude', 'knowledge', '_inbox');
  const dotfilesRepo = path.join(localHome, 'dotfiles-fixture');
  const sourceInbox = path.join(dotfilesRepo, 'source-inbox');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(path.join(sourceInbox, '_archive'), { recursive: true });
  return { home: localHome, stateDir, inboxDir, now: () => new Date(now), deps: { sshCommand: ssh.command, hostTimeoutMs: 10_000, endpoints, dotfilesRepo, chezmoiSourceInbox: sourceInbox } };
}

export function seedVerifiedPublication(options, importedNames) {
  const digest = path.join(options.deps.chezmoiSourceInbox, '_archive', 'DIGEST.md');
  fs.writeFileSync(digest, `# fixture digest\n${importedNames.map((name) => `2026-09-29 · ${name.slice(0, -3)} → merged:fixture.md`).join('\n')}\n`);
  const fakeGit = path.join(options.stateDir, 'fake-git.mjs');
  fs.mkdirSync(options.stateDir, { recursive: true });
  fs.writeFileSync(fakeGit, `
import fs from 'node:fs';
const argv = process.argv.slice(2); const args = argv[0] === '-C' ? argv.slice(2) : argv; const head = 'a'.repeat(40);
if (args[0] === 'rev-parse') console.log(head); else if (args[0] === 'symbolic-ref') console.log('main');
else if (args[0] === 'ls-remote') console.log(head + '\\trefs/heads/main');
else if (args[0] === 'show') process.stdout.write(fs.readFileSync(${JSON.stringify(digest.replaceAll('\\', '/'))}, 'utf8'));
else if (args[0] === 'log') console.log(head); else process.exit(2);
`);
  options.deps.gitCommand = [process.execPath, fakeGit];
}

function octalField(buffer, offset, length, value) {
  buffer.write(Math.trunc(value).toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}
export function tarEntry(name, data = Buffer.alloc(0), { type = '0', mtime = 1_700_000_000, linkname = '' } = {}) {
  data = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8'); octalField(header, 100, 8, 0o600); octalField(header, 108, 8, 1000);
  octalField(header, 116, 8, 1000); octalField(header, 124, 12, data.length); octalField(header, 136, 12, mtime);
  header.fill(0x20, 148, 156); header.write(type, 156, 1, 'ascii'); header.write(linkname, 157, 100, 'utf8');
  header.write('ustar\0', 257, 6, 'binary'); header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii'); header[154] = 0; header[155] = 0x20;
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}
export function paxRecord(key, value) {
  const body = `${key}=${value}\n`; let length = Buffer.byteLength(body) + 3;
  while (Buffer.byteLength(`${length} ${body}`) !== length) length = Buffer.byteLength(`${length} ${body}`);
  return `${length} ${body}`;
}
export const tarArchive = (entries) => Buffer.concat([...entries, Buffer.alloc(1024)]);

export function makeTarSshFixture(tarBytes) {
  const dir = tmp('knowledge-tar-ssh-'); const script = path.join(dir, 'fake-tar-ssh.mjs'); const data = path.join(dir, 'stream.tar');
  fs.writeFileSync(data, tarBytes);
  fs.writeFileSync(script, `import fs from 'node:fs'; process.stdout.write(fs.readFileSync(${JSON.stringify(data.replaceAll('\\', '/'))}));\n`);
  return { command: [process.execPath, script], log: path.join(dir, 'unused'), calls: () => [] };
}
export function makeExitSshFixture(code, stderr = '') {
  const dir = tmp('knowledge-exit-ssh-'); const script = path.join(dir, 'fake-exit-ssh.mjs');
  fs.writeFileSync(script, `process.stderr.write(${JSON.stringify(stderr)}); process.exit(${code});\n`);
  return { command: [process.execPath, script], log: path.join(dir, 'unused'), calls: () => [] };
}
