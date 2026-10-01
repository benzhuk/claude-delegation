VERDICT: NEEDS_FIXES 578ec5c915b48fa68684d14ec71a40c6af3a0d5e

# Seam review: pickup-complete-1, integrated branch

Reviewed: /home/ben/Code/wt-pc, branch build/pickup-complete-1, HEAD 578ec5c915b48fa68684d14ec71a40c6af3a0d5e (merges 954206d P1, 95327e9 P2, 80cd701 P3, plus lead commit 578ec5c). Read-only. Nothing in the reviewed tree was written except this report.

Suite evidence, run on HEAD, output kept in scratch:
- `node scripts/run-tests.mjs` (whole suite): 2165 tests, 2162 pass, 0 fail, exit 0.
- The seven decisions test files (all three territory gates together): 310 pass, 0 fail.
- The integrator-gate.log in reports/ (10:23, 2 fail) is older than 578ec5c (10:26). HEAD is green today.

Count: 1 MAJOR, 1 MINOR, 2 NIT/INFO. The verdict rests on the MAJOR. Both patches are one line each and were verified on a scratch export.

---

## F1. MAJOR: the fresh-title fixtures read the wall clock, so the sealed suite goes red during every US fall-back hour (next one 2026-11-01 01:00-01:59 EST)

Evidence:
- skills/decisions/scripts/decisions-archive.contract.test.mjs:17-20 (added in 578ec5c): `freshTitleMeta()` builds `formatTitle('Test', new Date())` with `last_edited_time: now.toISOString()`.
- It copies P3's harness default at skills/decisions/scripts/decisions-handback.test.mjs:47, `const now = overrides.now || new Date();`. Every `runWith` call that does not pin its own meta uses that default.
- The handback resolves the repeated fall-back hour to EDT on purpose (decisions-handback.mjs:150-175, `nyWallTimeToUtcMillis`). So a title formatted during the second 1:xx AM (EST) reads 60-61 minutes stale. I computed this directly: now=2026-11-01T06:30:00Z gives "Test: 11/1 1:30AM Decisions", staleBy=60.00 min, STALE. At 05:30Z and 07:00Z it is fresh.
- Measured with a clock-shift preload (`--import`, scratch only, which moves only `Date`):
  - FAKE_NOW=2026-11-01T06:30:00Z: the contract test "handback reports the same unknown-H1 shape defect..." FAILS. decisions-handback.test.mjs gives 88 tests, 72 pass, **16 fail**.
  - FAKE_NOW=2026-11-01T07:30:00Z: both files pass (88/88, and the contract test passes).
- Because of spec Acceptance ("Sealed suite green on Netcup and on Windows from origin"), a gate run in that hour fails in a known, repeatable way, 17 tests in all. This is not a production defect: the hand-back's fail-closed fall-back rule is deliberate and documented. The defect is that the fixtures do not pin the instant they claim is "fresh".

Patch 1, skills/decisions/scripts/decisions-archive.contract.test.mjs (578ec5c's own helper):
```
-  const now = new Date();
+  const now = new Date(NOW);
```
(`NOW = '2026-09-24T12:00:00.000Z'` at :23. It is 8:00AM EDT, not ambiguous. `const` TDZ is not an issue because the function is only called inside the test body.)

Patch 2, skills/decisions/scripts/decisions-handback.test.mjs:47 (the same defect in P3's harness, which 578ec5c copied):
```
-  const now = overrides.now || new Date();
+  const now = overrides.now || new Date('2026-09-22T16:00:00.000Z');
```
This is safe. The title check never reads the clock: it compares the meta title with the meta `last_edited_time` only (decisions-handback.mjs:197-245). Every stale or boundary test already passes its own `now` (:993, :1010, :1188).

Predicted outcome, verified: I applied both lines to a `git archive HEAD` export in scratch. Under FAKE_NOW=2026-11-01T06:30:00Z and FAKE_NOW=2026-09-27T14:40:00Z, the two files give 97 tests with 96 pass. The one failure in both runs is "CLI: real process, without --head, calls real git". It fails only because the export is not a git repository, which has nothing to do with the patch. In the real tree it passes.

## F2. MINOR: SKILL.md tells a session to take `<decisions-page-id>` from `decisions_url`, but `decisions-title.mjs` accepts only a bare or dashed id

Point (1) of the brief. The field names and page-id form agree end to end for every live config. The only gap is a URL-form `decisions_url`, which nothing uses today.

What agrees (checked):
- The producer, decisions-title.mjs:271-273, prints `{"page": canonicalPageId(args.page), "title", "last_edited_time"}`.
- The consumer, decisions-handback.mjs:216-223, needs `typeof meta.page/title/last_edited_time === 'string'` and compares `canonicalPageId(meta.page) !== canonicalPageId(decisionsUrl)` (:224), using P3's `canonicalPageId` on both sides. Same three field names, and the page form is normalized on both sides.
- Every local `.agents/project.json` (20 checkouts, grep) has `"decisions_url": "3e1da11277a18174bccfea187d5c3972"`, a bare 32-hex id. So the SKILL.md block at :311-314 and :333-335 works today when the placeholder is filled from it.
- I ran an in-process simulation with a live-shaped page: `# Waiting on you now` with one decision, then `# Bearings — September 26, 2026 (independent, Opus) {toggle="true"}` and `# First bearings assessment — ... {toggle="true"}` sections that hold optionless summaries. The meta had a dashed, upper-case page id, and decisions_url was a Notion URL. Result: exit 0 with `title ok: Skills: 9/27 10:30AM Decisions` and then `HANDBACK ok`. With the live page's current off-pattern title (for example "Skills Decisions") the result is `TITLE off-pattern`, exit 1, which is what the spec intends. The first hand-back after release needs `set --topic Skills`, or the registration topic the lead is adding.
- `notion.js read` (~/.claude/scripts/notion.js:253-258) prints only the markdown body, never the page title. So a title such as `Bearings: 9/27 ...` (topic "Bearings" is valid under C3, and I checked that it matches the C4 regex) can never become a top-level H1 inside the decisions read. The P2 regex and P3 titles cannot collide.

The gap:
- decisions-title.mjs:36 with :227 rejects anything that is not 32-hex or a dashed UUID: `--page is not 32-hex or dashed`, exit 2. I checked this with a URL argument: exit 2.
- SKILL.md:240 says the page id comes "from `.agents/project.json`'s `decisions_url`". The 2026-09-22 spec (docs/specs/2026-09-22-decisions-current.md, M3 Config) says `decisions_url` may be "a page URL or id". `notion.js read` accepts a URL, so the same placeholder works for the read and fails for `meta`/`set`.
- For `set`, the SKILL.md exit-2 advice (:128-129) is "Pass `--topic`", which is the wrong remedy here.
- For `meta`, the `>` redirect leaves an empty file. The handback then goes BLIND ("title-meta file is not valid JSON", exit 3). SKILL.md's exit-3 advice (:354-356) says to rerun "both `notion.js read` calls", not the meta read.

Patch (docs only, stays inside C5's "32-hex or dashed"), SKILL.md, in the paragraph after the hand-back code block:
```
-<goals_parent_page>` (not checked). `--title-meta` is required, like `--goals`; a missing
+<goals_parent_page>` (not checked). `<decisions-page-id>` is the bare 32-hex id (the last 32 hex
+characters of `decisions_url` when that is a URL): `decisions-title.mjs` refuses a URL with exit
+2 (checked by `scripts/decisions-title.mjs`). `--title-meta` is required, like `--goals`; a missing
```
and in the exit-3 sentence:
```
-read first — rerun both `notion.js read` calls and the check (checked by
+read first — rerun both `notion.js read` calls, the `decisions-title.mjs meta` read, and the check (checked by
```
If skill-text.test.mjs pins either sentence, the builder updates that assertion in the same commit. There is an alternative in code: canonicalize `--page` through `canonicalPageId` in parseArgs. That widens C5's CLI contract, so it is the lead's call, not a reviewer patch.

## F3. NIT: P3 reads a topic from a registration P1 rejects as a whole (P1/P3 seam)

This is the P1/P3 boundary.

Producer side, P1: skills/decisions/scripts/decisions-pickup.mjs.
- :83 has `TOPIC_PATTERN = /^[A-Za-z][A-Za-z0-9 &._-]{0,39}$/`.
- :681-688: `hasTopic` means exactKeys with `topic` included, then `validateTopic`, which throws and invalidates the whole registration.
- :653-655 with :96-98: the path is `<AGENTS_HOME or ~/.agents>/ws/decisions-pickup/registrations.json`.
- :66-73 is `normalizedPage`.

Consumer side, P3: skills/decisions/scripts/decisions-title.mjs.
- :30 has `TOPIC_RE`, byte-identical to P1's pattern.
- :92-99 is the same path.
- :109-129 reads `entry.page` and `entry.topic`.
- :44-50 is `canonicalPageId`.

Where they agree: the key name `topic`, the regex, the file path, and the page normalization for bare 32-hex ids, dashed UUIDs and Notion URLs. I checked that a URL with `?pvs=4`, and an upper-case dashed id, both return "Skills". `topic: null` is invalid in P1 and ignored in P3, so no topic is used in either case.

Where they diverge: I simulated in scratch a registration P1 refuses entirely. One case had an extra key. The other had a sibling entry with topic `Bad:colon`. P3 still returned "Skills" for both. P3 also follows a symlinked registrations.json, which P1 refuses. There is one more corner: a URL slug ending in hex letters right before the id (for example `Bad-<32hex>`). There P1's 36-character alternative at :71 captures 35 characters and rejects the page (fail-closed), while P3 extracts the right id.

None of these makes a wrong page's topic reach a title. C3 only requires P3 to skip "missing or unparsable", and a broken registration already fails loudly on the pickup side. So this is not a contract contradiction. No fix is required. If the lead wants one meaning of "valid registration", the fix is for P3 to return null unless every entry has exactly P1's key set and a valid topic. That is a judgment call and needs no patch.

## F4. INFO, point (2): `readDecisionsUrl: () => null` in 578ec5c does not hide the page-mismatch path

- Why the injection is needed: the contract test passes `--repo r`. The default `defaultReadDecisionsUrl` (decisions-handback.mjs:409-414) calls `loadProjectConfig('r')`, which walks up from the cwd (project-config.mjs:12-19) to the checkout's own `.agents/project.json`. That file has decisions_url `3e1da…`, which is not the test's `PAGE` `0123…`. Without the injection the test would go BLIND for a reason that has nothing to do with archive shape, and whether it did would depend on the cwd. With the injection the contract test no longer depends on the cwd. That is correct, and it matches P3's own `runWith` default (decisions-handback.test.mjs:93).
- The mismatch path is covered where it belongs:
  - decisions-handback.test.mjs:1101-1116 injects decisions_url `a…a` against meta page `b…b` and asserts exit 3, `HANDBACK blind`, and no `title ok`.
  - :1132-1146 covers dash and case equivalence.
  - :630-642 and :798-815 run the real default reader against a real project.json end to end.
- Remaining gap (INFO, not blocking): no test combines the real default reader with a wrong-page meta. The comparison is the shared `titleCheckLine` at :224, so the risk is low.
- "Passes because it isn't looking" check: the contract helper is always fresh. That is correct for a shape-only contract. Stale and off-pattern cases are fed at :988, :1007 and :1022, and an unparsable `last_edited_time` goes BLIND at :1118. I found no looking-away check in 578ec5c's handback half. Its one real defect is F1: it pins nothing, so it can fail when it should not. It never passes when it should not.

## 578ec5c, the symlink half: verified sound

- decisions-pickup.test.mjs:711 now uses `childEnv(fx.fixtureRoot, { AGENTS_HOME })` (skills/multi/scripts/test-child-env.mjs:32-40). That is the suite's required spawn-env helper: it seals the messaging socket and token and points HOME/USERPROFILE at the fixture. The CLI's `AGENTS_HOME` still wins, because `over` is spread last.
- The test still discriminates. It spawns `process.execPath` (no PATH dependence) on a symlink in fixtureRoot. If `isMainModule` failed through the symlink, stdout would be empty and `JSON.parse(child.stdout)` at :715 would throw.

## P2/P3 seam (decisions-handback reading through decisions-read): agreement verified

- Producer side, P2: decisions-read.mjs:204 has `inArchive = topLevelHeading === 'Closed' || /^(?:First )?[Bb]earings\b/.test(topLevelHeading)`, which is gated by `detailsDepth === 0` (:201) and by the toggle-stripping in `matchTopLevelHeading` (:74-82). `shapeless` excludes `archivedTitles` (:378-381).
- Consumer side, P3: decisions-handback.mjs:75-80 `shapeLines` reports `doc.shapeless` as is, and :46-52 `objectionableLines` uses `formatText`. It has no second archive rule, so the Bearings scope reaches the hand-back through the reader alone.
- The title check (:197-245) reads only the meta file, never the page body, so it is independent of any heading scope.
- Simulated: live Bearings headings holding optionless summaries give no SHAPE lines and `HANDBACK ok`. The same page with `# Not Bearings …` and `# Bearingsless` gives two SHAPE lines and `HANDBACK blocked`. They agree.

---

Cause: 578ec5c's new `freshTitleMeta()` (and the P3 harness it copied) builds the "fresh" title from the wall clock. The hand-back deliberately resolves the repeated fall-back hour to EDT, so the fixture reads 60 min stale during 01:00-01:59 EST on fall-back day.
Discriminating check: run decisions-archive.contract.test.mjs and decisions-handback.test.mjs with a `Date` shift preload at FAKE_NOW=2026-11-01T06:30:00Z: 17 failures before the patch, 0 title-related failures after.
Fix location: skills/decisions/scripts/decisions-archive.contract.test.mjs:18 and skills/decisions/scripts/decisions-handback.test.mjs:47 (pin `now` to a fixed unambiguous instant).
Simplification: pin both helpers to a fixed instant. No other code change and no production change is needed, since the title check never reads the clock.
