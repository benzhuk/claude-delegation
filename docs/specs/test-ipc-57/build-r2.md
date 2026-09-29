DONE

# Lane 57 fix round 2: review-r2 R1-R3 (fix round at 1135839, review-r2.md)

Worktree: /var/tmp/lane-57/wt (build/test-ipc-57-1). Territory unchanged: scripts/run-tests.
test.mjs, scripts/test-home.test.mjs, the N2 scanner (skills/multi/scripts/hooks.test.mjs) and
its own unit tests. Scratch: /var/tmp/l57d-T6he (git-archive copy of 1135839, an extracted
standalone copy of the scanner functions for the pending-verification steps, a mutated
note-inbox.test.mjs copy - kept per the no-delete rule, nothing from it committed).

GOAL line served: "work lost or stalled" - same as round 1: a scanner that looks clean but
misses a real env-leak site, or fires on an unrelated edit, costs builder time later. Nearest
NOT: "a rule no script checks" - all three findings became mechanical assertions in this file's
own unit tests, not notes.

Preliminary: confirmed `git diff --stat 1135839 HEAD` (and `..dff5538`) touches only
docs/specs/test-ipc-57/*.md and the work record - the code file I'm editing is unchanged since
review-r2's static reading, so its findings apply to the tree I actually edited.

## Per finding

**R1 (call starting inside a multi-line template inverts part (b)'s per-line scan).**
Red evidence: on a git-archive copy of 1135839 (/var/tmp/l57d-T6he/red-1135839, OLD
implementation untouched, new test body appended), the fixture
```
const NODE = process.execPath;
spawn(NODE, ['--input-type=module', '-e', `
  console.log(1);
`], { env: process.env, stdio: 'ignore' });
```
gives `findEnvLessSpawns(...).length === 0` - `AssertionError: 0 !== 1`. Matches the review's
static trace exactly: part (a) skips the call because `env: process.env` reads as a valid env
key; part (b) resets its string state on line 3 (which begins mid-template), reads the leading
backtick as an *opener*, and blanks the rest of that line including `env: process.env`.
Fix location: hooks.test.mjs - part (a) (around :540-575) now records every call it judged
whole (extent closed with `)`) into `ownedSpans`, and treats `process.env`-by-name and a bare
spread as inheriting values on THIS call, not just `undefined`/`null`. Part (b) (around
:606-622) skips any line inside an owned span before running its own per-line scan.
Green result: same fixture, `findEnvLessSpawns(...).length === 1` on the patched tree. Full
N2 real-repo scan stays green (no new hits).

**R2 (a runaway call extent is silent).**
Red evidence: same red-1135839 archive, two cases in one fixture:
- Unclosed call (`spawn(NODE, ['-e', script], { stdio: 'ignore' }` with no closing `)` anywhere):
  old code returns `hits.length === 1` (the fallback `text.slice(openIdx)` still parses as a call),
  but `hits[0].target` is `'NODE'`, not matching `/call extent not parsed/` -
  `AssertionError [ERR_ASSERTION]`.
- Regex literal containing `//` (`/https?:\/\//.source` as the last thing in the fixture text,
  with no trailing newline): old code follows the same fallback path (the `//` inside the escaped
  slashes reads as a line-comment opener with no newline after it, so the scan breaks and returns
  `text.slice(openIdx)` to end-of-text); `hits[0].target` is again `'NODE'`, same mismatch.
Fix location: hooks.test.mjs, right after computing `line` (around :551-559): `if
(!call.endsWith(')') || call.split('\n').length > 40) { found.push({ line, fn: m[1], target:
'call extent not parsed - rewrite or split this call' }); continue; }` - exactly the reviewer's
patch, verbatim.
Green result: both cases now give `hits.length === 1` with `target` matching
`/call extent not parsed/`. Full N2 real-repo scan on the actual test tree stayed green with the
existing 10-file/14-site exemption table and no new offenders - no real test file in this repo
has an unclosed spawn-family call or one over 40 lines. Nothing to report or fix in the scanner
class itself.

**R3 (a bare `node` word in a comment brings an unrelated call into scope).**
Red evidence: red-1135839 archive, fixture
```
execFileSync('git', ['status'], { // the node process reads this output later
  cwd: repo, encoding: 'utf8' });
```
Old code: `findEnvLessSpawns(...)` returns `[{ line: 1, fn: 'execFileSync', target: "'git'" }]`
instead of `[]` - the raw call text (unstripped of comments) contains the bare word "node" in
the comment, so `nodeTokenRes` matches it and the git-only call is wrongly brought into scope
and flagged as env-less.
Fix location: hooks.test.mjs (around :560-561): `const noComments = call.replace(/\/\*[\s\S]*?\*\//g,
' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1'); const reachesNode = m[1] === 'fork' ||
nodeTokenRes.some((re) => re.test(noComments));` - the reviewer's patch, verbatim.
Green result: same fixture gives `[]`. No real test file in the repo tripped this false-red
before or after the fix (confirmed by the unchanged real-tree exemption counts below), so
nothing to report per the "a real site gets fixed in the scanner, never exempted" rule.

## Pending verification (review-r2's list, run and recorded)

1. **Docs-only diff.** `git diff --stat 1135839 HEAD` = 4 files, all under `docs/` (build-r1.md,
   lead-ruling-r2.md, review-r2.md, the work record). `git diff --stat 1135839 dff5538` = 2 files
   (build-r1.md, the work record), also docs only. Confirmed the code I'm editing was untouched
   between the reviewed commit and my start point.
2. **note-inbox.test.mjs:373 mutation.** Removed the `env: childEnv(...)` key from the call at
   note-inbox.test.mjs:369-374 (leaving `{ encoding: 'utf8' }`), on a scratch copy (not the real
   file). Ran the patched `findEnvLessSpawns` against both the original and mutated text:
   - original: `[]` (0 hits, correctly sealed).
   - mutated: `[{"line":369,"fn":"execFileSync","target":"process.execPath"}]` - exactly `[369]`,
     as review-r2 expected.
3. **Real per-file exemption counts.** Ran the patched scanner + `exemptionOffenders` over
   `walkTestFiles(REPO)` on the real worktree. Result: exactly the 10 files at
   hooks.test.mjs:646-667, each at its listed count -
   `hooks/codex-unsupported.test.mjs`:1, `scripts/bugfix-fields.test.mjs`:2,
   `scripts/collect-from-origin.test.mjs`:1, `scripts/janitor.test.mjs`:1,
   `scripts/native-continuation-smoke.test.mjs`:2, `scripts/prefix-test.test.mjs`:1,
   `scripts/work-record.test.mjs`:1, `skills/decisions/scripts/decisions-read.test.mjs`:3,
   `skills/decisions/scripts/goals-mirror.test.mjs`:1,
   `skills/team-build/scripts/review-run.test.mjs`:2. Offenders list: `[]`. No new site, no stale
   entry.
4. **Three touched files, one run.** `TMPDIR=/var/tmp node --test skills/multi/scripts/hooks.
   test.mjs scripts/test-home.test.mjs scripts/run-tests.test.mjs` -> 91 tests / 90 pass / 0 fail
   / 1 skipped (win32-only). (Build-r1's baseline: 88/87/0/1 skipped; +3 is this round's new unit
   tests.)
5. **R1 multi-line shape, in-memory.** 0 hits at 1135839 (measured on the git-archive copy, see
   R1 red evidence above), 1 hit after the patch (measured on the worktree, see R1 green result
   above) - matches review-r2's prediction exactly.

## Commits

- `9e36a08` fix(hooks): close N2 scanner false green and silent-desync gaps (review-r2 R1-R3) -
  on build/test-ipc-57-1, not pushed.

## Test counts

- Touched-file gate: `TMPDIR=/var/tmp node --test skills/multi/scripts/hooks.test.mjs
  scripts/test-home.test.mjs scripts/run-tests.test.mjs` -> 91 tests / 90 pass / 0 fail / 1
  skipped (win32-only signal test). Was 88/87/0/1 before this round; +3 this round's new tests
  (R1, R2 [2 assertions inside one test], R3).
- Full suite: `TMPDIR=/var/tmp node scripts/run-tests.mjs` -> 3038 tests / 3033 pass / 0 fail /
  5 skipped, exit 0. Was 3035/3030/5 skipped before this round; +3 is this round's new unit
  tests.
- Red proofs (git-archive copy at /var/tmp/l57d-T6he/red-1135839, OLD implementation untouched,
  new test bodies appended): all 3 new tests fail (R1: `0 !== 1`; R2: two assertion mismatches,
  `'NODE'` not matching `/call extent not parsed/`, for both the unclosed-call and regex-literal
  cases; R3: `[{line:1,fn:'execFileSync',target:"'git'"}]` not deepEqual `[]`).

## C4 fields

Cause: (R1) part (a) treated `env: process.env`/a bare spread as "has a real env key" and left
the actual inheriting-value judgment to part (b); part (b) re-tracked string/comment state fresh
on every line, so a line that BEGAN inside a multi-line template inverted that state and blanked
the inheriting value out. (R2) `extractBalanced` has no concept of a regex literal, so `//`
inside one (e.g. `/https?:\/\//`) reads as a line-comment opener; if that happens on the line
holding the call's real closing `)`, the fallback `text.slice(openIdx)`-to-end-of-text silently
stands in for the call, with no signal that anything went wrong. (R3) the node-reachability
check scanned the call's RAW text (deliberately, to catch a node token inside a quoted `sh -c`
script), which also let a bare "node" inside a `//`/`/* */` comment pull an unrelated call into
scope.

Discriminating check: for each finding, a synthetic fixture built with this file's own
`['sp','awn'].join('')` self-scan-avoidance convention, run through `findEnvLessSpawns` directly
- proved red against the untouched 1135839 implementation (measured on a git-archive copy),
green against the patched one, exactly as instructed. The real-repo N2 test (walking every
actual test file) is the integration check tying it together: it stayed green with the same
10-file/14-site exemption table, no new offenders, before and after - none of the three fixes
changed a single real site's classification.

Fix location: skills/multi/scripts/hooks.test.mjs's `findEnvLessSpawns` - `ownedSpans` added
(R1), the extent tripwire added right after `line` is computed (R2), the node-reachability check
now runs on `noComments` instead of the raw `call` (R3), part (b)'s loop now skips owned spans
(R1) - plus 3 new unit tests (one for R1, one covering both R2 cases, one for R3), and the
function's leading doc comment updated to match all three changes.

Simplification: part (a) now judges each spawn-family call whole, including its own inheriting
env value; part (b) shrinks to strictly "wrapper calls only" (lines outside any span (a) already
owns). No call is ever judged twice, and a malformed extent fails loud instead of silently
standing in for a real judgment - removing the split-ownership ambiguity between (a) and (b)
that caused R1 in the first place.

## Cleanup

No dev server started; nothing to kill. Scratch at /var/tmp/l57d-T6he kept per the no-delete
rule (git-archive copy of 1135839, extracted scanner-core/-full.mjs helper modules, mutated
note-inbox.test.mjs copy, verification driver scripts); nothing from it committed. No git
identity set, no --no-verify used. One commit on build/test-ipc-57-1 (9e36a08), not pushed.
State file updated: /var/tmp/lane-57/test-ipc-57-state-r2.md.
