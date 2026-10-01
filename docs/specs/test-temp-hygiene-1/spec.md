# Lane 46, test temp hygiene: lead spec

Source: the packet beside this file (skills-fable-lane-46-1), built on skills-n-release-0-20-17-2. Base 357fc15.

## Defect

The Netcup /tmp is a tmpfs with 1,048,576 inodes. On 2026-09-28 it reached 99.8 percent, and 81,654 test directories had to be deleted by hand. It was back at 29 percent an hour later. 31 of the 53 `*.test.mjs` files that call mkdtemp never remove what they create. `scripts/run-tests.mjs` gives each run a sealed home, `makeTempHome` in scripts/test-home.mjs, which is `mkdtemp(os.tmpdir()/sealed-home-)`. But every test's own mkdtemp lands directly in the real `os.tmpdir()`, because the child's environment still points TMPDIR/TEMP/TMP at the real temp dir. `sweepStaleHomes` (run-tests.mjs:61) removes only `sealed-home-*` older than 6 h. It never sees the test dirs. Measure: work lost or stalled. A full /tmp kills sessions, and Ben gets asked to delete things.

## Verified sources (lead, at 357fc15)

- run-tests.mjs: `main()` (:230) sweeps, then calls `runSealed`. `runSealed` (:153) calls `makeTempHome({gitIdentity:true})`, runs the canary child, then runs `node --test <files>` with `env` from makeTempHome. On a nonzero exit it keeps the home (`keep()`) for inspection, and on 0 it cleans it up. `runChild` (:122) forwards SIGINT/SIGTERM/SIGHUP to the child, then re-raises.
- test-home.mjs: `makeTempHome` (:108) mkdtemps under `os.tmpdir()` and registers the dir in a per-process exit/signal cleanup registry (:75-78). Its `env` comes from `childEnv(home)`, which spreads the parent process environment, so a variable set on `env` reaches every test process.
- `checkSeal` (:195), which the canary runs inside the child, requires `os.homedir()` to be strictly inside `realpath(os.tmpdir())` **as the child sees it**. So once the child's TMPDIR is the per-run root, the sealed home must be created INSIDE that root, or the canary refuses the suite.
- Node's `os.tmpdir()` reads TMPDIR on POSIX, and TEMP then TMP on Windows.

## Pinned rulings

P1, the per-run root. In the CLI path (`main`, not programmatic `runSealed` callers that pass nothing), create one directory directly under the REAL `os.tmpdir()`, named with the fixed prefix `delegation-test-run-`, then `<pid>-`, then the mkdtemp suffix (for example `mkdtempSync(path.join(tmp, \`delegation-test-run-${process.pid}-\`))`). Pass it to `runSealed` as a new option, `tmpRoot`. With `tmpRoot` set, `runSealed`:
  (a) creates the sealed home inside it. Add an optional `tmpDir` parameter to `makeTempHome`, defaulting to `os.tmpdir()`, so no other caller changes;
  (b) sets TMPDIR, TEMP and TMP on the child `env` to the root, for both the canary and the suite;
  (c) leaves everything else as it is.
  Without `tmpRoot`, `runSealed` behaves byte-for-byte as today.

P2, removal. When the run ends with exit 0, `main` removes the whole root. When it ends nonzero, it removes every entry of the root except the retained sealed home, prints the retained path as today, and leaves the root holding only that home. On SIGINT/SIGTERM (and SIGHUP off Windows), the root is removed synchronously before the signal is re-raised. Reuse test-home.mjs's registry pattern, or add the root to it; do not add a second, competing handler that races `runChild`'s forwardSignal. Removal errors are reported on stderr and never change the exit code.

P3, the sweep backstop. `sweepStaleHomes` also removes `delegation-test-run-<pid>-*` directories directly under the temp dir that are older than 24 h AND whose pid is not alive (`process.kill(pid, 0)` throws ESRCH; any other outcome, EPERM included, counts as alive). The existing `sealed-home-` rule is unchanged. Its printed line gains the new count, in the form `swept <n> stale sealed homes, <m> stale test-run roots`. Update any test that pins the old line.

P4, the leak check. In `main`, before the suite runs, record the set of names directly under the real `os.tmpdir()` that match `LEAK_PREFIX_RE`. Record it again after the run. Every name in the second set and not the first is a leak. Pin `LEAK_PREFIX_RE` as an exported constant: the packet regex minus `sealed-home` (concurrent runs create those legitimately and the sweep bounds them), plus `dispatch`. That is `^(note-send|note-flush|hook-core|multi-hook|inbox|note-inbox|pane-binding|multi-inbox-home|session-name|resume-notice|resume-size|delete-guard|continuation-native|note-cursor-fallback|bugfix-fields|build-loop-check|goal|state-hold|decisions-handback|decisions-render|work-record|backlog|reminder|mirror|knowledge-log|knowledge-counts|codex-census|four-read|goal-card|accept-prep|discrim|dispatch|decisions|transport-identity)-`. Extend it with any other prefix the builder finds a test file using in a mkdtemp call; list them in the report. The check always prints exactly one line:
  - `leak check: 0 new temp entries` when clean;
  - `leak check: <n> new temp entries: <up to 5 names>` when not, in which case the run exits 1 even if the suite passed.
  A suite that is already failing keeps its own nonzero code. The check runs on every platform. A concurrent legacy run of an older runner can cause a false red. That is accepted and documented in the leak-check comment.

P5, stragglers. After P1, run the full suite once and read the leak-check line. Any test that still leaks does so because it builds a child env from scratch without TMPDIR/TEMP/TMP, or writes to a hard-coded temp path. Fix each one in that test file with the smallest change (usually spreading `childEnv(...)` or passing the three vars), and list them. The string literals `/tmp/x`, `/tmp/EVIL-*` and `/tmp/cc-socks/...` in token-census, build-loop-workflow and inbox tests are values, not writes; leave them unless the leak check names them.

P6, docs. Add one line to docs/census.md naming `leak check:` (the run-tests.mjs line) as the reader for temp leaks, next to the other markers.

## Territory

scripts/run-tests.mjs, scripts/run-tests.test.mjs, scripts/test-home.mjs (only the `tmpDir` parameter), docs/census.md (one line), and test files named by P5. NOT janitor.mjs, work-record.mjs, build-census.mjs, the codex hooks, scratch-reaper.

## Efficacy

Unit tests in run-tests.test.mjs, each with an injected temp dir and never the real /tmp:
- the root is created, exported as TMPDIR/TEMP/TMP to the child, and removed on exit 0;
- on a failing run, only the sealed home remains;
- a child run killed with SIGTERM leaves no root. Use a small script that runs `main` against an injected temp dir with a test file that sends itself a signal, or an equivalent real-process test;
- the sweep removes a stale root with a dead pid and keeps a young one or one with a live pid;
- the leak check goes red on a planted leak and is silent when clean.
Each of these must fail on base 357fc15 or be new behaviour. The report says which of the two applies to each.

Live proof (lead, after review): on Netcup, record `df -i /tmp` and `ls /tmp | grep -cE '<LEAK_PREFIX_RE without ^>'` before and after one full `node scripts/run-tests.mjs` from the branch, plus the run's `leak check:` line.
