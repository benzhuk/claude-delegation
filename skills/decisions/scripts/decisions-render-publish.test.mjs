// node scripts/run-tests.mjs skills/decisions/scripts/decisions-render-publish.test.mjs
// decisions-render-publish: the publish() 8-step pipeline. notion.js, decisions-title.mjs and the
// pickup status read are ALWAYS injected fakes here — this file never calls Notion or pushes.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  publish, PublishError, ownerInputTriples, hasOwnerInput, multisetsEqual, defaultReadPickupCapture,
} from './decisions-render-publish.mjs';
import { normalize } from './decisions-render-core.mjs';
import { parseDocument } from './decisions-read.mjs';

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
  '# Waiting on you now',
  'Nothing right now.',
  '# What is going on',
  'Text.',
  '# History {toggle="true"}',
  '\t<empty-block/>',
  '<callout icon="x">note</callout>',
  '- [ ] Done',
  '<empty-block/>',
].join('\n');

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

test('defaultReadPickupCapture: an ACCOUNTED wrapper (round already closed out) yields null and never opens the private capture', async () => {
  const pickup = {
    status: () => ({ status: 'ACCOUNTED', receipt: { state: 'ACCOUNTED', round: 4 } }),
    openPrivateCapture: () => { throw new Error('must not be called once status is rejected'); },
  };
  const capture = await defaultReadPickupCapture({ repo: REPO, page: 'PAGE' }, { pickup });
  assert.equal(capture, null);
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
  assert.match(result.rendered, /^# Waiting on you now/);
  assert.match(result.rendered, /- \[ \] Done\n/); // step 4 copied the fresh (unticked) Done verbatim
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
    publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps),
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
  });
  const result = await publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps);
  assert.equal(result.code, 0);
  assert.ok(calls.some((c) => c[0] === 'add' && c.includes('docs/decisions/session.md')));
  assert.match(fsMap.get(p('docs', 'decisions', 'session.md')), /^since: 2026-09-27T19:05:00Z/);
});
