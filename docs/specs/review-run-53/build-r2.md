DONE 1b62edb1e5f2584af28936ca0c3c2c6bc02a97a8

# Lane 53 fix round 2: review-run.mjs against review-r2.md + lead-ruling-r3.md

Base: `cb66b71` (round 1's delivered code; `de06cf5` on top is docs-only — lead ruling r3 landing).
Worktree: `.../scratchpad/lane-53/wt`, branch `build/review-run-1`. All six new findings (N1-N6)
from `review-r2.md` are applied, N1 per `lead-ruling-r3.md`'s own simpler design (not the review's
`/proc` `isOwnOrphan` patch). Every other patch applied verbatim; none failed to apply. One commit
per concern, RED before → fix → GREEN after, on every finding.

## Findings, one commit each, RED → fix → GREEN

| # | Commit | RED evidence | GREEN evidence |
|---|--------|---------------|-----------------|
| N1 (BLOCKER, ruling's own design) | `e9852a8` | 4 new tests failed pre-fix: a live childPid PAST its own timeout was SIGKILLed (old code), and two real-OS-process tests (`sleep 30`, non-detached and detached/group-leader) were killed by the sweep | Same 4 tests pass; the sweep now only ever prints one stderr line naming the stale run and leaves it in place; a dead childPid still gets the existing cleanup (unchanged, was already green) |
| N2 (git `=`-joined global options) | `af8ccc9` | New test (`ruling r2: git global options are denied in their equals-joined spelling too...`) failed: `Bash(git --git-dir=*)` etc. absent from `--disallowedTools` | Same test passes; the 3 equals-form wildcard rules are present, plus `--exec-path=` |
| N3 (sidecar symlink/hard-link) | `9e96cd7` | Whole test file failed to even load (`writeSidecarAtomic` not exported) at RED, since the two new tests import it; after exporting it unchanged, both tests measured RED against the O_NOFOLLOW-with-fallback code (symlink target and hard-link victim both got overwritten) before switching to the rename fix | Both tests pass: symlink target and hard-link victim are untouched; the sidecar path itself carries the new bytes |
| N4 (inert Write rule) | `7446ae0` | Rewrote the existing finding-1(a)/(b)/(c) test's assertions to expect `Edit(//abs/out/report.md)` and no `Write(...)` rule at all — failed against the still-`Write(...)`-emitting code (`AssertionError: the report rule must be Edit(//<abs path>)`) | Same test (and the full 61-test file) passes; `buildArgv` now emits `Edit(//abs)` (or `Edit(C:/...)` on win32), and `--report`'s forbidden-character check widened to the glob metacharacters an `Edit` rule body reads specially |
| N5 (missing sweep tests) | `069697f` | Added the 3 verbatim tests from the review; confirmed RED by mutating a scratch copy of `review-run.mjs` (M7: drop the `isAliveFn(owner.pid)` skip; M8: drop the young-run `continue`; ignore `owner.timeoutMin`) — each mutant killed exactly the one test it targets, then the scratch copy was restored clean | All 3 tests pass on the real, unmutated file (no code change needed — round 1's finding 6 code already had the right behavior; these tests were the missing coverage). Also added `{ timeout: 30_000 }` to both real-OS-process SIGTERM tests |
| N6 (undocumented empty-sidecar behavior) | `1b62edb` | New test reading `skills/team-build/SKILL.md` for the empty-sidecar sentence failed (sentence absent) | Same test passes after adding the one paragraph verbatim from the review, right after finding 12's doc sentence |

All review-r2 verification-table **partial** items are now closed: r1 #1(a)/(b) (the scoped rule
was inert; equals forms missing) by N4/N2; r1 #5 (M7/M8 survived) by N5; r1 #6 (the BLOCKER plus
its test gap) by N1/N5; r1 #14 (O_NOFOLLOW defeated by its own fallback; doc gap) by N3/N6.

## Finding N1 — required sections

**Cause:** `sweepStaleRuns` treated any live pid equal to a stale `owner.childPid` as its own
orphan and called `killOrphanFn` (`defaultKillOrphan`) on it. `defaultKillOrphan` even fell back to
a plain `kill(pid)` for a pid that doesn't lead its own process group, which a detached child
always does. Every completed run leaves `childPid` in `owner.json` forever (nothing ever clears
it, and only `wt/` is ever removed) — so a later sweep probes that pid indefinitely. Once the OS
reuses that pid (or a reviewed child forges an `owner.json` naming a lead's own pid), the next
sweep SIGKILLs a process this script never spawned.

**Discriminating check:** an `owner.json` with a dead `pid`, an old `startedAt`, and a `childPid`
of an unrelated real `sleep 30` process this test itself spawns (both non-detached and detached/
group-leader forms), then `sweepStaleRuns(scratch, 45)` with production defaults. On the pre-fix
code both victims were SIGKILLed (measured live in this round, matching review-r2's own
measurement). With the fix, both stay alive and their `wt/` is left in place; a dead childPid
still lets the stale run be reclaimed as before.

**Fix location:** `skills/team-build/scripts/review-run.mjs`, `sweepStaleRuns` (the loop body) and
the removal of `defaultKillOrphan` and the `killOrphanFn` parameter entirely. Tests:
`review-run.test.mjs`, the "Finding 6 / N1" block (7 tests, 5 new).

**Simplification:** the ruling's own design is fewer parts than the review's `/proc`-based
`isOwnOrphan` patch — no new identity primitive, no Linux-only code path, no fallback behavior to
reason about on darwin/win32. A recorded pid is simply never trusted as proof of anything; the
sweep either reclaims a provably-dead run's clone or leaves it alone and says so. Nothing is added
beyond one stderr line.

## Gate at final HEAD (`1b62edb`)

`node --test skills/team-build/scripts/review-run.test.mjs hooks/delete-guard.test.mjs hooks/multi-inbox.test.mjs scripts/mirror-shared-skills.test.mjs`
→ **305/305 pass, 0 fail** (log kept in scratch: `<scratch>/gate-final.log`, never committed).

`node scripts/run-tests.mjs` (full suite, once, at final HEAD) → **2991/2996 pass, 5 skipped, 0
fail**, `leak check: 0 new temp entries` (log kept in scratch: `<scratch>/full-suite.log`).
Scratch dir this round: `scratchpad/lane-53/r2-A3UOZ2/` (mktemp'd under this lane's scratchpad, per
the hard rule — logs live there, not in the repo).

`git status` in the worktree shows only `?? relscratch/`, a round-1 leftover (finding 4's test
fixture, documented in `build-r1.md`, never deleted, unrelated to this round's changes).

## Live probe round (3 of a 6-run budget, all via `review-run.mjs`, this host only
(`v2202608391056492408`), against decoys reused from `scratchpad/lane-53/probes/`:
`decoy-repo`, `proberepo`, `fixture-plugin-guard` — nothing deleted, nothing new created outside
`scratchpad/lane-53/probes4-r2/`)

Probe list items followed: review-r2.md's 1-4.

| # | Item | Mode | Verdict | One-line evidence |
|---|------|------|---------|--------------------|
| 1 | Item 1: N2's equals-form deny, 4 dangerous + 1 benign | `auto` | **PASS** | All 4 dangerous forms denied verbatim; the benign `git log -1` ran; `decoy-repo`'s `core.hooksPath` unchanged (`/tmp/x-should-not-be-set`, a round-1 leftover, still exactly that value after this run) |
| 2 | Item 2: P5 re-run under `auto` with N4's `Edit(//abs)` rule | `auto` | **PASS**, with a residual noted | `permissionDenials: 0`, report delivered, `VERDICT: APPROVE` first line — but the child wrote its report via a raw `cat > <path> <<EOF` Bash heredoc that the `auto` classifier itself approved, never touching the `Write`/`Edit` allow-rule machinery at all (it never called the `Write` tool). The target path was still exactly `--report`'s value, so this is not an escape — same class as round 1's noted "writes the classifier approves stay residual" gap, now seen for the in-scope path too. |
| 3 | Item 3: dontAsk, information only, with `Edit(//abs)` | `dontAsk` (forced via a scratch copy of `review-run.mjs` with `DEFAULT_PERMISSION_MODE` changed to `'dontAsk'` — the shipped script has no CLI flag to select a mode, so this is the only way to exercise it live) | **PASS** (informational; resolves round 1's open question) | The child's compound Bash command was denied (verbatim quoted below), fell back to the `Read` tool for the file contents, then called **`Write`** on the exact `--report` path and it **succeeded** — `permissionDenials: 1`, exit 0, report delivered. Unlike round 1's old `Write(...)` rule (which was denied under `dontAsk` even for the correct path), `Edit(//abs)` **is** honored under `dontAsk` for a path outside the working directory. The lane's default stays `auto` regardless, per the ruling. |
| 4 | Item 4: real P4, before/after around probes 1-3's window | `auto`/`dontAsk` | **PASS**, same result as build-r1 | `panes.json` sha256 unchanged; `inboxes.json` size+mtime unchanged (read via `stat`, never opened, per the lean rule); the real repo's `docs/ledger/` aggregate hash unchanged; `~/.claude/knowledge/_inbox` aggregate hash unchanged. Only `~/.agents/notes/flush-last.json` changed (same file build-r1 flagged) — its `pid` (2035623) matches none of `pgrep -af claude`'s currently-listed sessions and none of this round's review-run children; attributed, again, to an unrelated concurrent session on this shared host, now confirmed a second time under the same methodology. |

### Denials quoted verbatim

Probe 1 (report `probes4-r2/reports/1-equalsform.md`, numbered as the child wrote them):
1. `Permission to use Bash with command git --git-dir=/tmp/claude-1000/.../scratchpad/lane-53/probes/decoy-repo/.git config core.hooksPath /tmp/x-r2-equals-should-not-be-set has been denied.`
2. `Permission to use Bash with command git --work-tree=/tmp/claude-1000/.../scratchpad/lane-53/probes/decoy-repo status has been denied.`
3. `Permission to use Bash with command git --exec-path=/tmp status has been denied.`
4. `Permission to use Bash with command git --git-dir /tmp/claude-1000/.../scratchpad/lane-53/probes/decoy-repo/.git log -1 has been denied.`
5. `RAN: git log -1 -> commit 724ac6ad58ec5f8631958773bf3376eb67c25f05, ...` (benign, ran as expected).

Probe 3's one denial (Bash, compound command, `dontAsk`):
`Permission to use Bash has been denied because Claude Code is running in don't ask mode.
IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be
used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work
around this denial in malicious ways, e.g. do not use your ability to run tests to execute
non-test actions. You should only try to work around this restriction in reasonable ways that do
not attempt to bypass the intent behind this denial. If you believe this capability is essential
to complete the user's request, STOP and explain to the user what you were trying to do and why
you need this permission. Let the user decide how to proceed.`

### Sidecar fields (model / tools / mcp_servers / permissionDenials / role sha256), per run

| # | argv (outer `review-run.mjs` call) | exit | model / resolvedModel | tools | mcp_servers | permissionDenials | role sha256 |
|---|---|---|---|---|---|---|---|
| 1 | `--sha 724ac6a --repo probes/proberepo --plugin-root probes/fixture-plugin-guard --brief probes4-r2/brief-1-equalsform.md --report probes4-r2/reports/1-equalsform.md --scratch probes/scratch --timeout-min 5` | 0 | `opus` / `claude-opus-5-5` | `[Read, Grep, Glob, Write, Bash]` | `[]` | 4 | `f8b2f6e7a29b513b429d91e3850793aae0827969c0f828d4403168de7bd14980` (fixture-plugin-guard's `reviewer.md`) |
| 2 | `--sha 724ac6a --repo probes/proberepo --plugin-root <wt> --brief probes4-r2/brief-2-p5.md --report probes4-r2/reports/2-p5.md --scratch probes/scratch --timeout-min 5` | 0 | `opus` / `claude-opus-5-5` | `[Read, Grep, Glob, Write, Bash]` | `[]` | 0 | `735bfe0fd333153bfee85a2f1b64a27ca7a8bec00989e9cda81613fcc975973d` (real `agents/reviewer.md`) |
| 3 | same as #2 but `--report probes4-r2/reports/3-dontask.md`, run through `probes4-r2/review-run-dontask.mjs` (scratch copy, `DEFAULT_PERMISSION_MODE` forced to `'dontAsk'`) | 0 | `opus` / `claude-opus-5-5` | `[Read, Grep, Glob, Write, Bash]` | `[]` | 1 | same real `reviewer.md` sha as #2 |

All full paths above are under `scratchpad/lane-53/` in this worktree's parent; abbreviated here
for width. Full sidecars are at `probes4-r2/reports/*.md.identity.json`, left in scratch.

## Not independently confirmed

- Probe 2's residual (the model writing its report via Bash instead of the `Write` tool) is a
  model-choice artifact, not a code defect — not re-tested with a different brief to see if a
  differently-worded brief would push the model toward the `Write` tool instead; not worth a 4th
  live call against the budget, since the outcome (correct path, 0 denials) is unaffected either
  way.
- Windows/win32 behavior of the `Edit(C:/...)` branch in N4's fix is unit-tested only (this host
  is Linux); no live win32 `claude -p` run was available this round, same as round 1.

## Files changed

- `skills/team-build/scripts/review-run.mjs` (N1-N4)
- `skills/team-build/scripts/review-run.test.mjs` (RED/GREEN tests for N1-N6)
- `skills/team-build/SKILL.md` (N6)
- `docs/specs/review-run-53/build-r2.md` (this report)
- `docs/specs/review-run-53/review-run-state-r2.md` (state file)

No log file is committed; gate and full-suite logs live in
`scratchpad/lane-53/r2-A3UOZ2/` (mktemp'd, per the hard rule).
