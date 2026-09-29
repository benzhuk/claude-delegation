// Lane 37's independent contract: the Claude manifest is the inventory, while
// the native wrapper's observable output is the evidence for each routed pair.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

import { childEnv } from '../skills/multi/scripts/test-child-env.mjs';
import { NATIVE_ROUTES, nativeRouteForLead, runCodexHook, runRoute } from './multi-codex-hook.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLAUDE_MANIFEST = path.join(REPO, 'hooks', 'hooks.json');
const CODEX_MANIFEST = path.join(REPO, 'hooks', 'codex-hooks.json');
const UNSUPPORTED = path.join(REPO, 'hooks', 'codex-unsupported.json');
const INSTALLER = path.join(REPO, 'scripts', 'mirror-shared-skills.mjs');
const WRAPPER = path.join(REPO, 'hooks', 'multi-codex-hook.mjs');
const BACKLOG = path.join(REPO, 'hooks', 'backlog-notice.js');
const LEAD = '01a0c5f8-1865-7d93-9ff3-38793062f1ee';
const CLAUDE_SESSION = 'claude-l49-session';
const CODEX_SESSION = 'codex-l49-session';
const require = createRequire(import.meta.url);
const { sentinelPathFor } = require('./backlog-notice.js');

function scratch(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function rmLater(t, target) { t.after(() => fs.rmSync(target, { recursive: true, force: true })); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function key(pair) { return `${pair.script}\u0000${pair.event}`; }

function freezeParentRouteTimers(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => t.mock.timers.reset());
}

function wrapperTimerPreload(root) {
  const preload = path.join(root, 'freeze-wrapper-route-timers.mjs');
  fs.writeFileSync(preload, [
    'const realSetTimeout = globalThis.setTimeout;',
    'const realClearTimeout = globalThis.clearTimeout;',
    'const frozen = new Set();',
    'globalThis.setTimeout = (callback, delay, ...args) => {',
    '  if (delay === 400 || delay === 450 || delay === 2500) {',
    '    const timer = { frozen: true, unref() { return this; } };',
    '    frozen.add(timer);',
    '    return timer;',
    '  }',
    '  return realSetTimeout(callback, delay, ...args);',
    '};',
    'globalThis.clearTimeout = (timer) => frozen.delete(timer) || realClearTimeout(timer);',
    '',
  ].join('\n'));
  return preload;
}

function manifestPairs(manifest) {
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

function claudePairs(manifest = readJson(CLAUDE_MANIFEST)) { return manifestPairs(manifest); }

function nativeCommands(event, manifest = readJson(CODEX_MANIFEST)) {
  const groups = manifest.hooks?.[event] ?? [];
  return groups.flatMap((group) => group.hooks ?? []).map((hook) => String(hook.command ?? ''));
}

function commandNames(command) {
  return [...String(command).matchAll(/((?:hooks|scripts)\/[A-Za-z0-9_.-]+)/g)].map((match) => match[1]);
}

function codexPairs(manifest) {
  return manifestPairs(manifest).map((pair) => {
    const [script] = commandNames(pair.script);
    assert.ok(script, `Codex hook command must name a repo hook: ${pair.script}`);
    return { script, event: pair.event };
  });
}

function pairedRoutes(claudeManifest, codexManifest, nativeRoutes) {
  const claude = claudePairs(claudeManifest);
  const codex = codexPairs(codexManifest);
  const routes = new Map();
  const coveredCodex = new Set();
  const claudeKeys = new Set(claude.map(key));
  const codexWrapperEvents = new Set(codex.filter((pair) => pair.script === 'hooks/multi-codex-hook.mjs').map((pair) => pair.event));

  for (const pair of claude) {
    if (pair.script === 'hooks/multi-inbox.js' && codexWrapperEvents.has(pair.event)) routes.set(key(pair), pair.event);
  }
  for (const [event, scripts] of Object.entries(nativeRoutes)) {
    assert.ok(Array.isArray(scripts) && scripts.length === 1, `NATIVE_ROUTES.${event} must declare exactly one script`);
    assert.ok(codexWrapperEvents.has(event), `NATIVE_ROUTES.${event} must have an installed Codex wrapper event`);
    const script = scripts[0];
    assert.match(script, /^(?:hooks|scripts)\/[A-Za-z0-9_.-]+$/);
    const pair = { script, event };
    assert.ok(claudeKeys.has(key(pair)), `NATIVE_ROUTES must name an actual Claude pair: ${script}/${event}`);
    routes.set(key(pair), event);
  }
  for (const pair of codex) {
    if (pair.script === 'hooks/multi-codex-hook.mjs' && (claudeKeys.has(key({ script: 'hooks/multi-inbox.js', event: pair.event })) || Object.hasOwn(nativeRoutes, pair.event))) {
      coveredCodex.add(key(pair));
    }
    if (pair.script !== 'hooks/delete-guard.mjs') continue;
    assert.ok(claudeKeys.has(key(pair)), `native delete guard must map to a Claude pair: ${pair.script}/${pair.event}`);
    routes.set(key(pair), pair.event);
    coveredCodex.add(key(pair));
  }
  return { claude, codex, routes, coveredCodex };
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

function deterministicBacklogRoute(input) {
  const line = 'work: 1 runnable and unowned (wr-2026-09-28-parity), 0 delivered and unreviewed (), 0 rejected awaiting a fix round (). Pull one or say why not.';
  return { text: line, systemMessage: input.hook_event_name === 'Stop' ? line : null };
}

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

const INTERRUPT_ONLY_REASON = 'Codex has an Interrupt event, Claude Code has none.';

function assertManifestParity(claudeManifest, codexManifest, unsupportedDoc, nativeRoutes = NATIVE_ROUTES) {
  const { claude: inventory, codex, routes: derivedRoutes, coveredCodex } = pairedRoutes(claudeManifest, codexManifest, nativeRoutes);
  assert.deepEqual(Object.keys(unsupportedDoc).sort(), ['unsupported']);
  assert.ok(Array.isArray(unsupportedDoc.unsupported));
  assertCoverage(inventory, derivedRoutes, unsupportedDoc.unsupported);

  for (const pair of inventory) {
    const route = derivedRoutes.get(key(pair));
    if (route === 'PreToolUse') {
      assert.ok(nativeCommands(route, codexManifest).some((command) => command.includes('delete-guard.mjs')), 'delete guard must be native PreToolUse');
    } else if (route) {
      assert.ok(nativeCommands(route, codexManifest).some((command) => command.includes('multi-codex-hook.mjs')), `${pair.script}/${pair.event} must reach the native wrapper`);
    }
  }
  for (const pair of codex) {
    if (coveredCodex.has(key(pair))) continue;
    assert.deepEqual(pair, { script: 'hooks/multi-codex-hook.mjs', event: 'Interrupt' }, `Codex-only allowance: ${INTERRUPT_ONLY_REASON}`);
  }
  assert.ok(nativeCommands('Interrupt', codexManifest).some((command) => command.includes('multi-codex-hook.mjs')), 'Codex-only Interrupt remains permitted');
}

test('functional: actual manifests derive complete bidirectional native coverage with only the reasoned Interrupt exception', () => {
  assertManifestParity(readJson(CLAUDE_MANIFEST), readJson(CODEX_MANIFEST), readJson(UNSUPPORTED));
});

test('functional: the manifest-derived validator rejects fake Claude and Codex wrapper events', () => {
  const claudeManifest = readJson(CLAUDE_MANIFEST);
  const codexManifest = readJson(CODEX_MANIFEST);
  const unsupportedDoc = readJson(UNSUPPORTED);
  const fakeClaude = structuredClone(claudeManifest);
  fakeClaude.hooks.FakeClaude = [{ hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/fake-l49.mjs"' }] }];
  const fakeCodex = structuredClone(codexManifest);
  fakeCodex.hooks.FakeCodex = [{ hooks: [{ command: 'node "${PLUGIN_ROOT}/hooks/multi-codex-hook.mjs"' }] }];
  assert.throws(() => assertManifestParity(fakeClaude, codexManifest, unsupportedDoc), /coverage must be exactly one/);
  assert.throws(() => assertManifestParity(claudeManifest, fakeCodex, unsupportedDoc), /NATIVE_ROUTES\.FakeCodex|Codex-only allowance: Codex has an Interrupt event, Claude Code has none\./);
});

test('functional: native wrapper emits SessionStart wiring plus backlog prompt/post/stop output without erasing peer or continuation context', { timeout: 10000 }, async (t) => {
  const root = scratch('codex-parity-route-project-');
  const home = scratch('codex-parity-route-home-');
  rmLater(t, root); rmLater(t, home);
  freezeParentRouteTimers(t);
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

  // This is a composition assertion: route output is injected through the existing runCodexHook seam
  // so all three event shapes are deterministic under a loaded host. Actual child routing remains
  // covered by the default-CLI and two-session route tests below.
  for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop']) {
    const eventHome = scratch(`codex-parity-${event}-`); rmLater(t, eventHome);
    const result = await runCodexHook({ ...input, hook_event_name: event }, { ...deps, home: eventHome, env: { ...deps.env, AGENTS_HOME: path.join(eventHome, '.agents') }, nativeRouteForLead: deterministicBacklogRoute });
    const rendered = `${context(result)}\n${result?.output?.systemMessage ?? ''}\n${result?.output?.reason ?? ''}`;
    assert.match(rendered, /work: 1 runnable and unowned \(wr-2026-09-28-parity\)/, `${event} must render actual backlog output`);
    assert.match(rendered, /peer → lead/, `${event} must preserve peer delivery`);
    assert.match(rendered, /CONTINUATION-PARITY-MARKER/, `${event} must preserve continuation delivery`);
  }
});

test('functional: the actual wrapper CLI keeps its parent route timers frozen while its real UserPromptSubmit child writes the supplied-session sentinel', { timeout: 10000 }, (t) => {
  const root = scratch('codex-parity-cli-project-'); const home = scratch('codex-parity-cli-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const sessionId = 'cli-l56-session';
  const input = { hook_event_name: 'UserPromptSubmit', session_id: sessionId, transcript_path: transcript(root), cwd: root, turn_id: 'cli-turn' };
  const child = spawnSync(process.execPath, ['--import', pathToFileURL(wrapperTimerPreload(root)).href, WRAPPER], {
    cwd: root, input: JSON.stringify(input), encoding: 'utf8',
    env: childEnv(home, { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
    timeout: 10000,
  });
  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout.trim());
  assert.match(output.hookSpecificOutput.additionalContext, /work: 1 runnable and unowned \(wr-2026-09-28-parity\)/);
  assert.ok(fs.existsSync(sentinelPathFor(path.join(home, '.agents'), sessionId)), 'the real UserPromptSubmit child must write its supplied-session sentinel');
});

test('functional: real SessionStart without transcript metadata still routes wiring while preserving peer context', { timeout: 10000 }, async (t) => {
  const root = scratch('codex-parity-no-transcript-project-'); const home = scratch('codex-parity-no-transcript-home-');
  const healthyHome = scratch('codex-parity-wiring-healthy-home-');
  rmLater(t, root); rmLater(t, home); rmLater(t, healthyHome);
  freezeParentRouteTimers(t);
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

test('deadline: native route child give-up stays silent within two seconds', { timeout: 2000 }, async (t) => {
  const root = scratch('codex-parity-route-timeout-'); const home = scratch('codex-parity-route-timeout-home-');
  rmLater(t, root); rmLater(t, home);
  const close = path.join(root, 'close.mjs'); const slow = path.join(root, 'slow.mjs');
  fs.writeFileSync(close, 'process.exit(0);\n');
  fs.writeFileSync(slow, 'setTimeout(() => process.stdout.write("late"), 5000);\n');
  assert.equal(await runRoute(close, [], {}, root, {}, 100), '');
  const childStarted = performance.now();
  assert.equal(await runRoute(slow, [], {}, root, {}), '');
  assert.ok(performance.now() - childStarted < 2000, 'default runRoute kill must reap a real hung child well before the 5-second mutant');
});

test('deadline: runCodexHook outer route budget gives up silently within two seconds', { timeout: 2000 }, async (t) => {
  const root = scratch('codex-parity-outer-timeout-'); const home = scratch('codex-parity-outer-timeout-home-');
  rmLater(t, root); rmLater(t, home);
  const started = performance.now();
  const result = await runCodexHook(
    { hook_event_name: 'UserPromptSubmit', session_id: LEAD, transcript_path: transcript(root), cwd: root, turn_id: 'outer-timeout' },
    {
      home, env: { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents') },
      inbox: async () => ({ slug: 'lead', count: 0, notes: [] }),
      goalContextForLead: async () => null,
      nativeRouteForLead: async () => new Promise(() => {}),
      codexContinuationSupported: false,
    },
  );
  assert.ok(performance.now() - started < 2000, 'runCodexHook outer route budget must reject the 5-second timeout mutant');
  assert.equal(result, null, 'the timed-out route must give up silently');
});

test('functional: a real UserPromptSubmit child preserves peer and advisory output while parent route timers stay frozen', { timeout: 10000 }, async (t) => {
  const root = scratch('codex-parity-real-route-project-'); const home = scratch('codex-parity-real-route-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const sessionId = 'real-route-l56-session';
  freezeParentRouteTimers(t);
  const result = await runCodexHook(
    { hook_event_name: 'UserPromptSubmit', session_id: sessionId, transcript_path: transcript(root), cwd: root, turn_id: 'real-route' },
    {
      home,
      env: childEnv(home, { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
      inbox: async () => peerNotes(),
      goalContextForLead: async () => ({ text: 'ADVISORY-PRESERVED' }),
      nativeRouteForLead,
      codexContinuationSupported: false,
    },
  );
  assert.match(context(result), /work: 1 runnable and unowned \(wr-2026-09-28-parity\)/, 'the real child route must reach the wrapper output');
  assert.match(context(result), /peer → lead/, 'the real child route must preserve peer output');
  assert.match(context(result), /ADVISORY-PRESERVED/, 'the real child route must preserve advisory output');
  assert.ok(fs.existsSync(sentinelPathFor(path.join(home, '.agents'), sessionId)), 'the real child must write its supplied-session sentinel');
});

test('functional: nativeRouteForLead consumes the production NATIVE_ROUTES declaration without writing a sentinel for a nonexistent child', { timeout: 10000 }, async (t) => {
  const root = scratch('codex-parity-route-declaration-'); const home = scratch('codex-parity-route-declaration-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  freezeParentRouteTimers(t);
  const original = NATIVE_ROUTES.UserPromptSubmit;
  NATIVE_ROUTES.UserPromptSubmit = ['hooks/not-a-real-native-route.js'];
  try {
    const result = await nativeRouteForLead(
      { hook_event_name: 'UserPromptSubmit', session_id: LEAD, cwd: root }, root, 'unknown',
      childEnv(home, { AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO }),
    );
    assert.equal(result, null, 'changing the declaration must change the route selection instead of leaving a handwritten backlog path');
    assert.equal(fs.existsSync(sentinelPathFor(path.join(home, '.agents'), LEAD)), false, 'a nonexistent route child must not write a supplied-session sentinel');
  } finally {
    NATIVE_ROUTES.UserPromptSubmit = original;
  }
});

test('functional: Claude and Codex native session ids have independent exact backlog sentinels while the same id stays silent', { timeout: 10000 }, async (t) => {
  const root = scratch('codex-parity-session-project-'); const home = scratch('codex-parity-session-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const agents = path.join(home, '.agents');
  const env = childEnv(home, { AGENTS_HOME: agents, NOTE_SLUG: 'lead', CLAUDE_PLUGIN_ROOT: REPO });
  freezeParentRouteTimers(t);
  const claudeInput = { hook_event_name: 'UserPromptSubmit', session_id: CLAUDE_SESSION, cwd: root };
  const first = spawnSync(process.execPath, [BACKLOG, 'UserPromptSubmit'], {
    cwd: root, input: JSON.stringify(claudeInput), encoding: 'utf8', env,
  });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /work: 1 runnable and unowned/);

  const codex = await runCodexHook(
    { hook_event_name: 'UserPromptSubmit', session_id: CODEX_SESSION, cwd: root, turn_id: 'two-session-native-route' },
    { home, env, nativeRouteForLead, codexContinuationSupported: false, inbox: async () => ({ slug: 'lead', count: 0, notes: [] }) },
  );
  assert.match(context(codex), /work: 1 runnable and unowned/, 'a different supplied Codex session must emit in the same home and project');
  const claudeSentinel = sentinelPathFor(agents, CLAUDE_SESSION);
  const codexSentinel = sentinelPathFor(agents, CODEX_SESSION);
  assert.ok(fs.existsSync(claudeSentinel), `Claude must write its exact sentinel ${claudeSentinel}`);
  assert.ok(fs.existsSync(codexSentinel), `Codex must write its exact sentinel ${codexSentinel}`);
  assert.notEqual(claudeSentinel, codexSentinel);

  const repeated = spawnSync(process.execPath, [BACKLOG, 'UserPromptSubmit'], {
    cwd: root, input: JSON.stringify(claudeInput), encoding: 'utf8', env,
  });
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(repeated.stdout, '', 'the same supplied id keeps its existing cadence');
});

test('functional: real native Stop route surfaces backlog text for Codex', { timeout: 10000 }, async (t) => {
  const root = scratch('codex-parity-stop-route-'); const home = scratch('codex-parity-stop-route-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const env = childEnv(home, { AGENTS_HOME: path.join(home, '.agents'), NOTE_SLUG: 'lead', CLAUDE_PLUGIN_ROOT: REPO });
  const sessionId = 'stop-l49-session';
  freezeParentRouteTimers(t);
  const result = await nativeRouteForLead({ hook_event_name: 'Stop', session_id: sessionId, cwd: root }, root, 'unknown', env);
  assert.match(result?.text ?? '', /work: 1 runnable and unowned/, 'Codex Stop must carry the real backlog line in additionalContext text');
  assert.ok(fs.existsSync(sentinelPathFor(path.join(home, '.agents'), sessionId)), 'real Stop child must write its supplied-session backlog sentinel');
});

test('functional: backlog route keeps its existing switches and cadence silent', { timeout: 10000 }, async (t) => {
  const root = scratch('codex-parity-silence-project-'); const home = scratch('codex-parity-silence-home-');
  rmLater(t, root); rmLater(t, home); runnableRecord(root);
  const base = { hook_event_name: 'UserPromptSubmit', session_id: LEAD, transcript_path: transcript(root), cwd: root, turn_id: 'silence-turn' };
  const env = { NOTE_SLUG: 'lead', AGENTS_HOME: path.join(home, '.agents'), CLAUDE_PLUGIN_ROOT: REPO };
  freezeParentRouteTimers(t);
  const first = await runCodexHook(base, { home, env, nativeRouteForLead, codexContinuationSupported: false, inbox: async () => ({ slug: 'lead', count: 0, notes: [] }) });
  assert.match(context(first), /work: 1 runnable/, 'fixture proves the route is live before cadence check');
  assert.ok(fs.existsSync(sentinelPathFor(path.join(home, '.agents'), LEAD)), 'the real first route must write its supplied-session sentinel');
  const second = await runCodexHook(base, { home, env, nativeRouteForLead, codexContinuationSupported: false, inbox: async () => ({ slug: 'lead', count: 0, notes: [] }) });
  assert.equal(second, null, 'the existing 120-second backlog cadence remains silent');
  fs.mkdirSync(path.join(home, '.agents'), { recursive: true }); fs.writeFileSync(path.join(home, '.agents', 'ws-off-backlog'), '');
  const switched = await runCodexHook({ ...base, turn_id: 'switch-turn' }, { home, env, nativeRouteForLead, codexContinuationSupported: false, inbox: async () => ({ slug: 'lead', count: 0, notes: [] }) });
  assert.equal(switched, null, 'ws-off-backlog remains silent through the native wrapper');
});

test('functional: native scratch installer wires and trusts the delete guard beside the wrapper', (t) => {
  const home = scratch('codex-parity-installer-home-'); rmLater(t, home);
  const installed = spawnSync(process.execPath, [INSTALLER, '--codex-hooks-only', '--codex-home', home, '--json'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const result = JSON.parse(installed.stdout);
  assert.equal(result.ok, true);
  const hooks = readJson(path.join(home, 'hooks.json')).hooks;
  assert.ok((hooks.PreToolUse ?? []).flatMap((group) => group.hooks ?? []).some((hook) => String(hook.command).includes('delete-guard.mjs')));
  assert.match(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /trusted_hash\s*=/, 'installer must trust what it wires');
});

test('functional: negative controls prove removed and overlapping coverage are rejected by the same contract validator', () => {
  const actual = claudePairs();
  const routes = new Map(actual.map((pair) => [key(pair), pair.event]));
  const noUnsupported = [];
  routes.delete(key(actual[0]));
  assert.throws(() => assertCoverage(actual, routes, noUnsupported), /coverage must be exactly one/);
  const overlap = actual[1];
  assert.throws(() => assertCoverage(actual, new Map(actual.map((pair) => [key(pair), pair.event])), [{ ...overlap, reason: 'negative control' }]), /coverage must be exactly one/);
});
