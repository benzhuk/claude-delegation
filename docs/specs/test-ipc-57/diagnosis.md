DONE

# Lane 57 — test-ipc diagnosis (no cause confirmed, nothing changed)

Worktree: /var/tmp/lane-57/wt (build/test-ipc-57-1), base 0b517ba. Territory:
scripts/run-tests.mjs, scripts/test-home.mjs, their tests. Node v24.18.1 (Linux
6.12.100+deb13-amd64, 16 cores). Scratch: /var/tmp/l57-A5K4 (mktemp'd, left in place per the
no-delete rule).

GOAL line served: "work lost or stalled" (a false-red gate on Windows loses builder time).
Nearest NOT: "a symptom fix" — since no cause reproduced, the correct move is to change
nothing rather than patch around an unconfirmed guess.

## 1. Reproduce

Read scripts/run-tests.mjs, scripts/run-tests.test.mjs, scripts/test-home.mjs,
scripts/test-home.test.mjs, skills/multi/scripts/test-child-env.mjs in full. Confirmed the
lead's finding at 0b517ba: `runSealed` (run-tests.mjs:230-231) already deletes
NODE_TEST_CONTEXT and NODE_TEST_WORKER_ID before its own `node --test` grandchild spawn, and
every spawn in the touched files uses `process.execPath`, never a bare `node`.

Reasoned from the error text (a V8 structured-clone/`DeserializeError`: "Unable to deserialize
cloned data due to invalid or unsupported version") plus Node's documented per-test-file child
process model. `node --test` sets both `NODE_TEST_CONTEXT=child-v8` and `NODE_TEST_WORKER_ID=<n>`
on every test-file child's own `process.env` — confirmed directly:

```
$ node --test checkenv.test.mjs   # writes process.env.NODE_TEST_CONTEXT / _WORKER_ID to a file
NODE_TEST_CONTEXT=child-v8
NODE_TEST_WORKER_ID=1
```

Tried to reproduce the original failure under load on Linux two ways (research step 1):

(a) 4 concurrent full `TMPDIR=/var/tmp node scripts/run-tests.mjs` runs, plus 5 CPU-saturating
    busy-loop `node` processes (started/killed by their own PIDs: 2487175/77/78/79/80, confirmed
    killed and gone after). Baseline (uncontended): 22.9s, 3029 tests, 3024 pass, 5 skipped,
    exit 0. All 4 concurrent+stressed runs: exit 0, `ℹ tests 3029 / pass 3024` each, no
    "deserialize" text anywhere in any of the 4 logs (`grep -ai deserialize concurrent-*.log` →
    empty).

(b) `node --test` under manufactured load with deliberately corrupt/garbage byte streams (see
    step 4) — also never reproduced the error.

Not reproduced on Linux by either load path.

## 2. Isolate

Grepped every spawn/`execFileSync`/`spawnSync` in the four territory files for env provenance:

- run-tests.mjs:174 `spawn(NODE, args, options)` — `NODE = process.execPath`; env always built
  by `makeTempHome`→`childEnv`, then explicitly strips NODE_TEST_CONTEXT/NODE_TEST_WORKER_ID
  (run-tests.mjs:230-231) before the sealed grandchild `node --test` spawn.
- run-tests.test.mjs — 6 spawn/spawnSync/execFileSync sites, all `NODE = process.execPath`; env
  always via `childEnv(fixtureHome, {...})`, and every one deletes `env.NODE_TEST_CONTEXT`
  explicitly (lines 386, 402, 490, 506, 592, 685, 734, 785, 904, 923) — **but none of them ever
  deletes `env.NODE_TEST_WORKER_ID`**. That is a real, confirmed gap relative to the lane-46
  pattern (run-tests.mjs strips both).
- test-home.test.mjs — `checkSealInChild` (line 51) passes an explicit `env` (caller-supplied,
  fine). `spawnAndSignal` (line 66, used by 3 tests at lines 449/467) passes **no `env` key at
  all** — the child inherits the full real `process.env` unmodified (worse than a `...process.env`
  spread: no text pattern for a suite-wide scanner to catch). This is a second, separate gap.
  It does not bear on the deserialize defect (its two scripts only call `makeTempHome()`, never
  spawn a nested `node --test`), but it is a real violation of test-child-env.mjs's own stated
  rule ("a test child must never inherit the environment of the session running the suite").
  Per the hard rule ("changing an existing test's spawn options needs the lead first"), this is
  reported, not touched.
- test-home.test.mjs:491 (`spawn(NODE, [...], { env: childEnv(fixture.home), ... })`) — env
  correctly built, but again never strips NODE_TEST_CONTEXT/WORKER_ID; harmless here since the
  spawned script never itself invokes `node --test`.

## 3. Hypothesis picked

H1 (env leak): the confirmed, real gap is `NODE_TEST_WORKER_ID` never stripped alongside
`NODE_TEST_CONTEXT` at every `childEnv()`-based spawn site in run-tests.test.mjs. Falsifiable
claim: this leaked var, present on a grandchild that is itself a `node --test` invocation
(matching the real nested shape `runSealed`'s `runChild` produces), causes either the known
"recursive, skipping" false-pass or feeds the parent test-runner's IPC channel a mismatched
worker id that corrupts the structured-clone stream and produces the deserialize error.

## 4. Discriminating check

Built a 3-level nested reproduction of the real shape (`/var/tmp/l57-A5K4/nested/`):
`node --test outer.test.mjs probe-nested.test.mjs` (outer test runner) → `probe-nested.test.mjs`
(a real test-file child, so it inherits NODE_TEST_CONTEXT=child-v8 + NODE_TEST_WORKER_ID=1 for
real, not simulated) spawns `node --test innerprobe.test.mjs` with `stdio: "inherit"` exactly
like `runSealed`'s `runChild`, env built with only NODE_TEST_CONTEXT deleted (WORKER_ID left in,
mirroring the confirmed gap) → `innerprobe.test.mjs` spawns a `detached`+`unref`'d orphan that
keeps writing raw garbage bytes (`Buffer.from([0,1,2,3,255,254,253,10])`, 1M+ writes) into the
inherited fd 1 for ~2.5s **after** the inner `node --test` has already exited — the closest
local shape to H2's "taskkill /F without /T orphans a grandchild still holding the pipe".

First control run (no env override at all) hit the known trap and proved the harness itself
works: `Warning: node:test run() is being called recursively within a test file. skipping
running files.` — i.e. leaving NODE_TEST_CONTEXT in unmodified DOES break things exactly as
documented, confirming the probe is wired correctly.

With NODE_TEST_CONTEXT stripped but NODE_TEST_WORKER_ID left in (the actual gap under test):

```
$ node --test outer.test.mjs probe-nested.test.mjs > out3.log 2>&1; echo EXIT=$?
EXIT=0
...
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

1,002,019 lines of interleaved raw garbage landed in the log (from the orphan writer), and the
outer run still reported 2/2 pass, exit 0, no deserialize error, no warning. Repeated the same
probe with `env.NODE_TEST_WORKER_ID` explicitly set to a colliding value (`"1"`, matching what a
real leak would carry) via a separate single-level check (`leak-worker-id3.mjs`/`leak-out-control.log`
family) — also clean (status 0, correct TAP summary) once an early false failure was traced to
`spawnSync`'s `maxBuffer` (unrelated artifact of the garbage-byte probe design, confirmed by
raising `maxBuffer` to 50MB and re-running — status 0 both with and without the WORKER_ID leak).

Result: **H1 does not reproduce.** Both the confirmed env gap (WORKER_ID) and a direct
byte-garbage/orphan-writer attack on an inherited stdio fd (H2's literal mechanism, "the parent
reads the child's stdout as a v8-serialized stream") leave the outer `node --test` completely
unaffected on this Linux/Node build. `stdio: "inherit"` under POSIX spawn only ever shares fd
0/1/2; Node's own test-runner-to-child IPC (whatever channel it actually uses for structured
test results — inferred, not confirmed, to be a separate handle/fd, since garbage on the shared
fd 1 never disturbed the TAP summary) is not reachable through ordinary fd inheritance on Linux.

## 5. Recorded before any fix

All of the above (baseline log, 4 concurrent+stressed logs, the 3-level nested probe's two runs,
the WORKER_ID-leak isolation runs) were captured to `/var/tmp/l57-A5K4/*.log` and quoted above
*before* writing any change to the worktree. No fix follows, per spec: "If no cause can be
confirmed: a report that says so with evidence. That is a valid result, and nothing is changed."

Cause: **not confirmed.** Neither H1 (the real NODE_TEST_WORKER_ID strip gap) nor H2 (garbage
bytes / an orphaned writer on an inherited stdio fd, in a 3-level nested shape matching this
codebase's real spawn topology) reproduces "Unable to deserialize cloned data" on Linux, under
concurrency, CPU load, or a targeted adversarial probe. H3: most likely a genuinely
Windows-only mechanism — Windows' `CreateProcess` handle inheritance is coarser than POSIX's
(when `bInheritHandles=TRUE` for any stdio handle, every OTHER inheritable handle the parent
holds, e.g. an IPC pipe HANDLE to a grandparent, can be inherited too) — but this is **inference,
labelled as such**; the Windows box was unreachable from here and nothing here proves it.

Discriminating check: the 3-level nested orphan-writer probe under
`/var/tmp/l57-A5K4/nested/{outer,probe-nested,innerprobe}.test.mjs`, plus the WORKER_ID-leak
isolation runs — all quoted above with exact commands and outputs.

Fix location: none — no change made anywhere in the worktree (`git status --short` is empty,
confirmed after all research).

Simplification: none applicable — no fix, so nothing to simplify. Two secondary findings are
left for the lead rather than acted on unilaterally (hard rule: an existing test's spawn options
need the lead first):
1. run-tests.test.mjs's childEnv()-based spawns strip NODE_TEST_CONTEXT but never
   NODE_TEST_WORKER_ID — a real, minor completeness gap relative to run-tests.mjs's own pattern,
   but empirically inert (see above); adding the strip would be harmless belt-and-suspenders,
   not a fix for anything reproduced.
2. test-home.test.mjs's `spawnAndSignal` (lines 64-81, used by the 3 signal-handling tests at
   449/467) spawns with no `env` override at all, inheriting the real process environment raw —
   a real violation of test-child-env.mjs's stated isolation rule, unrelated to this defect
   (its scripts never spawn a nested `node --test`), flagged for the lead's own call.

Commit sha(s): none — no commit made; nothing changed.

Test counts: baseline `TMPDIR=/var/tmp node scripts/run-tests.mjs` (uncontended): 3029 tests,
3024 pass, 0 fail, 5 skipped, exit 0, 22.9s real. Same command run 4x concurrently under 5
CPU-saturating busy loops: identical 3029/3024/0/5 in all 4 runs, exit 0 each, no deserialize
text in any log.

## Cleanup

Killed all 5 self-started CPU-stress `node` processes by PID (2487175, 2487177, 2487178,
2487179, 2487180) — confirmed gone via `ps`. No dev server started. No temp dirs removed
(scratch stays at /var/tmp/l57-A5K4 per the no-delete rule); no logs committed; no git identity
set; worktree is unmodified (clean `git status`).
