// node scripts/run-tests.mjs skills/decisions/scripts/decisions-render-publish.test.mjs
// decisions-render-publish: the publish() 8-step pipeline. notion.js, decisions-title.mjs and the
// pickup status read are ALWAYS injected fakes here — this file never calls Notion or pushes.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  publish, PublishError, ownerInputTriples, hasOwnerInput, multisetsEqual,
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

/** A fake git: ls-tree always "tracked"; add/commit/push/fetch/rebase/branch recorded, never real. */
function fakeGit(overrides = {}) {
  const calls = [];
  const impl = (args, cwd) => {
    calls.push(args);
    if (args[0] === 'ls-tree') return args[args.length - 1];
    if (overrides[args[0]]) return overrides[args[0]](args, cwd);
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
  const files = baseFiles({ [p('docs', 'decisions', 'last-render.md')]: live });
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
  const live = pageWithComment('please look at this');
  const historyWithAnswer = '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped.\n'
    + '- Your note, 9-27: "please look at this" — looked at it, nothing further needed.\n';
  const files = baseFiles({
    [p('docs', 'decisions', 'last-render.md')]: live,
    [p('docs', 'decisions', 'history', '2026-09-27.md')]: historyWithAnswer,
  });
  const { deps, fsMap } = baseDeps({
    files,
    readPage: async () => live,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'please look at this']] }),
  });
  const result = await publish({
    repo: REPO, page: 'PAGE', clearDone: true, dryRun: true,
  }, deps);
  assert.equal(result.code, 0);
  assert.match(result.rendered, /- \[ \] Done \(last cleared: Sep 27, 2026, 3:00 PM America\/New_York\)/);
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
  const files = baseFiles({
    [p('docs', 'decisions', 'last-render.md')]: live,
    [p('docs', 'decisions', 'history', '2026-09-27.md')]: historyWithAnswer,
  });
  const { readPage, replaceMd } = wireNotion(live);
  const { deps, calls, fsMap } = baseDeps({
    files,
    readPage,
    readPickupCapture: async () => ({ round: 1, tickAt: '2026-09-27T19:05:00Z', triples: [['comment', 'A decision', 'please look at this']] }),
    replaceMd,
  });
  const result = await publish({ repo: REPO, page: 'PAGE', clearDone: true }, deps);
  assert.equal(result.code, 0);
  assert.ok(calls.some((c) => c[0] === 'add' && c.includes('docs/decisions/session.md')));
  assert.match(fsMap.get(p('docs', 'decisions', 'session.md')), /^since: 2026-09-27T19:05:00Z/);
});
