VERDICT: NEEDS_FIXES 3af975a553f35a0099c6c9195d4d645a9c56694d

Lane 32 (autolink-guard), review r1. Diff origin/main...3af975a (the branch tip is now 963a7f7; that commit only touches the orchestrator's `docs/work/wr-2026-09-27-autolink-guard.record.md`). The review was read-only. Every mutation and trial fix ran on a scratch `git archive` copy and a scratch clone of origin/main (1135f12), and the worktree still shows `git status` clean.

Findings: 2 blocking (F1, F2), 3 low. The combined trial patch for F1+F2+F3 (below) gives 83/83 tests passing, exit 0 on the current main sources, and the proof line reported at the correct number.

## Findings

### F1 (Medium, blocking): the `<...>` exemption covers every span between `<` and `>`, applies to all three rules, and lets the defect through in ordinary prose
`skills/decisions/scripts/decisions-render-core.mjs:144`: `.replace(/<[^>]*>/g, ...)` inside `stripAutolinkExempt`.
- The spec's `stripAutolinkExempt` blanks code spans, whole links and fenced blocks. It exempts `<...>` only from rule (c), the URL rule. The builder applied the blanket blanking to (a) and (b) as well, and the builder report says "No other assumptions or deviations".
- Measured false negatives (each passes today): `latency < 5s, see GOALS.md -> fixed`; `x <- y, ~/.agents -> z`; `a < b and GOALS.md > c`; `<GOALS.md>`; `<~/.agents>`. Agent prose uses `->` and `<` routinely. Any of these lines would reach Notion and cause the exact exit-5-after-write loss this lane exists to stop.
- Fix: exempt only a real angle-bracket autolink. The exact patch:
  - current: `        .replace(/<[^>]*>/g, (m) => ' '.repeat(m.length)),`
  - replacement: `        .replace(/<(?:https?:\/\/|www\.)[^>\s]*>/gi, (m) => ' '.repeat(m.length)),`
  - Also update the doc comment at :123-124 ("and `<...>` angle-bracket spans") to "and `<http(s)://...>` / `<www....>` autolinks".
- Add tests: `a < b, see GOALS.md -> c` refuses; `<GOALS.md>` refuses; `<~/.agents>` refuses; the existing `<https://example.com/x>` test still passes.
- Result of the trial on the scratch copy: 83/83 pass. All five cases above refuse. `<https://example.com/x>` passes. `<details>`/`<summary>` waiting items are unaffected, because those tags contain no token. Current main sources render with exit 0.

### F2 (Medium, blocking): the line number in a session.md refusal is wrong
`decisions-render-core.mjs:410`: `checkAutolinkLines(bullets.join('\n'), 'session.md')` numbers lines by bullet index. Line 1 of the file (`since:`) is dropped, and so is every blank line.
- Measured: I appended `- See GOALS.md for the current goal.` to origin/main's session.md, which makes it line 10 of a 10-line file. `render --repo` exits 2 but reports **session.md:9**. The builder report's live proof ("line 9 ... names the file and line") is therefore wrong: the file had 9 lines before the append. Every blank line between bullets adds another line of error.
- The spec requires the message to name the file and line. The length check a few lines below already uses `idx + 2`, which shows the file-line intent.
- Fix, exact patch:
  - current: `  checkAutolinkLines(bullets.join('\n'), 'session.md');`
  - replacement: `  checkAutolinkLines(text, 'session.md');`
  - Line 1 (`since: <ISO>`) can never match: an ISO timestamp contains no `~`, no `www.`/`http` and none of the listed extensions. `parseSessionSource` has already validated it.
- Add a render-level test: a session.md whose third line holds `GOALS.md` refuses with `/^session\.md:3 /`.
- Result of the trial: the proof now reports `session.md:10`, 83/83 tests pass, and the current sources exit 0. (`checkProseLines` at :409 has the same off-by-one. It predates this lane and is out of scope. Mention it to the spec owner; it is not a condition of this verdict.)

### F3 (Low): the filename check is not limited to the final path segment, and the test meant to pin that cannot catch it
`decisions-render-core.mjs:117`: the lookahead `(?![A-Za-z0-9_-])` accepts a following `/` or `.`.
- Measured: `notes.md/x.mjs` refuses on `notes.md`, which is not the final segment (the final segment is `.mjs`, so it should pass). `GOALS.md.bak` refuses even though its extension is `bak`.
- Mutation: widening the character class to the whole path (`[A-Za-z0-9_/.-]+`) survives the suite. The "final path segment" test only asserts that `2026-09-27.md` appears in the message, and that assertion holds either way.
- Both errors lean toward refusing (fail-safe), so this is Low. It still breaks the binding rule ("FINAL segment").
- Fix, exact patch:
  - current: ``(?![A-Za-z0-9_-])`);``
  - replacement: ``(?![A-Za-z0-9_-]|[./][A-Za-z0-9_-])`, 'i');`` (see F4 for the `'i'`; drop it if F4 is declined)
- Add tests: `notes.md/x.mjs` passes; `GOALS.md.bak` passes; `see GOALS.md.` (sentence end) still refuses.
- Result of the trial: those three behave as stated, 83/83 pass, and the current sources exit 0.

### F4 (Low): the extension list is correct but no test pins it, and the match is case-sensitive
- List at :116 is exactly `md, sh, io, ai, co, me, so, py`, confirmed. But the mutations `dropSh`, `dropPy`, `dropIo` and `addJson` all SURVIVE the suite. Only `md` (refuses) and `mjs` (passes) are tested.
  Fix: add one table test. Each of `x.md x.sh x.io x.ai x.co x.me x.so x.py` refuses. Each of `x.mjs x.js x.json x.ts x.toml x.yaml x.yml x.txt x.html x.css` passes. That test kills all four mutants.
- `README.MD`, `GOALS.Md`, `HTTP://example.com` and `WWW.example.com` all pass today. Domain matching is case-insensitive, so Notion is likely to link these. Suggested fix: the `'i'` flag on `AUTOLINK_FILENAME_RE` (patch in F3) and on `AUTOLINK_WWW_HTTP_RE`:
  - current: `const AUTOLINK_WWW_HTTP_RE = /www\.\S+|https?:\/\/\S+/;`
  - replacement: `const AUTOLINK_WWW_HTTP_RE = /www\.\S+|https?:\/\/\S+/i;`
  The mutation `caseI` survives today. With these flags, an uppercase test (`README.MD` refuses) pins the behaviour. In the trial the current sources still exit 0. This is a judgement call; if it is declined, the spec owner should note it.

### F5 (Low): the SKILL.md sentence overstates the rule
`skills/decisions/SKILL.md:43-47` says the renderer refuses "any bare filename". It refuses only the eight TLD-shaped extensions, and `scripts/collect-status.mjs` stays legal.
- Fix: replace "any bare filename," with "a bare filename ending in .md, .sh, .io, .ai, .co, .me, .so or .py,".
- The house style elsewhere writes "(checked by `scripts/decisions-read.mjs`)". The new sentence uses "`decisions-render.test.mjs`" without the `scripts/` prefix. Align it to `scripts/decisions-render.test.mjs`.
- Placement: the sentence is inserted mid-line 43, at the first sentence boundary after line 42. That is acceptable, and the builder disclosed it.

## Acceptance tests / mutations
All 83 tests pass on 3af975a (`node --test skills/decisions/scripts/decisions-render.test.mjs`, scratch copy). I applied 26 mutations to scratch copies of core.
- Killed: remove the check body (11 fail); remove the `~` rule; remove the URL rule; remove the backtick blanking; remove the link blanking; remove the `<>` blanking; add owner-quote blanking (this is the stripExempt-widening twin; the owner-quote test string matches stripExempt's `Your note, <M-D>: "…"` shape exactly, so the test discriminates); add `mjs`; drop the done-line call; mislabel the done-line; scan the whole history file instead of the Summary line; drop each of the waiting, now, session and history call sites; drop the line number from the message.
- Survived: `dropSh`, `dropPy`, `dropIo`, `addJson`, `caseI` (F4); `wholePath` (F3); `noFence`, where the fence toggle is removed. Nothing tests that a fenced block exempts its content. Add: "```\nGOALS.md\n```" passes, and GOALS.md after the closing fence refuses.
- Every item on the spec's acceptance list has a test that exists and fails when its rule breaks, with one exception: "final segment" (F3).

## Extension list
Exactly md, sh, io, ai, co, me, so, py (`decisions-render-core.mjs:116`). `mdx`, `python`, `some` and `com` are not matched, thanks to the lookahead. Two gaps: the check is not limited to the final segment (F3), and the list is not pinned by a test (F4). Spec-level note (the spec's gap, not the builder's): bare `example.com` passes, because `com` is not on the list. The spec excluded emails and `#123` explicitly but said nothing about `.com`; the spec owner may want to add it.

## Bare ~ and URLs
- `~`: any `~` outside a code span, link or fence refuses. That includes `approx ~5 min` and `~~~` fences, both of which refuse. This matches the spec's "a bare `~`" and errs safe.
- URLs: bare `www.x` and `https://x` refuse, `[t](url)` passes, `<https://…>` passes. The one hole is the `<...>` over-exemption (F1).

## Exemptions
- No owner-quote exemption, confirmed: the test at test:268 fails if one is added.
- `stripExempt` (core:72-78) is byte-identical to origin/main. It is not widened, and `checkAutolinkLines` does not call it.

## Scan scope
- Scanned: now.md, session.md, waiting items, history `Summary:` lines, and `--done-line`. Each call site is killed by its own mutation.
- `--done-line` is checked first in `render()` (core:497) with the label `--done-line`. CLI proof: `render --done-line '- [ ] Done, see ~/x'` exits 2 with `--done-line:1 carries a bare ~ …`.
- History bodies are not scanned (the `histBody` mutation is killed). Templates are not read by `render` at all. The default done line `- [ ] Done` passes.
- Cosmetic: a Summary refusal reads `history/<date>.md:2:1` (a double line suffix), the same as the existing `checkProseLines` convention. Not a condition of this verdict.

## Error contract
The CLI exits 2 through `RefusedError`, with nothing on stdout. The message has the form `decisions-render: <file>:<line> carries a bare filename Notion will autolink (GOALS.md) — wrap it in backticks or write it as a link.`, which includes the fix text. The line number is wrong for session.md (F2).

## False positives on real sources
- I ran the branch's `render --repo .` on a scratch clone of the current origin/main (1135f12). It covers now.md, session.md, `waiting/release-0-20-16.md` and all history Summary lines, including the new 2026-09-28 file. Result: **exit 0**, no hits.
- Also on current main: history/2026-09-27.md:20 (bare `~/.agents/ws-off-sweep`, a body line) stays legal.
- Probes that pass: `e.g.`, `i.e.`, `etc.`, `U.S.`, `p.s. me`, `0.20.16`, `v0.20.10`, `2:16 PM, Sep 27`, `11:02 PM New York`, `Node.js`, `Next.js`, `.yaml`/`.toml`/`.json`/`.ts`/`.txt`/`.html`/`.css`/`.yml`, `the so-called fix`, `done.So`.
- True-positive oddities that are acceptable and fail safe: `Mr.me`, `No.io`, `user@example.co`.
- `publish --dry-run` needs a Notion reader, so I did not run it. `render` is the only code this lane changed, and publish calls it.

## Territory
The code diff touches only the core file, the test file, the 2-line re-export in `decisions-render.mjs` (the spec names that file as a re-exporter, and the tests import through it), and the one SKILL.md sentence. The `docs/work/` record comes from the orchestrator's own commits (a43d96e, 963a7f7). `decisions-render-publish.mjs`, `normalize`, `docs/decisions/**`, `notion.js` and `goals-mirror.mjs` are untouched.
