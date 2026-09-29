// node --test scripts/knowledge-triage.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runKnowledgeTriage } from './knowledge-triage.mjs';

const tracked = [];
function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(process.env.FIXTURE_ROOT || os.tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}
after(() => {
  for (const dir of tracked.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeNote(h, name, body = 'body') {
  fs.mkdirSync(h.inboxDir, { recursive: true });
  const file = path.join(h.inboxDir, name);
  fs.writeFileSync(file, `---\ndate: ${name.slice(0, 10)}\nstatus: pending\n---\n${body}\n`);
  return file;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function fixtureTarEntry(name, size) {
  const data = Buffer.alloc(size, 0x61);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  const octal = (offset, length, value) => header.write(Math.trunc(value).toString(8).padStart(length - 1, '0') + '\0', offset, length, 'ascii');
  octal(100, 8, 0o600); octal(108, 8, 1000); octal(116, 8, 1000);
  octal(124, 12, data.length); octal(136, 12, 1_700_000_000);
  header.fill(0x20, 148, 156); header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'binary'); header.write('00', 263, 2, 'ascii');
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(sum.toString(8).padStart(6, '0'), 148, 6, 'ascii'); header[154] = 0; header[155] = 0x20;
  return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)]);
}

function makeStaticSsh(root, tar) {
  const tarPath = path.join(root, 'ssh-stream.tar');
  const script = path.join(root, 'static-ssh.mjs');
  fs.writeFileSync(tarPath, Buffer.concat([tar, Buffer.alloc(1024)]));
  fs.writeFileSync(script, `import fs from 'node:fs'; process.stdout.write(fs.readFileSync(${JSON.stringify(tarPath.replaceAll('\\', '/'))}));\n`);
  return [process.execPath, script];
}

function makeHarness() {
  const root = tmp('knowledge-triage-');
  const home = path.join(root, 'home');
  const store = path.join(home, '.claude', 'knowledge');
  const inboxDir = path.join(store, '_inbox');
  const stateDir = path.join(home, '.agents', 'knowledge-triage');
  const dotfilesRepo = path.join(root, 'dotfiles');
  const sourceInbox = path.join(root, 'source-inbox');
  const sourceDigest = path.join(dotfilesRepo, 'home', 'dot_claude', 'knowledge', 'DIGEST.md');
  const skill = path.join(home, '.claude', 'skills', 'triage', 'SKILL.md');
  for (const dir of [inboxDir, stateDir, sourceInbox, path.dirname(sourceDigest), path.dirname(skill)]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(store, 'DIGEST.md'), '# Knowledge digest\n');
  fs.writeFileSync(sourceDigest, '# Knowledge digest\n');
  fs.writeFileSync(skill, '# Triage\n\n## Designated writer boundary\n\nOnly `BEN-DESKTOP` is the designated writer host.\n');

  const configPath = path.join(root, 'fixture-config.json');
  const gitStatePath = path.join(root, 'git-state.json');
  const claudeLog = path.join(root, 'claude-calls.jsonl');
  const gitLog = path.join(root, 'git-calls.jsonl');
  const chezmoiLog = path.join(root, 'chezmoi-calls.jsonl');
  const grandchildPid = path.join(root, 'grandchild.pid');
  writeJson(configPath, { action: 'defer', exitCode: 0, usage: true });
  writeJson(gitStatePath, {
    oldHead: '1'.repeat(40), newHead: '2'.repeat(40), phase: 'before',
    remoteHead: '2'.repeat(40), touchesDigest: true,
  });

  const claudeScript = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(claudeScript, `
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const configPath = ${JSON.stringify(configPath.replaceAll('\\', '/'))};
const gitStatePath = ${JSON.stringify(gitStatePath.replaceAll('\\', '/'))};
const logPath = ${JSON.stringify(claudeLog.replaceAll('\\', '/'))};
const pidPath = ${JSON.stringify(grandchildPid.replaceAll('\\', '/'))};
const inbox = ${JSON.stringify(inboxDir.replaceAll('\\', '/'))};
const storeDigest = ${JSON.stringify(path.join(store, 'DIGEST.md').replaceAll('\\', '/'))};
const sourceDigest = ${JSON.stringify(sourceDigest.replaceAll('\\', '/'))};
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
fs.appendFileSync(logPath, JSON.stringify({ argv: process.argv.slice(2), env: Object.keys(process.env).sort() }) + '\\n');
if (cfg.spawnGrandchild) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  fs.writeFileSync(pidPath, String(child.pid));
}
if (cfg.sleepMs) await new Promise((resolve) => setTimeout(resolve, cfg.sleepMs));
if (cfg.action === 'archive') {
  const pending = fs.readdirSync(inbox).filter((name) => name.endsWith('.md')).sort();
  const selected = cfg.selectedNames || pending.slice(0, 60);
  const toMove = [...selected, ...(cfg.extraNames || [])];
  const archive = path.join(inbox, '_archive', cfg.archiveMonth || '2026-09');
  fs.mkdirSync(archive, { recursive: true });
  let digest = fs.readFileSync(storeDigest, 'utf8');
  for (const name of toMove) {
    const from = path.join(inbox, name);
    if (!fs.existsSync(from)) continue;
    const to = path.join(archive, name);
    fs.renameSync(from, to);
    const raw = fs.readFileSync(to, 'utf8').replace('status: pending', 'status: merged:fixture.md');
    fs.writeFileSync(to, raw);
    if (!cfg.omitDigestFor?.includes(name)) digest += '2026-09-29 · ' + name.slice(0, -3) + ' → merged:fixture.md\\n';
  }
  if (cfg.digestChanged !== false) {
    fs.writeFileSync(storeDigest, digest);
    fs.writeFileSync(sourceDigest, digest);
    const state = JSON.parse(fs.readFileSync(gitStatePath, 'utf8'));
    if (cfg.advanceHead !== false) state.phase = 'after';
    fs.writeFileSync(gitStatePath, JSON.stringify(state));
  }
}
const usage = cfg.usage === false ? {} : { usage: { input_tokens: 11, output_tokens: 7, cache_read_input_tokens: 13, cache_creation_input_tokens: 5 } };
process.stdout.write(JSON.stringify({ type: 'result', subtype: cfg.exitCode ? 'error' : 'success', is_error: !!cfg.exitCode, session_id: 'fixture-session', ...usage }) + '\\n');
process.exit(cfg.exitCode || 0);
`);

  const gitScript = path.join(root, 'fake-git.mjs');
  fs.writeFileSync(gitScript, `
import fs from 'node:fs';
const statePath = ${JSON.stringify(gitStatePath.replaceAll('\\', '/'))};
const logPath = ${JSON.stringify(gitLog.replaceAll('\\', '/'))};
const digest = ${JSON.stringify(sourceDigest.replaceAll('\\', '/'))};
const argv = process.argv.slice(2);
fs.appendFileSync(logPath, JSON.stringify(argv) + '\\n');
const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const head = s.phase === 'after' ? s.newHead : s.oldHead;
if (argv[0] === 'rev-parse' && argv.includes('HEAD')) console.log(head);
else if (argv[0] === 'rev-parse' && argv.includes('--abbrev-ref')) console.log('main');
else if (argv[0] === 'branch') console.log('main');
else if (argv[0] === 'ls-remote') console.log((s.remoteHead || head) + '\\trefs/heads/main');
else if (argv[0] === 'log') { if (s.touchesDigest) console.log(s.newHead); }
else if (argv[0] === 'show') process.stdout.write(fs.readFileSync(digest, 'utf8'));
else if (argv[0] === 'diff') { if (s.phase === 'after' && s.touchesDigest) console.log(digest); }
else console.log(head);
`);

  const chezmoiScript = path.join(root, 'fake-chezmoi.mjs');
  fs.writeFileSync(chezmoiScript, `
import fs from 'node:fs';
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(chezmoiLog.replaceAll('\\', '/'))}, JSON.stringify(argv) + '\\n');
if (argv.includes('source-path')) console.log(${JSON.stringify(sourceDigest.replaceAll('\\', '/'))});
else process.exit(2);
`);

  const notes = [];
  const options = {
    home, stateDir, inboxDir,
    now: () => new Date('2026-09-29T18:00:00Z'),
    deps: {
      hostname: () => 'BEN-DESKTOP',
      endpoints: { netcup: null, hetzner: null, mac: null },
      claudeCommand: [process.execPath, claudeScript],
      gitCommand: [process.execPath, gitScript],
      chezmoiCommand: [process.execPath, chezmoiScript],
      nestedTimeoutMs: 5_000,
      hostTimeoutMs: 2_000,
      dotfilesRepo,
      chezmoiSourceInbox: sourceInbox,
      noteSend: async (text) => notes.push(text),
    },
  };
  return {
    root, home, store, inboxDir, stateDir, sourceInbox, sourceDigest, skill,
    configPath, gitStatePath, claudeLog, gitLog, chezmoiLog, grandchildPid,
    notes, options,
    configure(patch) { writeJson(configPath, { ...readJson(configPath), ...patch }); },
    configureGit(patch) { writeJson(gitStatePath, { ...readJson(gitStatePath), ...patch }); },
  };
}

test('kill switches, nonwriter, missing skill, and pending Mac report honest skip reasons', async () => {
  const cases = [
    ['no-knowledge-triage', {}, /no-knowledge-triage/],
    ['ws-off', {}, /ws-off/],
    [null, { hostname: () => 'OTHER-HOST' }, /not the writer host/i],
  ];
  for (const [switchName, deps, reason] of cases) {
    const h = makeHarness();
    if (switchName) fs.writeFileSync(path.join(h.home, '.agents', switchName), 'off\n');
    const result = await runKnowledgeTriage({ ...h.options, deps: { ...h.options.deps, ...deps } });
    assert.equal(result.exitCode, 0);
    assert.equal(result.receipt.status, 'skipped');
    assert.match(result.receipt.reason, reason);
    assert.ok(!fs.existsSync(h.claudeLog));
  }

  const h = makeHarness();
  fs.rmSync(h.skill);
  const result = await runKnowledgeTriage(h.options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.receipt.status, 'skipped');
  assert.match(result.receipt.reason, /missing.*triage skill/i);
});

test('existing ATTENTION and unavailable Claude CLI are explicit skips with no false success', async () => {
  const attention = makeHarness();
  fs.writeFileSync(path.join(attention.stateDir, 'ATTENTION'), 'operator action required\n');
  const stopped = await runKnowledgeTriage(attention.options);
  assert.equal(stopped.receipt.status, 'skipped');
  assert.match(stopped.receipt.reason, /ATTENTION/i);
  assert.ok(!fs.existsSync(attention.claudeLog));

  const missing = makeHarness();
  writeNote(missing, '2026-08-01-cli.md');
  const result = await runKnowledgeTriage({
    ...missing.options,
    deps: { ...missing.options.deps, claudeCommand: [path.join(missing.root, 'does-not-exist')] },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.receipt.status, 'skipped');
  assert.match(result.receipt.reason, /Claude CLI|ENOENT|not found/i);
});

test('chezmoi-source inbox names are managed residue and cannot enter selection', async () => {
  const h = makeHarness();
  const name = '2026-08-01-managed.md';
  writeNote(h, name);
  fs.writeFileSync(path.join(h.sourceInbox, name), 'managed source copy\n');
  const result = await runKnowledgeTriage(h.options);
  assert.equal(result.receipt.notesEligible, 0);
  assert.deepEqual(result.receipt.selected, []);
  assert.ok(result.receipt.residue.managed.some((item) => item.host === 'local' && item.name === name));
  assert.ok(fs.existsSync(path.join(h.inboxDir, name)));
  assert.ok(!fs.existsSync(h.claudeLog));
});

test('oversize and unsupported-name gather residue are named and never reach Claude selection', async () => {
  const h = makeHarness();
  const name = '2026-08-01-oversize.md';
  const unsupported = '2026-08-01-line\nbreak.md';
  const sshCommand = makeStaticSsh(h.root, Buffer.concat([
    fixtureTarEntry(name, 1024 * 1024 + 1),
    fixtureTarEntry(unsupported, 4),
  ]));
  const result = await runKnowledgeTriage({
    ...h.options,
    deps: {
      ...h.options.deps,
      sshCommand,
      endpoints: { netcup: 'fixture-netcup', hetzner: null, mac: null },
    },
  });
  assert.ok(result.receipt.residue.oversize.some((item) => item.host === 'netcup' && item.name === name));
  assert.ok(result.receipt.residue.unsupportedName.some((item) => item.host === 'netcup' && item.name === unsupported));
  assert.equal(result.receipt.notesEligible, 0);
  assert.equal(result.receipt.notesIn, 0);
  assert.ok(!fs.existsSync(h.claudeLog));
});

test('selection is the deterministic oldest union capped at 60 and prompt pins exact slugs', async () => {
  const h = makeHarness();
  for (let i = 0; i < 65; i++) writeNote(h, `2026-08-${String((i % 28) + 1).padStart(2, '0')}-${String(i).padStart(3, '0')}.md`);
  const result = await runKnowledgeTriage(h.options);
  assert.equal(result.receipt.notesEligible, 65);
  assert.equal(result.receipt.notesIn, 60);
  assert.equal(result.receipt.selected.length, 60);
  assert.deepEqual(result.receipt.selected, [...result.receipt.selected].sort((a, b) => a.localeCompare(b)));
  const calls = fs.readFileSync(h.claudeLog, 'utf8').trim().split('\n').map(JSON.parse);
  const argvText = calls[0].argv.join('\n');
  assert.match(argvText, /For each selected note, use its exact filename without `\.md` as the skill's note-slug\./);
  for (const name of result.receipt.selected) assert.match(argvText, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('two skill deferrals escalate, while unavailable usage is never invented as zero', async () => {
  const h = makeHarness();
  writeNote(h, '2026-08-01-deferred.md');
  h.configure({ action: 'defer', usage: false });
  const first = await runKnowledgeTriage(h.options);
  assert.equal(first.receipt.deferredConsecutive, 1);
  assert.deepEqual(Object.keys(first.receipt.tokens), ['unavailable']);
  const second = await runKnowledgeTriage(h.options);
  assert.equal(second.receipt.status, 'attention');
  assert.equal(second.receipt.deferredConsecutive, 2);
  assert.match(second.receipt.reason, /skill deferred/i);
  assert.equal(h.notes.length, 1);
});

test('successful run requires committed digest identity and a fresh matching remote ref', async () => {
  const h = makeHarness();
  writeNote(h, '2026-08-01-alpha.md');
  writeNote(h, '2026-08-02-beta.md');
  h.configure({ action: 'archive' });
  const result = await runKnowledgeTriage(h.options);
  assert.equal(result.exitCode, 0);
  assert.equal(result.receipt.status, 'success');
  assert.equal(result.receipt.notesArchived, 2);
  assert.deepEqual(result.receipt.tokens, { input: 11, output: 7, cacheRead: 13, cacheCreation: 5, total: 36 });
  assert.equal(result.receipt.publication.verified, true);
  assert.equal(result.receipt.dotfilesBefore, '1'.repeat(40));
  assert.equal(result.receipt.dotfilesSha, '2'.repeat(40));
  const gitCalls = fs.readFileSync(h.gitLog, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(gitCalls.some((argv) => argv[0] === 'ls-remote'), 'fresh remote identity must be read');
  assert.ok(gitCalls.some((argv) => argv.some((arg) => String(arg).includes('DIGEST'))), 'commit/digest identity must be checked');
  const sessions = readJson(path.join(h.stateDir, 'sessions.json'));
  assert.ok(sessions.length >= 1);
});

test('changed DIGEST cannot report success for unchanged HEAD, unrelated HEAD, or remote mismatch', async () => {
  for (const mode of ['unchanged', 'unrelated', 'remote-mismatch']) {
    const h = makeHarness();
    writeNote(h, `2026-08-01-${mode}.md`);
    if (mode === 'unchanged') h.configure({ action: 'archive', advanceHead: false });
    else h.configure({ action: 'archive' });
    if (mode === 'unrelated') h.configureGit({ touchesDigest: false });
    if (mode === 'remote-mismatch') h.configureGit({ remoteHead: '3'.repeat(40) });
    const result = await runKnowledgeTriage(h.options);
    assert.equal(result.receipt.status, 'attention', mode);
    assert.equal(result.receipt.publication.verified, false, mode);
    assert.notEqual(result.exitCode, 0, mode);
    assert.equal(h.notes.length, 1, mode);
  }
});

test('no-change remote mismatch defers reconciliation without ATTENTION', async () => {
  const h = makeHarness();
  writeNote(h, '2026-08-01-still-pending.md');
  h.configure({ action: 'defer' });
  h.configureGit({ remoteHead: '3'.repeat(40) });
  const result = await runKnowledgeTriage(h.options);
  assert.notEqual(result.receipt.status, 'attention');
  assert.equal(result.receipt.publication.verified, false);
  assert.equal(h.notes.length, 0);
  assert.ok(fs.existsSync(path.join(h.inboxDir, '2026-08-01-still-pending.md')));
});

test('out-of-selection archive is ATTENTION and blocks origin reconciliation', async () => {
  const h = makeHarness();
  const names = [];
  for (let i = 0; i < 61; i++) {
    const name = `2026-08-${String((i % 28) + 1).padStart(2, '0')}-${String(i).padStart(3, '0')}.md`;
    names.push(name);
    writeNote(h, name);
  }
  h.configure({ action: 'archive', selectedNames: names.slice(0, 60), extraNames: [names[60]] });
  const result = await runKnowledgeTriage(h.options);
  assert.equal(result.receipt.status, 'attention');
  assert.deepEqual(result.receipt.outOfSelection, [names[60]]);
  assert.equal(result.exitCode, 1);
});

test('nested nonzero is failed, and the job-local lock rejects a concurrent run', async () => {
  const h = makeHarness();
  writeNote(h, '2026-08-01-concurrent.md');
  h.configure({ action: 'defer', exitCode: 17, sleepMs: 800 });
  const firstPromise = runKnowledgeTriage(h.options);
  const lock = path.join(h.stateDir, 'run.lock');
  const deadline = Date.now() + 3_000;
  while (!fs.existsSync(lock) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(fs.existsSync(lock), 'first run must hold run.lock while child is alive');
  const second = await runKnowledgeTriage(h.options);
  assert.equal(second.receipt.status, 'skipped');
  assert.match(second.receipt.reason, /job already running/i);
  const first = await firstPromise;
  assert.equal(first.receipt.status, 'failed');
  assert.equal(first.receipt.nestedExitCode, 17);
});

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform !== 'win32' && fs.existsSync(`/proc/${pid}/stat`)) {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      if (/\) Z /.test(stat)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

test('real watchdog kills the owned child and grandchild and records timeout ATTENTION', { timeout: 15_000 }, async () => {
  const h = makeHarness();
  writeNote(h, '2026-08-01-timeout.md');
  h.configure({ action: 'defer', spawnGrandchild: true, sleepMs: 60_000 });
  const started = Date.now();
  const result = await runKnowledgeTriage({
    ...h.options,
    deps: { ...h.options.deps, nestedTimeoutMs: 250 },
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 150 && elapsed < 10_000, `real timeout elapsed ${elapsed}ms`);
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /timed out|timeout/i);
  assert.ok(fs.existsSync(h.grandchildPid));
  const pid = Number(fs.readFileSync(h.grandchildPid, 'utf8'));
  const deadline = Date.now() + 4_000;
  while (processAlive(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(processAlive(pid), false, `grandchild ${pid} survived owned process-tree kill`);
  assert.equal(h.notes.length, 1);
});

test('two consecutive curated-lock observations escalate without taking or clearing the lock', async () => {
  const h = makeHarness();
  const lock = path.join(h.store, '.curated-update.lock');
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.txt'), 'some other owner\n');
  const first = await runKnowledgeTriage(h.options);
  assert.equal(first.receipt.status, 'skipped');
  assert.match(first.receipt.reason, /lock held/i);
  const second = await runKnowledgeTriage(h.options);
  assert.equal(second.receipt.status, 'attention');
  assert.ok(fs.existsSync(lock), 'job must never clear the skill lock');
  assert.equal(h.notes.length, 1);
  assert.match(h.notes[0], /rmdir ~\/\.claude\/knowledge\/\.curated-update\.lock/);
});

test('archived note without its exact committed digest slug remains named residue', async () => {
  const h = makeHarness();
  const name = '2026-08-01-missing-digest.md';
  writeNote(h, name);
  h.configure({ action: 'archive', omitDigestFor: [name] });
  const result = await runKnowledgeTriage(h.options);
  assert.ok(result.receipt.residue.unresolved.some((item) => item.name === name && /digest entry missing/i.test(item.reason)));
  assert.notEqual(result.receipt.status, 'success');
});
