// Lane 37's independent contract: the Claude manifest is the inventory, while
// the native wrapper's observable output is the evidence for each routed pair.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import { nativeRouteForLead, runCodexHook, runRoute } from './multi-codex-hook.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLAUDE_MANIFEST = path.join(REPO, 'hooks', 'hooks.json');
const CODEX_MANIFEST = path.join(REPO, 'hooks', 'codex-hooks.json');
const UNSUPPORTED = path.join(REPO, 'hooks', 'codex-unsupported.json');
const INSTALLER = path.join(REPO, 'scripts', 'mirror-shared-skills.mjs');
const WRAPPER = path.join(REPO, 'hooks', 'multi-codex-hook.mjs');
const LEAD = '01a0c5f8-1865-7d93-9ff3-38793062f1ee';

function scratch(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function rmLater(t, target) { t.after(() => fs.rmSync(target, { recursive: true, force: true })); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function key(pair) { return `${pair.script}\u0000${pair.event}`; }

function claudePairs() {
  const manifest = readJson(CLAUDE_MANIFEST);
  const pairs = [];
  for (const [event, groups] of Object.entries(manifest.hooks ?? {})) {
    for (const group of groups ?? []) for (const hook of group.hooks ?? []) {
      const match = /((?:hooks|scripts)\/[^"'\\ ]+)/.exec(String(hook.command ?? ''));
      assert.ok(match, `Claude hook command must name a repo hook: ${hook.command}`);
      pairs.push({ script: match[1], event });
    }
  }
  return pairs;
}

function nativeCommands(event) {
  const groups = readJson(CODEX_MANIFEST).hooks?.[event] ?? [];
  return groups.flatMap((group) => group.hooks ?? []).map((hook) => String(hook.command ?? ''));
}

function transcript(root) {
  const file = path.join(root, 'session.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { id: LEAD, session_id: LEAD, source: 'cli' } })}\n`);
  return file;
}

function runnableRecord(root) {
  const dir = path.join(root, 'docs', 'work');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'wr-2026-09-28-parity.record.md'), [
    'Work: wr-2026-09-28-parity', 'Scope: hooks/codex-unsupported.test.mjs@fixture',
    'Owner: none', 'Status: runnable', 'Authority: test fixture', 'Artifact: none',
    'Evidence: none', 'Next: pull it', 'Opened: 2026-09-28T00:00:00Z', '', 'fixture', '',
  ].join('\n'));
}

function wireHealthyWiringHome(home) {
  const write = (relative, text) => {
    const file = path.join(home, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  write('.agents/lean-rules.md', '# fixture rules\n');
  write('.local/bin/note-send', '#!/bin/sh\n');
  write('.claude/settings.json', JSON.stringify({ crossSessionInbound: 'accept' }));
  write('.agents/janitor/installed.json', JSON.stringify({ schema: 1 }));
  write('.agents/janitor/last-run.log', 'ok\n');
  fs.mkdirSync(path.join(home, '.agents', 'notes'), { recursive: true });
}

function peerNotes() {
  return {
    slug: 'lead', count: 1, problems: [], scanned: [],
    notes: [{ id: 'peer-parity-1', from: 'peer', to: 'lead', kind: 'ASK', line: 'peer → lead, 9.28.26 12:00 NYC [peer-parity-1] ASK: preserve me.', details: null }],
  };
}

function context(result) { return result?.output?.hookSpecificOutput?.additionalContext ?? ''; }

function assertCoverage(inventory, nativeRoutes, unsupportedRows) {
  const inventoryKeys = new Set(inventory.map(key));
  assert.equal(inventoryKeys.size, inventory.length, 'the actual Claude manifest must not duplicate a script/event pair');
  const unsupported = new Set();
  for (const row of unsupportedRows) {
    assert.deepEqual(Object.keys(row).sort(), ['event', 'reason', 'script']);
    assert.match(row.script, /^(?:hooks|scripts)\/[A-Za-z0-9_.-]+$/);
    assert.match(row.event, /^[A-Za-z][A-Za-z0-9]*$/);
    assert.equal(typeof row.reason, 'string');
    assert.ok(row.reason.trim().length > 0 && !/[\r\n]/.test(row.reason), 'unsupported reason must be one nonempty line');
    assert.ok(inventoryKeys.has(key(row)), `unsupported entry is not an actual Claude pair: ${row.script}/${row.event}`);
    assert.ok(!unsupported.has(key(row)), `duplicate unsupported pair: ${row.script}/${row.event}`);
    unsupported.add(key(row));
  }
  for (const pair of inventory) {
    const route = nativeRoutes.get(key(pair));
    const exception = unsupported.has(key(pair));
    assert.notEqual(Boolean(route), exception, `coverage must be exactly one for ${pair.script}/${pair.event}`);
  }
}

test('every actual Claude manifest pair is covered once by an observed native route or strict unsupported entry', () => {
  const nativeRoutes = new Map([
    ['hooks/multi-inbox.js\u0000SessionStart', 'SessionStart'],
    ['hooks/multi-inbox.js\u0000UserPromptSubmit', 'UserPromptSubmit'],
    ['hooks/multi-inbox.js\u0000Stop', 'Stop'],
    ['hooks/multi-inbox.js\u0000PostToolUse', 'PostToolUse'],
    ['scripts/wiring-check.mjs\u0000SessionStart', 'SessionStart'],
    ['hooks/backlog-notice.js\u0000UserPromptSubmit', 'UserPromptSubmit'],
    ['hooks/backlog-notice.js\u0000Stop', 'Stop'],
    ['hooks/backlog-notice.js\u0000PostToolUse', 'PostToolUse'],
    ['hooks/delete-guard.mjs\u0000PreToolUse', 'PreToolUse'],
  ]);
  const inventory = claudePairs();
  const unsupportedDoc = readJson(UNSUPPORTED);
  assert.deepEqual(Object.keys(unsupportedDoc).sort(), ['unsupported']);
  assert.ok(Array.isArray(unsupportedDoc.unsupported));
  assertCoverage(inventory, nativeRoutes, unsupportedDoc.unsupported);

  for (const pair of inventory) {
    const route = nativeRoutes.get(key(pair));
    if (route === 'PreToolUse') {
      assert.ok(nativeCommands(route).some((command) => command.includes('delete-guard.mjs')), 'delete guard must be native PreToolUse');
    } else if (route) {
      assert.ok(nativeCommands(route).some((command) => command.includes('multi-codex-hook.mjs')), `${pair.script}/${pair.event} must reach the native wrapper`);
    }
  }
  assert.ok(nativeCommands('Interrupt').some((command) => command.includes('multi-codex-hook.mjs')), 'Codex-only Interrupt remains permitted');
});

test('native wrapper emits SessionStart wiring plus backlog prompt/post/stop output without erasing peer or continuation context', async (t) => {
  const root = scratch('codex-parity-route-project-');
  const home = scratch('codex-parity-route-home-');
  rmLater(t, root); rmLater(t, home);
  runnableRecord(root);
  const input = { session_id: LEAD, transcript_path: transcript(root), cwd: root, turn_id: 'native-turn' };
  const deps = {
    home,
    env: childEnv(home, { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
    inbox: async () => peerNotes(),
    handleContinuationEvent: async () => ({ context: 'CONTINUATION-PARITY-MARKER' }),
    nativeRouteForLead,
  };

  const start = await runCodexHook({ ...input, hook_event_name: 'SessionStart' }, deps);
  assert.match(context(start), /wiring:/, 'SessionStart must put the real wiring line into native context');
  assert.match(context(start), /peer → lead/, 'wiring must preserve peer context');
  assert.match(context(start), /CONTINUATION-PARITY-MARKER/, 'wiring must preserve continuation context');

  // Backlog has one cadence sentinel shared by all three events. Use independent homes so each
  // event is observed rather than silently suppressed by the previous event's successful output.
  for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop']) {
    const eventHome = scratch(`codex-parity-${event}-`); rmLater(t, eventHome);
    const result = await runCodexHook({ ...input, hook_event_name: event }, { ...deps, home: eventHome, env: { ...deps.env, AGENTS_HOME: path.join(eventHome, '.agents') } });
    const rendered = `${context(result)}\n${result?.output?.systemMessage ?? ''}\n${result?.output?.reason ?? ''}`;
    assert.match(rendered, /work: 1 runnable and unowned \(wr-2026-09-28-parity\)/, `${event} must render actual backlog output`);
    assert.match(rendered, /peer → lead/, `${event} must preserve peer delivery`);
    assert.match(rendered, /CONTINUATION-PARITY-MARKER/, `${event} must preserve continuation delivery`);
  }
});

test('the actual wrapper CLI selects the default native backlog route and writes its context to stdout', (t) => {
  const root = scratch('codex-parity-cli-project-'); const home = scratch('codex-parity-cli-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const input = { hook_event_name: 'UserPromptSubmit', session_id: LEAD, transcript_path: transcript(root), cwd: root, turn_id: 'cli-turn' };
  const child = spawnSync(process.execPath, [WRAPPER], {
    cwd: root, input: JSON.stringify(input), encoding: 'utf8',
    env: childEnv(home, { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
  });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout.trim());
  assert.match(output.hookSpecificOutput.additionalContext, /work: 1 runnable and unowned \(wr-2026-09-28-parity\)/);
});

test('real SessionStart without transcript metadata still routes wiring while preserving peer context', async (t) => {
  const root = scratch('codex-parity-no-transcript-project-'); const home = scratch('codex-parity-no-transcript-home-');
  const healthyHome = scratch('codex-parity-wiring-healthy-home-');
  rmLater(t, root); rmLater(t, home); rmLater(t, healthyHome);
  const result = await runCodexHook(
    { hook_event_name: 'SessionStart', session_id: LEAD, cwd: root, turn_id: 'no-transcript-turn' },
    {
      home,
      env: childEnv(home, { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
      inbox: async () => peerNotes(),
      handleContinuationEvent: async () => ({ context: 'NO-TRANSCRIPT-CONTINUATION' }),
      nativeRouteForLead,
    },
  );
  assert.match(context(result), /wiring:/, 'Codex callbacks do not supply transcript_path');
  assert.match(context(result), /peer → lead/, 'unknown role must retain peer delivery');
  assert.match(context(result), /NO-TRANSCRIPT-CONTINUATION/, 'unknown role must retain continuation delivery');
  wireHealthyWiringHome(healthyHome);
  const healthy = await runCodexHook(
    { hook_event_name: 'SessionStart', session_id: LEAD, cwd: root, turn_id: 'healthy-wiring-turn' },
    {
      home: healthyHome,
      env: childEnv(healthyHome, { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(healthyHome, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
      inbox: async () => ({ slug: 'lead', count: 0, notes: [] }),
      codexContinuationSupported: false,
      nativeRouteForLead,
    },
  );
  assert.equal(healthy, null, 'a fully wired isolated home keeps SessionStart silent');
});

test('route child early-close and bounded timeout fail silent without erasing peer or advisory output', async (t) => {
  const root = scratch('codex-parity-route-timeout-'); const home = scratch('codex-parity-route-timeout-home-');
  rmLater(t, root); rmLater(t, home);
  const close = path.join(root, 'close.mjs'); const slow = path.join(root, 'slow.mjs');
  fs.writeFileSync(close, 'process.exit(0);\n');
  fs.writeFileSync(slow, 'setTimeout(() => process.stdout.write("late"), 5000);\n');
  assert.equal(await runRoute(close, [], {}, root, {}, 100), '');
  const started = Date.now();
  assert.equal(await runRoute(slow, [], {}, root, {}), '');
  assert.ok(Date.now() - started < 650, 'default route timeout must finish inside Codex PostToolUse budget');
  const result = await runCodexHook(
    { hook_event_name: 'UserPromptSubmit', session_id: LEAD, transcript_path: transcript(root), cwd: root, turn_id: 'route-failure' },
    {
      home, env: { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents') },
      inbox: async () => peerNotes(),
      goalContextForLead: async () => ({ text: 'ADVISORY-PRESERVED' }),
      nativeRouteForLead: async () => { await runRoute(slow, [], {}, root, {}); return null; },
      codexContinuationSupported: false,
    },
  );
  assert.match(context(result), /peer → lead/);
  assert.match(context(result), /ADVISORY-PRESERVED/);
});

test('backlog route keeps its existing switches and cadence silent', async (t) => {
  const root = scratch('codex-parity-silence-project-'); const home = scratch('codex-parity-silence-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const base = { hook_event_name: 'UserPromptSubmit', session_id: LEAD, transcript_path: transcript(root), cwd: root, turn_id: 'silence-turn' };
  const env = { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO };
  const first = await runCodexHook(base, { home, env, nativeRouteForLead, codexContinuationSupported: false, inbox: async () => ({ slug: 'lead', count: 0, notes: [] }) });
  assert.match(context(first), /work: 1 runnable/, 'fixture proves the route is live before cadence check');
  const second = await runCodexHook(base, { home, env, nativeRouteForLead, codexContinuationSupported: false, inbox: async () => ({ slug: 'lead', count: 0, notes: [] }) });
  assert.equal(second, null, 'the existing 120-second backlog cadence remains silent');
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true }); fs.writeFileSync(path.join(home, '.agents', 'ws-off-backlog'), '');
  const switched = await runCodexHook({ ...base, turn_id: 'switch-turn' }, { home, env, nativeRouteForLead, codexContinuationSupported: false, inbox: async () => ({ slug: 'lead', count: 0, notes: [] }) });
  assert.equal(switched, null, 'ws-off-backlog remains silent through the native wrapper');
});

test('native scratch installer wires and trusts the delete guard beside the wrapper', (t) => {
  const home = scratch('codex-parity-installer-home-'); rmLater(t, home);
  const installed = spawnSync(process.execPath, [INSTALLER, '--codex-hooks-only', '--codex-home', home, '--json'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const result = JSON.parse(installed.stdout);
  assert.equal(result.ok, true);
  const hooks = readJson(path.join(home, 'hooks.json')).hooks;
  assert.ok((hooks.PreToolUse ?? []).flatMap((group) => group.hooks ?? []).some((hook) => String(hook.command).includes('delete-guard.mjs')));
  assert.match(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /trusted_hash\s*=/, 'installer must trust what it wires');
});

test('negative controls prove removed and overlapping coverage are rejected by the same contract validator', () => {
  const actual = claudePairs();
  const routes = new Map(actual.map((pair) => [key(pair), pair.event]));
  const noUnsupported = [];
  routes.delete(key(actual[0]));
  assert.throws(() => assertCoverage(actual, routes, noUnsupported), /coverage must be exactly one/);
  const overlap = actual[1];
  assert.throws(() => assertCoverage(actual, new Map(actual.map((pair) => [key(pair), pair.event])), [{ ...overlap, reason: 'negative control' }]), /coverage must be exactly one/);
});
