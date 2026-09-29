// node scripts/run-tests.mjs skills/decisions/scripts/decisions-render.test.mjs
// decisions-render: normalisation, prose refusals, render() composition, and the CLI dispatch.
// The publish() pipeline itself is covered in decisions-render-publish.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childEnv } from '../../multi/scripts/test-child-env.mjs';
import { parseDocument, computeExitCode } from './decisions-read.mjs';
import {
  render, normalize, RefusedError, BlindError,
  checkProseLines, countSentences, checkWaitingItem,
  checkAutolinkLines,
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
  // Review round-2 NIT: compare against the exact string, not `.trim()` — an indented one is a
  // different (nested, never page-final) thing and is left alone.
  assert.equal(normalize('a\nb\n\t<empty-block/>\n'), 'a\nb\n\t<empty-block/>');
});

test('normalize: a non-trailing <empty-block/> is left alone', () => {
  assert.equal(normalize('a\n<empty-block/>\nb'), 'a\n<empty-block/>\nb');
});

test('normalize: two texts differing only by CRLF/whitespace/blank-run/trailing-empty-block compare equal', () => {
  const a = 'Line one\nLine two\n\n\nLine three\n<empty-block/>\n';
  const b = 'Line one\r\nLine two \r\n\r\nLine three\r\n<empty-block/>\r\n';
  assert.equal(normalize(a), normalize(b));
});

test('normalize: a real content change is never hidden', () => {
  assert.notEqual(normalize('a\nb\n'), normalize('a\nc\n'));
});

const RENDER_READBACK_48_FIXTURES = path.join(HERE, 'fixtures', 'render-readback-48');
function lane48Snapshot(name, expectedHash) {
  const bytes = fs.readFileSync(path.join(RENDER_READBACK_48_FIXTURES, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), expectedHash);
  return bytes.toString('utf8');
}
const lane48Intended = lane48Snapshot(
  'main-merge-r2-decisions-intended-publish-render.md',
  '535914342B07C360AB2FBC59699598C2012F547C3C7F501FCC5CC8EC8D755E1E',
);
const lane48Live = lane48Snapshot(
  'main-merge-r2-decisions-live-after-exit5.md',
  '5E38CB6460AC8B4C7255E785716ED664A4C028DD3CB3C5A74A8EDFB90BBE6DB1',
);

test('normalize: Lane48 exact Notion readback differs only by the structural details separator', () => {
  assert.equal(normalize(lane48Intended), normalize(lane48Live));
});

test('normalize: Lane48 meaningful changes and fenced literals remain unequal', () => {
  const bulletRemoved = lane48Live.replace(/\t- \[ \] Yes, release 0\.20\.18 now\r?\n/, '');
  const tickChanged = lane48Live.replace(
    '\t- [ ] Yes, release 0.20.18 now',
    '\t- [x] Yes, release 0.20.18 now',
  );
  const lineMoved = lane48Live.replace(
    /(\t- \[ \] Yes, release 0\.20\.18 now)\r?\n(\t- \[ \] Hold)/,
    '$2\n$1',
  );
  assert.notEqual(bulletRemoved, lane48Live, 'bullet mutation must alter the pinned live snapshot');
  assert.notEqual(tickChanged, lane48Live, 'tick mutation must alter the pinned live snapshot');
  assert.notEqual(lineMoved, lane48Live, 'line-move mutation must alter the pinned live snapshot');
  assert.notEqual(
    normalize(lane48Intended),
    normalize(bulletRemoved),
    'removing a bullet must remain visible',
  );
  assert.notEqual(
    normalize(lane48Intended),
    normalize(tickChanged),
    'changing a tick must remain visible',
  );
  assert.notEqual(
    normalize(lane48Intended),
    normalize(lineMoved),
    'moving a content line must remain visible',
  );
  assert.notEqual(
    normalize('```md\n</details>\n\nnext\n```'),
    normalize('```md\n</details>\nnext\n```'),
    'a literal closing tag inside a fenced block must retain its blank line',
  );
  assert.notEqual(
    normalize('~~~md\n</details>\n\nnext\n~~~'),
    normalize('~~~md\n</details>\nnext\n~~~'),
    'a tilde-fenced literal closing tag must retain its blank line',
  );
  assert.notEqual(
    normalize('<details>\n````md\n```\n</details>\n\nnext\n````\n</details>'),
    normalize('<details>\n````md\n```\n</details>\nnext\n````\n</details>'),
    'a shorter backtick run cannot close a longer fence around a literal closing tag',
  );
  assert.notEqual(
    normalize('<details>\n```md\n```still-code\n</details>\n\nnext\n```\n</details>'),
    normalize('<details>\n```md\n```still-code\n</details>\nnext\n```\n</details>'),
    'a fence delimiter with a non-whitespace suffix cannot close a fence around a literal closing tag',
  );
});

test('normalize: Lane48 structural separator collapse is idempotent for an existing blank run', () => {
  const withBlankRun = '<details>\n</details>\n\n\nnext\n</details>';
  const normalized = normalize(withBlankRun);
  assert.equal(normalized, normalize(normalized));
  assert.equal(normalized, normalize('<details>\n</details>\nnext\n</details>'));
});

const READBACK_ESCAPES_52_FIXTURES = path.join(HERE, 'fixtures', 'readback-escapes-52');
function lane52Fixture(name, expectedHash) {
  const bytes = fs.readFileSync(path.join(READBACK_ESCAPES_52_FIXTURES, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), expectedHash);
  return bytes.toString('utf8');
}
const lane52Before = lane52Fixture(
  'lane52-render-before-write.md',
  'B448DAB8D79FC7254FD42D100D192A5790E5A7642F2B46E608ED2D8C9C9B93C8',
);
const lane52Live = lane52Fixture(
  'lane52-live-after-write.md',
  'A88FA4A5AF57B30F237038F164B3F25EBA334F220EB559D62114542FD5FCC844',
);
const lane52ProbeRequest = lane52Fixture(
  'probe-request.md',
  '117A5C0F257FD42BC6CBA3B10AEB603B07E63B2D85735BF6CE36DCFB1D35264D',
);
const lane52ProbeReadback = lane52Fixture(
  'readback.md',
  '01FCC13F70C603E1E222A23986E33C879EFE3EB1A1C0A87393A10B7FEF43A3DD',
);
const lane52ProbeManifest = JSON.parse(lane52Fixture(
  'proof-manifest.json',
  '65BDAF2BB9679B3116CC3F0B054550FA34AD9659FBDD786B4FC9E78D2DFCBCFB',
));

function alignLane52DoneMetadata(before, live) {
  const beforeDone = /^- \[ \] Done$/m.exec(before);
  const liveDone = /^- \[ \] Done \(last cleared: [^)]+\)$/m.exec(live);
  assert.ok(beforeDone, 'before snapshot must contain exactly the un-cleared Done line');
  assert.ok(liveDone, 'live snapshot must contain the cleared Done line');
  let replacements = 0;
  const aligned = before.replace(beforeDone[0], () => {
    replacements += 1;
    return liveDone[0];
  });
  assert.equal(replacements, 1, 'metadata alignment must replace exactly one Done line');
  assert.match(aligned, /^- \[ \] Done \(last cleared: [^)]+\)$/m);
  return aligned;
}

const lane52TimestampAligned = alignLane52DoneMetadata(lane52Before, lane52Live);

test('normalize: Lane52 byte-pinned snapshots compare after only Done metadata alignment', () => {
  assert.notEqual(normalize(lane52Before), normalize(lane52Live), 'raw cleared timestamp stays significant');
  assert.equal(normalize(lane52TimestampAligned), normalize(lane52Live));
});

test('normalize: Lane52 probe request and readback compare for only the observed escape set', () => {
  assert.deepEqual(lane52ProbeManifest.observed_escaped_characters, ['*', '[', ']', '`', '~', '>', '|', '<']);
  assert.equal(normalize(lane52ProbeRequest), normalize(lane52ProbeReadback));
  for (const character of lane52ProbeManifest.observed_escaped_characters) {
    const unescaped = `A${character}B`;
    const escaped = `A\\${character}B`;
    assert.equal(normalize(unescaped), normalize(escaped), `escape before ${character} must compare equally in either direction`);
    assert.equal(normalize(escaped), normalize(normalize(escaped)), `escape before ${character} must be idempotent`);
  }
  for (const character of ['_', '#', '-', '+', '!']) {
    assert.notEqual(normalize(`A${character}B`), normalize(`A\\${character}B`), `unobserved escape before ${character} must remain significant`);
  }
});

test('normalize: Lane52 substantive snapshot mutations remain unequal', () => {
  const bulletRemoved = lane52Live.replace(/\t- \[ \] Yes, daily on this desktop, first run as soon as the lane lands \(recommended\)\r?\n/, '');
  const tickChanged = lane52Live.replace(
    '\t- [ ] Yes, daily on this desktop, first run as soon as the lane lands (recommended)',
    '\t- [x] Yes, daily on this desktop, first run as soon as the lane lands (recommended)',
  );
  const lineMoved = lane52Live.replace(
    /(\t- \[ \] Yes, daily on this desktop, first run as soon as the lane lands \(recommended\))\r?\n(\t- \[ \] Yes, but the first run waits until after Oct 4)/,
    '$2\n$1',
  );
  const wordChanged = lane52Live.replace('The plugin now runs the whole loop by itself', 'The harness now runs the whole loop by itself');
  const escapedStarChanged = lane52Live.replace('build/\\* branches', 'build/x branches');
  for (const [name, mutated] of [
    ['removed bullet', bulletRemoved],
    ['changed checkbox tick', tickChanged],
    ['moved substantive line', lineMoved],
    ['changed word', wordChanged],
    ['changed escaped-star branch', escapedStarChanged],
  ]) {
    assert.notEqual(mutated, lane52Live, `${name} mutation must alter the pinned live snapshot`);
    assert.notEqual(normalize(lane52TimestampAligned), normalize(mutated), `${name} must remain visible`);
  }
});

test('normalize: Lane52 observed escapes stay significant inside fenced literals', () => {
  const backtickFenceEscaped = ['```', String.raw`a\*b`, '```'].join('\n');
  const backtickFenceBare = ['```', 'a*b', '```'].join('\n');
  const tildeFenceEscaped = ['~~~', String.raw`C:\[x]`, '~~~'].join('\n');
  const tildeFenceBare = ['~~~', 'C:[x]', '~~~'].join('\n');
  assert.notEqual(normalize(backtickFenceEscaped), normalize(backtickFenceBare), 'a fenced escaped star is literal content');
  assert.notEqual(normalize(tildeFenceEscaped), normalize(tildeFenceBare), 'a fenced escaped bracket is literal content');
});

test('normalize: Lane52 observed escapes stay significant inside matching inline code spans', () => {
  const singleEscaped = '`' + String.raw`C:\[x]` + '`';
  const singleBare = '`C:[x]`';
  const multiEscaped = '``' + String.raw`a\*b` + '``';
  const multiBare = '``a*b``';
  const multilineEscaped = ['``', String.raw`a\*b`, 'continued literal', '``'].join('\n');
  const multilineBare = ['``', 'a*b', 'continued literal', '``'].join('\n');
  assert.notEqual(normalize(singleEscaped), normalize(singleBare), 'single-backtick code span preserves its backslash');
  assert.notEqual(normalize(multiEscaped), normalize(multiBare), 'multi-backtick code span preserves its backslash');
  assert.notEqual(normalize(multilineEscaped), normalize(multilineBare), 'a multi-line matching code span preserves its backslash before any fence boundary');
});

test('normalize: Lane52 prose escapes remain equivalent without a matching code span', () => {
  assert.equal(normalize(String.raw`prose a\*b and A\`B`), normalize('prose a*b and A`B'));
  assert.equal(
    normalize(String.raw`unmatched prose tick A\`B leaves a\*b in prose`),
    normalize('unmatched prose tick A`B leaves a*b in prose'),
    'an unmatched prose tick must not make later prose literal',
  );
  assert.equal(normalize(String.raw`A\`B`), normalize('A`B'), 'the observed escaped probe backtick remains equivalent');
  assert.equal(
    normalize(['unmatched ` before fence', '```', 'fenced literal', '```', String.raw`after fence a\*b`].join('\n')),
    normalize(['unmatched ` before fence', '```', 'fenced literal', '```', 'after fence a*b'].join('\n')),
    'an unmatched inline tick cannot pair across fence boundaries and hide later prose',
  );
});

test('normalize: Lane52 code backslash changes remain substantive', () => {
  assert.notEqual(normalize('`' + String.raw`build/\*` + '`'), normalize('`build/*`'));
  assert.notEqual(normalize('``' + String.raw`C:\[x]` + '``'), normalize('``C:[x]``'));
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

// Review round-2 M1: the exemptions were wider than the spec's "URL or a quoted owner note".
test('checkProseLines hex rule: a sha in a markdown link\'s VISIBLE TEXT still trips it (only the link target is exempt)', () => {
  assert.throws(() => checkProseLines('See [a806bb3](https://x.y/z).', 'x'), (e) => e instanceof RefusedError && /hex-looking token/.test(e.message));
});

test('checkProseLines hex rule: a bare quoted sha outside the "Your note/question" form still trips it', () => {
  assert.throws(() => checkProseLines('The commit "a806bb3" broke it.', 'x'), (e) => e instanceof RefusedError && /hex-looking token/.test(e.message));
});

test('checkProseLines hex rule: a sha with an underscore neighbor still trips it (word-boundary widened)', () => {
  assert.throws(() => checkProseLines('sha_a806bb3 broke it.', 'x'), (e) => e instanceof RefusedError && /hex-looking token/.test(e.message));
});

test('checkProseLines hex rule: a sha quoted in the spec\'s "Your note, <M-D>: ..." form is still exempt', () => {
  assert.doesNotThrow(() => checkProseLines('- Your note, 9-27: "a806bb3 looks fine" — noted.', 'x'));
});

// Review round-2 M2: a bullet that starts with bold right after its marker still violates the
// "plain bullet, never starting with bold" rule.
test('checkProseLines bold rule: a bullet starting with bold right after "- " is refused', () => {
  assert.throws(() => checkProseLines('- **Evidence** here', 'x'), (e) => e instanceof RefusedError && /starts with bold/.test(e.message));
});

test('checkProseLines bold rule: a leading escaped \\*\\* (the page\'s own comment marker) is refused outside a real comment', () => {
  assert.throws(() => checkProseLines('\\*\\* a stray copied owner line', 'x'), (e) => e instanceof RefusedError && /starts with bold/.test(e.message));
});

// ─────────────────────────────────────────────────────────────────────────────
// checkAutolinkLines() — Lane 32: refuse text Notion will rewrite on the way back (a bare
// `word.TLD`-shaped filename's final path segment, a bare `~`, or an unwrapped www./http(s)://).
// ─────────────────────────────────────────────────────────────────────────────

test('checkAutolinkLines: a bare GOALS.md is refused', () => {
  assert.throws(() => checkAutolinkLines('GOALS.md', 'x'), (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message));
});

test('checkAutolinkLines: GOALS.md in backticks passes', () => {
  assert.doesNotThrow(() => checkAutolinkLines('`GOALS.md`', 'x'));
});

test('checkAutolinkLines: [GOALS.md](https://github.com/...) as a whole link passes', () => {
  assert.doesNotThrow(() => checkAutolinkLines('[GOALS.md](https://github.com/benzhuk/claude-delegation/blob/main/docs/GOALS.md)', 'x'));
});

test('checkAutolinkLines: a bare history path refuses on its final path segment', () => {
  assert.throws(
    () => checkAutolinkLines('see docs/decisions/history/2026-09-27.md for detail', 'x'),
    (e) => e instanceof RefusedError && /2026-09-27\.md/.test(e.message),
  );
});

test('checkAutolinkLines: the same path as a link passes', () => {
  assert.doesNotThrow(() => checkAutolinkLines('see [docs/decisions/history/2026-09-27.md](https://github.com/x/y/blob/main/docs/decisions/history/2026-09-27.md)', 'x'));
});

test('checkAutolinkLines: a bare .mjs filename passes (not one of the eight extensions)', () => {
  assert.doesNotThrow(() => checkAutolinkLines('run scripts/collect-status.mjs now', 'x'));
});

test('checkAutolinkLines: a bare ~ refuses', () => {
  assert.throws(() => checkAutolinkLines('~/.agents holds the state', 'x'), (e) => e instanceof RefusedError && /bare ~/.test(e.message));
});

test('checkAutolinkLines: ~/.agents in backticks passes', () => {
  assert.doesNotThrow(() => checkAutolinkLines('`~/.agents` holds the state', 'x'));
});

test('checkAutolinkLines: a version number, a full date-time, and "HTTP codes" all pass', () => {
  assert.doesNotThrow(() => checkAutolinkLines('Release 0.20.16 shipped', 'x'));
  assert.doesNotThrow(() => checkAutolinkLines('Sep 27, 2026, 2:16 PM America/New_York', 'x'));
  assert.doesNotThrow(() => checkAutolinkLines('the change is about HTTP codes', 'x'));
});

test('checkAutolinkLines: a bare www.example.com refuses', () => {
  assert.throws(() => checkAutolinkLines('see www.example.com for detail', 'x'), (e) => e instanceof RefusedError && /www\.example\.com/.test(e.message));
});

test('checkAutolinkLines: a bare http(s):// URL refuses outside a link and outside <...>', () => {
  assert.throws(() => checkAutolinkLines('see https://example.com/x for detail', 'x'), RefusedError);
});

test('checkAutolinkLines: a URL inside <...> passes', () => {
  assert.doesNotThrow(() => checkAutolinkLines('see <https://example.com/x> for detail', 'x'));
});

// Review round-2/Lane-32: unlike the hex rule's stripExempt, there is no owner-quote exemption
// here — Notion rewrites the text whoever wrote it, so a quoted filename still refuses.
test('checkAutolinkLines: a quoted owner line containing a bare GOALS.md still refuses (no owner-quote exemption)', () => {
  assert.throws(
    () => checkAutolinkLines('- Your note, 9-27: "mentions GOALS.md in passing" — done', 'x'),
    (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message),
  );
});

test('checkAutolinkLines: render does not scan a history body line below the Summary line', () => {
  const { deps } = renderDeps({
    [p('docs', 'decisions', 'history', '2026-09-27.md')]: '# Sep 27, 2026\nSummary: five lanes merged today.\n- see ~/.agents/ws-off-sweep for detail\n',
  });
  assert.doesNotThrow(() => render({ repo: REPO }, deps));
});

test('checkAutolinkLines: a bare filename in a history Summary line refuses', () => {
  const { deps } = renderDeps({
    [p('docs', 'decisions', 'history', '2026-09-27.md')]: '# Sep 27, 2026\nSummary: see GOALS.md for detail.\n- a bullet\n',
  });
  assert.throws(() => render({ repo: REPO }, deps), (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message));
});

test('checkAutolinkLines: --done-line is scanned, and the message labels it --done-line', () => {
  const { deps } = renderDeps();
  assert.throws(
    () => render({ repo: REPO, doneLine: '- [ ] Done (see GOALS.md)' }, deps),
    (e) => e instanceof RefusedError && /^--done-line:/.test(e.message),
  );
});

// Review r1 F1: `<...>` is exempt from rule (c) (the URL rule) only, never a blanket exemption
// for rules (a)/(b) — ordinary prose using `<`/`->` must still refuse.
test('checkAutolinkLines F1: a < b, see GOALS.md -> c still refuses (ordinary prose, not an autolink)', () => {
  assert.throws(() => checkAutolinkLines('a < b, see GOALS.md -> c', 'x'), (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message));
});

test('checkAutolinkLines F1: <GOALS.md> refuses (not a real http(s)/www autolink)', () => {
  assert.throws(() => checkAutolinkLines('<GOALS.md>', 'x'), (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message));
});

test('checkAutolinkLines F1: <~/.agents> refuses (not a real http(s)/www autolink)', () => {
  assert.throws(() => checkAutolinkLines('<~/.agents>', 'x'), (e) => e instanceof RefusedError && /bare ~/.test(e.message));
});

test('checkAutolinkLines F1: <https://example.com/x> (a real autolink) still passes', () => {
  assert.doesNotThrow(() => checkAutolinkLines('see <https://example.com/x> for detail', 'x'));
});

// Review r1 F2: the file-line number in a session.md refusal must be the TRUE file line, not a
// bullet index (bullet 1 is file line 2, since line 1 is "since: <ISO>", already validated and
// never itself a match).
test('render refusal F2: a bare filename on session.md line 3 is reported as session.md:3', () => {
  const { deps } = renderDeps({
    [p('docs', 'decisions', 'session.md')]: 'since: 2026-09-27T18:16:00Z\n- a plain bullet first.\n- See GOALS.md for detail.',
  });
  assert.throws(() => render({ repo: REPO }, deps), (e) => e instanceof RefusedError && /^session\.md:3 /.test(e.message));
});

// Review r1 F3: the filename check tests only the FINAL path segment — a following `/` or `.`
// means the matched run was not actually the last segment.
test('checkAutolinkLines F3: notes.md/x.mjs passes (notes.md is not the final segment)', () => {
  assert.doesNotThrow(() => checkAutolinkLines('see notes.md/x.mjs for detail', 'x'));
});

test('checkAutolinkLines F3: GOALS.md.bak passes (the real extension is .bak, not .md)', () => {
  assert.doesNotThrow(() => checkAutolinkLines('see GOALS.md.bak for detail', 'x'));
});

test('checkAutolinkLines F3: a bare filename at a sentence end still refuses', () => {
  assert.throws(() => checkAutolinkLines('see GOALS.md.', 'x'), (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message));
});

// Review r1 F4: pin the exact extension list (kills dropSh/dropPy/dropIo/addJson) and case
// insensitivity (kills caseI) with one table test each.
test('checkAutolinkLines F4: exactly md/sh/io/ai/co/me/so/py refuse; none of the near-miss extensions do', () => {
  for (const ext of ['md', 'sh', 'io', 'ai', 'co', 'me', 'so', 'py']) {
    assert.throws(() => checkAutolinkLines(`x.${ext}`, 'x'), RefusedError, `x.${ext} should refuse`);
  }
  for (const ext of ['mjs', 'js', 'json', 'ts', 'toml', 'yaml', 'yml', 'txt', 'html', 'css']) {
    assert.doesNotThrow(() => checkAutolinkLines(`x.${ext}`, 'x'), `x.${ext} should pass`);
  }
});

test('checkAutolinkLines F4: the filename and URL rules are case-insensitive (Notion links a domain regardless of case)', () => {
  assert.throws(() => checkAutolinkLines('see README.MD for detail', 'x'), RefusedError);
  assert.throws(() => checkAutolinkLines('see GOALS.Md for detail', 'x'), RefusedError);
  assert.throws(() => checkAutolinkLines('see HTTP://example.com for detail', 'x'), RefusedError);
  assert.throws(() => checkAutolinkLines('see WWW.example.com for detail', 'x'), RefusedError);
});

// Review r1 "Survived: noFence": a fenced block's own content is exempt end to end, and scanning
// resumes correctly right after the closing fence.
test('checkAutolinkLines: a fenced GOALS.md is exempt, but a bare one right after the closing fence still refuses', () => {
  assert.doesNotThrow(() => checkAutolinkLines('```\nGOALS.md\n```', 'x'));
  assert.throws(
    () => checkAutolinkLines('```\nGOALS.md\n```\nGOALS.md', 'x'),
    (e) => e instanceof RefusedError && /^x:4 /.test(e.message),
  );
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

// Review round-2 F3 (probe2): render() must never hand a caller a page decisions-read.mjs would
// flag. checkWaitingItem is the pre-write refusal for each of the probe's four shapes.
test('checkWaitingItem: no default and no "No default" line is refused', () => {
  const item = GOOD_ITEM.replace(/\tDefault after 2030-06-15 18:00 -04:00: cap at 200 items per run\n/, '');
  assert.throws(() => checkWaitingItem(item, 'waiting/no-default.md'), (e) => e instanceof RefusedError && /no default/.test(e.message));
});

test('checkWaitingItem: an overdue default is refused (DUE)', () => {
  const item = GOOD_ITEM.replace('Default after 2030-06-15 18:00 -04:00', 'Default after 2020-01-01 00:00 -05:00');
  assert.throws(
    () => checkWaitingItem(item, 'waiting/overdue.md', new Date('2026-09-27T19:00:00Z')),
    (e) => e instanceof RefusedError && /overdue default/.test(e.message),
  );
});

test('checkWaitingItem: a pre-ticked option in the source file is refused', () => {
  const item = GOOD_ITEM.replace('\t- [ ] Cap at 200 per run (recommended)', '\t- [x] Cap at 200 per run (recommended)');
  assert.throws(() => checkWaitingItem(item, 'waiting/pre-ticked.md'), (e) => e instanceof RefusedError && /pre-ticked option/.test(e.message));
});

test('checkWaitingItem: an unticked Done line as the item\'s own last line is refused, naming the file and line (round-2 R2-3)', () => {
  // No warning fires here: there is only one Done candidate and it truly is the last line, so
  // the pre-R2-3 code let it through as a source-file defect the composed-page self-check would
  // then wrongly blame on the renderer.
  const item = `${GOOD_ITEM}\n- [ ] Done`;
  assert.throws(
    () => checkWaitingItem(item, 'waiting/done-in-item.md'),
    (e) => e instanceof RefusedError && /waiting\/done-in-item\.md:\d+ carries a Done line \(only the renderer writes Done\)/.test(e.message),
  );
});

test('checkWaitingItem: a stray Done line inside the item is refused (more than one Done line)', () => {
  const item = `${GOOD_ITEM}\n- [ ] Done\n- [ ] Done`;
  assert.throws(() => checkWaitingItem(item, 'waiting/stray-done.md'), RefusedError);
});

test('checkWaitingItem: a stray owner comment (escaped \\*\\*) inside the item is refused', () => {
  const item = GOOD_ITEM.replace('\t<empty-block/>', '\t\\*\\* a copied owner note\n\t<empty-block/>');
  assert.throws(() => checkWaitingItem(item, 'waiting/stray-comment.md'), (e) => e instanceof RefusedError && /comment/.test(e.message));
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

test('render refusal: a bare autolink-shaped filename in now.md', () => {
  const { deps } = renderDeps({ [p('docs', 'decisions', 'now.md')]: 'See GOALS.md for detail. Second sentence here now. Third one too now.' });
  assert.throws(() => render({ repo: REPO }, deps), (e) => e instanceof RefusedError && /GOALS\.md/.test(e.message));
});

test('render refusal: a bare www. in a session.md bullet', () => {
  const { deps } = renderDeps({
    [p('docs', 'decisions', 'session.md')]: 'since: 2026-09-27T18:16:00Z\n- See www.example.com for detail.',
  });
  assert.throws(() => render({ repo: REPO }, deps), (e) => e instanceof RefusedError && /www\.example\.com/.test(e.message));
});

test('render refusal: a bare ~ in a waiting item', () => {
  const item = GOOD_ITEM.replace('Evidence: the queue outgrew memory twice this month.', 'Evidence: see ~/.agents for the queue depth.');
  const { deps } = renderDeps({ [p('docs', 'decisions', 'waiting', 'a-item.md')]: item });
  assert.throws(() => render({ repo: REPO }, deps), (e) => e instanceof RefusedError && /bare ~/.test(e.message));
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
