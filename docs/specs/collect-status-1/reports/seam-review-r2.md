VERDICT: APPROVE ccac310874957b2f21525bc6c3f518dd1713e052

# collect-status-1 seam review r2 (delta: m1 fix)

Scope: `git diff 1542f8c..121eb52 -- scripts/` only. Two files changed:
`scripts/collect-status.mjs` (+10 -1) and `scripts/collect-status.test.mjs` (+17 -0).
Worktree HEAD at review time: 121eb52fbf073643511f4fd8e528c3ef92c4865a. Nothing in the worktree was
modified. The mutation check ran on a `git archive` extract in the session scratchpad.

Findings: 0 blocking, 0 major, 0 minor, 1 info.

## (1) Is the patch exactly m1's? YES, byte for byte

- `scripts/collect-status.mjs:40-42` adds the comment and the `NOTE_STATE_TOKENS` Set. The text is
  identical to seam-review-r1.md:144-146, and it sits right after the `assertFieldSafe` import (`:38`),
  where m1 said to put it.
- `scripts/collect-status.mjs:190-195` replaces the old one-line `kv` builder with the `safeByState`
  loop plus the new `kv`. The text is identical to seam-review-r1.md:158-163.
- The allowlist matches the source of truth exactly. `computeState` (`scripts/collect-from-origin.mjs:111-117`)
  returns only accepted-merged, accepted-unmerged, withdrawn, rejected and owned, and `noRecordRow`
  (`:129`) returns no-record. Those are the six tokens in the Set. None is missing and none is extra,
  so no real state is renamed to "other".

## (2) Does the test discriminate? YES, measured

New test: `scripts/collect-status.test.mjs:445-460`. It injects `collectMain` with one row whose
state is `"evil;$(id)"`, then checks that `--text` matches `/other=1/` and does not match `/evil/`.

Mutation run: I extracted 121eb52 with `git archive` into the scratchpad, overwrote only
`scripts/collect-status.mjs` with its 1542f8c content (`diff` confirmed the only difference was the
m1 hunks), and ran `node --test scripts/collect-status.test.mjs`:

```
✖ K2 allowlist: a state outside collect-from-origin's names reaches --text only as other (seam m1)
ℹ pass 24
ℹ fail 1
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /other=1/. Input:
    actual: '1 lanes on origin: evil;$(id)=1, attention 0',
```

So without the fix the test fails, and it fails on exactly the leak m1 described. The other 24 tests
still pass without the fix, as m1 predicted. Afterwards I put the 121eb52 content back into the
scratch copy and confirmed it with `diff -q`.

## (3) Can any other origin-supplied string still reach --text or --goal? NO

These are every value that enters the note argv (`scripts/collect-status.mjs:189-201`, `buildNoteArgv` `:161-169`):

- `--text` = `${n} lanes on origin: ${kv || "none"}, attention ${m}`.
  - `n = rows.length` and `m = attention.length` are array lengths, so they are integers.
    `computeAttention` (`:97`) always returns an array.
  - `kv` keys are now only allowlisted tokens or the literal `other`. Its values are
    `Number.isInteger(v) ? v : 0`, so no string value survives. Before the fix, a prototype-named
    state could smuggle in a non-integer value; see i1.
- `--goal` = `status at ${statusMdPath}`, with `statusMdPath = path.join(outDir, "status.md")` (`:322`).
  `outDir` comes from operator `--out` or from `home` plus `basename(repo)` (`:65-66`). No origin
  data is involved, and `safeGoalOrNull` (`:152-159`) still runs it through `assertFieldSafe`.
- The other argv fields are `--from` (the sanitized host), `--to` (an operator flag), and
  `--recipient-repo` (the resolved operator `--repo`). They are fixed literals or operator input,
  not origin data.
- Branch names, record paths and tip SHAs reach only `computeChangeKey` and `computeAttention`
  entries. They never reach `sendNote`'s string building.

Verified absence: no origin-supplied string reaches `--text` or `--goal` at 121eb52.

## (4) Did any existing test expectation change? NO

`git diff 1542f8c..121eb52 -- scripts/collect-status.test.mjs` has 17 additions and 0 removed lines.
It is purely additive: one new `test(...)` block, inserted between two existing tests.

## (5) Does `node --test scripts/collect-status.test.mjs` pass? YES

Run in the worktree at 121eb52: tests 25, pass 25, fail 0, duration about 4.2 s. That is the 24
tests from r1 plus the new one.

## Info

### i1 (info, non-blocking): prototype-named states are undercounted, but nothing leaks

`computeByState` (`scripts/collect-status.mjs:80-84`) builds its counts on a plain `{}`. I probed
this in the scratchpad by running the real `computeByState` and a verbatim copy of the patch's loop:

- state `"constructor"` or `"toString"`: raw byState gets `"function Object() { [native code] }1"`.
  After the patch this becomes `other=0`: it is counted as zero, and nothing leaks.
- state `"__proto__"`: the assignment sets the prototype instead of an own key, so the row
  disappears from byState. `other` is not emitted at all. Nothing leaks.

The fix does its K2 job, because no string reaches `--text`. Only the "other" count is wrong, and
only for a state that `computeState` cannot produce today. If anyone wants to tidy it later, change
`const out = {};` at `:81` to `const out = Object.create(null);`. The predicted outcome is that the
"constructor" row counts as `other=1` and the "__proto__" row counts as `other=1`, with no change to
any existing test, because those tests use only real states. This does not block approval.

## C4 fields

Cause: `sendNote` built `--text` from every key of `byState`, which is taken directly from collect-from-origin's `r.state`, with no K2 allowlist (1542f8c `scripts/collect-status.mjs:186`).
Discriminating check: with only `scripts/collect-status.mjs` reverted to 1542f8c in a scratch extract, the new test fails with actual `'1 lanes on origin: evil;$(id)=1, attention 0'`. At 121eb52 it passes (25/25).
Fix location: `scripts/collect-status.mjs:40-42` (NOTE_STATE_TOKENS) and `:190-195` (safeByState fold before `kv`).
Simplification: a single fixed Set of six token names plus a fold into "other" replaces trusting the upstream state vocabulary. There is no new abstraction and no change to the note format for real states.

---

# Delta 2: ccac310 (Windows portability, tests only)

Scope: `git diff 121eb52..ccac310 -- scripts/`. It touches `scripts/collect-status.test.mjs` (1 line)
and `scripts/install-janitor-timer.test.mjs` (2 lines). No production file changed. The commit also
committed this report as it stood at 121eb52; that part is not code and not reviewed here.
Worktree HEAD at review time: ccac310874957b2f21525bc6c3f518dd1713e052. `git diff --quiet HEAD -- scripts/`
is clean. The mutation checks ran on a separate `git archive` extract in the session scratchpad.

Findings: 0 blocking, 0 major, 1 minor (m-d2-1), 1 info.

## D2.1 Is the defaultOutDir change still looking? YES

`scripts/collect-status.test.mjs:140`: the expectation is now
`path.join("/home/ben", ".agents", "collect", "claude-delegation")`, built from fixed literals. It
does not reuse the implementation's own `path.basename(repoAbs)`, so it is not a tautology. On
Linux it produces exactly the old literal string.

Mutation check: in the scratch extract I changed `defaultOutDir` (`scripts/collect-status.mjs:66`)
to join the whole `repoAbs` instead of its basename. The test failed: `✖ defaultOutDir … pass 0 fail 1`.

## D2.2 Is the skip on the systemd exact-bytes test honest? YES

`scripts/install-janitor-timer.test.mjs:746`. Production can never produce systemd text on a win32 host:

- `main` defaults `platform = process.platform` (`scripts/install-janitor-timer.mjs:478`). The CLI
  entry is `process.exit(main())` with no opts (`:921-922`), so a real run always uses the host's
  own platform.
- `scheduler = platform === "win32" ? "schtasks" : platform === "darwin" ? "launchd" : "systemd-user"` (`:703`).
- The only production callers of `systemdServiceUnit` and `systemdTimerUnit` are `:732-733`, inside
  `if (scheduler === "systemd-user")` (`:726`). A repo-wide grep over non-test `.mjs`/`.js` files
  finds no other caller.
- Why it failed on Windows: `scheduledCommandArgv` joins the script path with the host's
  `path.join` (`:143`). On win32 the POSIX fixture `/opt/plugin` therefore becomes
  `\opt\plugin\scripts\…`. That is a mismatch between the host and the fixture. It is not a
  production defect.

Wording nit: the skip reason says "runs only on linux hosts". The real rule is "any host that is
neither win32 nor darwin" (`:703`). The skip condition itself is exactly right (`=== "win32"`), so
nothing needs to change.

On Linux the test still runs. Measured at ccac310: `✔ C2: systemd unit and timer text … exact bytes`,
48/48 pass, 0 skipped.

## D2.3 Is the skip on C2 r1 m2 honest? Only for the first half. See m-d2-1

`scripts/install-janitor-timer.test.mjs:931-962` contains two independent checks:

1. `:932-946` checks that `--out rel` resolves to an absolute path inside the generated systemd
   service text. This half really does read systemd text, and it compares that text with the
   host's `path.resolve`. The skip is honest for it, for the same reasons as D2.2.
2. `:948-961` checks that `--out "out\nExecStartPost=pwn"` is refused with "--out must not contain
   control characters" and that nothing is written. This half reads no systemd text. The refusal
   (`scripts/install-janitor-timer.mjs:593-595`) runs before any scheduler is chosen, and it
   applies on every platform. Its only paths are `mkTmp` and `fixturePluginRoot()`, which are
   host-native, plus the injected `execPath: "/usr/bin/node"`, which is only passed through
   `path.resolve` (`:603`). The skip reason "these fixtures are POSIX paths" is not true for this half.

### m-d2-1 (minor): the win32 suite no longer runs any control-character refusal check

Evidence: `grep -n "control characters" scripts/*.test.mjs` returns one hit,
`scripts/install-janitor-timer.test.mjs:957`, and that line is inside the test that is now skipped on
win32. The Windows run at ccac310 (2348 pass, 0 fail, 2 skipped, per the coordinator; I could not
measure it on this Linux host) reports green while running no check of that refusal. The refusal
matters on Windows too: a newline in `--out` would otherwise flow into the Task Scheduler XML or
the `cmd /c` command. The same JavaScript is still covered on Linux. Mutation check on the scratch
extract: I replaced the refusal condition at `:594` with `if (false)`, and the m2 test failed on
Linux (`✖ … round 1, m2 … pass 0 fail 1`). So the check still works on Linux; the gap is that
Windows no longer runs it. That is why this is minor and not a blocker.

Fix: split the test so the refusal half runs on every host. Patch for `scripts/install-janitor-timer.test.mjs`.
Current text (lines 946-948):

```js
  assert.ok(!serviceText.includes("--out rel\n") && !serviceText.includes("--out rel "), serviceText);

  const home2 = mkTmp("janitor-timer-home-out-newline-");
```

Replacement:

```js
  assert.ok(!serviceText.includes("--out rel\n") && !serviceText.includes("--out rel "), serviceText);
});

test("C2 review round 1, m2 (every host): --out carrying a control character (a real newline) is refused outright, nothing written", () => {
  const home2 = mkTmp("janitor-timer-home-out-newline-");
```

Everything after that line stays as it is. It still ends with the original `});` at `:962`.
Predicted outcome: on Linux the file goes from 48 to 49 tests, all passing. On win32, 1 test is
skipped instead of 2, and the new refusal test passes: it exits 1 on the refusal before any write,
and no step in it depends on POSIX paths. If the orchestrator prefers not to reopen C2 for this,
carry it to a follow-up. The code itself is not defective.

## D2.4 Did any other expectation change? NO

The diff changes exactly three lines: one expectation, which is equivalent on Linux, and two added
`{ skip: … }` options. It has no removed assertions and no other edits. `install-janitor-timer.test.mjs`
has no other win32 skips (`grep -n "skip: process.platform"` finds only `:746` and `:931`).

## D2.5 Gates at ccac310 (Linux, `node --test`)

| file | tests | pass | fail | skipped |
|---|---|---|---|---|
| scripts/collect-status.test.mjs | 25 | 25 | 0 | 0 |
| scripts/install-janitor-timer.test.mjs | 48 | 48 | 0 | 0 |

### i-d2-1 (info)

I did not measure the Windows result (2348/2350, 0 fail, 2 skipped) on this host. This review
takes it from the coordinator. The reasoning in D2.2 and D2.3 explains why exactly those two
tests failed on win32 and why no production path is involved.

## C4 fields (delta 2)

Cause: three test expectations assumed POSIX separators. One was a literal `defaultOutDir` string, and two compared systemd unit text built through host `path.join`/`path.resolve` against POSIX fixtures. On win32 the host path module produced backslashes.
Discriminating check: on Linux, breaking `defaultOutDir` (joining the whole `repoAbs`) fails the rewritten test, and disabling the control-character refusal fails the m2 test. The failures on win32 were in systemd text, which `scripts/install-janitor-timer.mjs:703,726` never generates on win32.
Fix location: `scripts/collect-status.test.mjs:140`, and `scripts/install-janitor-timer.test.mjs:746` and `:931`.
Simplification: build the one path expectation with `path.join`, and skip on win32 only what depends on the systemd generator. m-d2-1 narrows the second skip to the half that actually reads systemd text.
