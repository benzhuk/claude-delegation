// node scripts/run-tests.mjs skills/decisions/scripts/decisions-render.test.mjs
// decisions-render: normalisation, prose refusals, render() composition, and the CLI dispatch.
// The publish() pipeline itself is covered in decisions-render-publish.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childEnv } from '../../multi/scripts/test-child-env.mjs';
import { parseDocument, computeExitCode } from './decisions-read.mjs';
import {
  render, normalize, RefusedError, BlindError,
  checkProseLines, countSentences, checkWaitingItem,
  formatSinceHeading, formatClearedTimestamp, formatMonthDay,
  run, defaultReadPageWithCli, defaultReplaceMdWithCli,
} from './decisions-render.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = path.join(HERE, 'decisions-render.mjs');
const REPO = '/repo';

// ─────────────────────────────────────────────────────────────────────────────
// A tiny in-memory filesystem, keyed exactly the way the production code builds paths (path.join)
// so a Windows or POSIX test run resolves to the same keys as the code under test.
// ─────────────────────────────────────────────────────────────────────────────

function fakeFs(files) {
  const map = new Map(Object.entries(files));
  const readFile = (f) => {
    if (!map.has(f)) {
      const e = new Error(`ENOENT: ${f}`);
      e.code = 'ENOENT';
      throw e;
    }
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
    if (names.size === 0) {
      const e = new Error(`ENOENT: ${d}`);
      e.code = 'ENOENT';
      throw e;
    }
    return [...names];
  };
  return {
    map, readFile, readdirSync, write: (f, c) => map.set(f, c),
  };
}

/** A tracking-set execGit fake: ls-tree returns the path back (tracked) unless it is listed in
 * `untracked`, in which case it returns empty output (a 404 link). */
function fakeGit(untracked = []) {
  return (args) => {
    if (args[0] === 'ls-tree') {
      const rel = args[args.length - 1];
      return untracked.includes(rel) ? '' : rel;
    }
    throw new Error(`fakeGit: unexpected args ${JSON.stringify(args)}`);
  };
}

function p(...parts) {
  return path.join(REPO, ...parts);
}

/** A minimal, valid repo fixture: empty Waiting, a compliant now.md/session.md, two history days. */
function baseFiles(overrides = {}) {
  const files = {
    [p('docs', 'decisions', 'now.md')]: 'The plugin runs the loop by itself. Ticks reach the right session within a minute. Knowledge sharing between machines is the next lane.',
    [p('docs', 'decisions', 'session.md')]: 'since: 2026-09-27T18:16:00Z\n- The collector runs on Netcup every 15 minutes.\n- Release 0.20.15 is installed on three hosts.',
    [p('docs', 'decisions', 'history', '2026-09-27.md')]: '# Sep 27, 2026\nSummary: five lanes merged, the delete guard shipped, and a second RE-PLAN reached your page.\n- some bullet\n',
    [p('docs', 'decisions', 'history', '2026-09-26.md')]: '# Sep 26, 2026\nSummary: eleven lanes merged, including the four-number read.\n- some bullet\n',
    [p('docs', 'decisions', 'archive', 'decisions-page-2026-09-27.md')]: '# archive\ncontent\n',
  };
  return { ...files, ...overrides };
}

function renderDeps(overrides = {}, untracked = []) {
  const f = fakeFs(baseFiles(overrides));
  return {
    deps: {
      readFile: f.readFile, readdirSync: f.readdirSync, execGit: fakeGit(untracked),
    },
    fs: f,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// normalize()
// ─────────────────────────────────────────────────────────────────────────────

test('normalize: CRLF becomes LF', () => {
  assert.equal(normalize('a\r\nb\r\n'), 'a\nb');
});

test('normalize: trailing whitespace is stripped per line', () => {
  assert.equal(normalize('a   \nb\t\n'), 'a\nb');
});

test('normalize: runs of blank lines collapse to one', () => {
  assert.equal(normalize('a\n\n\n\nb'), 'a\n\nb');
});

test('normalize: exactly one trailing <empty-block/> is dropped', () => {
  assert.equal(normalize('a\nb\n<empty-block/>\n'), 'a\nb');
  assert.equal(normalize('a\nb\n\t<empty-block/>\n'), 'a\nb'); // indented, still the trailing one
});

test('normalize: a non-trailing <empty-block/> is left alone', () => {
  assert.equal(normalize('a\n<empty-block/>\nb'), 'a\n<empty-block/>\nb');
});

test('normalize: two texts differing only by CRLF/whitespace/blank-run/trailing-empty-block compare equal', () => {
  const a = 'Line one\nLine two\n\n\nLine three\n<empty-block/>\n';
  const b = 'Line one\r\nLine two \r\n\r\nLine three\r\n\t<empty-block/>\r\n';
  assert.equal(normalize(a), normalize(b));
});

test('normalize: a real content change is never hidden', () => {
  assert.notEqual(normalize('a\nb\n'), normalize('a\nc\n'));
});

// ─────────────────────────────────────────────────────────────────────────────
// countSentences() — now.md's three-to-five-sentence rule
// ─────────────────────────────────────────────────────────────────────────────

test('countSentences: three plain sentences', () => {
  assert.equal(countSentences('One. Two? Three!'), 3);
});

test('countSentences: a markdown link\'s period inside the URL never counts', () => {
  const text = 'See [card.md](http://example.com/card.v.1.md) for details. Done.';
  assert.equal(countSentences(text), 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// checkProseLines() — bold-outside-<summary> and the hex-token rule
// ─────────────────────────────────────────────────────────────────────────────

test('checkProseLines: a line starting with bold outside a <summary> is refused', () => {
  assert.throws(() => checkProseLines('normal line\n**bold line**', 'now.md'), RefusedError);
});

test('checkProseLines: a <summary>…</summary> line itself is exempt from the bold rule', () => {
  assert.doesNotThrow(() => checkProseLines('<summary>**Decision title**</summary>', 'waiting/x.md'));
});

test('checkProseLines hex rule: a 7-digit count does not trip it (no letter)', () => {
  assert.doesNotThrow(() => checkProseLines('processed 1234567 items today', 'now.md'));
});

test('checkProseLines hex rule: a plain date does not trip it', () => {
  assert.doesNotThrow(() => checkProseLines('shipped on 2026-09-27 in the evening', 'now.md'));
});

test('checkProseLines hex rule: a sha (letters and digits, 7-40 hex chars) trips it', () => {
  assert.throws(() => checkProseLines('merged at 619ad1c today', 'now.md'), RefusedError);
});

test('checkProseLines hex rule: a sha inside a markdown link target is exempt', () => {
  assert.doesNotThrow(() => checkProseLines('see [here](https://github.com/x/y/commit/619ad1c)', 'now.md'));
});

test('checkProseLines hex rule: a sha inside a quoted owner note is exempt', () => {
  assert.doesNotThrow(() => checkProseLines('Your note, 9-27: "mentions 619ad1c in passing" — done', 'history/x.md:2'));
});

test('checkProseLines hex rule: a bare https URL is exempt even unlinked', () => {
  assert.doesNotThrow(() => checkProseLines('see https://github.com/x/y/commit/619ad1c for detail', 'now.md'));
});

// ─────────────────────────────────────────────────────────────────────────────
// Time formatting — must match pack/live-page.md exactly
// ─────────────────────────────────────────────────────────────────────────────

test('formatSinceHeading: 2:16 PM EDT on a Sunday', () => {
  assert.equal(formatSinceHeading('2026-09-27T18:16:00Z'), 'Sun 2:16 PM');
});

test('formatClearedTimestamp: matches the live page\'s "last cleared" wording', () => {
  assert.equal(formatClearedTimestamp(new Date('2026-09-27T18:16:00Z')), 'Sep 27, 2026, 2:16 PM America/New_York');
});

test('formatMonthDay: no leading zero on the day', () => {
  assert.equal(formatMonthDay('2026-09-27'), 'Sep 27');
  assert.equal(formatMonthDay('2026-09-05'), 'Sep 5');
  assert.equal(formatMonthDay('2026-01-20'), 'Jan 20');
});

// ─────────────────────────────────────────────────────────────────────────────
// checkWaitingItem() — SHAPELESS or missing options
// ─────────────────────────────────────────────────────────────────────────────

const GOOD_ITEM = [
  '<details>',
  '<summary>**Cap the nightly batch at 200 items or run it uncapped**</summary>',
  '\tEvidence: the queue outgrew memory twice this month.',
  '\t- [ ] Cap at 200 per run (recommended)',
  '\t- [ ] Run uncapped',
  '\tDefault after 2030-06-15 18:00 -04:00: cap at 200 items per run',
  '\t<empty-block/>',
  '</details>',
].join('\n');

test('checkWaitingItem: a well-shaped item passes', () => {
  assert.doesNotThrow(() => checkWaitingItem(GOOD_ITEM, 'waiting/good.md'));
});

test('checkWaitingItem: a shapeless <summary> (no checkbox options) is refused, naming SHAPELESS', () => {
  const shapeless = '<details>\n<summary>**Just a heading**</summary>\n\tsome text\n</details>';
  assert.throws(() => checkWaitingItem(shapeless, 'waiting/bad.md'), (e) => e instanceof RefusedError && /SHAPELESS/.test(e.message));
});

test('checkWaitingItem: a file with no decision item at all is refused, naming missing options', () => {
  assert.throws(() => checkWaitingItem('nothing here but a checkbox\n- [ ] loose', 'waiting/loose.md'), RefusedError);
});

// ─────────────────────────────────────────────────────────────────────────────
// render() — happy path composition
// ─────────────────────────────────────────────────────────────────────────────

test('render: Waiting is "Nothing right now." with an empty waiting/ directory', () => {
  const { deps } = renderDeps();
  const page = render({ repo: REPO }, deps);
  assert.match(page, /^# Waiting on you now\nNothing right now\.\n/);
});

test('render: What is going on carries now.md verbatim', () => {
  const { deps } = renderDeps();
  const page = render({ repo: REPO }, deps);
  assert.match(page, /# What is going on\nThe plugin runs the loop by itself\./);
});

test('render: This session heading converts since: to NY wall time, and carries every bullet', () => {
  const { deps } = renderDeps();
  const page = render({ repo: REPO }, deps);
  assert.match(page, /# This session \(since your tick at Sun 2:16 PM\)/);
  assert.match(page, /- The collector runs on Netcup every 15 minutes\./);
  assert.match(page, /- Release 0\.20\.15 is installed on three hosts\./);
});

test('render: History ordering is newest-first, and the link shape matches the live page', () => {
  const { deps } = renderDeps();
  const page = render({ repo: REPO }, deps);
  const idx27 = page.indexOf('[Sep 27]');
  const idx26 = page.indexOf('[Sep 26]');
  assert.ok(idx27 > -1 && idx26 > -1 && idx27 < idx26, 'Sep 27 must appear before Sep 26 (newest first)');
  assert.match(
    page,
    /\t- \[Sep 27\]\(https:\/\/github\.com\/benzhuk\/claude-delegation\/blob\/main\/docs\/decisions\/history\/2026-09-27\.md\) — five lanes merged/,
  );
});

test('render: one bullet per archive file, after the history bullets', () => {
  const { deps } = renderDeps();
  const page = render({ repo: REPO }, deps);
  const idxHistory = page.indexOf('[Sep 26]');
  const idxArchive = page.indexOf('archive');
  assert.ok(idxArchive > idxHistory);
  assert.match(page, /\t- Everything before today's rewrite is kept, byte for byte, in the \[Sep 27 archive\]/);
});

test('render: History toggle closes with an indented <empty-block\\/>, then the callout, the Done line, the trailing <empty-block\\/>', () => {
  const { deps } = renderDeps();
  const page = render({ repo: REPO }, deps);
  const lines = page.split('\n');
  const historyIdx = lines.indexOf('# History {toggle="true"}');
  assert.ok(historyIdx > -1);
  const emptyBlockIdx = lines.indexOf('\t<empty-block/>');
  assert.ok(emptyBlockIdx > historyIdx);
  assert.equal(lines[emptyBlockIdx + 1], '<callout icon="✅">');
  assert.equal(lines[lines.length - 2], '<empty-block/>');
  assert.equal(lines[lines.length - 1], '');
});

test('render: default Done line is unticked; --done-line is carried verbatim', () => {
  const { deps } = renderDeps();
  const page1 = render({ repo: REPO }, deps);
  assert.match(page1, /\n- \[ \] Done\n<empty-block\/>\n$/);
  const page2 = render({ repo: REPO, doneLine: '- [ ] Done (last cleared: Sep 27, 2026, 2:16 PM America/New_York)' }, deps);
  assert.match(page2, /- \[ \] Done \(last cleared: Sep 27, 2026, 2:16 PM America\/New_York\)/);
});

test('render: waiting items are included in file order between the two headings', () => {
  const item = GOOD_ITEM;
  const { deps } = renderDeps({ [p('docs', 'decisions', 'waiting', 'a-item.md')]: item });
  const page = render({ repo: REPO }, deps);
  assert.match(page, /# Waiting on you now\n<details>/);
  assert.doesNotMatch(page, /Nothing right now\./);
});

test('render: --drop-owner-lines refuses when a forbidden line would leak into the page', () => {
  const { deps, fs: f } = renderDeps();
  f.write(p('drop.txt'), 'The collector runs on Netcup every 15 minutes.\n');
  assert.throws(
    () => render({ repo: REPO, dropOwnerLines: p('drop.txt') }, deps),
    RefusedError,
  );
});

test('render: --drop-owner-lines passes when none of the forbidden lines are present', () => {
  const { deps, fs: f } = renderDeps();
  f.write(p('drop.txt'), 'a line Ben definitely never wrote here\n');
  assert.doesNotThrow(() => render({ repo: REPO, dropOwnerLines: p('drop.txt') }, deps));
});

// ─────────────────────────────────────────────────────────────────────────────
// render() refusals
// ─────────────────────────────────────────────────────────────────────────────

test('render refusal: bold outside a <summary> in now.md', () => {
  const { deps } = renderDeps({ [p('docs', 'decisions', 'now.md')]: '**Bold start.** Second sentence here now. Third one too now.' });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

test('render refusal: a hex-looking token in a session.md bullet', () => {
  const { deps } = renderDeps({
    [p('docs', 'decisions', 'session.md')]: 'since: 2026-09-27T18:16:00Z\n- Merged at 619ad1c today.',
  });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

test('render refusal: session.md has more than eight bullets', () => {
  const bullets = Array.from({ length: 9 }, (_, i) => `- bullet number ${i}`).join('\n');
  const { deps } = renderDeps({ [p('docs', 'decisions', 'session.md')]: `since: 2026-09-27T18:16:00Z\n${bullets}` });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

test('render refusal: a session.md bullet longer than 200 characters', () => {
  const long = `- ${'x'.repeat(201)}`;
  const { deps } = renderDeps({ [p('docs', 'decisions', 'session.md')]: `since: 2026-09-27T18:16:00Z\n${long}` });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

test('render refusal: now.md with fewer than three sentences', () => {
  const { deps } = renderDeps({ [p('docs', 'decisions', 'now.md')]: 'Only one sentence here.' });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

test('render refusal: now.md with more than five sentences', () => {
  const six = Array.from({ length: 6 }, (_, i) => `Sentence number ${i}.`).join(' ');
  const { deps } = renderDeps({ [p('docs', 'decisions', 'now.md')]: six });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

test('render refusal: a history file lacking its Summary line', () => {
  const { deps } = renderDeps({ [p('docs', 'decisions', 'history', '2026-09-27.md')]: '# Sep 27, 2026\n- a bullet with no Summary line\n' });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

test('render refusal: a history file linked on the page is absent from git ls-tree origin/main', () => {
  const { deps } = renderDeps({}, ['docs/decisions/history/2026-27.md']);
  const { deps: deps2 } = renderDeps({}, ['docs/decisions/history/2026-09-27.md']);
  assert.throws(() => render({ repo: REPO }, deps2), (e) => e instanceof RefusedError && /ls-tree/.test(e.message));
});

test('render refusal: an archive file linked on the page is absent from git ls-tree origin/main', () => {
  const { deps } = renderDeps({}, ['docs/decisions/archive/decisions-page-2026-09-27.md']);
  assert.throws(() => render({ repo: REPO }, deps), (e) => e instanceof RefusedError && /ls-tree/.test(e.message));
});

test('render refusal: a waiting item that fails decisions-read.mjs (SHAPELESS)', () => {
  const shapeless = '<details>\n<summary>**No options here**</summary>\n\tjust text\n</details>';
  const { deps } = renderDeps({ [p('docs', 'decisions', 'waiting', 'bad.md')]: shapeless });
  assert.throws(() => render({ repo: REPO }, deps), RefusedError);
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance: the render output parses with decisions-read.mjs exit 0, zero warnings, DONE
// false, and nothing but blank follows the Done line (the DONE_NOT_LAST rule).
// ─────────────────────────────────────────────────────────────────────────────

test('acceptance: render output parses clean through decisions-read.mjs', () => {
  const { deps } = renderDeps();
  const page = render({ repo: REPO }, deps);
  const doc = parseDocument(page);
  assert.equal(computeExitCode(doc), 0);
  assert.equal(doc.warnings.length, 0, `expected zero warnings, got: ${JSON.stringify(doc.warnings)}`);
  assert.equal(doc.done, false);
  const lines = page.split('\n');
  const doneIdx = lines.findIndex((l) => /^- \[ \] Done/.test(l));
  assert.ok(doneIdx > -1);
  for (const rest of lines.slice(doneIdx + 1)) {
    assert.ok(rest.trim() === '' || rest.trim() === '<empty-block/>', `unexpected content after Done: ${JSON.stringify(rest)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// --reader: an explicit path to a notion.js-shaped CLI, never hardcoded (same convention
// decisions-pickup.mjs's readPageWithCli already uses). A tiny fake script stands in for
// notion.js here — never the real network, never a real page.
// ─────────────────────────────────────────────────────────────────────────────

function writeFakeReader(dir, { failRead = false } = {}) {
  const script = path.join(dir, 'fake-reader.mjs');
  fs.writeFileSync(script, `import fs from 'node:fs';
const [, , cmd, ...rest] = process.argv;
if (cmd === 'read') {
  if (${JSON.stringify(failRead)}) { process.stderr.write('deliberate failure\\n'); process.exit(1); }
  const page = rest[0];
  process.stdout.write('page-content-for-' + page + '\\n');
  process.exit(0);
} else if (cmd === 'replace-md') {
  const [page, file, flag] = rest;
  if (flag !== '--force') { process.stderr.write('missing --force\\n'); process.exit(1); }
  const md = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(process.env.FAKE_READER_LAST_WRITE, page + '\\n' + md);
  console.log('replaced');
  process.exit(0);
} else {
  process.stderr.write('unknown command\\n');
  process.exit(1);
}
`, 'utf8');
  return script;
}

test('defaultReadPageWithCli: spawns the given reader path with "read <page>" and returns its stdout', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decisions-render-reader-'));
  const script = writeFakeReader(dir);
  const readPage = defaultReadPageWithCli(script, childEnv(dir));
  const text = await readPage('abc123');
  assert.equal(text, 'page-content-for-abc123\n');
});

test('defaultReplaceMdWithCli: writes the markdown to a temp file and calls "replace-md <page> <file> --force"', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decisions-render-reader-'));
  const script = writeFakeReader(dir);
  const lastWrite = path.join(dir, 'last-write.txt');
  const replaceMd = defaultReplaceMdWithCli(script, childEnv(dir, { FAKE_READER_LAST_WRITE: lastWrite }));
  await replaceMd('abc123', '# hello\nworld\n');
  const written = fs.readFileSync(lastWrite, 'utf8');
  assert.equal(written, 'abc123\n# hello\nworld\n');
});

test('defaultReadPageWithCli: a nonzero reader exit throws, never returns silently', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decisions-render-reader-'));
  const script = writeFakeReader(dir, { failRead: true });
  const readPage = defaultReadPageWithCli(script, childEnv(dir));
  // "fail" stands in for a real notion.js failure (bad page id, network error, ...), which must
  // never be swallowed into an empty or stale-looking read.
  await assert.rejects(() => readPage('abc123'), /--reader exited 1/);
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

test('CLI run(): render dispatch prints the page and exits 0', async () => {
  const { deps } = renderDeps();
  const out = [];
  const code = await run({ argv: ['render', '--repo', REPO], write: (s) => out.push(s), deps });
  assert.equal(code, 0);
  assert.match(out.join(''), /^# Waiting on you now/);
});

test('CLI run(): render dispatch surfaces a RefusedError as exit 2', async () => {
  const { deps } = renderDeps({ [p('docs', 'decisions', 'now.md')]: 'Only one sentence.' });
  const err = [];
  const code = await run({ argv: ['render', '--repo', REPO], writeErr: (s) => err.push(s), deps });
  assert.equal(code, 2);
  assert.match(err.join(''), /decisions-render:/);
});

test('CLI run(): an unknown command exits 2', async () => {
  const err = [];
  const code = await run({ argv: ['bogus'], writeErr: (s) => err.push(s) });
  assert.equal(code, 2);
});

test('CLI run(): render with no --repo exits 2', async () => {
  const err = [];
  const code = await run({ argv: ['render'], writeErr: (s) => err.push(s) });
  assert.equal(code, 2);
});

test('CLI: real process, no arguments at all — exits 2, no network needed', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'decisions-render-'));
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8', env: childEnv(home, { AGENTS_HOME: home }),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /decisions-render:/);
});
