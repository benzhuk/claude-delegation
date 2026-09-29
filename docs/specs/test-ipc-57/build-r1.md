DONE

# Lane 57 fix round 1: N2 scanner false greens (review-r1 F1-F8, W1)

Worktree: /var/tmp/lane-57/wt (build/test-ipc-57-1). Territory unchanged: scripts/run-tests.
test.mjs, scripts/test-home.test.mjs, the N2 scanner (skills/multi/scripts/hooks.test.mjs) and
its own unit tests. Scratch: /var/tmp/l57c-VRMz (git-archive copies at 0824e76/1167b9a, tap
logs, gate logs - kept per the no-delete rule, nothing from it committed).

GOAL line served: "work lost or stalled" - a scanner that looks clean but misses a real
env-leak site (or that goes red on an unrelated edit) costs builder time later; that's the
whole point of review-r1 and this ruling. Nearest NOT: "a rule no script checks" - every
finding below became a mechanical assertion, not a note.

Environment note: the shared host's /tmp tmpfs was at 100% inode usage (unrelated sessions'
files) for the whole round; every node invocation below used TMPDIR=/var/tmp to avoid it. A
harness-internal cwd-tracking write to /tmp failed on nearly every Bash call ("No space left on
device"), which is why several `Bash` outputs show exit code 1 even though the command's own
output (and its own echoed exit code, checked explicitly twice) was 0/green. Not in my
territory to fix; noted so it isn't mistaken for a real test failure.

## Per finding

**W1 (path separators).** Red at 0824e76: N/A (the exemption-by-file API didn't exist yet, so
this is inseparable from F2 - see F2's red below, same test). Fix: `toPosix` (already imported
from transport.mjs, `p.replace(/\\/g,'/')`) applied to `rel` before it's used as an exemption
key or printed (hooks.test.mjs, inside the N2 test and `exemptionOffenders`). Green: real-repo
N2 test passes; unit test feeds `'scripts\\fixture.test.mjs'` and confirms it matches the
`'scripts/fixture.test.mjs'` exemption key.

**F1 (comment-corrupted call slice).** Red at 0824e76 (measured on git-archive
/var/tmp/l57c-VRMz/red2, only the new test body appended, old implementation untouched): `only
the first, genuinely env-less call should be flagged` - `0 !== 1`. Fix location:
hooks.test.mjs - new `codeOnly` helper (blanks comments and string bodies to spaces, same
length) plus comment-aware `extractBalanced`; the env-key test now runs on `codeOnly(call)`
matching `env` only as an object key, never a raw substring. Green: real-repo N2 test passes;
new unit test ("a comment inside a call does not corrupt...") passes both the apostrophe-in-
comment and the `// env: later`-in-comment cases.

**F2 (exemptions keyed by file:line).** Red at 0824e76 (measured): the new test calls
`exemptionOffenders(...)`, which doesn't exist there - `ReferenceError: exemptionOffenders is
not defined`. That's a legitimate red: this round's per-file-count API is new. Fix location:
hooks.test.mjs - `N2_SPAWN_ENV_EXEMPTIONS` is now `Map<file, {count, reason}>`; `exemptionOffenders(rel, hits, exemptions, seenExempt)` reports nothing when the count matches,
every hit (plus a mismatch note) when it doesn't, and a stale-entry sweep runs after the file
loop for any exempted file with no matching hits left. Green: real-repo N2 test passes; unit
test proves both directions - a line shift with the same count stays green, a new site (count
too high) OR a fixed one (count too low) both go red.

**F3 (sh -c running node out of scope) + F6 (fork/'node' not node-direct), folded together per
the ruling.** Red: N/A (F3/F6 weren't in the ruling's required-red list; the review's own
"measured live" evidence at collect-from-origin.test.mjs:423 stands as the red-equivalent
proof - that site was invisible to the OLD scanner). Fix location: hooks.test.mjs - the
node-direct gate no longer requires the call's own FIRST argument to equal `process.execPath`;
it now accepts the call if `process.execPath`, a local NODE-style const, or a bare `'node'`/
`"node"` string appears ANYWHERE in the call's own raw text (deliberately not
`codeOnly(call)` - a node token can legitimately sit inside a quoted `sh -c` script, and
over-including a comment's mention of "node" only means more scrutiny, never less), or the
call is `fork(...)` (always node, unconditionally). Green: real-repo N2 test passes with the
new collect-from-origin.test.mjs exemption (count 1); new unit test covers fork, a bare 'node'
string, a shell running process.execPath (flagged) and a shell running only git (still out of
scope).

**F4 (inheriting env value, and build.md's wrong citation).** Red: N/A per se (build.md's own
citation of native-continuation-smoke.test.mjs:17 as inert was itself wrong - see below); the
review's "measured live" evidence at native-continuation-smoke.test.mjs:20 (env: the real
environment object) is the equivalent red - invisible under the old scanner in every way (not
a recognized function name at all). New unit test proves red at 0824e76: `env: undefined must
count as inheriting the whole environment` - `0 !== 1`. Fix location: hooks.test.mjs, two
halves for two different false-positive risks:
  - `env: undefined` / `env: null`, scoped to a real spawn-family call ONLY (not universal) -
    a universal check would have false-flagged scripts/wiring-check.test.mjs's own unrelated
    `env: null` fixture (measured while iterating: it is not a child-process spawn option, just
    a same-named parameter to an in-process function).
  - `env: <the real environment object>` and a bare spread of it, checked UNIVERSALLY (any
    function name, so `runChild(...)` is caught), one line at a time with `codeOnly(line)` -
    NOT `codeOnly(wholeFile)`, because a regex character class holding a stray quote elsewhere
    in the file (measured: hooks/codex-unsupported.test.mjs's own quote-stripping regex) can
    desync a whole-file string-tracking scan for everything after it; per-line resets bound
    that risk to one line.
  Corrected citation: build.md's build round cited native-continuation-smoke.test.mjs:17 as an
  "inert -e literal" exemption. That line is not a real call at the file's own scope - it's a
  spawn call written INSIDE that scenario's own eval'd source string (the script text handed to
  a node child). It IS a genuine second hit under this scanner (which reads string contents the
  same as code), so the file's exemption is count:2 - :17 (the nested literal, now visible after
  F5 removed the escape hatch that used to hide it) and :20 (the real runChild/full-environment
  site F4 was written for). Green: real-repo N2 test passes with this exemption; new unit test
  covers undefined/null/the real environment object/spread, plus a `runChild(...)`-shaped call
  under an unlisted function name.

**F5 (delete the inert-literal escape hatch).** Adopted exactly as ruled: deleted the whole
`litMatch`/marker block outright rather than replacing it with a deny-list. Its sites (4, per
the ruling's count, matching build.md's citations minus the in-territory one and the corrected
:17/:20 pair folded under F4's exemption above):
  - scripts/janitor.test.mjs:1074 - a trivial holder-process spawn, out-of-territory exemption.
  - skills/team-build/scripts/review-run.test.mjs:111 and :577 - `spawnSleeper()`'s own spawn
    (its `opts` is a function parameter, never resolvable) and a trivial dead-pid probe,
    out-of-territory exemption (count 2, one file).
  - scripts/run-tests.test.mjs:804 (in-territory) - sealed directly instead of exempted (2nd
    commit): `env: sealedEnv(homeDir)` added to the existing dead-pid probe.
  native-continuation-smoke.test.mjs's freed :17 site is counted under F4's exemption above,
  not re-listed here, to avoid a duplicate reason for the same file.

**F6.** Folded into F3 above (fork always in scope; `'node'`/`"node"` added to the node-direct
token set).

**F7 (ambiguous one-hop resolution).** Red at 0824e76 (measured): `two same-named declarations
must not resolve to whichever one has env` - `0 !== 1`. Fix location: `resolveIdentHasEnvKey`
now requires the identifier be declared EXACTLY ONCE as an object literal in the file (two or
zero matches -> `null`, not vouched for), and matches `env` only as an object key via
`codeOnly`, not `\benv\b` anywhere (which used to also match e.g. `cwd: env.HOME`). Green:
real-repo N2 test passes (note-send.test.mjs:868, the one real one-hop case, still resolves -
still exactly one declaration there); new unit test proves the ambiguous case is no longer
vouched for.

**F8 (scratchHome leak, non-blocking, adopted).** Fix location: scripts/test-home.test.mjs -
both `spawnAndSignal` (:69-71) and the handler-idempotency test (:530-532) now push
`() => fs.rmSync(sealedHome, {...})` onto the file's own `cleanups` array before spawning,
matching every other fixture directory in the file.

## Final exemption table (N2_SPAWN_ENV_EXEMPTIONS, hooks.test.mjs)

| file | count | reason |
|---|---|---|
| hooks/codex-unsupported.test.mjs | 1 | installer smoke test, real INSTALLER child |
| scripts/bugfix-fields.test.mjs | 2 | runCli() helper + usage-message check, real CLI |
| scripts/prefix-test.test.mjs | 1 | runPrefixTest() helper, real CLI |
| scripts/work-record.test.mjs | 1 | real build-census.mjs CLI invocation |
| skills/decisions/scripts/decisions-read.test.mjs | 3 | symlinked-script check, SCRIPT_PATH spawn, blind-input variant |
| skills/decisions/scripts/goals-mirror.test.mjs | 1 | real CLI render-match check |
| scripts/collect-from-origin.test.mjs | 1 | F3 follow-up: sh -c running process.execPath, no env |
| scripts/native-continuation-smoke.test.mjs | 2 | F4/F5 follow-up: runChild env-as-real-environment + nested literal (corrects build.md's :17 citation) |
| scripts/janitor.test.mjs | 1 | F5 follow-up: trivial holder-process spawn |
| skills/team-build/scripts/review-run.test.mjs | 2 | F5 follow-up: spawnSleeper's own spawn + dead-pid probe |

8 files, 14 exempted sites total. The first 6 files/9 sites are unchanged from the prior round;
this round added 4 files/5 sites, all out-of-territory follow-ups, all named above and in the
next section.

## Follow-up list (out of territory, exemption entries only, no edits made)

- scripts/collect-from-origin.test.mjs:423 (F3) - `execFileSync("sh", ["-c", ...,
  process.execPath, ...], {})` with no env.
- scripts/native-continuation-smoke.test.mjs:~17 and :20 (F4/F5) - the nested spawn literal
  inside the win32-only scenario's own eval source, and the real `runChild(process.execPath,
  [...], { env: <the real environment object>, ... }, 300)` call.
- scripts/janitor.test.mjs:1074 (F5) - trivial holder-process spawn.
- skills/team-build/scripts/review-run.test.mjs:111, :577 (F5) - `spawnSleeper()`'s own spawn
  and a dead-pid probe.

Each is a real, minor completeness gap against the class this scanner enforces, left named
per the hard rule that an existing test file's spawn options need the lead first.

## Commits (build/test-ipc-57-1, not pushed)

- `b87f5dd` test(hooks): fix N2 scanner false greens from review-r1 (W1, F1-F7)
- `1135839` fix(scripts): seal a dead-pid probe spawn, clean up two scratch homes (F5, F8)

## Test counts

- Touched-file gate: `TMPDIR=/var/tmp node --test skills/multi/scripts/hooks.test.mjs
  scripts/test-home.test.mjs scripts/run-tests.test.mjs` -> 88 tests / 87 pass / 0 fail / 1
  skipped (win32-only signal test).
- Full suite: `TMPDIR=/var/tmp node scripts/run-tests.mjs` -> 3035 tests / 3030 pass / 0 fail /
  5 skipped, exit 0 (confirmed twice, once with an explicit `echo EXIT:$?` past the harness's
  own /tmp-write noise). Baseline before this round was 3030/3025/5 skipped; +5 is this round's
  new unit tests (F1, F3/F6, F4, F7, W1+F2 combined).
- Red proofs (mktemp/git-archive copies, /var/tmp/l57c-VRMz, not in any repo): W1+F2, F1, F4,
  F7's new test bodies, appended to a pristine 0824e76 archive with the OLD implementation
  otherwise untouched, all fail (3 real assertion failures, 1 ReferenceError for the brand-new
  `exemptionOffenders` API). The scanner's own original red (1167b9a) still flags
  test-home.test.mjs:66 and :523 (plus scripts/run-tests.test.mjs:804, not yet sealed at that
  commit) when the FINAL scanner is copied onto that commit's own tree and run.

## C4 fields

Cause: the 0824e76 scanner made five independent, compounding shortcuts - a raw substring test
for "env:" that a comment or string could corrupt (F1); an exemption keyed to a line number
that any unrelated edit could shift (F2); a node-direct gate that only looked at a call's OWN
first argument, missing node run through a shell (F3) or `fork`/'node' (F6); an "any env: key
present" test that couldn't tell a real override from `undefined`/`null`/the real environment
object handed straight through (F4); and an "inert literal" escape hatch that only checked one
way a literal could reach anything (F5). Each shortcut either hid a real site or would go red
on an unrelated change - the exact "false green"/"gate false red" pair the ruling was written
to close.

Discriminating check: for each finding, a synthetic source fixture built with the file's own
`['sp','awn'].join('')` self-scan-avoidance convention, run through `findEnvLessSpawns`/
`exemptionOffenders` directly - proved red against the untouched 0824e76 implementation
(measured on a git-archive copy), green against the final one. The real-repo N2 test (walking
every actual test file) is the integration check that ties all seven together: it went from
red-with-two-genuine-self-scan-bugs (mid-round, both fixed - see below) to green with exactly
the 14-site exemption table above and no others.

Fix location: skills/multi/scripts/hooks.test.mjs's scanner section (codeOnly, comment-aware
extractBalanced, resolveIdentHasEnvKey, findEnvLessSpawns, N2_SPAWN_ENV_EXEMPTIONS,
exemptionOffenders, the N2 test itself) plus 7 new unit tests; scripts/run-tests.test.mjs's
dead-pid probe (F5); scripts/test-home.test.mjs's two cleanup pushes (F8).

Simplification: one `codeOnly` pass replaces three ad hoc text tests (the old `env:` substring,
its shorthand regex, and the old `\benv\b` one-hop check). One per-file counted exemption map
replaces the line-keyed one, removing the need to ever re-key anything on an unrelated edit.
Deleting F5's escape hatch removed a whole code path for "very little in return", per the
ruling - its sites now read the same as every other named gap in the same table, one part
instead of two.

## Mid-round self-scan bugs found and fixed (not separate findings, disclosed for completeness)

Widening the scanner (F3/F4) initially made hooks.test.mjs flag its OWN new code and test
fixtures, and two real files elsewhere:
- `fork` appearing in a doc comment as "fork (...)" (whitespace then paren) matched the
  function-call regex, since `\s*` spans newlines; reworded to break the adjacency.
- Three new test fixtures wrote `fork(`/`spawn(`/`execFileSync(` as literal substrings instead
  of the file's own concatenation convention; fixed to match it.
- A first attempt at F4 ran `codeOnly` over the WHOLE file once; a stray quote character inside
  an unrelated regex character class elsewhere in the file desynced it for everything after -
  moved to a per-line reset (see F4 above).
- `hooks/delegation-reminder.test.mjs`'s own forbidden-terms list (`['child_process', 'spawn(',
  ...]`) - a literal `'spawn('` written as DATA, not code - matched the function-call regex on
  raw text and ran away; fixed with a one-character lookbehind (a function name whose preceding
  character is a quote mark is never a real call).
- `scripts/wiring-check.test.mjs`'s own `env: null` fixture (an unrelated in-process function
  parameter) false-positived under an early, universal undefined/null check; fixed by scoping
  undefined/null to real spawn-family calls only (F4 above).

## Cleanup

No dev server started. Nothing killed (nothing started). Scratch at /var/tmp/l57c-VRMz kept per
the no-delete rule (git-archive copies of 0824e76/1167b9a, tap/log files); nothing from it
committed. No git identity set, no --no-verify used. Two commits on build/test-ipc-57-1, not
pushed.
