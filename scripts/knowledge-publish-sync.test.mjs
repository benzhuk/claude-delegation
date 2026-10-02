// node --test scripts/knowledge-publish-sync.test.mjs
//
// Lane 71 (docs/specs/triage-fetch-first-71/spec.md items 1 to 4), proved against REAL git: a scratch bare
// repo is origin, a scratch clone is the "dotfiles" repo, a second clone plays "another host". Everything
// lives under makeTempHome().fixtureRoot with its sealed env (fixture git identity, no global config); the
// job's own git calls take that env through deps.gitEnv and run through a logging wrapper so the tests can
// assert exactly which git calls the job made. The nested triage run is a fake Claude that does what the
// skill does: archives the notes, edits DIGEST, commits in the dotfiles repo and tries one plain push.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempHome } from './test-home.mjs';
import { runKnowledgeTriage } from './knowledge-triage.mjs';
import { recoveryBlock } from './knowledge-publish-sync.mjs';
import { assertFieldSafe } from '../skills/multi/scripts/envelope.mjs';

const DIGEST_REL = 'source-inbox/_archive/DIGEST.md';
const SKILL = '# Triage\n\n## Designated writer boundary\n\nCurated knowledge publication has one designated writer: Windows host\n`BEN-DESKTOP`.\n';
const homes = [];
after(() => { for (const th of homes.splice(0)) th.cleanup(); });

const gitIn = (env, dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).trim();

// What the skill does in the nested session (outside this repo): archive, edit DIGEST, commit, one plain push.
const fakeClaude = (cfgPath) => `
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(cfgPath)}, 'utf8'));
const keep = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP'];
const env = { GIT_CONFIG_GLOBAL: cfg.gitConfigGlobal, GIT_CONFIG_NOSYSTEM: '1', HOME: cfg.home, USERPROFILE: cfg.home };
for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { env, encoding: 'utf8' });
fs.readFileSync(0, 'utf8');
fs.writeFileSync(cfg.startHead, git(cfg.repo, 'rev-parse', 'HEAD').stdout.trim());
if (cfg.lock) { fs.mkdirSync(cfg.lock); fs.writeFileSync(path.join(cfg.lock, 'owner.txt'), 'fixture skill session\\n'); }
const archive = path.join(cfg.inbox, '_archive', '2026-09');
fs.mkdirSync(archive, { recursive: true });
let added = '';
for (const n of fs.readdirSync(cfg.inbox).filter((x) => x.endsWith('.md'))) {
  fs.renameSync(path.join(cfg.inbox, n), path.join(archive, n));
  added += '2026-09-29 · ' + n.slice(0, -3) + ' → merged:fixture.md\\n';
}
fs.appendFileSync(cfg.storeDigest, added);
if (!cfg.skipSourceDigest) fs.appendFileSync(cfg.sourceDigest, added);
if (cfg.commitFile) fs.appendFileSync(path.join(cfg.repo, cfg.commitFile), added);
git(cfg.repo, 'add', cfg.commitFile ?? cfg.digestRel);
git(cfg.repo, 'commit', '-q', '-m', 'triage: archive notes');
for (let i = 1; i < (cfg.commits ?? 1); i++) {
  fs.appendFileSync(path.join(cfg.repo, 'topics', 'base.md'), 'extra ' + i + '\\n');
  git(cfg.repo, 'add', 'topics/base.md');
  git(cfg.repo, 'commit', '-q', '-m', 'triage: extra ' + i);
}
if (cfg.race) {
  const file = path.join(cfg.other, cfg.race.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, cfg.race.text);
  git(cfg.other, 'add', cfg.race.file);
  git(cfg.other, 'commit', '-q', '-m', 'other host commit');
  git(cfg.other, 'push', '-q', 'origin', 'HEAD:main');
  if (cfg.rejectHook) {
    const hook = path.join(cfg.origin, 'hooks', 'pre-receive');
    fs.writeFileSync(hook, '#!/bin/sh\\necho "fixture: pushes are closed" >&2\\nexit 1\\n');
    fs.chmodSync(hook, 0o755);
  }
}
const push = git(cfg.repo, 'push', '-q', 'origin', 'HEAD:main');
fs.writeFileSync(cfg.pushStatus, String(push.status));
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } }) + '\\n');
`;

// Logs every git argv the job makes, then runs the real git with the env the job handed it.
const gitLogger = (logPath) => `
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + '\\n');
const r = spawnSync('git', process.argv.slice(2), { stdio: 'inherit' });
process.exit(r.status ?? 1);
`;

function makeHarness() {
  const th = makeTempHome({ gitIdentity: true });
  homes.push(th);
  const { env, fixtureRoot, home } = th;
  const fwd = (p) => p.replaceAll('\\', '/');
  const origin = path.join(fixtureRoot, 'origin.git');
  const repo = path.join(fixtureRoot, 'dotfiles');
  const other = path.join(fixtureRoot, 'other');
  const g = (dir, ...args) => gitIn(env, dir, ...args);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { env });
  execFileSync('git', ['init', '-q', '-b', 'main', repo], { env });
  g(repo, 'remote', 'add', 'origin', origin);
  fs.mkdirSync(path.join(repo, 'source-inbox', '_archive'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'topics'), { recursive: true });
  fs.writeFileSync(path.join(repo, DIGEST_REL), '# Knowledge digest\n');
  fs.writeFileSync(path.join(repo, 'README.md'), 'dotfiles\n');
  fs.writeFileSync(path.join(repo, 'topics', 'base.md'), 'base\n');
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'seed');
  g(repo, 'push', '-q', '-u', 'origin', 'main');
  execFileSync('git', ['clone', '-q', origin, other], { env });

  const store = path.join(home, '.claude', 'knowledge');
  const inboxDir = path.join(store, '_inbox');
  const stateDir = path.join(home, '.agents', 'knowledge-triage');
  const skill = path.join(home, '.claude', 'skills', 'triage', 'SKILL.md');
  fs.mkdirSync(path.join(inboxDir, '_archive'), { recursive: true });
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, SKILL);
  fs.writeFileSync(path.join(inboxDir, '_archive', 'DIGEST.md'), '# Knowledge digest\n');

  const cfgPath = path.join(fixtureRoot, 'fake-claude.json');
  const claudeScript = path.join(fixtureRoot, 'fake-claude.mjs');
  const loggerScript = path.join(fixtureRoot, 'git-logger.mjs');
  const gitLog = path.join(fixtureRoot, 'job-git-calls.jsonl');
  const startHead = path.join(fixtureRoot, 'nested-start-head.txt');
  const pushStatus = path.join(fixtureRoot, 'skill-push-status.txt');
  const lock = path.join(store, '.curated-update.lock');
  fs.writeFileSync(claudeScript, fakeClaude(fwd(cfgPath)));
  fs.writeFileSync(loggerScript, gitLogger(fwd(gitLog)));
  const cfg = {
    gitConfigGlobal: env.GIT_CONFIG_GLOBAL, home, repo, other, origin, inbox: inboxDir, digestRel: DIGEST_REL,
    storeDigest: path.join(inboxDir, '_archive', 'DIGEST.md'), sourceDigest: path.join(repo, DIGEST_REL),
    startHead, pushStatus, lock, race: null, rejectHook: false, skipSourceDigest: false, commitFile: null, commits: 1,
  };
  const writeCfg = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  writeCfg();

  const notes = [];
  const options = {
    home, stateDir, inboxDir, now: () => new Date('2026-09-29T18:00:00Z'),
    deps: {
      hostname: () => 'BEN-DESKTOP', endpoints: { netcup: null, hetzner: null, mac: null },
      claudeCommand: [process.execPath, claudeScript], gitCommand: [process.execPath, loggerScript], gitEnv: env,
      nestedTimeoutMs: 60_000, hostTimeoutMs: 2_000, dotfilesRepo: repo, chezmoiSourceInbox: path.join(repo, 'source-inbox'),
      noteSend: async (text) => notes.push(text),
    },
  };
  const readCalls = () => {
    try { return fs.readFileSync(gitLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((a) => (a[0] === '-C' ? a.slice(2) : a)); }
    catch { return []; }
  };
  return {
    env, g, fixtureRoot, repo, origin, other, inboxDir, stateDir, store, lock, notes, options, readCalls, startHead, pushStatus,
    configure(patch) { Object.assign(cfg, patch); writeCfg(); },
    note(name = '2026-08-01-alpha.md') {
      fs.writeFileSync(path.join(inboxDir, name), `---\ndate: ${name.slice(0, 10)}\nstatus: pending\n---\nbody of ${name}\n`);
      return name;
    },
    run: () => runKnowledgeTriage(options),
    packet: () => fs.readFileSync(path.join(stateDir, 'ATTENTION'), 'utf8'),
    nestedStarted: () => fs.existsSync(startHead),
    originHead: () => g(origin, 'rev-parse', 'refs/heads/main'),
    otherCommit(file, text, message = 'other host commit') {
      fs.mkdirSync(path.dirname(path.join(other, file)), { recursive: true });
      fs.appendFileSync(path.join(other, file), text);
      g(other, 'add', file);
      g(other, 'commit', '-q', '-m', message);
      g(other, 'push', '-q', 'origin', 'HEAD:main');
    },
  };
}

const FORBIDDEN = new Set(['--force', '--force-with-lease', '-f', 'reset', 'stash', 'clean', 'checkout', '-c', 'user.name', 'user.email']);
/** Every git argv the job made: no force, reset, stash, clean, checkout, identity; merge only --ff-only; push only a plain refspec. */
function assertSafeCalls(calls) {
  for (const argv of calls) {
    for (const arg of argv) {
      assert.ok(!FORBIDDEN.has(arg) && !arg.startsWith('--force') && !arg.startsWith('user.'), `forbidden git argument in ${JSON.stringify(argv)}`);
    }
    if (argv[0] === 'merge') assert.ok(argv.includes('--ff-only'), 'a merge must be --ff-only');
    if (argv[0] === 'push') assert.deepEqual(argv, ['push', 'origin', 'HEAD:main']);
  }
}
const names = (calls) => calls.map((a) => a[0]);
const q = (p) => (/\s/.test(p) ? `"${p}"` : p);

// ---------------------------------------------------------------------------------------------------------------

test('clean and in sync: preflight fetches, changes nothing, and the run proceeds to a verified publication', async (t) => {
  const h = makeHarness();
  const base = h.g(h.repo, 'rev-parse', 'HEAD');
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'success', result.receipt.reason);
  assert.equal(result.receipt.sync.action, 'in sync');
  assert.equal(result.receipt.dotfilesBefore, base);
  assert.equal(fs.readFileSync(h.startHead, 'utf8'), base);
  assert.equal(h.g(h.repo, 'rev-parse', 'HEAD'), h.originHead(), 'the skill push went through; remote equals local');
  const calls = h.readCalls();
  assert.ok(names(calls).includes('fetch'));
  assert.ok(!names(calls).some((n) => ['merge', 'rebase', 'push'].includes(n)), 'nothing to sync or repair');
  assert.equal(names(calls).indexOf('status') < names(calls).indexOf('fetch'), true);
  assertSafeCalls(calls);
  t.diagnostic(`job git calls (clean): ${JSON.stringify(calls)}`);
});

test('origin ahead: fast-forwards first, dotfilesBefore is the new HEAD, and a pulled-in DIGEST commit is not this run\'s', async (t) => {
  const h = makeHarness();
  h.otherCommit(DIGEST_REL, '2026-09-28 · from-another-host → merged:x.md\n', 'another host digest');
  const originNow = h.originHead();
  assert.notEqual(h.g(h.repo, 'rev-parse', 'HEAD'), originNow, 'precondition: the local clone is behind');
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'success', result.receipt.reason);
  assert.equal(result.receipt.sync.action, 'fast-forwarded');
  assert.equal(result.receipt.sync.behind, 1);
  assert.equal(result.receipt.dotfilesBefore, originNow, 'the baseline is the post-fast-forward HEAD');
  assert.equal(fs.readFileSync(h.startHead, 'utf8'), originNow, 'the nested run saw the fast-forwarded tree');
  assert.ok(fs.readFileSync(path.join(h.repo, DIGEST_REL), 'utf8').includes('from-another-host'));
  assert.equal(h.g(h.repo, 'rev-parse', 'HEAD'), h.originHead());
  assert.equal(h.g(h.repo, 'rev-list', '--count', '--merges', 'HEAD'), '0', 'no merge commit');
  const calls = h.readCalls();
  assert.deepEqual(calls.find((a) => a[0] === 'merge'), ['merge', '--ff-only', 'origin/main']);
  assertSafeCalls(calls);
  t.diagnostic(`job git calls (origin ahead): ${JSON.stringify(calls)}`);
});

test('dirty tracked file: ATTENTION before any fetch, gather or nested spawn; the change and the inbox are untouched', async (t) => {
  const h = makeHarness();
  fs.appendFileSync(path.join(h.repo, 'README.md'), 'a hand edit\n');
  const name = h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'attention');
  assert.equal(result.exitCode, 1);
  assert.match(result.receipt.reason, /^dirty before start: .*1 tracked change\(s\) on main \(M README\.md\)/);
  assert.ok(!h.nestedStarted(), 'nested run must not start');
  assert.ok(!fs.existsSync(path.join(h.stateDir, 'gather')), 'gather must not start');
  assert.ok(fs.existsSync(path.join(h.inboxDir, name)), 'inbox untouched');
  assert.ok(!fs.existsSync(path.join(h.inboxDir, '_archive', '2026-09')));
  const calls = h.readCalls();
  assert.ok(!names(calls).includes('fetch'), 'a dirty tree is refused before the fetch (no network needed to refuse)');
  assert.ok(!names(calls).includes('ls-remote'));
  assert.match(h.g(h.repo, 'status', '--porcelain'), /M README\.md/, 'the hand edit is still there');
  const packet = h.packet();
  assert.ok(packet.includes(`  git -C ${q(h.repo)} status --short\n`));
  assert.ok(packet.includes('  rmdir ~/.claude/knowledge/.curated-update.lock\n'));
  assert.ok(packet.includes('  rm ~/.agents/knowledge-triage/ATTENTION\n'));
  assert.equal(h.notes.length, 1);
  assert.doesNotThrow(() => assertFieldSafe('text', h.notes[0]));
  assertSafeCalls(calls);
  t.diagnostic(`ATTENTION packet (dirty before start):\n${packet}`);
});

test('untracked files alone do not stop the run (dirty means tracked changes only)', async () => {
  const h = makeHarness();
  fs.writeFileSync(path.join(h.repo, '._junk'), 'appledouble\n');
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'success', result.receipt.reason);
});

test('diverged before start: local and origin each have a commit; ATTENTION before the knowledge store is touched', async (t) => {
  const h = makeHarness();
  fs.appendFileSync(path.join(h.repo, 'topics', 'base.md'), 'leftover local work\n');
  h.g(h.repo, 'commit', '-q', '-am', 'unpublished local');
  h.otherCommit('topics/remote.md', 'remote work\n');
  const localHead = h.g(h.repo, 'rev-parse', 'HEAD');
  const name = h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /^diverged before start: .*1 local commit\(s\) origin lacks and 1 origin commit\(s\) the local lacks/);
  assert.ok(!h.nestedStarted());
  assert.ok(fs.existsSync(path.join(h.inboxDir, name)));
  assert.ok(!fs.existsSync(path.join(h.stateDir, 'gather')));
  const calls = h.readCalls();
  assert.ok(names(calls).includes('fetch'), 'divergence is only knowable after the fetch');
  assert.ok(!names(calls).some((n) => ['merge', 'rebase', 'push'].includes(n)), 'the job touches nothing');
  assert.equal(h.g(h.repo, 'rev-parse', 'HEAD'), localHead);
  const packet = h.packet();
  for (const line of ['fetch origin', 'log --oneline origin/main..HEAD', 'rebase origin/main', 'push origin HEAD:main']) {
    assert.ok(packet.includes(`  git -C ${q(h.repo)} ${line}\n`), line);
  }
  assertSafeCalls(calls);
  t.diagnostic(`ATTENTION packet (diverged before start):\n${packet}`);
});

test('ahead only (leftover unpublished work of an earlier run) is also a stop, with nothing to fast-forward', async () => {
  const h = makeHarness();
  fs.appendFileSync(path.join(h.repo, 'topics', 'base.md'), 'leftover local work\n');
  h.g(h.repo, 'commit', '-q', '-am', 'unpublished local');
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /^diverged before start: .*1 unpublished local commit\(s\) origin lacks, nothing to fast-forward/);
  assert.ok(!h.nestedStarted());
});

test('push race: origin gains a commit during the run; one rebase and one plain push repair it, history stays linear', async (t) => {
  const h = makeHarness();
  const base = h.g(h.repo, 'rev-parse', 'HEAD');
  h.configure({ lock: h.lock, race: { file: 'topics/race.md', text: 'raced in from another host\n' } });
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'success', result.receipt.reason);
  assert.notEqual(fs.readFileSync(h.pushStatus, 'utf8'), '0', 'precondition: the skill\'s own push was rejected');
  assert.equal(result.receipt.dotfilesBefore, base);
  assert.deepEqual(result.receipt.publication.repair, { attempted: true, outcome: 'pushed' });
  assert.equal(result.receipt.publication.verified, true);
  const local = h.g(h.repo, 'rev-parse', 'HEAD');
  assert.equal(local, h.originHead(), 'remote head equals local head');
  assert.equal(result.receipt.dotfilesSha, local);
  assert.deepEqual(h.g(h.repo, 'log', '--format=%s', '-3').split('\n'), ['triage: archive notes', 'other host commit', 'seed']);
  assert.equal(h.g(h.repo, 'rev-list', '--count', '--merges', 'HEAD'), '0', 'linear: no merge commit');
  assert.ok(fs.existsSync(path.join(h.repo, 'topics', 'race.md')));
  assert.ok(fs.existsSync(h.lock), 'the skill\'s curated lock is left exactly as the skill left it');
  const calls = h.readCalls();
  assert.equal(names(calls).filter((n) => n === 'rebase').length, 1);
  assert.equal(names(calls).filter((n) => n === 'push').length, 1);
  assert.ok(names(calls).lastIndexOf('fetch') < names(calls).indexOf('rebase') && names(calls).indexOf('rebase') < names(calls).indexOf('push'));
  assertSafeCalls(calls);
  t.diagnostic(`job git calls (push race repaired): ${JSON.stringify(calls)}`);
});

test('rebase conflict: the same DIGEST tail edited on both sides; rebase is aborted, the tree is clean, ATTENTION names the state', async (t) => {
  const h = makeHarness();
  h.configure({ race: { file: DIGEST_REL, text: '2026-09-29 · other-host-note → merged:y.md\n' } });
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /^conflict on rebase: .*CONFLICT.*rebase aborted, tree restored/);
  const calls = h.readCalls();
  const at = names(calls).indexOf('rebase');
  assert.ok(at >= 0 && calls[at + 1][0] === 'rebase' && calls[at + 1][1] === '--abort', 'rebase then rebase --abort');
  assert.ok(!names(calls).includes('push'), 'nothing is pushed after a conflict');
  assert.equal(h.g(h.repo, 'status', '--porcelain', '--untracked-files=no'), '', 'tree clean after the abort');
  for (const dir of ['rebase-merge', 'rebase-apply']) assert.ok(!fs.existsSync(path.join(h.repo, '.git', dir)), `${dir} must be gone`);
  assert.equal(h.g(h.repo, 'log', '-1', '--format=%s'), 'triage: archive notes', 'the skill\'s commit is still on the local branch');
  assert.notEqual(h.g(h.repo, 'rev-parse', 'HEAD'), h.originHead());
  assert.equal(h.g(h.origin, 'log', '-1', '--format=%s', 'refs/heads/main'), 'other host commit', 'remote untouched by the job');
  const packet = h.packet();
  for (const line of ['status', 'fetch origin', 'rebase origin/main', 'add -u', 'rebase --continue', 'push origin HEAD:main', 'status -sb', 'rebase --abort']) {
    assert.ok(packet.includes(`  git -C ${q(h.repo)} ${line}\n`), line);
  }
  assert.ok(packet.includes('  rm ~/.agents/knowledge-triage/ATTENTION\n'));
  assert.doesNotThrow(() => assertFieldSafe('text', h.notes[0]));
  assertSafeCalls(calls);
  t.diagnostic(`job git calls (rebase conflict): ${JSON.stringify(calls)}`);
  t.diagnostic(`ATTENTION packet (conflict on rebase):\n${packet}`);
});

test('race commit touching DIGEST from another host is not this run\'s digest commit: ATTENTION, not success', async () => {
  const h = makeHarness();
  h.configure({ skipSourceDigest: true, commitFile: 'topics/base.md', race: { file: DIGEST_REL, text: '2026-09-29 · other-host → merged:z.md\n' } });
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /no commit touching its source path/);
  assert.equal(result.receipt.publication.repair.outcome, 'pushed');
  assertSafeCalls(h.readCalls());
});

test('two own commits ahead: the repair is not attempted, no rebase, no push, the remote is unchanged', async () => {
  const h = makeHarness();
  h.configure({ commits: 2, race: { file: 'topics/race.md', text: 'raced\n' } });
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /repair not attempted: expected exactly one own commit .* found 2 ahead and 2/);
  assert.equal(result.receipt.publication.repair.attempted, false);
  const calls = h.readCalls();
  assert.ok(!names(calls).includes('rebase'), 'no rebase');
  assert.ok(!names(calls).includes('push'), 'no push');
  assert.equal(h.originHead(), h.g(h.other, 'rev-parse', 'HEAD'), 'the remote is exactly what the other host pushed');
  assertSafeCalls(calls);
});

test('second push rejection: exactly one rebase, one push, then ATTENTION; no second rebase', async () => {
  const h = makeHarness();
  h.configure({ race: { file: 'topics/race.md', text: 'raced\n' }, rejectHook: true });
  h.note();
  const result = await h.run();
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /^push rejected after one rebase: .*pushes are closed.*no second rebase/);
  const calls = h.readCalls();
  assert.equal(names(calls).filter((n) => n === 'rebase').length, 1);
  assert.equal(names(calls).filter((n) => n === 'push').length, 1);
  assert.equal(h.g(h.repo, 'status', '--porcelain', '--untracked-files=no'), '');
  assert.equal(h.g(h.repo, 'rev-list', '--count', 'origin/main..HEAD'), '1', 'the rebased commit waits on top of origin');
  assert.equal(h.g(h.repo, 'rev-list', '--count', 'HEAD..origin/main'), '0');
  assert.ok(h.packet().includes(`  git -C ${q(h.repo)} push origin HEAD:main\n`));
  assertSafeCalls(calls);
});

test('a fetch failure and a detached HEAD are ATTENTION naming the cause, never a skip, before anything runs', async () => {
  const gone = makeHarness();
  fs.renameSync(gone.origin, `${gone.origin}-moved`);
  gone.note();
  const fetchFail = await gone.run();
  assert.equal(fetchFail.receipt.status, 'attention');
  assert.match(fetchFail.receipt.reason, /^fetch failed before start: git fetch origin in .*:/);
  assert.ok(!gone.nestedStarted());
  assert.ok(gone.packet().includes(`  git -C ${q(gone.repo)} remote -v\n`));

  const detached = makeHarness();
  detached.g(detached.repo, 'switch', '-q', '--detach');
  detached.note();
  const result = await detached.run();
  assert.equal(result.receipt.status, 'attention');
  assert.match(result.receipt.reason, /^dotfiles repo unresolved: .* has no branch checked out/);
  assert.ok(!detached.nestedStarted());
  assertSafeCalls(detached.readCalls());
});

test('recoveryBlock quotes a repo path with spaces and returns nothing for an unknown state', () => {
  const lines = recoveryBlock('dirty', 'C:/Users/some one/chezmoi', 'main');
  assert.ok(lines.includes('  git -C "C:/Users/some one/chezmoi" status --short'));
  assert.deepEqual(recoveryBlock('nope', '/r', 'main'), []);
  assert.deepEqual(recoveryBlock('dirty', null, null), []);
});
