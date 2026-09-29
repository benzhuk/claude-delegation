DONE

# Lane 57 fix builder — N2 scanner extension + both gaps closed

Worktree: /var/tmp/lane-57/wt (build/test-ipc-57-1). Territory: scripts/run-tests.test.mjs,
scripts/test-home.test.mjs, the N2 scanner (skills/multi/scripts/hooks.test.mjs) and its own unit
test. Nothing touched in scripts/run-tests.mjs, hooks/, or four-read. Scratch:
/var/tmp/l57b-scan (analysis scripts, kept per no-delete rule), /var/tmp/l57b-wza1 (mktemp'd, one
full-gate log kept, not committed).

GOAL line served: "work lost or stalled" (a gate that goes red on an unfixed real env-hygiene
gap, or that lets a new one land unseen, costs builder time later). Nearest NOT: "a rule no
script checks" — the whole point of this round was moving the rule from a diagnosis writeup into
a mechanical scanner assertion.

## 1. RED FIRST — the scanner's red output at HEAD b63db1a (pre-fix)

Extended the N2 test ('N2: no test file in this suite inherits the runner environment on its
own', hooks.test.mjs:434 at the base sha) with `findEnvLessSpawns`, then ran it before touching
any other file:

```
$ git rev-parse HEAD
b63db1a7d00300dd6c76f5ece069089bc28d84cc
$ node --test skills/multi/scripts/hooks.test.mjs
✖ N2: no test file in this suite inherits the runner environment on its own (49.015526ms)
  AssertionError [ERR_ASSERTION]: these node-direct spawn sites pass NO env key at all,
  inheriting the runner's whole environment: scripts/test-home.test.mjs:66 [spawn] passes no
  env key at all, scripts/test-home.test.mjs:523 [execFileSync] passes no env key at all
ℹ tests 28
ℹ pass 27
ℹ fail 1
```

Flagged exactly two sites, both in-territory:
- `scripts/test-home.test.mjs:66` — **`spawnAndSignal`**, the required target.
- `scripts/test-home.test.mjs:523` — the "handler registration is idempotent" test's
  `execFileSync(NODE, [...])` with no options object at all. The diagnosis's manual grep missed
  this one; the mechanical scanner caught it because it's the same shape (a node-direct spawn,
  no env key). Fixed alongside spawnAndSignal since it's in-territory and the same class.

Full flagged-site list across the WHOLE repo (before narrowing/exemption), for the record: a
naive "any spawn/spawnSync/execFile/execFileSync/fork with no env key" rule flagged **45** sites.
Narrowing to node-direct spawns only (process.execPath, or a local const bound to it — see
"Discriminating check" below) cut that to **17**; resolving one bare-identifier options argument
via a same-file one-hop trace (skills/multi/scripts/note-send.test.mjs:868, which really does
have `env: childEnv(home)`, just not visible at the call site) cut it to **16**; excluding the 2
in-territory sites left **14** true out-of-territory candidates; a second narrowing (an inline
`-e`/`--eval` literal that provably never reads its own environment, applied uniformly, not as a
one-off exemption — janitor.test.mjs:1074, native-continuation-smoke.test.mjs:17,
review-run.test.mjs:111, review-run.test.mjs:577, and in-territory run-tests.test.mjs:804) cut it
to **9**.

## 2. Exemption list and reasoning

9 real, out-of-territory gaps remain, named in `N2_SPAWN_ENV_EXEMPTIONS` (hooks.test.mjs) with a
one-line reason each — under the ~10 soft cap, so no stop was needed:

| site | why left alone |
|---|---|
| hooks/codex-unsupported.test.mjs:438 | functional installer smoke test, real INSTALLER child |
| scripts/bugfix-fields.test.mjs:21 | `runCli()` helper, real bugfix-fields.mjs CLI |
| scripts/bugfix-fields.test.mjs:113 | same file, direct usage-message check |
| scripts/prefix-test.test.mjs:91 | `runPrefixTest()` helper spawning the real CLI |
| scripts/work-record.test.mjs:1778 | real build-census.mjs CLI invocation |
| skills/decisions/scripts/decisions-read.test.mjs:440 | symlinked-script exit-code check |
| skills/decisions/scripts/decisions-read.test.mjs:720 | same file, direct SCRIPT_PATH spawn |
| skills/decisions/scripts/decisions-read.test.mjs:727 | same file, blind-input variant |
| skills/decisions/scripts/goals-mirror.test.mjs:30 | real CLI render-match check |

All 9 invoke a real, separately-maintained production `.mjs` file (not an inline literal), so
their content can't be proven safe by the mechanical criterion below — they're real, minor
completeness gaps against the class, left named rather than fixed per the hard rule that an
existing test's spawn options need the lead first.

**Discriminating criterion used to narrow the rule (not just list exemptions):**
1. *Node-direct only.* A spawn of `process.execPath` (or a local `NODE`-style const bound to it)
   runs ARBITRARY script text with the whole inherited environment — it alone can read and act on
   `CLAUDE_CODE_MESSAGING_SOCKET`/`TOKEN`, exactly the shape of the 2026-09-17 incident. A spawn of
   a fixed external binary (`git`, `sh`, `mkfifo`, `taskkill.exe`) has no code path that parses or
   forwards those two variable names, so it cannot reach the runner's session through inheritance
   alone — narrowed to the actual mechanism, not "no env key" read literally everywhere (which
   would also flag every fixture `git` call in the suite: 130 additional sites excluded this way).
2. *Provably-inert inline literal.* An inline `-e`/`--eval` string written directly at the call
   site (not a path to a separately-maintained file) that does not itself reference its own
   process environment is exempt — not because "it doesn't do that today" (the codebase's own
   note-send.test.mjs comment explicitly warns against that framing), but because the check is
   mechanical and re-run every time: if anyone ever edits that exact literal to add such a read,
   this scanner re-flags it at that moment. This is different in kind from trusting an external
   file's current, separately-maintained content.

Also added a unit test for the scanner's own detection, on synthetic source text (built via string
concatenation so the fixtures themselves don't trip the real scan over hooks.test.mjs) — proves
`findEnvLessSpawns` flags a node-direct no-env call, doesn't flag the same call with an env key,
doesn't flag a `git` spawn, doesn't flag a trivial inline literal without a self-env-read, and
does flag one that has such a read.

## 3. Green after both fixes

```
$ node --test skills/multi/scripts/hooks.test.mjs
✔ N2: no test file in this suite inherits the runner environment on its own
✔ N2 scanner: findEnvLessSpawns flags a node-direct spawn with no env key, not one that has one
ℹ tests 28 / pass 28 / fail 0
```

## 4. Fixes

**Gap 2** (scripts/test-home.test.mjs): `spawnAndSignal` and the handler-idempotency test's
`execFileSync` now pass `env: childEnv(scratchHome(fs, "..."))`. Both scripts build their own
fixture home via `makeTempHome()` internally, so the sealed scratch home passed at the spawn
boundary is never read by them — it only blanks the messaging vars, matching every other spawn in
the file.

**Gap 1** (scripts/run-tests.test.mjs): all 10 `childEnv()`-based spawns previously did
`const env = childEnv(fixtureHome, {...}); delete env.NODE_TEST_CONTEXT;` — never
`NODE_TEST_WORKER_ID`. Replaced with one `sealedEnv(fixtureHome, overrides)` helper (childEnv +
delete both markers), used at every site.

## 5. Gates

```
$ node --test skills/multi/scripts/hooks.test.mjs scripts/test-home.test.mjs scripts/run-tests.test.mjs
ℹ tests 83 / pass 82 / fail 0 / skipped 1 (win32-only signal test)

$ TMPDIR=/var/tmp node scripts/run-tests.mjs
ℹ tests 3030 / pass 3025 / fail 0 / skipped 5   (exit 0, ~22s, leak check: 0 new temp entries)
```
Baseline before this lane (diagnosis round) was 3029/3024/5 skipped; the +1 test/+1 pass is this
lane's new scanner unit test. No regression anywhere.

## Commits (build/test-ipc-57-1, not pushed)

- `1167b9a` test: N2 scanner flags a node-direct spawn in a test file with no env key (RED at
  parent b63db1a captured above)
- `7090efc` fix: test-home.test.mjs seals two spawns the N2 scanner now catches
- `0824e76` fix: run-tests.test.mjs strips NODE_TEST_WORKER_ID alongside NODE_TEST_CONTEXT

## docs/census.md

No line there describes these checks (grepped for N2/childEnv/spawnAndSignal/NODE_TEST_*: no
hits) — left unchanged, per instructions.

## Cause / Discriminating check / Fix location / Simplification

Cause: not a new defect diagnosis — this round closes the two completeness gaps the ruling
(skills-fable-lane-57-2) named against the ALREADY-recorded, not-reproduced-on-Linux "Unable to
deserialize cloned data" defect (docs/specs/test-ipc-57/diagnosis.md). Both gaps are real
violations of test-child-env.mjs's own stated rule, independent of whether they caused that
defect.

Discriminating check: the extended N2 scanner itself — red at b63db1a (flagged
scripts/test-home.test.mjs:66 and :523), green after both fixes; the scanner's own unit test on
synthetic source text (hooks.test.mjs, "N2 scanner: findEnvLessSpawns...").

Fix location: scripts/test-home.test.mjs (`spawnAndSignal`, ~line 64-81; the handler-idempotency
test, ~line 515-530); scripts/run-tests.test.mjs (`sealedEnv` helper + its 10 call sites);
skills/multi/scripts/hooks.test.mjs (N2 extension + exemption list + new unit test).

Simplification: run-tests.test.mjs's repeated `childEnv(...); delete env.NODE_TEST_CONTEXT;` pair
(10 sites) collapsed into one `sealedEnv()` helper, per the task's own steer — a third marker node
ever adds only needs naming once.

## Cleanup

No dev server started. No stress processes started or left running. Scratch scripts at
/var/tmp/l57b-scan and the mktemp'd /var/tmp/l57b-wza1 (one full-gate log) left in place per the
no-delete rule; nothing from either was committed. No git identity set. Worktree has 3 new commits
on build/test-ipc-57-1, not pushed.
