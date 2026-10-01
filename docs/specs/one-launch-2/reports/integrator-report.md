VERDICT: PASS

# Integrator report — one-launch-2 (wr-2026-09-26-one-launch-fix), round 3

Integration worktree: /home/ben/Code/wt-olfix, branch build/one-launch-2.

## Context: this is round 3

Round 2 (prior integrator run, see integrator-report.md history / docs/work/wr-2026-09-26-one-launch-fix.record.md
Log at 2026-09-26T18:31:00Z) merged F1 at sha `8791423e37a85d2fee31854c7eade696fde2552e` (merge
commit `2f659bf574fa66460fe3f34cff4ae4013cd54e97`) and FAILED the gate: one new failing test
name vs base, **N2** (skills/multi/scripts/hooks.test.mjs:429), triaged to F1 (four spawn sites
in F1's new file `accept-prep.test.mjs` spread `process.env` directly instead of using the
sealed `childEnv()` helper). That round's record was marked rejected, with "fix round 3 for
F1 ... relaunched with startFrom NEEDS_FIXES at 8791423".

F1 fixed it: branch `build/one-launch-2-F1` now sits at sha
`4eb7bd1e91f716f902c86681a075eff67e473fc4`, one commit on top of 8791423, touching only
`skills/team-build/references/accept-prep.test.mjs` (imports `childEnv`, routes all four
spawn sites through it). Reviewed and APPROVEd at that exact sha:
`docs/specs/one-launch-2/reports/F1-review.md`, first line
`VERDICT: APPROVE 4eb7bd1e91f716f902c86681a075eff67e473fc4` — matches
`git rev-parse build/one-launch-2-F1` exactly.

## Merge (this round)

`git merge --no-ff build/one-launch-2-F1` into build/one-launch-2 (ordinary merge, no rebase,
never pushed). Merge commit, my own `git rev-parse HEAD` run in the worktree after the merge:
**`c904a4aac6c92d5735c768be8d2a4bc08114af51`**. Clean, no conflicts (the range 8791423..4eb7bd1
touches only accept-prep.test.mjs, which the worktree's pre-existing uncommitted docs edits
did not touch).

Pre-merge state note (not mine to fix, reported for the record, same as round 2's report):
the worktree carried uncommitted docs-only edits (F1-gate.log, F1-report.md, F1-review.md,
F1-state.md modified; F1-n2-gate.log untracked) when I started. None of these are touched by
F1's branch diff, so the merge did not conflict with them; left exactly as found, uncommitted.

## Gate: `node scripts/run-tests.mjs`

Ran three times on the merge commit c904a4a to resolve a one-off flake unrelated to the merge
(see "Flake investigated" below). The official log (path per the brief's Gate line, 3rd/final
run) is `docs/specs/one-launch-2/reports/integrator-gate.log`.

Official run summary: `tests 1746 / pass 1741 / fail 2`.
Failing test names: **V4** (skills/multi/scripts/mirror-shim.test.mjs), **H6**
(skills/multi/scripts/note-send.test.mjs). **N2 is gone** — confirmed fixed.

Base comparison run: created a scratch worktree at base sha
`33aa023bd927b44b23292d540cc0c2aed4ced212` under the session scratchpad (never under
/home/ben/Code/wt-olfix, never pushed, removed afterward with `git worktree remove`), and ran
the identical command there **twice** (see "Flake investigated" for why twice).
Both base runs: `tests 1714 / pass 1709 / fail 2`, failing names **V4**, **H6** only, both times.

### Failing-test-name diff (this branch vs base 33aa023), by name

| Test name | Base 33aa023 (both runs) | build/one-launch-2 @ c904a4a (official run) | Verdict |
|---|---|---|---|
| V4 (mirror-shim.test.mjs) | fail | fail | pre-existing, matches contracts.md R6's pinned list |
| H6 (note-send.test.mjs) | fail | fail | pre-existing, matches contracts.md R6's pinned list |
| N2 (hooks.test.mjs) | pass | pass | round-2 new failure, now FIXED — confirmed absent |

**No new failing test name vs base.** Gate: PASS.

## Flake investigated (skills/decisions/, not F1, not the merge)

The first of the three full-suite runs on c904a4a additionally showed a third failure, once:

```
test at skills/decisions/scripts/registered-pickup.contract.test.mjs:98:1
✖ one injected selection invokes exactly one bound entry and maps lifecycle states to safe summaries
  AssertionError [ERR_ASSERTION]: ordinal selects canonical repo/page order, not fixture creation order
  + actual - expected
  + 'fedcba9876543210fedcba9876543210'
  - '0123456789abcdef0123456789abcdef'
```

Per the brief, any failing name absent from the base run is a new failure, full stop — so this
was investigated rather than assumed away:
- Not in F1's diff: the range `8791423e37a85d2fee31854c7eade696fde2552e..4eb7bd1e91f716f902c86681a075eff67e473fc4`
  touches only `accept-prep.test.mjs`; F1's whole scope (contracts.md) never touches
  `skills/decisions/`.
- Does not reproduce running the file alone: `node --test skills/decisions/scripts/registered-pickup.contract.test.mjs`,
  4/4 clean runs (pass 8 / fail 0 each time).
- Does not reproduce on the 2nd or 3rd full-suite run of the SAME commit c904a4a — same code,
  different outcome run to run (2nd and 3rd: `tests 1746 / pass 1741 / fail 2`, V4+H6 only).
- Does not reproduce on either of two full-suite runs at base 33aa023.
- The failing assertion's own in-file comment (added by a prior commit,
  `931588a4e366e8df75ce796beb1ead161fac9693`, "make the pickup contract test independent of
  mkdtemp's random sort order") documents that a *different* assertion later in the same test
  was already known to depend on `mkdtempSync`'s random fixture-directory suffix order; the
  assertion that failed here is upstream of that fix and evidently shares the same class of
  order-dependency.

Conclusion: this is an intermittent, pre-existing flake in
`skills/decisions/scripts/registered-pickup.contract.test.mjs` (or the pickup-ordinal logic it
exercises), unrelated to F1 and unrelated to this merge — observed once in 3 tries on the exact
same commit, and not observed in 2 tries at base (small samples; base could in principle also
flake on rarer draws — not something I can rule out from 2 runs). Reported here as a fact, not
judged away and not silently dropped, per the brief's explicit instruction not to decide
acceptability. This is not one of contracts.md's two pinned pre-existing failures (V4, H6), so
it is a genuinely new name to contracts.md's list even though it is not attributable to F1's
diff — flagged for whoever owns skills/decisions/ next, not triaged to F1.

## Two named territory gate results (verbatim, per the evidence format)

`node --test skills/team-build/references/build-loop-workflow.test.mjs
skills/team-build/references/accept-prep.test.mjs`, run from /home/ben/Code/wt-olfix at the
merge commit c904a4a — full output:

```
✔ R3a: editRecord on a record with no Worktree: changes only Status/Artifact/Evidence, inserts Worktree, appends one Log line — everything else byte-identical (2.820604ms)
✔ R3a: editRecord on a record WITH an existing Worktree: updates it in place (no insert) and dedupes Evidence, keeping existing order (0.45708ms)
✔ R3a (line endings): a CRLF record's untouched lines keep \r\n exactly, including the newly inserted Log line (0.427424ms)
✔ R3a: editRecord throws missing-field, changes nothing on disk, when Status: is absent (0.587266ms)
✔ B1: editRecord on a no-trailing-newline record ending in a Log line inserts a new line, never gluing it onto the last one (0.37157ms)
✔ B1: editRecord on a no-trailing-newline record with NO Log lines at all still inserts one cleanly (0.322006ms)
✔ m1: --evidence none is never appended as an evidence path, whether existing Evidence: is real paths or already 'none' (1.775468ms)
✔ R3b ORDER: census sees the reviewed Log: line already present, and check-acceptance runs strictly after census (106.998714ms)
✔ R3c: a failing census leaves the record's edit in place, reports censusPath null + censusError, and never runs check-acceptance (71.183882ms)
✔ m2: runCensus creates the --census-out directory when it does not already exist (102.811501ms)
✔ R3d: a full successful run never writes Status: accepted and never invokes the accept subcommand (113.078983ms)
✔ parseArgs: rejects a non-40-hex --artifact-sha (0.439223ms)
✔ parseArgs: rejects both --from and --marker together (0.170678ms)
✔ parseArgs: reports the missing flag name for a missing required option (0.14568ms)
✔ splitPreservingEol/joinPreservingEol: round-trips arbitrary mixed line endings byte-for-byte (0.104688ms)
✔ formatLogLine: matches scripts/work-record.mjs's own format (no trailing space when note is empty) (0.1193ms)
✔ main: exits 1 and writes nothing to stdout on a bad-args failure (0.272311ms)
✔ L-C4.1: the script parses under node --check (33.769627ms)
✔ L-C4.2 & L-C4.7: meta is a pure object literal; phases are {title, detail} objects titled Setup, Build, Review, Fix, Integrate, Seam, Accept in order (1.121721ms)
✔ L-C4.3: every banned token is absent from the source, each checked by name (0.650741ms)
✔ bonus: the source never calls pipeline( (L-C3: not used at the territory level, or anywhere, in this script) (0.171258ms)
✔ L-C4.4: every agent( call site carries a model: and an agentType: key, matching one of the pinned pairs (1.330256ms)
✔ L-C4.5: `args ?? {}` (or `args ?? ({})`) is the first code statement referencing args (0.439782ms)
✔ L-C4.6: log( appears within 5 source lines of the literal string 'rounds-exhausted' (0.385872ms)
✔ L-C4.8: BUILD, REVIEW, INTEGRATE, SETUP, and ACCEPT_PREP each appear as a schema: value in at least one agent( call (0.302517ms)
✔ R9: every mandate constant carries the note-send prohibition (0.303779ms)
✔ R2: missing specPath/baseSha/startedAt returns missing-args and spawns nothing (1.414613ms)
✔ R2: args entirely undefined also returns missing-args and spawns nothing (0.984064ms)
✔ R4: a two-sha baseSha like 'a+b' returns bad-base-sha and spawns nothing (0.352482ms)
✔ R4: baseSha shorter than 7 hex characters, or containing a non-hex character, is bad-base-sha (0.471181ms)
✔ R4: a valid 7-40 hex baseSha (either length, any case) is accepted, not bad-base-sha (1.042814ms)
✔ R2: mixing a given territory with a setup territory is a launch error, nothing spawns (0.796661ms)
✔ R2: a territory with only one or two of {worktree, branch, briefPath} is ambiguous, also mixed-territory-modes (0.19227ms)
✔ m2: startFrom with a non-sha string (e.g. the literal 'HEAD') is a launch error, nothing spawns (0.189877ms)
✔ m2: startFrom with an unrecognized verdict is a launch error, never silently runs from round 1 (0.154954ms)
✔ m2: startFrom NEEDS_FIXES without a findingsPath is a launch error (0.220964ms)
✔ m2: startFrom on a setup territory is a launch error (R6: only valid on given territories) (0.230478ms)
✔ m1: a trailing slash on integrationWorktree does not nest the setup worktree inside it (0.500204ms)
✔ m1: a trailing slash on integrationBranch does not produce an empty slug (0.536649ms)
✔ given path: no territories, integrator still runs once, empty territories and blockers (0.296678ms)
✔ given path: one territory, immediate APPROVE: one build call, one review call, one integrate call, rounds=1 (0.387364ms)
✔ given path: NEEDS_FIXES once then APPROVE: fix round re-runs build with the SAME pinned builder pair, rounds=2 (0.344638ms)
✔ given path: a null agent() return on the build stage is respawned once and succeeds (0.410149ms)
✔ given path: seam S1 sha prefix acceptance still works (sameSha/longerSha unchanged) (0.906267ms)
✔ given path: NEEDS_FIXES at every round exhausts maxRounds: blocker rounds-exhausted, log() fires (0.534175ms)
✔ given path: cross-territory concurrency uses parallel(), never pipeline(): two territories complete independently (0.307734ms)
✔ given path: returns the full R7 superset shape and nothing else (0.190357ms)
✔ a null integrator return twice falls back to a BLOCKED INTEGRATE result rather than throwing (0.242274ms)
✔ S1: the integrate prompt names the integration worktree/branch/gate when integrationWorktree is given, and omits it entirely otherwise (0.297208ms)
✔ R6: startFrom APPROVE skips build and review entirely, goes straight to Integrate (0.241986ms)
✔ R6: startFrom NEEDS_FIXES starts at a fix round (round 2), no round-1 build or review call (0.239852ms)
✔ setup path: setup-failed when a returned territory's headSha doesn't match baseSha (0.219149ms)
✔ setup path: setup-failed when a returned worktree/branch/briefPath doesn't match the computed name (0.199971ms)
✔ setup path: setup-failed when a returned branch doesn't match the computed name (0.172862ms)
✔ setup path: setup-failed when a returned briefPath doesn't match the computed name (0.157977ms)
✔ setup path: setup-failed when a territory row is missing from the returned territories array (0.482488ms)
✔ setup path: setup agent dying twice gives setup-failed with id '*' and spawns nothing else (0.175926ms)
✔ setup path: setup-failed when the returned seamBriefPath differs from the computed one (0.230238ms)
✔ setup path: setup-failed when the returned reviewerBriefPath or integratorBriefPath differs from the computed one (0.271329ms)
✔ M1: a correct but relative reviewerBriefPath (resolved against integrationWorktree) passes setup verification (0.258459ms)
✔ M1: a correct but relative integratorBriefPath, seamBriefPath and reportPath (each resolved against integrationWorktree) all pass setup verification (0.257258ms)
✔ M1: no other leniency — a genuinely different reviewerBriefPath still fails setup verification after normalising (0.199631ms)
✔ R7: a correct but relative briefPath (resolved against integrationWorktree) passes setup verification (0.242515ms)
✔ R7: a correct but relative worktree (resolved against integrationWorktree) passes setup verification (0.194363ms)
✔ R7: a '../' escape that still resolves to the exact computed briefPath passes verification (0.170106ms)
✔ R7: a trailing slash on a returned worktree does not itself cause a mismatch (0.187283ms)
✔ R7: no other leniency — a genuinely different briefPath still fails setup verification after normalising (0.396318ms)
✔ R7: a genuinely different worktree still fails setup verification after normalising (0.134462ms)
✔ setup path: computed branch/worktree names use integrationBranch's last segment as slug (0.205361ms)
✔ S1: the setup prompt names the integration worktree/branch/gate for the integrator brief it writes (0.209476ms)
✔ s11: setup prompt carries a report path, and a mismatched returned reportPath is setup-failed (0.259471ms)
✔ N2: the setup prompt never renders undefined when integrationBranch/integrationGate are absent (0.21774ms)
✔ S4: accept-prep is skipped (no-integration-branch) when integrationWorktree is given but integrationBranch is not (0.193271ms)
✔ S4: the seam-fix prompt never renders a literal undefined Gate when integrationGate is absent (0.286972ms)
✔ setup path: full fixture run produces setup, builds, reviews, integrate, seam APPROVE, and accept-prep with censusPath and checkAcceptance (12.685051ms)
✔ given path (integrationWorktree absent): seam:null, acceptance:null even with two territories (0.46393ms)
✔ R4: given mode with an explicit seamBriefPath uses it for the seam review, not the reviewer brief (1.032766ms)
✔ R4: given mode with NO seamBriefPath falls back to the reviewer brief for the seam review (0.18561ms)
✔ m4: given mode with an EMPTY-STRING seamBriefPath falls back to the reviewer brief, same as absent (0.176396ms)
✔ R4: seam NEEDS_FIXES triggers one seam-fix builder on the integration worktree, then a delta re-review that APPROVEs (0.233852ms)
✔ M2: seam-fix that makes no new commit does not leak the current HEAD into the re-review prompt (0.200983ms)
✔ m9: seam round-1 sha mismatch against integrate.headSha blocks with review-sha-mismatch (0.171059ms)
✔ m9: seam agent dying twice falls back to BLOCKED agent-died rather than throwing (0.243467ms)
✔ R4: seam rounds-exhausted when NEEDS_FIXES persists through maxRounds (0.322005ms)
✔ R4: seam is SKIPPED (not run) with a single territory, since the default requires two or more (0.190227ms)
✔ R4: seam:true forces the seam stage even with a single territory (0.233643ms)
✔ R4: seam:false suppresses the seam stage even with two or more territories (0.237448ms)
✔ R5: accept-prep is skipped (acceptance.skipped) when seam is NEEDS_FIXES (0.241414ms)
✔ R5: accept-prep is skipped when recordPath is absent, even with seam APPROVE (0.304157ms)
✔ R5: accept-prep runs when seam is SKIPPED and integrator PASSed (no seam stage needed) (0.719195ms)
✔ R5: accept-prep is skipped when the integrator did not PASS (0.166833ms)
✔ M4: accept-prep is skipped (territory-blockers) when a territory is builder-BLOCKED, even though the integrator PASSed (0.181353ms)
✔ M4: accept-prep is skipped (territory-blockers) when one of two territories is blocked (0.184648ms)
✔ M3: accept-prep returning an unverified integrationHead (e.g. the literal 'HEAD') adds an accept-prep review-sha-mismatch blocker (0.16593ms)
✔ M3: accept-prep is checked against the seam's (longer) APPROVE sha, not the integrator's shorter one (0.216636ms)
✔ s11: accept-prep returning a reportPath that differs from the computed one adds an accept-prep report-path-mismatch blocker (0.183736ms)
✔ R9: no rendered prompt across build/review/integrate/setup/seam/accept-prep contains any note-send instruction other than the prohibition itself (0.279091ms)
✔ build-loop-args.example.json (new one-launch shape) parses and matches the setup-territory shape (0.20578ms)
✔ build-loop-args.legacy.example.json (old given-worktree shape) parses and matches the given-territory shape (0.137498ms)
✔ both example arg files launch cleanly against the given/setup detection with no mixed-territory-modes error (0.552694ms)
ℹ tests 100
ℹ suites 0
ℹ pass 100
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 468.459122
```

Plain pass/fail for F1's own contribution (its two pinned test files, run in isolation): **PASS**
— 100/100, 0 failures. Matches F1-report.md's and F1-review.md's own claimed 100/100.

Targeted N2 repro (the exact reviewer-named check), verbatim:

```
$ node --test --test-name-pattern="N2" skills/multi/scripts/hooks.test.mjs
✔ N2: no test file in this suite inherits the runner environment on its own (14.110079ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 98.721954
```

## Evidence

- docs/specs/one-launch-2/reports/integrator-gate.log — full tail of the official (3rd) run,
  matching base exactly (V4 + H6 only).
- Base-comparison runs (both): performed in a scratch worktree
  (session scratchpad `base-cmp/33aa023`, since removed with `git worktree remove`); output
  transcribed above (summary + failing test names for both runs) rather than left on disk,
  since it lived outside the integration worktree.
- The transient decisions-flake run's raw log was superseded (docs/specs/one-launch-2/reports/integrator-gate.log
  was overwritten by the 2nd and then 3rd runs at the required Gate path); its failing-test text
  is transcribed verbatim above, captured before being overwritten.
- docs/specs/one-launch-2/reports/integrator-state.md — kept current after each gate run.

## Not done (explicitly out of scope)

- No fix applied to V4, H6, or the decisions flake — reported, not patched.
- No ship decision — that is the orchestrator's call, not mine.
- No judgment on whether the decisions flake or V4/H6 are "acceptable" — reported as facts.
- The lead's dogfood step (lane six's record Base rewrite + four-read) — not touched, not mine.
- No push to origin. No destructive git. No peer notes sent.

Report: this file. Gate log: docs/specs/one-launch-2/reports/integrator-gate.log. State file:
docs/specs/one-launch-2/reports/integrator-state.md.
