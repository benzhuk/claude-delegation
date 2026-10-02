// node scripts/run-tests.mjs skills/decisions/scripts/decisions-render-publish.test.mjs
// decisions-render-publish: the publish() 8-step pipeline. notion.js, decisions-title.mjs and the
// pickup status read are ALWAYS injected fakes here — this file never calls Notion or pushes.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  publish, PublishError, revertOwnerInput, ownerInputTriples, hasOwnerInput, multisetsEqual, defaultReadPickupCapture, defaultAccountRound,
} from './decisions-render-publish.mjs';
import { normalize, RefusedError } from './decisions-render-core.mjs';
import { parseDocument } from './decisions-read.mjs';
import { run } from './decisions-render.mjs';
import { toggleFiles, CARD_SHA } from './fixtures/toggles-fixtures.mjs';

const REPO = '/repo';
function p(...parts) { return path.join(REPO, ...parts); }

function fakeFs(files) {
  const map = new Map(Object.entries(files));
  const readFile = (f) => {
    if (!map.has(f)) { const e = new Error(`ENOENT: ${f}`); e.code = 'ENOENT'; throw e; }
    return map.get(f);
  };
  const readdirSync = (d) => {
    const prefix = d.endsWith(path.sep) ? d : d + path.sep;
    const names = new Set();
    for (const key of map.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest.includes(path.sep)) names.add(rest);
      }
    }
    if (names.size === 0) { const e = new Error(`ENOENT: ${d}`); e.code = 'ENOENT'; throw e; }
    return [...names];
  };
  return {
    map, readFile, readdirSync, writeFile: (f, c) => map.set(f, c),
  };
}

function baseFiles(overrides = {}) {
  return {
    ...toggleFiles(path.join, REPO),
    [p('docs', 'decisions', 'now.md')]: 'The plugin runs the loop by itself. Ticks reach the right session within a minute. Knowledge sharing between machines is the next lane.',
    [p('docs', 'decisions', 'session.md')]: 'since: 2026-09-27T18:16:00Z\n- The collector runs on Netcup every 15 minutes.',
    [p('docs', 'decisions', 'history', '2026-09-27.md')]: '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n- some bullet\n',
    [p('docs', 'decisions', 'last-render.md')]: '', // filled per-test to control drift
    ...overrides,
  };
}

/** A fake git: ls-tree always "tracked"; rev-parse reports a clean, up-to-date main checkout by
 * default (F6's pre-write guard); add/commit/push/fetch/rebase/branch/show recorded, never real.
 * `diff --cached --quiet` (M10's empty-commit check) THROWS by default — a real `git diff
 * --cached --quiet` exits non-zero exactly when there IS a staged difference, and a real publish
 * always has something new to commit — so the default here is "there is something to commit". */
function fakeGit(overrides = {}) {
  const calls = [];
  const impl = (args, cwd) => {
    calls.push(args);
    if (overrides[args[0]]) return overrides[args[0]](args, cwd);
    if (args[0] === 'ls-tree') return args[args.length - 1];
    if (args[0] === 'log') return CARD_SHA;
    if (args[0] === 'rev-parse') return args.includes('--abbrev-ref') ? 'main' : 'sha-fixed';
    if (args[0] === 'show') return '';
    if (args[0] === 'diff') throw new Error('there is a staged difference');
    return '';
  };
  return { git: impl, calls };
}

function baseDeps(over = {}) {
  const f = fakeFs(baseFiles(over.files));
  const { git, calls } = fakeGit(over.gitOverrides);
  return {
    fsMap: f.map,
    calls,
    deps: {
      readFile: f.readFile,
      readdirSync: f.readdirSync,
      writeFile: f.writeFile,
      execGit: git,
      now: () => new Date(over.now ?? '2026-09-27T19:00:00Z'),
      readPage: over.readPage ?? (async () => f.readFile(p('docs', 'decisions', 'last-render.md'))),
      replaceMd: over.replaceMd ?? (async () => {}),
      titleSet: over.titleSet ?? (async () => {}),
      readPickupCapture: over.readPickupCapture ?? (async () => null),
      readLatestBackup: over.readLatestBackup ?? (async () => null),
      write: () => {},
      ...over.deps,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ownerInputTriples / hasOwnerInput / multisetsEqual
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_NO_INPUT = [
  '# Waiting on you now {toggle="true"}',
  '\tNothing right now.',
  '\t## What is going on',
  '\tText.',
  '\t<callout icon="x">note</callout>',
  '\t- [ ] Done',
  '\t<empty-block/>',
  '# History {toggle="true"}',
  '\t<empty-block/>',
].join('\n');

test('revertOwnerInput: a ticked Done nested in the Waiting toggle is unticked in place, indentation kept', () => {
  const live = PAGE_NO_INPUT.replace('\t- [ ] Done', '\t- [x] Done');
  const doc = parseDocument(live);
  assert.equal(doc.done, true);
  assert.deepEqual(doc.warnings, []);
  assert.equal(revertOwnerInput(live, doc), PAGE_NO_INPUT);
});

test('revertOwnerInput: a legacy column-0 ticked Done is still unticked in place', () => {
  const legacy = '# Waiting on you now\nNothing right now.\n# History {toggle="true"}\n\t<empty-block/>\n- [x] Done\n<empty-block/>';
  const doc = parseDocument(legacy);
  assert.equal(revertOwnerInput(legacy, doc), legacy.replace('- [x] Done', '- [ ] Done'));
});

test('hasOwnerInput: a clean page (unticked Done, no comments) has none', () => {
  const doc = parseDocument(PAGE_NO_INPUT);
  assert.equal(hasOwnerInput(doc), false);
});

test('hasOwnerInput: a ticked Done counts as owner input', () => {
  const doc = parseDocument(PAGE_NO_INPUT.replace('- [ ] Done', '- [x] Done'));
  assert.equal(hasOwnerInput(doc), true);
});

test('hasOwnerInput: an owner comment (escaped \\*\\* line) under a decision counts', () => {
  const page = [
    '<details>',
    '<summary>**A decision**</summary>',
    '\t- [ ] Option one',
    '\t\\*\\* a note from Ben',
    '\tDefault after 2030-01-01 00:00 -05:00: Option one',
    '</details>',
    '- [ ] Done',
  ].join('\n');
  const doc = parseDocument(page);
  assert.equal(hasOwnerInput(doc), true);
  const triples = ownerInputTriples(doc);
  assert.deepEqual(triples, [['comment', 'A decision', 'a note from Ben']]);
});

test('hasOwnerInput: a ticked option counts, and ownerInputTriples records it as a selection', () => {
  const page = [
    '<details>',
    '<summary>**A decision**</summary>',
    '\t- [x] Option one',
    '\t- [ ] Option two',
    '\tDefault after 2030-01-01 00:00 -05:00: Option one',
    '</details>',
    '- [ ] Done',
  ].join('\n');
  const doc = parseDocument(page);
  assert.equal(hasOwnerInput(doc), true);
  assert.deepEqual(ownerInputTriples(doc), [['selection', 'A decision', 'Option one']]);
});

test('multisetsEqual: order does not matter, counts do', () => {
  assert.equal(multisetsEqual([['a', 'b', 'c'], ['d', 'e', 'f']], [['d', 'e', 'f'], ['a', 'b', 'c']]), true);
  assert.equal(multisetsEqual([['a', 'b', 'c']], [['a', 'b', 'c'], ['a', 'b', 'c']]), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// defaultReadPickupCapture — round-2 R2-1 regression. decisions-pickup.mjs's real `status()`
// puts the lifecycle word on the WRAPPER (`st.status`, from receiptStatus's `effectiveStatus`,
// decisions-pickup.mjs:804-829) — a receipt itself only ever has `.state`, never `.status`. A
// fake `pickup` module (never the real decisions-pickup.mjs) is injected through the second
// argument so this exercises the exact wrapper shape production code receives.
// ─────────────────────────────────────────────────────────────────────────────

test('defaultReadPickupCapture: a real RECORDED wrapper (status lives on st, not st.receipt) yields the captured triples', async () => {
  const pickup = {
    status: () => ({
      status: 'RECORDED',
      receipt: { state: 'RECORDED', round: 4, captureReadAt: '2026-09-27T21:55:00Z' },
    }),
    openPrivateCapture: () => Buffer.from(pageWithComment('hello'), 'utf8'),
  };
  const capture = await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup });
  assert.deepEqual(capture, {
    round: 4,
    tickAt: '2026-09-27T21:55:00Z',
    triples: [['comment', 'A decision', 'hello']],
  });
});

test('defaultReadPickupCapture: an ACCOUNTED wrapper (round accounted but Done not yet cleared) yields the captured triples, tagged so publish can require Done still checked', async () => {
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 4, captureReadAt: '2026-09-27T21:55:00Z' } }),
    openPrivateCapture: () => Buffer.from(pageWithComment('hello'), 'utf8'),
  };
  const capture = await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup });
  assert.deepEqual(capture, {
    round: 4,
    tickAt: '2026-09-27T21:55:00Z',
    triples: [['comment', 'A decision', 'hello']],
    accounted: true,
    doneLabel: 'Done',
  });
});

test('defaultReadPickupCapture: a NEEDS_RECONCILIATION wrapper still yields null and never opens the private capture', async () => {
  let opened = false;
  const pickup = {
    status: () => ({ status: 'NEEDS_RECONCILIATION', receipt: { state: 'NEEDS_RECONCILIATION', round: 4 } }),
    openPrivateCapture: () => { opened = true; return Buffer.from(pageWithComment('hello'), 'utf8'); },
  };
  const capture = await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup });
  assert.equal(capture, null);
  assert.equal(opened, false, 'the status filter, not a failed open, must reject it');
});

test('defaultReadPickupCapture: an ACCOUNTED round whose unchecked page was already observed yields null and never opens the capture', async () => {
  let opened = false;
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 4, observedUncheckedAt: '2026-09-27T22:00:00Z' } }),
    openPrivateCapture: () => { opened = true; return Buffer.from(pageWithComment('hello'), 'utf8'); },
  };
  assert.equal(await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup }), null);
  assert.equal(opened, false, 'the observedUncheckedAt guard, not a failed open, must reject it');
});

// ─────────────────────────────────────────────────────────────────────────────
// publish(): argument/precondition guards
// ─────────────────────────────────────────────────────────────────────────────

test('publish: missing --repo/--page throw PublishError exit 2', async () => {
  await assert.rejects(publish({ page: 'x' }, {}), (e) => e instanceof PublishError && e.code === 2);
  await assert.rejects(publish({ repo: REPO }, {}), (e) => e instanceof PublishError && e.code === 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: owner input pending
// ─────────────────────────────────────────────────────────────────────────────

test('publish: owner input pending without --clear-done is exit 3, naming the pickup', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const ticked = PAGE_NO_INPUT.replace('- [ ] Done', '- [x] Done');
  const { deps } = baseDeps({ files, readPage: async () => ticked });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /owner input pending/.test(e.message),
  );
});

test('publish: no owner input and no --clear-done runs clean through dry-run', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({ files, readPage: async () => PAGE_NO_INPUT });
  const result = await publish({
    repo: REPO, page: 'PAGE', dryRun: true,
  }, deps);
  assert.equal(result.code, 0);
  assert.match(result.rendered, /^# Goal card {toggle="true"}/);
  assert.match(result.rendered, /	- \[ \] Done\n/); // step 4 copied the fresh (unticked) Done verbatim
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: drift
// ─────────────────────────────────────────────────────────────────────────────

test('publish: drift between the fresh read and last-render.md is exit 4', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const driftedLive = PAGE_NO_INPUT.replace('Text.', 'A hand-edited line nobody rendered.');
  const { deps } = baseDeps({ files, readPage: async () => driftedLive });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 4 && /written outside the renderer/.test(e.message),
  );
});

test('publish: no drift (normalised-equal fresh read vs last-render.md) proceeds past step 3', async () => {
  // last-render.md differs from the fresh read only by CRLF/trailing whitespace/blank-run/
  // trailing-empty-block -- normalize() must treat them as equal, per the acceptance list.
  const rendered = `${PAGE_NO_INPUT}\n`;
  const crlfCousin = rendered.replace(/\n/g, '\r\n');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: crlfCousin });
  const { deps } = baseDeps({ files, readPage: async () => rendered });
  const result = await publish({ repo: REPO, page: 'PAGE', dryRun: true }, deps);
  assert.equal(result.code, 0);
});

test('publish --adopt-live: adopts the fresh read as last-render.md, commits and pushes, never re-writes Notion', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const driftedLive = PAGE_NO_INPUT.replace('Text.', 'The crashed publish already wrote this live.');
  let replaceMdCalled = false;
  const { deps, calls, fsMap } = baseDeps({
    files,
    readPage: async () => driftedLive,
    replaceMd: async () => { replaceMdCalled = true; },
  });
  const result = await publish({ repo: REPO, page: 'PAGE', adoptLive: true }, deps);
  assert.equal(result.code, 0);
  assert.equal(replaceMdCalled, false, '--adopt-live must never write to Notion');
  assert.equal(fsMap.get(p('docs', 'decisions', 'last-render.md')), driftedLive);
  assert.ok(calls.some((c) => c[0] === 'commit'));
  assert.ok(calls.some((c) => c[0] === 'push'));
});

test('publish --adopt-live --dry-run: reports the adoption but writes nothing and never touches git', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const driftedLive = PAGE_NO_INPUT.replace('Text.', 'Different live text.');
  const { deps, calls, fsMap } = baseDeps({ files, readPage: async () => driftedLive });
  const before = fsMap.get(p('docs', 'decisions', 'last-render.md'));
  const result = await publish({
    repo: REPO, page: 'PAGE', adoptLive: true, dryRun: true,
  }, deps);
  assert.equal(result.code, 0);
  assert.equal(fsMap.get(p('docs', 'decisions', 'last-render.md')), before);
  assert.equal(calls.filter((c) => c[0] === 'commit' || c[0] === 'push').length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1 (render-guard, pack/spec.md): publish refuses a dirty docs/decisions tree, right after
// step 1 and before step 2 — ahead of the owner-input check, the drift compare, and every write.
// ─────────────────────────────────────────────────────────────────────────────

test('publish: Fix 1 — a modified file under docs/decisions is exit 7, the message names git restore', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => ' M docs/decisions/now.md\n' },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7
      && /git restore/.test(e.message) && /docs\/decisions\/now\.md/.test(e.message),
  );
});

test('publish: Fix 1 — a staged file under docs/decisions is exit 7', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => 'M  docs/decisions/session.md\n' },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7 && /docs\/decisions\/session\.md/.test(e.message),
  );
});

test('publish: Fix 1 — an untracked file under docs/decisions is exit 7', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => '?? docs/decisions/new-note.md\n' },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7 && /docs\/decisions\/new-note\.md/.test(e.message),
  );
});

test('publish: Fix 1 — last-render.md alone dirty is exempt (step 8 writes it), a clean run still succeeds', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { readPage, replaceMd } = wireNotion(PAGE_NO_INPUT);
  const { deps } = baseDeps({
    files,
    readPage,
    replaceMd,
    gitOverrides: { status: () => ' M docs/decisions/last-render.md\n' },
  });
  const result = await publish({ repo: REPO, page: 'PAGE' }, deps);
  assert.equal(result.code, 0);
});

test('publish: Fix 1 — a lane-branch caller with a clean docs/decisions tree still gets exit 2 (not exit 7)', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: {
      status: () => '',
      'rev-parse': (args) => (args.includes('--abbrev-ref') ? 'build/decisions-render-1' : 'sha-fixed'),
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 2 && /not main/.test(e.message),
  );
});

test('publish: Fix 1 — dirty docs/decisions AND off main is exit 7 with the list and then the exit-2 detail', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: {
      status: () => ' M docs/decisions/now.md\n',
      'rev-parse': (args) => (args.includes('--abbrev-ref') ? 'build/decisions-render-1' : 'sha-fixed'),
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7
      && /git restore/.test(e.message) && /docs\/decisions\/now\.md/.test(e.message)
      && /not main/.test(e.message),
  );
});

test('publish: Fix 1 — --dry-run warns on stderr for a dirty docs/decisions tree and still prints the render', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const warnings = [];
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => '?? docs/decisions/scratch.md\n' },
    deps: { writeErr: (s) => warnings.push(s) },
  });
  const result = await publish({ repo: REPO, page: 'PAGE', dryRun: true }, deps);
  assert.equal(result.code, 0);
  assert.match(result.rendered, /^# Goal card {toggle="true"}/);
  assert.ok(warnings.some((w) => w.startsWith('warning:')));
  assert.ok(warnings.some((w) => w.includes('docs/decisions/scratch.md')));
});

test("CLI run(): publishDeps forwards writeErr, so the real CLI entry's --dry-run dirty-tree warning reaches stderr", async () => {
  // MAJOR-1 (review round-2): decisions-render.mjs's run() builds publishDeps with `write` but
  // (before the fix) never `writeErr`, so the real CLI silently no-ops the warning above even
  // though the unit test at deps-level passes. This drives the fix the same way the CLI does:
  // through run(), with writeErr only on run()'s own top-level param, never inside `deps`.
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => '?? docs/decisions/scratch.md\n' },
  });
  const warnings = [];
  const code = await run({
    argv: ['publish', '--repo', REPO, '--page', 'PAGE', '--dry-run'],
    write: () => {},
    writeErr: (s) => warnings.push(s),
    deps,
  });
  assert.equal(code, 0);
  assert.ok(warnings.some((w) => w.startsWith('warning:') && w.includes('docs/decisions/scratch.md')));
});

test('publish: Fix 1 — the dirty-tree check runs before step 2: owner input pending stays unseen, exit 7 not exit 3, and no write or drift compare happens', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const ticked = PAGE_NO_INPUT.replace('- [ ] Done', '- [x] Done'); // owner input pending
  const { deps, calls } = baseDeps({
    files,
    readPage: async () => ticked,
    gitOverrides: { status: () => ' M docs/decisions/now.md\n' },
  });
  let writeFileCalls = 0;
  const realWriteFile = deps.writeFile;
  deps.writeFile = (...args) => { writeFileCalls += 1; return realWriteFile(...args); };
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7 && !/owner input pending/.test(e.message),
  );
  assert.equal(writeFileCalls, 0, 'no write happens on exit 7');
  assert.ok(!calls.some((c) => c[0] === 'show'), 'no clear-done verbatim compare (git show) reached on exit 7');
  assert.ok(!calls.some((c) => c[0] === 'diff'), "no step-8 commit-diff check reached on exit 7 (this run wasn't --clear-done)");
});

test('publish: Fix 1 — the dirty-tree status check runs in --repo, not cwd, with the docs/decisions pathspec', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const recorded = [];
  const execGit = (args, cwd) => {
    recorded.push({ args, cwd });
    if (args[0] === 'status') return ' M docs/decisions/now.md\n';
    if (args[0] === 'rev-parse') return args.includes('--abbrev-ref') ? 'main' : 'sha-fixed';
    if (args[0] === 'ls-tree') return args[args.length - 1];
    return '';
  };
  const { deps } = baseDeps({
    files, readPage: async () => PAGE_NO_INPUT, deps: { execGit },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7,
  );
  const statusCall = recorded.find((c) => c.args[0] === 'status');
  assert.ok(statusCall, 'git status must be called');
  assert.equal(statusCall.cwd, REPO, 'status must run in --repo, not process.cwd()');
  assert.deepEqual(statusCall.args, ['status', '--porcelain', '--untracked-files=all', '--', 'docs/decisions']);
});

test('publish: Fix 1 — a rename lists both the old and the new path, and is exit 7', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => 'R  docs/decisions/waiting/old.md -> docs/decisions/waiting/new.md\n' },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7
      && /git restore/.test(e.message)
      && /docs\/decisions\/waiting\/old\.md/.test(e.message)
      && /docs\/decisions\/waiting\/new\.md/.test(e.message),
  );
});

test('publish: Fix 1 — a rename onto last-render.md still counts as dirty (the source path is not exempt)', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => 'R  docs/decisions/foo.md -> docs/decisions/last-render.md\n' },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7 && /docs\/decisions\/foo\.md/.test(e.message),
  );
});

test('publish: Fix 1 — a rename from last-render.md still counts as dirty (the destination path is not exempt)', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    gitOverrides: { status: () => 'R  docs/decisions/last-render.md -> docs/decisions/bar.md\n' },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 7 && /docs\/decisions\/bar\.md/.test(e.message),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 8: the non-fast-forward rebase retry, and its second-failure exit 6
// ─────────────────────────────────────────────────────────────────────────────

/** Simulates notion.js: the first `readPage` call returns `freshPage`; every later call returns
 * whatever `replaceMd` most recently received (a fresh readback of what was actually written). */
function wireNotion(freshPage) {
  let written = freshPage;
  let reads = 0;
  return {
    readPage: async () => { reads += 1; return reads === 1 ? freshPage : written; },
    replaceMd: async (_page, md) => { written = md; },
  };
}

test('publish: a non-fast-forward push retries once (fetch, rebase, push) and succeeds', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  let pushAttempts = 0;
  const { readPage, replaceMd } = wireNotion(PAGE_NO_INPUT);
  const { deps, calls } = baseDeps({
    files,
    readPage,
    replaceMd,
    gitOverrides: {
      push: () => {
        pushAttempts += 1;
        if (pushAttempts === 1) throw new Error('non-fast-forward');
        return '';
      },
    },
  });
  const result = await publish({ repo: REPO, page: 'PAGE' }, deps);
  assert.equal(result.code, 0);
  assert.equal(pushAttempts, 2);
  assert.ok(calls.some((c) => c[0] === 'fetch'));
  assert.ok(calls.some((c) => c[0] === 'rebase'));
});

test('publish: a second push failure is exit 6, and the commit is left on render/last-<ISO>', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { readPage, replaceMd } = wireNotion(PAGE_NO_INPUT);
  const { deps, calls } = baseDeps({
    files,
    readPage,
    replaceMd,
    gitOverrides: {
      push: () => { throw new Error('non-fast-forward, always'); },
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 6 && /render\/last-/.test(e.message),
  );
  assert.ok(calls.some((c) => c[0] === 'branch' && /^render\/last-/.test(c[1])));
});

// Review round-2 F5: an ISO timestamp's `:`/`.` are not valid in a git ref, a conflicted rebase
// must be aborted, and the exit-6 message must only claim the branch exists once it actually does.
test('publish: F5 — a conflicted rebase is aborted, the parking branch name is sanitised, and the message only claims it once it exists', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { readPage, replaceMd } = wireNotion(PAGE_NO_INPUT);
  let rebaseAborted = false;
  const { deps, calls } = baseDeps({
    files,
    readPage,
    replaceMd,
    gitOverrides: {
      push: () => { throw new Error('non-fast-forward, always'); },
      rebase: (args) => {
        if (args[1] === '--abort') { rebaseAborted = true; return ''; }
        throw new Error('CONFLICT (content): last-render.md');
      },
      branch: (args) => {
        const name = args[1];
        if (/[:~^?*[\\ ]|\.\.|@\{/.test(name)) throw new Error(`fatal: '${name}' is not a valid branch name`);
        return '';
      },
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 6 && /render\/last-2026-09-27T19-00-00-000Z/.test(e.message),
  );
  assert.equal(rebaseAborted, true, 'rebase --abort must run before the branch is created');
  const branchCall = calls.find((c) => c[0] === 'branch');
  assert.ok(branchCall, 'a branch call was made');
  assert.equal(branchCall[1], 'render/last-2026-09-27T19-00-00-000Z');
});

// ─────────────────────────────────────────────────────────────────────────────
// F6: a pre-write guard requires an up-to-date main checkout before any Notion write
// ─────────────────────────────────────────────────────────────────────────────

test('publish: F6 — refuses (exit 2) before any Notion write when the checkout is not on main', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  let replaceMdCalled = false;
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    replaceMd: async () => { replaceMdCalled = true; },
    gitOverrides: {
      'rev-parse': (args) => (args.includes('--abbrev-ref') ? 'build/decisions-render-1' : 'sha-fixed'),
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 2 && /not main/.test(e.message),
  );
  assert.equal(replaceMdCalled, false);
});

test('publish: F6 — refuses (exit 2) when HEAD is not origin/main (unpushed local commits)', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  let replaceMdCalled = false;
  let nonAbbrevCalls = 0;
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    replaceMd: async () => { replaceMdCalled = true; },
    gitOverrides: {
      'rev-parse': (args) => {
        if (args.includes('--abbrev-ref')) return 'main';
        nonAbbrevCalls += 1;
        return nonAbbrevCalls === 1 ? 'local-only-sha' : 'origin-main-sha';
      },
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 2 && /HEAD is not origin\/main/.test(e.message),
  );
  assert.equal(replaceMdCalled, false);
});

test('publish --adopt-live: F6 — the same pre-write guard applies to --adopt-live', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const driftedLive = PAGE_NO_INPUT.replace('Text.', 'Different live text.');
  const { deps, calls } = baseDeps({
    files,
    readPage: async () => driftedLive,
    gitOverrides: {
      'rev-parse': (args) => (args.includes('--abbrev-ref') ? 'not-main' : 'sha-fixed'),
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', adoptLive: true }, deps),
    (e) => e instanceof PublishError && e.code === 2,
  );
  assert.equal(calls.some((c) => c[0] === 'commit'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// F4: the replace-md backup path is captured, logged, and used to catch a mid-flight edit
// ─────────────────────────────────────────────────────────────────────────────

test('publish: F4 — a backup that does not match the fresh read (a mid-flight edit) is exit 5 before readback', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const backupPath = '/backups/PAGE/2026-09-27T18-59-00.md';
  const { deps } = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    replaceMd: async () => ({ backupFile: backupPath }),
  });
  const baseReadFile = deps.readFile;
  deps.readFile = (f) => (f === backupPath ? 'A DIFFERENT page — someone edited between step 1 and step 5' : baseReadFile(f));
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 5 && /changed between the fresh read/.test(e.message),
  );
});

test('publish: F4 — a backup that matches the fresh read is logged and does not block the publish', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const backupPath = '/backups/PAGE/2026-09-27T18-59-00.md';
  const writes = [];
  const { readPage, replaceMd: baseReplaceMd } = wireNotion(PAGE_NO_INPUT);
  const { deps } = baseDeps({
    files,
    readPage,
    replaceMd: async (pg, md) => { await baseReplaceMd(pg, md); return { backupFile: backupPath }; },
    deps: { write: (s) => writes.push(s) },
  });
  const baseReadFile = deps.readFile;
  deps.readFile = (f) => (f === backupPath ? PAGE_NO_INPUT : baseReadFile(f));
  const result = await publish({ repo: REPO, page: 'PAGE' }, deps);
  assert.equal(result.code, 0);
  assert.ok(writes.some((w) => w.includes(backupPath)));
});

// ─────────────────────────────────────────────────────────────────────────────
// M4: a step 7 retitle failure does not block step 8
// ─────────────────────────────────────────────────────────────────────────────

test('publish: M4 — a step 7 retitle failure still runs step 8 (commit/push happen), then reports the failure', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { readPage, replaceMd } = wireNotion(PAGE_NO_INPUT);
  const { deps, calls } = baseDeps({
    files,
    readPage,
    replaceMd,
    titleSet: async () => { throw new Error('decisions-title.mjs set exited 1'); },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => /decisions-title\.mjs set failed/.test(e.message),
  );
  assert.ok(calls.some((c) => c[0] === 'commit'), 'step 8 must still commit last-render.md');
  assert.ok(calls.some((c) => c[0] === 'push'), 'step 8 must still push');
});

// ─────────────────────────────────────────────────────────────────────────────
// M10: an empty (byte-identical) republish never falls through to a bare exit 1
// ─────────────────────────────────────────────────────────────────────────────

test('publish: M10 — a republish whose readback is byte-identical to last-render.md skips commit/push', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { readPage, replaceMd } = wireNotion(PAGE_NO_INPUT);
  const { deps, calls } = baseDeps({
    files,
    readPage,
    replaceMd,
    gitOverrides: {
      diff: () => '', // does NOT throw: "no staged difference"
    },
  });
  const result = await publish({ repo: REPO, page: 'PAGE' }, deps);
  assert.equal(result.code, 0);
  assert.equal(calls.some((c) => c[0] === 'commit'), false);
  assert.equal(calls.some((c) => c[0] === 'push'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 6: readback verification failure -> exit 5
// ─────────────────────────────────────────────────────────────────────────────

test('publish: a readback that does not match the render is exit 5', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  let readCount = 0;
  const { deps } = baseDeps({
    files,
    readPage: async () => {
      readCount += 1;
      if (readCount === 1) return PAGE_NO_INPUT; // step 1: fresh read, no drift
      return 'garbage that does not parse as a decisions page shape at all really not';
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 5,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 (lane 72b): Notion rewrites a `www.notion.so/<id>` link to `app.notion.com/p/<id>` on write
// ─────────────────────────────────────────────────────────────────────────────

function waitingItem(title) {
  return [
    '<details>',
    `<summary>**${title}**</summary>`,
    '\tEvidence: the queue outgrew memory twice this month.',
    '\t- [ ] Cap at 200 per run (recommended)',
    '\t- [ ] Run uncapped',
    '\tDefault after 2030-06-15 18:00 -04:00: cap at 200 items per run',
    '\t<empty-block/>',
    '</details>',
  ].join('\n');
}

/** Simulates notion.js as the live page behaved after lane 72: the first `readPage` returns
 * `freshPage`; every later read returns what `replaceMd` last received WITH Notion's own link
 * rewrite applied (not the text verbatim). `mutate` lets a test change one more line. */
function wireRewritingNotion(freshPage, mutate = (t) => t) {
  let written = freshPage;
  let reads = 0;
  const rewrite = (md) => mutate(md
    .replace(/https:\/\/(?:www\.)?notion\.so\/([0-9a-f]{32})/g, 'https://app.notion.com/p/$1')
    .replace(/(\t<\/details>)\n\n/g, '$1\n'));
  return {
    readPage: async () => { reads += 1; return reads === 1 ? freshPage : rewrite(written); },
    replaceMd: async (_page, md) => { written = md; },
    writtenText: () => written,
  };
}

test('publish (lane 72b): a page carrying the Goals page link reads back through the Notion link rewrite and is exit 0', async () => {
  const files = baseFiles({
    [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT,
    [p('docs', 'decisions', 'waiting', 'a-item.md')]: waitingItem('Cap the nightly batch at 200 items or run it uncapped'),
    [p('docs', 'decisions', 'waiting', 'b-item.md')]: waitingItem('Keep the old export format or drop it'),
  });
  const notion = wireRewritingNotion(PAGE_NO_INPUT);
  const { deps, fsMap } = baseDeps({ files, readPage: notion.readPage, replaceMd: notion.replaceMd });
  const result = await publish({ repo: REPO, page: 'PAGE' }, deps);
  assert.equal(result.code, 0);
  const written = notion.writtenText();
  assert.ok(written.includes('\t</details>\n\n\t<details>'), 'the fixture exercises the blank separator between indented Waiting items');
  assert.match(written, /\[Goals page\]\(https:\/\/[^)]+\/3e3da11277a1813cb326c42ed97a1d5d\)/, 'the Bearings toggle carries the Goals page link');
  const lastRender = fsMap.get(p('docs', 'decisions', 'last-render.md'));
  assert.equal(normalize(lastRender), normalize(written), 'last-render.md is the readback, equal to the written text after normalisation');
  assert.ok(lastRender.includes('https://app.notion.com/p/3e3da11277a1813cb326c42ed97a1d5d'), 'last-render.md holds the readback form of the link');
});

test('publish (lane 72b): the same rewriting Notion with ONE genuinely different content line is still exit 5', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const notion = wireRewritingNotion(PAGE_NO_INPUT, (t) => t.replace('Netcup every 15 minutes', 'Netcup every 16 minutes'));
  const { deps, fsMap } = baseDeps({ files, readPage: notion.readPage, replaceMd: notion.replaceMd });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE' }, deps),
    (e) => e instanceof PublishError && e.code === 5,
  );
  assert.match(notion.writtenText(), /Netcup every 15 minutes/, 'the planted difference is in the readback, not the render');
  assert.equal(fsMap.get(p('docs', 'decisions', 'last-render.md')), PAGE_NO_INPUT, 'last-render.md is not advanced on a readback failure');
});

// ─────────────────────────────────────────────────────────────────────────────
// --clear-done: since: set only by --clear-done, verbatim history check, mismatch naming
// ─────────────────────────────────────────────────────────────────────────────

function pageWithComment(comment) {
  return [
    '<details>',
    '<summary>**A decision**</summary>',
    '\t- [ ] Option one',
    `\t\\*\\* ${comment}`,
    '\tDefault after 2030-01-01 00:00 -05:00: Option one',
    '</details>',
    '- [x] Done',
  ].join('\n');
}

/** Review round-2 F1: the ONLY page shape `last-render.md` can ever actually hold in production —
 * a clean render, never Ben's input (that only ever lives in the fresh Notion read). Every
 * `--clear-done` test below drifts the fresh read from THIS, never the other way around. */
const CLEAN_PAGE_WITH_DECISION = [
  '<details>',
  '<summary>**A decision**</summary>',
  '\t- [ ] Option one',
  '\tDefault after 2030-01-01 00:00 -05:00: Option one',
  '</details>',
  '- [ ] Done',
].join('\n');

/** Review round-2 F2: today's history file and every waiting item are read via `git show
 * origin/main:<path>`, never the working tree — this maps those exact ref:path keys the
 * production code builds to fixture text. */
function showOverride(map) {
  return (args) => {
    const ref = args[1];
    if (!(ref in map)) { throw new Error(`fatal: no such ref/path: ${ref}`); }
    return map[ref];
  };
}

test('publish --clear-done: with no captured pickup round at all, exit 3', async () => {
  const live = pageWithComment('please look at this');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: live });
  const { deps } = baseDeps({ files, readPage: async () => live, readPickupCapture: async () => null });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /no captured pickup round/.test(e.message),
  );
});

test('publish --clear-done: a captured round whose owner inputs do not match the fresh read is exit 3, naming the difference', async () => {
  const live = pageWithComment('please look at this');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: live });
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'a totally different note']] }),
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /do not match the fresh read/.test(e.message),
  );
});

test('publish --clear-done: matching capture but the owner text is missing from today\'s history and every waiting item is exit 3', async () => {
  const live = pageWithComment('please look at this');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'please look at this']] }),
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /not present verbatim/.test(e.message),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 58: an ACCOUNTED round (Done not yet cleared) can still back --clear-done, through the
// real defaultReadPickupCapture wired to a fake `pickup` module (never a bare injected object) —
// so these exercise the actual read-layer acceptance, not just publish()'s own multiset check.
// ─────────────────────────────────────────────────────────────────────────────

test('publish --clear-done: an ACCOUNTED round whose Done is still checked and whose triples match proceeds, clearing Done', async () => {
  const live = pageWithComment('please look at this');
  const historyWithAnswer = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
    + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 1, captureReadAt: '2026-09-27T19:05:00Z' } }),
    openPrivateCapture: () => Buffer.from(live, 'utf8'),
  };
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: (ctx) => defaultReadPickupCapture(ctx, { pickup }),
    gitOverrides: {
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': historyWithAnswer }),
    },
  });
  const result = await publish({
    repo: REPO, page: 'PAGE', clearDone: true, dryRun: true,
  }, deps);
  assert.equal(result.code, 0);
  assert.match(result.rendered, /- \[ \] Done \(last cleared: Sep 27, 2026, 3:00 PM America\/New_York\)/);
});

test('publish --clear-done: an ACCOUNTED round with Done unchecked on the fresh page is exit 3', async () => {
  const live = pageWithComment('please look at this').replace('- [x] Done', '- [ ] Done');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 1 } }),
    openPrivateCapture: () => Buffer.from(pageWithComment('please look at this'), 'utf8'),
  };
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: (ctx) => defaultReadPickupCapture(ctx, { pickup }),
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /Done.*checked/i.test(e.message),
  );
});

test('publish --clear-done: an ACCOUNTED round whose captured triples differ from the fresh read is exit 3, naming the difference', async () => {
  const live = pageWithComment('please look at this');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 1 } }),
    openPrivateCapture: () => Buffer.from(pageWithComment('a totally different note'), 'utf8'),
  };
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: (ctx) => defaultReadPickupCapture(ctx, { pickup }),
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /do not match the fresh read/.test(e.message),
  );
});

test('publish --clear-done: an ACCOUNTED round whose Done was cleared and then re-checked with the same inputs is exit 3 (a new hand-back, not that round)', async () => {
  const OLD = 'Done (last cleared: Sep 27, 2026, 1:00 PM America/New_York)';
  const NEW = 'Done (last cleared: Sep 27, 2026, 2:10 PM America/New_York)';
  const captured = pageWithComment('please look at this').replace('- [x] Done', `- [x] ${OLD}`);
  const live = pageWithComment('please look at this').replace('- [x] Done', `- [x] ${NEW}`);
  const historyWithAnswer = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
    + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION.replace('- [ ] Done', `- [ ] ${NEW}`) });
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 1, captureReadAt: '2026-09-27T17:05:00Z' } }),
    openPrivateCapture: () => Buffer.from(captured, 'utf8'),
  };
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: (ctx) => defaultReadPickupCapture(ctx, { pickup }),
    gitOverrides: { show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': historyWithAnswer }) },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true, dryRun: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /Done line/.test(e.message),
  );
});

test('publish --clear-done: happy path — verbatim text in today\'s history file, since: set from the round\'s tick time, Done cleared with a timestamp', async () => {
  // Review round-2 F1 (probe5): last-render.md is the clean, PRE-input render; the fresh read is
  // that page plus Ben's lines (a comment and a ticked Done) — the only shape a real round ever
  // has. This must reach step 4 and render, not exit 4.
  const live = pageWithComment('please look at this');
  const historyWithAnswer = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
    + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const { deps, fsMap } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'please look at this']] }),
    gitOverrides: {
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': historyWithAnswer }),
    },
  });
  const result = await publish({
    repo: REPO, page: 'PAGE', clearDone: true, dryRun: true,
  }, deps);
  assert.equal(result.code, 0);
  assert.match(result.rendered, /- \[ \] Done \(last cleared: Sep 27, 2026, 3:00 PM America\/New_York\)/);
});

test('publish --clear-done: a fresh read with Ben\'s lines PLUS one other edited line still exits 4', async () => {
  // Review round-2 F1: the drift check must revert exactly the owner-input lines step 2 captured
  // and nothing else — any other change (here, "Option one" renamed) must still trip drift.
  const live = pageWithComment('please look at this').replace('Option one', 'Option ONE, RENAMED');
  const historyWithAnswer = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
    + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'please look at this']] }),
    gitOverrides: {
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': historyWithAnswer }),
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true, owner: 'skills-fable' }, deps),
    (e) => e instanceof PublishError && e.code === 4,
  );
});

test('publish --clear-done: F2 — a short comment must be quoted verbatim, never pass as a substring of unrelated prose ("no" inside "note")', async () => {
  const live = pageWithComment('no');
  const historyNoQuote = '# Sep 27, 2026\nSummary: a note about something else entirely.\n- some bullet\n';
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'no']] }),
    gitOverrides: { show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': historyNoQuote }) },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /not present verbatim/.test(e.message),
  );
});

function pageWithTick() {
  return [
    '<details>',
    '<summary>**A decision**</summary>',
    '\t- [x] Option B',
    '\t- [ ] Option A',
    '\tDefault after 2030-01-01 00:00 -05:00: Option A',
    '</details>',
    '- [x] Done',
  ].join('\n');
}

const CLEAN_PAGE_WITH_TICK_DECISION = [
  '<details>',
  '<summary>**A decision**</summary>',
  '\t- [ ] Option B',
  '\t- [ ] Option A',
  '\tDefault after 2030-01-01 00:00 -05:00: Option A',
  '</details>',
  '- [ ] Done',
].join('\n');

test('publish --clear-done: F2 — a tick must not pass merely because its own (unticked) option line still exists in its waiting item', async () => {
  const live = pageWithTick();
  const waitingItemText = [
    '<details>',
    '<summary>**A decision**</summary>',
    '\t- [ ] Option B',
    '\t- [ ] Option A',
    '\tDefault after 2030-01-01 00:00 -05:00: Option A',
    '</details>',
  ].join('\n');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_TICK_DECISION });
  const { deps } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['selection', 'A decision', 'Option B']] }),
    gitOverrides: {
      'ls-tree': (args) => (args.includes('-r') ? 'docs/decisions/waiting/2026-09-20-a.md' : args[args.length - 1]),
      show: showOverride({ 'origin/main:docs/decisions/waiting/2026-09-20-a.md': waitingItemText }),
    },
  });
  await assert.rejects(
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
    (e) => e instanceof PublishError && e.code === 3 && /not present verbatim/.test(e.message),
  );
});

test('publish --adopt-live --clear-done: refused outright (exit 2) — adopt-live cannot also clear Done', async () => {
  const live = pageWithComment('please look at this');
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const { deps } = baseDeps({ files, readPage: async () => live });
  await assert.rejects(
    publish({
      repo: REPO, page: 'PAGE', clearDone: true, adoptLive: true,
    }, deps),
    (e) => e instanceof PublishError && e.code === 2 && /cannot be combined/.test(e.message),
  );
});

test('publish: since: is set only under --clear-done — an ordinary publish never rewrites session.md', async () => {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT });
  const { readPage, replaceMd } = wireNotion(PAGE_NO_INPUT);
  const { deps, calls } = baseDeps({
    files, readPage, replaceMd,
  });
  await publish({ repo: REPO, page: 'PAGE' }, deps);
  assert.equal(calls.some((c) => c[0] === 'add' && c.includes('docs/decisions/session.md')), false);
});

test('publish --clear-done: the accepted round\'s commit adds session.md alongside last-render.md', async () => {
  const accounted = [];
  const live = pageWithComment('please look at this');
  const historyWithAnswer = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
    + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const { readPage, replaceMd } = wireNotion(live);
  const { deps, calls, fsMap } = baseDeps({
    files,
    readPage,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'please look at this']] }),
    replaceMd,
    gitOverrides: {
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': historyWithAnswer }),
    },
    deps: { accountRound: async (ctx) => { accounted.push(ctx); } },
  });
  const result = await publish({ repo: REPO, page: 'PAGE', clearDone: true, owner: 'skills-fable' }, deps);
  assert.equal(result.code, 0);
  assert.equal(accounted.length, 1, 'a non-accounted round is accounted by the same publish that clears Done');
  assert.ok(calls.some((c) => c[0] === 'add' && c.includes('docs/decisions/session.md')));
  assert.match(fsMap.get(p('docs', 'decisions', 'session.md')), /^since: 2026-09-27T19:05:00Z/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 39: the render's page-lint call covers publish. publish() hands render() no kill-switch
// path, so these tests point HOME at an empty temp dir for their duration, the way the sealed
// runner does, and a machine's real ~/.agents/no-page-lint can never make them pass or fail.
// ─────────────────────────────────────────────────────────────────────────────

const PLANTED_SESSION = 'since: 2026-09-27T18:16:00Z\n- The collector runs on Netcup every 15 minutes.\n- Written by Claude Code';

async function withEmptyHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-lint-home-'));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

function plantedPublish(extra = {}) {
  const files = baseFiles({
    [p('docs', 'decisions', 'last-render.md')]: PAGE_NO_INPUT,
    [p('docs', 'decisions', 'session.md')]: PLANTED_SESSION,
  });
  let replaceCalls = 0;
  const built = baseDeps({
    files,
    readPage: async () => PAGE_NO_INPUT,
    replaceMd: async () => { replaceCalls += 1; },
    ...extra,
  });
  return { ...built, replaceCount: () => replaceCalls };
}

test('page-lint: publish with a planted byline is refused before any Notion write', async () => {
  await withEmptyHome(async () => {
    const { deps, replaceCount } = plantedPublish();
    await assert.rejects(
      publish({ repo: REPO, page: 'PAGE' }, deps),
      (e) => e instanceof RefusedError && /page-lint: no-byline composed-page:\d+/.test(e.message),
    );
    assert.equal(replaceCount(), 0, 'replaceMd must never be called');
  });
});

test('page-lint: publish --dry-run with a planted byline is refused too, and prints no page', async () => {
  await withEmptyHome(async () => {
    const { deps, replaceCount } = plantedPublish();
    const printed = [];
    deps.write = (s) => printed.push(s);
    await assert.rejects(
      publish({ repo: REPO, page: 'PAGE', dryRun: true }, deps),
      (e) => e instanceof RefusedError && /no-byline/.test(e.message),
    );
    assert.equal(replaceCount(), 0);
    assert.equal(printed.join(''), '');
  });
});

test('page-lint: CLI run() publish --dry-run exits 2 naming no-byline', async () => {
  await withEmptyHome(async () => {
    const { deps } = plantedPublish();
    const err = [];
    const code = await run({
      argv: ['publish', '--repo', REPO, '--page', 'PAGE', '--dry-run'], write: () => {}, writeErr: (s) => err.push(s), deps,
    });
    assert.equal(code, 2);
    assert.match(err.join(''), /page-lint: no-byline composed-page:/);
  });
});

test('page-lint: the same publish with the kill switch present goes through and logs the skip', async () => {
  await withEmptyHome(async () => {
    fs.mkdirSync(path.join(os.homedir(), '.agents'), { recursive: true });
    fs.writeFileSync(path.join(os.homedir(), '.agents', 'no-page-lint'), '');
    const { deps, replaceCount } = plantedPublish();
    const stderr = process.stderr.write.bind(process.stderr);
    const seen = [];
    process.stderr.write = (s, ...rest) => { seen.push(String(s)); return typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1]() : true; };
    try {
      await publish({ repo: REPO, page: 'PAGE', dryRun: true }, deps);
    } finally {
      process.stderr.write = stderr;
    }
    assert.equal(replaceCount(), 0);
    assert.ok(seen.some((l) => /page-lint skipped, kill switch/.test(l)), seen.join(''));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 64: one step (clear Done + account) and the stuck round admitted by history.
// ─────────────────────────────────────────────────────────────────────────────

const STUCK_REASON = 'checked page bytes changed during the active round';

test('defaultReadPickupCapture (lane 64): a stuck-by-changed-bytes NEEDS_RECONCILIATION round with intact evidence is returned, tagged reconciling', async () => {
  const pickup = {
    status: () => ({
      status: 'NEEDS_RECONCILIATION',
      evidenceIntegrity: { status: 'OK' },
      receipt: { state: 'NEEDS_RECONCILIATION', round: 3, reconciliationReason: STUCK_REASON, captureReadAt: '2026-09-30T23:00:00Z' },
    }),
    openPrivateCapture: () => Buffer.from(pageWithComment('hello'), 'utf8'),
  };
  assert.deepEqual(await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup }), {
    round: 3, tickAt: '2026-09-30T23:00:00Z', triples: [['comment', 'A decision', 'hello']], reconciling: true,
  });
});

test('defaultReadPickupCapture (lane 64 F1): an ACCOUNTED round admitted from NEEDS_RECONCILIATION is tagged accounted and reconciling', async () => {
  const pickup = {
    status: () => ({
      status: 'ACCOUNTED',
      receipt: { state: 'ACCOUNTED', accountedFrom: 'NEEDS_RECONCILIATION', round: 3, captureReadAt: '2026-09-30T23:00:00Z', observedUncheckedAt: null },
    }),
    openPrivateCapture: () => Buffer.from(pageWithComment('hello'), 'utf8'),
  };
  const capture = await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup });
  assert.equal(capture.accounted, true);
  assert.equal(capture.reconciling, true);
  const plain = { ...pickup, status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 3, observedUncheckedAt: null } }) };
  assert.equal((await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup: plain })).reconciling, undefined);
});

test('defaultReadPickupCapture (lane 64): any other NEEDS_RECONCILIATION shape stays refused and never opens the capture', async () => {
  for (const [name, receipt, evidenceIntegrity] of [
    ['a different reason', { state: 'NEEDS_RECONCILIATION', round: 3, reconciliationReason: 'the saved note id exists with conflicting envelope fields' }, { status: 'OK' }],
    ['broken evidence', { state: 'NEEDS_RECONCILIATION', round: 3, reconciliationReason: STUCK_REASON }, { status: 'CAPTURE_INVALID' }],
    ['no evidence verdict', { state: 'NEEDS_RECONCILIATION', round: 3, reconciliationReason: STUCK_REASON }, undefined],
  ]) {
    let opened = false;
    const pickup = {
      status: () => ({ status: 'NEEDS_RECONCILIATION', evidenceIntegrity, receipt }),
      openPrivateCapture: () => { opened = true; return Buffer.from(pageWithComment('hello'), 'utf8'); },
    };
    assert.equal(await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup }), null, name);
    assert.equal(opened, false, name);
  }
});

const HISTORY_ANSWER = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
  + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';

function clearDoneHarness({
  capture, accountRound, gitOverrides, owner = 'skills-fable', dryRun = false, live = pageWithComment('please look at this'),
}) {
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: CLEAN_PAGE_WITH_DECISION });
  const { readPage, replaceMd: innerReplace } = wireNotion(live);
  const order = [];
  const built = baseDeps({
    files,
    readPage,
    replaceMd: async (...args) => { order.push('replaceMd'); return innerReplace(...args); },
    readPickupCapture: async () => capture,
    gitOverrides: gitOverrides ?? { show: showOverride({ 'origin/main:docs/decisions/history/2026-09-27.md': HISTORY_ANSWER }) },
    deps: { accountRound: async (ctx) => { order.push('accountRound'); return accountRound(ctx); } },
  });
  const runIt = () => publish({
    repo: REPO, page: 'PAGE', clearDone: true, dryRun, ...(owner ? { owner } : {}),
  }, built.deps);
  return { run: runIt, order, ...built };
}

const RECORDED_CAPTURE = { round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'please look at this']] };

test('publish --clear-done (lane 64): accounts the round once, with the running lead, BEFORE the page is written', async () => {
  const seen = [];
  const h = clearDoneHarness({ capture: RECORDED_CAPTURE, owner: 'skills-fable', accountRound: async (ctx) => { seen.push(ctx); } });
  const result = await h.run();
  assert.equal(result.code, 0);
  assert.deepEqual(h.order, ['accountRound', 'replaceMd']);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].repo, REPO);
  assert.equal(seen[0].page, 'PAGE');
  assert.equal(seen[0].owner, 'skills-fable');
  assert.match(seen[0].reconciliation, /publish --clear-done at 2026-09-27T19:00:00\.000Z: the 1 owner input\(s\)/);
});

test('publish --clear-done (lane 64 F3): a step that would account the round refuses without --owner (exit 2), before any write', async () => {
  const h = clearDoneHarness({ capture: RECORDED_CAPTURE, owner: null, accountRound: async () => { throw new Error('must not run'); } });
  await assert.rejects(h.run(), (e) => e instanceof PublishError && e.code === 2 && /pass --owner/.test(e.message));
  assert.deepEqual(h.order, []);
});

test('publish --clear-done (lane 64 F2): a stale older-day quote of a short answer does not close a round whose new answers are unrecorded', async () => {
  const once = pageWithComment('yes');
  const live = once.replace('\t\\*\\* yes', '\t\\*\\* yes\n\t\\*\\* yes');
  assert.notEqual(live, once);
  const stale = '# Sep 23, 2026\nSummary: unrelated.\n- Ben wrote "yes" about something else, and "old answer".\n';
  const h = clearDoneHarness({
    live,
    capture: { ...RECORDED_CAPTURE, triples: [['comment', 'A decision', 'old answer']], reconciling: true },
    gitOverrides: {
      'ls-tree': () => 'docs/decisions/history/2026-09-23.md',
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-23.md': stale }),
    },
    accountRound: async () => {},
  });
  await assert.rejects(
    h.run(),
    (e) => e instanceof PublishError && e.code === 3 && /not every owner input is quoted/.test(e.message),
  );
  assert.deepEqual(h.order, []);
});

test('publish --clear-done (lane 64 F1): an ACCOUNTED-from-reconciliation round is compared as reconciling, not by equality with its original capture', async () => {
  const live = pageWithComment('a different answer');
  const older = '# Sep 26, 2026\nSummary: recorded.\n- Ben wrote "a different answer" and "please look at this".\n';
  const h = clearDoneHarness({
    live,
    capture: { ...RECORDED_CAPTURE, accounted: true, doneLabel: 'Done', reconciling: true },
    gitOverrides: {
      'ls-tree': () => 'docs/decisions/history/2026-09-26.md',
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-26.md': older }),
    },
    accountRound: async () => { throw new Error('must not run'); },
  });
  assert.equal((await h.run()).code, 0);
  assert.deepEqual(h.order, ['replaceMd']);
});

test('publish --clear-done (lane 64): a refusal to account stops the publish before any page write (exit 3)', async () => {
  const h = clearDoneHarness({ capture: RECORDED_CAPTURE, accountRound: async () => { throw new Error('cannot account a round outside RECORDED'); } });
  await assert.rejects(
    h.run(),
    (e) => e instanceof PublishError && e.code === 3 && /could not be accounted, so Done was not cleared: cannot account a round outside RECORDED/.test(e.message),
  );
  assert.deepEqual(h.order, ['accountRound']);
  assert.equal(h.calls.some((c) => c[0] === 'add' || c[0] === 'commit' || c[0] === 'push'), false);
});

test('publish --clear-done (lane 64): --dry-run never accounts', async () => {
  const h = clearDoneHarness({ capture: RECORDED_CAPTURE, dryRun: true, accountRound: async () => { throw new Error('must not run'); } });
  assert.equal((await h.run()).code, 0);
  assert.deepEqual(h.order, []);
});

test('publish --clear-done (lane 64): an already-ACCOUNTED round is not accounted a second time', async () => {
  const h = clearDoneHarness({
    capture: { ...RECORDED_CAPTURE, accounted: true, doneLabel: 'Done' },
    accountRound: async () => { throw new Error('must not run'); },
  });
  assert.equal((await h.run()).code, 0);
  assert.deepEqual(h.order, ['replaceMd']);
});

test('publish --clear-done (lane 64): a stuck round is admitted when every input is quoted in an older day of history, and accounted', async () => {
  const live = pageWithComment('a different answer');
  const older = '# Sep 26, 2026\nSummary: the answers are recorded.\n- Ben wrote "a different answer", and "please look at this" earlier.\n';
  const h = clearDoneHarness({
    live,
    capture: { ...RECORDED_CAPTURE, reconciling: true },
    gitOverrides: {
      'ls-tree': () => 'docs/decisions/history/2026-09-26.md',
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-26.md': older }),
    },
    accountRound: async () => {},
  });
  assert.equal((await h.run()).code, 0);
  assert.deepEqual(h.order, ['accountRound', 'replaceMd']);
});

test('publish --clear-done (lane 64): a stuck round with an input quoted nowhere stays refused, naming it (exit 3)', async () => {
  const live = pageWithComment('a different answer');
  const h = clearDoneHarness({
    live,
    capture: { ...RECORDED_CAPTURE, reconciling: true },
    gitOverrides: {
      'ls-tree': () => 'docs/decisions/history/2026-09-26.md',
      show: showOverride({ 'origin/main:docs/decisions/history/2026-09-26.md': '# Sep 26, 2026\nSummary: x.\n- Ben wrote "please look at this".\n' }),
    },
    accountRound: async () => {},
  });
  await assert.rejects(
    h.run(),
    (e) => e instanceof PublishError && e.code === 3 && /not every owner input is quoted/.test(e.message) && e.message.includes('a different answer'),
  );
  assert.deepEqual(h.order, []);
});

test('defaultAccountRound (lane 64): calls the pickup closeRound with the lead, the reconciliation text and the clock', async () => {
  const calls = [];
  const pickup = { closeRound: (opts, deps) => { calls.push([opts, deps]); return { status: 'ACCOUNTED' }; } };
  const now = new Date('2026-09-27T19:00:00Z');
  await defaultAccountRound({ repo: REPO, page: 'PAGE', owner: 'skills-fable', reconciliation: 'r', now }, { pickup });
  await defaultAccountRound({ repo: REPO, page: 'PAGE', owner: null, reconciliation: 'r' }, { pickup });
  assert.deepEqual(calls[0], [{ repo: REPO, page: 'PAGE', owner: 'skills-fable', reconciliation: 'r' }, { now }]);
  assert.deepEqual(calls[1], [{ repo: REPO, page: 'PAGE', reconciliation: 'r' }, {}]);
});

test('defaultAccountRound (lane 64 F6): forwards the fresh page triples so the pickup can refuse an uncaptured page', async () => {
  const calls = [];
  const pickup = { closeRound: (opts, deps) => { calls.push([opts, deps]); return { status: 'ACCOUNTED' }; } };
  const freshInputs = [['comment', 'Leftover folders', 'and the temp dirs under scratch too']];
  await defaultAccountRound({ repo: REPO, page: 'PAGE', owner: 'skills-fable', reconciliation: 'r', freshInputs }, { pickup });
  assert.deepEqual(calls[0], [{ repo: REPO, page: 'PAGE', owner: 'skills-fable', reconciliation: 'r', freshInputs }, {}]);
});

test('CLI run() (lane 64): --owner is an accepted publish argument, not an unrecognized one', async () => {
  const errors = [];
  const code = await run({
    argv: ['publish', '--repo', REPO, '--page', 'PAGE', '--clear-done', '--dry-run', '--owner', 'skills-fable'],
    write: () => {},
    writeErr: (s) => errors.push(s),
    deps: { readPage: async () => { throw new Error('stop after argument parsing'); } },
  });
  assert.equal(code, 1);
  assert.equal(errors.join('').includes('unrecognized argument'), false);
  assert.match(errors.join(''), /stop after argument parsing/);
});
