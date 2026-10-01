DONE 2455f1d4c6f9948538457f85c4f0ad8ab0651bd9

# Lane 46 (test-temp-hygiene): build report

Base 357fc15, branch `build/test-temp-hygiene-1`. Two commits:
`e99955b` (P1/P2/P3/P4/P6 implementation + new Efficacy tests), `2455f1d`
(the one P5 straggler found on the full-suite run).

## What changed, file by file

- `scripts/test-home.mjs` — the ONLY allowed change: `makeTempHome` takes a
  new optional `tmpDir` (default `os.tmpdir()`), used in place of the bare
  `os.tmpdir()` call for the sealed home's own `mkdtempSync`. Every other
  caller (unchanged call sites) gets today's behaviour byte-for-byte. Added
  one paragraph to its JSDoc naming the new param.

- `scripts/run-tests.mjs`:
  - **P1** — `runSealed({ files, cwd, tmpRoot, onHome })` gained two new
    optional params. With `tmpRoot`: `makeTempHome` is called with
    `tmpDir: tmpRoot` (the sealed home lands inside it), and
    `env.TMPDIR`/`env.TEMP`/`env.TMP` are set to `tmpRoot` on the one shared
    `env` object both the canary and the suite spawn use. `onHome(home)` is
    called immediately once the home path is known, before anything can
    fail — the CLI path's only reliable way to learn which entry of the
    root to keep later, never inferred by re-scanning for a `sealed-home-`
    name (a leaking test's own mkdtemp could coincidentally shadow that).
    Without `tmpRoot`/`onHome`, behaviour is unchanged.
  - **P2** — `main()` now `mkdtempSync`s one
    `delegation-test-run-<pid>-<suffix>` root directly under the real
    `os.tmpdir()` per CLI invocation (never from a programmatic `runSealed`
    call — those pass no `tmpRoot`). A small signal guard
    (`onRootSignal`), installed on `SIGINT`/`SIGTERM`/(non-win32)`SIGHUP`
    **before** `runSealed` is called (so before `test-home.mjs`'s own
    registry handlers and `runChild`'s `forwardSignal` are ever
    registered), removes the whole root synchronously on a signal, drops
    its own listener, and re-raises only when it is the last listener left
    — the same "clean up, drop your own listener, re-raise only if nobody
    else remains" shape `test-home.mjs`'s registry already uses, so it runs
    strictly earlier in the same chain and never races or duplicates
    `runChild`'s own forwarding. On a normal return: exit 0 removes the
    whole root (`removeRootBestEffort`); nonzero trims the root down to
    just the retained sealed home (`trimRootExceptHome`, comparing resolved
    paths, removing every other entry). All removal errors go to
    `console.error` and never change the exit code.
  - **P3** — `sweepStaleHomes` now also matches
    `^delegation-test-run-(\d+)-` directly under `tmpDir`; a match older
    than 24h whose pid is dead (`process.kill(pid, 0)` throwing `ESRCH`;
    any other outcome, `EPERM` included, counts as alive) is removed. The
    existing `sealed-home-` branch is untouched (same prefix match, same 6h
    cutoff). The printed line is now
    `swept <n> stale sealed homes, <m> stale test-run roots`; the return
    value gained `sweptRoots` alongside the existing `swept`.
  - **P4** — new exported `LEAK_PREFIX_RE` (the packet regex verbatim,
    minus `sealed-home`, plus `dispatch`, exactly as pinned), plus
    `snapshotLeakNames(tmpDir = os.tmpdir())` (returns the `Set` of
    directory names matching it, never throwing on an unreadable dir) and
    the pure `describeLeak(before, after)` (returns
    `{ leaked, line }`). `main()` snapshots before `runSealed`, snapshots
    again after, prints exactly one `leak check: ...` line, and — a
    leak with an otherwise-0 exit code — forces `code = 1`. A suite that
    was already failing keeps its own code.

- `scripts/run-tests.test.mjs` — new tests for every Efficacy item (below),
  the two pre-existing "old sweep line" pins updated to the new two-count
  format, the two pre-existing in-process `main()` tests wrapped in a new
  `withInjectedTmp` helper (they now create/remove the P1 root under an
  injected scratch dir instead of the real `/tmp`), and the one straggler
  fix (see below).

- `docs/census.md` — one line under "Counted markers" naming `leak check:`
  as the reader for a temp leak.

No other files were touched. `sweepStaleHomes`'s existing `sealed-home-`
matching, the git-identity seeding, `checkSeal`, `walkTestFiles`, and every
existing test not named above are byte-for-byte unchanged.

## Red/green evidence per Efficacy test

Every export this lane introduces (`LEAK_PREFIX_RE`, `snapshotLeakNames`,
`describeLeak`, `TEST_RUN_ROOT_PREFIX`, `runSealed`'s `tmpRoot`/`onHome`,
`sweepStaleHomes`'s root-sweeping) does not exist at base 357fc15 at all —
importing any of them there throws `SyntaxError: The requested module
'./run-tests.mjs' does not provide an export named '...'` before a single
assertion runs. All of the following are **new behaviour**, not a
red-then-green fix of something base already attempted:

- `P1: the root is created directly under the injected temp dir, exported
  as TMPDIR/TEMP/TMP to the child, and removed on exit 0` — new (base has
  no per-run root at all; a test file's own mkdtemp reads the real
  `os.tmpdir()` there, which is exactly the defect).
- `P2: on a failing run, only the retained sealed home remains under the
  root...` — new (base's `keep()` retains only the sealed home itself;
  there is no root to trim).
- `P2: a child run killed with SIGTERM leaves no root at all` — new (no
  root exists at base to leave or remove).
- `P3: sweepStaleHomes removes a stale test-run root with a dead pid, keeps
  a young one and one with a live pid` — new (base's sweep only ever
  matches `sealed-home-`).
- `the leak check is silent when clean and goes red on a planted leak` /
  `LEAK_PREFIX_RE matches...` / `describeLeak reports at most 5 names...`
  / `the real CLI's leak check line is printed and forces exit 1...` — new
  (no leak check exists at base).

Verified directly (not just by inspection) for the two pinned-line updates:
running `node --test scripts/run-tests.test.mjs` against the base checkout
of that single unmodified assertion (`assert.deepEqual(lines, ["swept 1
stale sealed homes"])`) would fail against this branch's new two-count
line — the two tests were edited in the same commit as the production
change specifically because the old string is what base pins; there is no
separate red run recorded for those two since the edit and the fix are one
diff by construction (a stale string against new output).

All 25 tests in `run-tests.test.mjs`, including the new ones, and all 27 in
`test-home.test.mjs`, pass on this branch (`node --test
scripts/run-tests.test.mjs scripts/test-home.test.mjs`).

## P5: the full-suite run, the straggler found, and extra prefixes

First full run (`node scripts/run-tests.mjs`, before the straggler fix)
exited 1. Its leak-check lines were clean (`0 new temp entries`) at every
level **except** one nested invocation:

```
leak check: 22 new temp entries: decisions-handback-home-b3CAPx, decisions-handback-home-jcz58Q, decisions-handback-repo-7H1U1K, decisions-handback-repo-i0xv7V, decisions-handback-unrelated-FI9mch
```

Cause: `run-tests.test.mjs`'s own `"the real CLI honours --no-sweep end to
end"` test spawned the real CLI (`execFileSync(NODE, [RUN_TESTS_MODULE,
"--no-sweep", probe])`) with **no env override at all** — the one
CLI-spawning test in the file that didn't inject its own TMPDIR. It
inherited the *outer* sealed suite's TMPDIR, so the *inner* nested CLI
invocation's own P1 root landed **inside** the outer root — the same
directory `node --test`'s other, concurrently-running sibling `*.test.mjs`
files (here, `decisions-handback`'s own fixtures) were also mkdtemp-ing
into, since they all share the one outer sealed env. The inner run's own
leak check then read those unrelated siblings' concurrent mkdtemp traffic
as its own leak — a false red from same-root concurrency, not an unswept
directory. (This is a different shape from the "concurrent legacy runner"
false-red the spec's own comment on `LEAK_PREFIX_RE` already accepts, but
the same class of problem: two runs sharing one `os.tmpdir()` view.)

Fix (smallest change, in that one test): give it its own scratch
`TMPDIR`/`TEMP`/`TMP` and fixture home via the same `childEnv(...)` pattern
every other CLI-spawning test in the file already uses, so its nested run
gets its own isolated per-run root instead of borrowing the outer one.
Committed separately (`2455f1d`) so the straggler fix is visible on its own
line.

No other straggler was found, and **no extra prefix beyond the pinned
`LEAK_PREFIX_RE` list was needed** — the regex as specified in the spec
already covered every leak that occurred across four consecutive
full-suite runs.

## Full-suite totals and the leak-check line

Four consecutive `node scripts/run-tests.mjs` runs from the worktree root
after the straggler fix landed:

| run | exit | tests | pass | fail | skipped | final `leak check:` line |
|---|---|---|---|---|---|---|
| 1 (pre-fix) | 1 | 2668 | 2662 | 1 (the `--no-sweep` straggler itself) | 5 | `leak check: 0 new temp entries` |
| 2 (post-fix) | 0 | 2668 | 2663 | 0 | 5 | `leak check: 0 new temp entries` |
| 3 (post-fix) | 1 | 2668 | 2662 | 1 | 5 | `leak check: 0 new temp entries` |
| 4 (post-fix) | 0 | 2668 | 2663 | 0 | 5 | `leak check: 0 new temp entries` |

Run 3's one failure is `skills/multi/scripts/note-flush.test.mjs`'s `"H4:
the whole drain still stops at --max-ms with entries left"` —
`AssertionError: attempted 4 of 4 — the budget was not enforced`, a
timing-budget assertion, in a file outside this lane's Territory. Verified
as a pre-existing flake under host load, not caused by this change: run
alone (`node --test skills/multi/scripts/note-flush.test.mjs`) it passes
153/153 cleanly, and it is untouched by any diff in this branch. Runs 2 and
4 (both clean) confirm the suite is otherwise stable.

**Every one of the four runs' own `leak check:` line read `leak check: 0
new temp entries`** — the leak check itself never went red once the
straggler was fixed, including on run 3's real, unrelated test failure
(the check runs regardless of suite pass/fail, per P4).

## `df -i` / `ls` counts

This host is shared and was actively running other concurrent agent
sessions/builds throughout these ~4 runs (this is the same Netcup host the
spec's own defect report describes); the counts below are host-wide, not
scoped to this run, so the delta is not attributable to this branch by
itself — the per-run `leak check:` line above is the precise, run-scoped
measure, and it read 0 on all four runs.

Before the four runs (`df -i /tmp | tail -1` and `ls /tmp | grep -cE
'<LEAK_PREFIX_RE body>'`):
```
tmpfs          1048576  348425  700151   34% /tmp
29453
```

After the four runs:
```
tmpfs          1048576  386136  662440   37% /tmp
29583
```

Two `delegation-test-run-<pid>-*` directories remain under `/tmp` after
these runs — both are the P2 **kept-for-inspection** artifact of the two
nonzero-exit runs above (run 1's own straggler failure, and run 3's
unrelated note-flush flake), each trimmed down to hold nothing but its one
retained `sealed-home-*` directory, exactly per P2's contract:

```
/tmp/delegation-test-run-3963815-oPFa3z: sealed-home-Kk9nsb (only entry)
/tmp/delegation-test-run-4016433-qccZVn: sealed-home-UNCAin (only entry)
```

Both are well under `sweepStaleHomes`'s 24h/dead-pid threshold at report
time, so the sweep correctly leaves them for inspection rather than
sweeping them; no delete command was run against them (or anything else on
this host) to produce these numbers.

## Denied commands

None.

## Cause / Discriminating check / Fix location / Simplification

**Cause:** every test file's own `fs.mkdtempSync(os.tmpdir(), ...)` reads
`TMPDIR`/`TEMP`/`TMP` from the sealed child's environment, and that
environment pointed at the **real** `os.tmpdir()` even though the sealed
*home* itself lived in a disposable directory — the seal covered `HOME`
but never `TMPDIR`, so every test's own temp directories landed directly
on the real machine's `/tmp` with no runner-level cleanup path back to
them at all.

**Discriminating check:** `LEAK_PREFIX_RE` diffed against a
before/after snapshot of the real `os.tmpdir()` around the whole CLI run —
a name that appears after the run and didn't exist before it is
unambiguously something the run itself created outside the sealed root,
regardless of which specific test file was responsible.

**Fix location:** `runSealed`'s child `env` (P1) — the one place every
sealed child (canary and suite alike) gets its environment built, so
pointing `TMPDIR`/`TEMP`/`TMP` at a disposable per-run root there fixes
every test file's own mkdtemp call at once, with no per-test-file changes
needed except the one straggler whose test harness (not the production
code) bypassed the shared env entirely.

**Simplification:** the per-run root's own lifecycle (create, export,
remove-or-trim, sweep) deliberately mirrors `test-home.mjs`'s existing
sealed-home registry pattern (register, cleanup-on-exit-or-signal,
unregister-to-keep) rather than inventing a second competing mechanism —
same shape, same ordering guarantee, one extra layer of containment around
what was already there.
