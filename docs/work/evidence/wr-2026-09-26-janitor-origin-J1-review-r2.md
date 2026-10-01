VERDICT: APPROVE 70f639bae113d97c1577fb3c3f86eb55825d6430

# J1 review, round 2 (delta 6c9bc85..70f639b)

Scope: the round-2 fixes to scripts/janitor.mjs, scripts/janitor.test.mjs and skills/janitor/SKILL.md, measured against pack/reports/J1-review-r1.md. The reviewed tree was read-only: `git status` is clean at 70f639b. Probes and mutations ran on a scratch clone at the same sha against fixture repos with a bare origin. Every mutation was restored (byte-compare true, clone `git status` clean).

## Gate

- Full sealed suite, `node scripts/run-tests.mjs`, Windows, scratch clone at 70f639b: tests 1812, pass 1812, fail 0, exit 0. That is 1804 from round 1 plus 8 new tests, and it includes the gate's three files (janitor.test.mjs, hooks.test.mjs with the N2 scanner, mirror-shared-skills.test.mjs).
- Linux/Netcup run: not done by me. It is the integrator's second-host step.

## Bug-fix fields (C4)

Cause: SAFE was judged against the checkout's stale local main, with no fetch, and deletion used `-d`, which reads the checkout's HEAD. Round 1 fixed that, but `-D` could then be reached with no fetch this run (`--no-fetch --apply`) and against a tip other than the one proven merged.
Discriminating check: probes P2 (`--no-fetch --apply`) and P1/P1b (a commit lands between gather and apply). Before round 2 they deleted the branch; at 70f639b the branch survives. The new tests "J1 round 2 MAJOR 1" and "MAJOR 2" fail when the fix is reverted (M1-M3 below).
Fix location: scripts/janitor.mjs main() (1443, refuse `--apply` with `--no-fetch`), applySafe() (1127 fetch-live guard, 1148 tip and origin recheck before the single `-D` at 1170), gatherState/classify (the `tip` field carried as `sha` on SAFE branch rows).
Simplification: a reread of the tip and of the origin proof just before `-D`. No new destructive verb; `-D` still has exactly one call site.

## Prior findings, verified

| r1 finding | Fix (70f639b) | Probe rerun | Mutation (revert on scratch, named test) |
|---|---|---|---|
| MAJOR 1: `--no-fetch --apply` reaches `-D` | main() 1443 exits 3 before gatherState; applySafe 1127/1137 skips every delete without a live, successful fetch | P2: exit 3, stderr "--apply needs this run's own fetch; --no-fetch is report-only", branch survives, no branch-delete line. P2b (age unknown) still reports SAFE, labelled "as of last fetch, age unknown", and can no longer be applied. | M1 (main guard off): "MAJOR 1: --apply refuses" fails. M2 (applySafe guard off): "MAJOR 1 (defence in depth)" fails. |
| MAJOR 2: `-D` deletes a tip moved after the proof | SAFE row carries `sha`; applySafe 1147-1156 rereads the tip and reruns `isBranchOnOrigin` just before `-D` | P1 (late commit in a SAFE worktree): worktree removed; branch kept with "skipped: tip moved ... (6486d8b -> b250ea2)"; late commit on refs/heads/feat-race. P1b (plain branch moved): same, branch kept. | M3 (recheck off): "MAJOR 2" fails. |
| MINOR 1: remote class not downgraded | classify 839: UNVERIFIABLE row, `command: ""` | P10: `origin/feat-remote` reads "merge judgment UNVERIFIABLE this run: ...", with no command | M4: "MINOR 1" fails |
| MINOR 2: FETCH_HEAD from another fetch resets the age | 245-251: mtime trusted only when a line starts with the current origin/<main> sha and names `branch '<main>' of ` | P3: 120 h, then after `git fetch upstream` null ("age unknown"), no longer 0.00001 h | M5: "MINOR 2" fails |
| MINOR 3: multi-line raw error | 205-214: first `fatal:`/`error:` line only | P9/P10: single-line reasons. P13 (non-repo): one `fatal:` line. | M6: "MINOR 3" fails |
| MINOR 4: no timeout, prompt can block | 195-201: `timeout: 120000`, `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never` | not exercised live | M7 (timeout removed): "MINOR 4" fails. The pin is source-level only; see NIT 2. |
| MINOR 5: new `##` section in SKILL.md | heading removed; text folded into "janitor never deletes a file"; build-narrative wording replaced | headings equal the base's 8 | M8 (heading added): "MINOR 5" fails |

## Regression hunt, round-1 probes rerun at 70f639b

- **Unstarted branches:** P8. Both unstarted branches survive `--apply`.
- **Halfway fetch:** P4. `fetch.ok=false`, SAFE empty.
- **No origin:** P5. Exit 1, the locally merged branch survives, the banner is a single line.
- **Detached HEAD:** P6. The branch merged on origin is deleted and main is kept. This is correct: the new recheck and fetch guard pass on an unmoved tip.
- **Running from a linked worktree:** P7. The runner is kept, and the SAFE sibling worktree and branches are cleaned.

The happy path still deletes: "J1 item 3 ... IS deleted under --apply" passes in the suite. So the new guards did not turn `--apply` into a no-op.

- **`-D` call sites:** still exactly one (janitor.mjs:1170), pinned by the source test.
- **The new `...process.env` spread (janitor.mjs:200):** it sits in production `fetchOrigin`, not a test file. The N2 scanner only covers `*.test.mjs`; the N2 class is about test children inheriting the runner's token, and here the tool inherits its own caller's env exactly as every other git call already does. Not a finding.
- **Direct `applySafe` with a `noFetch` state:** worktree removals still run. Only reachable by a direct call (main() refuses first), and a removed clean worktree loses no commits because its branch delete is then skipped. Not a finding.

## Remaining (non-blocking)

- **NIT 1: another remote's fetch at the same sha still counts as a fresh fetch of origin.** P12: a mirror remote whose main sits at the same sha as origin/main. `git fetch mirror` writes `<sha> not-for-merge branch 'main' of <mirror-url>`. The line matches, and the age goes from 120 h to about 0 h. This is label-only, and `--no-fetch` can no longer apply. Optional fix, in `lastFetchAgeHours`: also require the line to end with ` of ${git(["remote", "get-url", "origin"], root).trim()}`. That URL is exactly what git writes for a path or URL remote. Predicted: P12 stays at 120 h.
- **NIT 2: the MINOR 4 pin is a source regex.** It checks for the timeout, not the behaviour. That is acceptable by this file's own convention (the exactly-one-`-D` test is the same shape).
- **Round-1 NITs 1-3 are unchanged, as the builder stated:**
  - the `--no-fetch` test regex is loose;
  - the report overstates which JUDGMENT rows carry the age label (the r2 report no longer repeats that claim);
  - a narrowed fetch refspec is never flagged.
- **Builder's deviation, accepted:** reread-then-`-D` rather than an atomic `update-ref -d <sha>`. The residual window is in-process, milliseconds between two git calls, versus the gather-to-apply window that was closed. The r1 fix note offered this choice.
