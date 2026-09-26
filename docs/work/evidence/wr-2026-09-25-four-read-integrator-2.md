VERDICT: FAIL

# Integrator report round 2 — four-number read (2026-09-25)

## Scope
Brief: `C:/Users/benzh/Code/four-read/pack/integrator.md`, facts `pack/facts.md`. Prior round: R2 already merged in `wt-int` at `804b5d7a83125b3c8b5bec75ac937752327e14b7` (`pack/reports/integrator.md`, VERDICT: BLOCKED — R1 excluded that round for lack of approval). This round: R1 is now approved — verified directly at `pack/reports/R1-review-r5.md` line 1, `VERDICT: APPROVE 57661bfa1238aacfe05872a48585519bd92566a0`, matching `build/four-read-1-r1`'s own HEAD (`git rev-parse build/four-read-1-r1` = `57661bfa1238aacfe05872a48585519bd92566a0`, exact match).

## Merge
`cd C:/Users/benzh/Code/four-read/wt-int && git merge --no-ff build/four-read-1-r1 -m "merge: build/four-read-1-r1 at 57661bf (accepted APPROVE, R1 review round 5)"` — clean, no conflicts (20 files changed, 4215 insertions(+), 27 deletions(-): `scripts/four-read.mjs`, `scripts/four-read.test.mjs`, `scripts/fixtures/four-read/*`, `docs/census.md`, `scripts/build-census.mjs`/`.test.mjs` `--from/--to`, and R1's committed evidence outputs under `docs/work/evidence/`).

**Merge sha: `38116eba819217fadd407f6c22feb5caae1f40b0`** on `build/four-read-1`. Not pushed.

The four untracked files sitting in the worktree before I started (`docs/specs/2026-09-25-four-number-read.md`, `docs/work/wr-2026-09-25-four-read{,-r1,-r2}.record.md` — the lead's) were left untouched throughout; `git status --short` after all my work shows exactly those four and nothing else.

## Full sealed suite (run once)
`node scripts/run-tests.mjs` at `38116eb`: **1651 tests, 1650 pass, 1 fail.**

Failing test:
```
test at skills\multi\scripts\hooks.test.mjs:429:1
✖ N2: no test file in this suite inherits the runner environment on its own
  AssertionError: these spawn sites build their own env instead of using childEnv(): scripts\four-read.test.mjs:58
```

`docs/sealed-baseline.json` is `{"files": []}` — empty, so this is a newly-failing file outside the ratchet, a genuine gate failure, not a pre-existing known one. Confirmed deterministic by re-running `node --test skills/multi/scripts/hooks.test.mjs` alone (same failure, same line).

**Root cause and triage:** `skills/multi/scripts/hooks.test.mjs`'s own N2 test (line 429) is a repo-wide scanner: it walks every `*.test.mjs` file the sealed runner runs and asserts every child-process spawn site builds its environment via the shared `childEnv()` helper (`skills/multi/scripts/test-child-env.mjs`), never its own ad hoc env, so no test can accidentally leak the real machine's identity/secrets into a spawned child. That convention predates R1's branch point — `git log 931588a -- skills/multi/scripts/hooks.test.mjs` shows it already enforced (`c687412 fix(N2): scan every *.test.mjs the sealed runner actually runs`). `scripts/four-read.test.mjs:58` (new file, wholly owned by R1) violates it:
```js
function commit(dir, file, content, message, isoDate) {
  fs.writeFileSync(path.join(dir, file), content);
  git(dir, ['add', file]);
  const env = { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', message], { encoding: 'utf8', env });
  ...
}
```
This builds `env` from `process.env` directly instead of the shared `childEnv()` helper. Confirmed by removing R1 from the equation: the R2-only merge (`804b5d7`, prior round) ran 1581/1581 green with no such failure; adding R1's `scripts/four-read.test.mjs` is what introduces it. **Owning territory: R1** — the fix (route the fixture's git-commit helper's env through `childEnv()`, or otherwise satisfy the scanner) belongs to whoever owns `scripts/four-read.test.mjs`, not to the integrator (I fix nothing) and not to R2 or `skills/multi` (the scanner itself is doing exactly its job).

## Budget check
`git diff --stat 931588a -- scripts/build-census.mjs scripts/work-record.mjs` at `38116eb`:
- `scripts/build-census.mjs`: 1036 → 1084 lines (+72/-24, net **+48**).
- `scripts/work-record.mjs`: 1072 → 1164 lines (+103/-11, net **+92**).
- **Combined net growth: +140, inside the +150 ceiling** (10 lines of headroom).
- `scripts/four-read.mjs`: 399 lines, under its separate 400-line single-sitting ceiling by exactly 1 line.

## Seam check — record fields consumed round-trip (ran against a scratch copy, outside the committed tree)
Built entirely under my scratch dir plus one throwaway repo-relative record/evidence pair inside `wt-int` (required — `work-record.mjs`'s own path confinement refuses a `--record`/`Evidence:` path outside the repo; deleted immediately after, `git status --short` confirmed clean of my additions afterward):

1. **`work-record.mjs` has no `open` subcommand** (confirmed again this round: `node scripts/work-record.mjs --help` → `expected command: check-acceptance or accept`; no `'open'` string anywhere in the file). `Lead-session:`/`Spec-session:`/`Spec-from:` are hand-authored record header fields (`docs/census.md`'s own wording: "open the record with the id your host reports" is documentation for a human/hook-driven authoring step, not a CLI verb) — matching what R2's own state note and the prior round's integrator report already flagged. I authored a scratch record by hand with those three fields instead of a nonexistent CLI invocation.
2. Ran `node scripts/four-read.mjs --record <scratch record> --census <scratch census.json> --ledger <fixture ledger>`: output's `leadSession` block reads `{"id": "lead-session", "note": "from the record's Lead-session: field", "source": "record"}` — confirms the field is read from the record, not a command-line fallback. Also re-ran with `--spec-census` pointed at the same census file: `four-read.mjs` used `Spec-session:`/`Spec-from:` to validate the spec-census window and correctly reported `partial (no spec slice): spec-census is not Spec-session:'s Spec-from:..Opened: window` — proving the fields are actively consumed for validation, not merely echoed.
3. Ran `node scripts/work-record.mjs accept --record <scratch record, Status: reviewed> --repo . --pinned-artifact <merge sha> --census <scratch census.md> --four-read <scratch four-read.json>` against the real merge sha `38116eba819217fadd407f6c22feb5caae1f40b0` as both `Artifact:` and `--pinned-artifact`: **`{"ok":true,...}`**, exit 0. The accepted record shows both `Census: ...` lines (copied verbatim from the census summary) and four `Four numbers: ...` lines (one per number, copied from the `--four-read` JSON) inserted before the new `Log: ... accepted ...` line, and `Status:` flipped from `reviewed` to `accepted`. Full round-trip confirmed: record fields in -> `four-read.mjs` consumes them -> `accept --four-read` copies the read's output back into the record.
4. Also ran plain `check-acceptance` first (read-only preview) to confirm it enforces the R2 rules independently of `accept`: a placeholder-shaped `Lead-session:`/`Spec-session:` value (no digit, matching the facts pack's own "unavailable"-style placeholder convention) is rejected/WARNed exactly as spec'd (`lead-session-missing` refusal for the former, `spec-session-missing` WARN for the latter) before I corrected the scratch record to real-shaped ids.

No code defect found in the seam itself — R1's `four-read.mjs` and R2's `work-record.mjs` fields interoperate correctly. The only note carried over from the prior round stands: "open ... with `--lead-session`" in spec.md is not a literal CLI verb in this codebase; it is realized as a hand-authored record convention, which is what actually round-trips.

## Bug-fix gate steps — not applicable
Neither R1 nor R2's reports/reviews carry `Base sha:`/`Regression test:` fields (re-grepped `pack/reports/*`, none found) — this is a feature build (the four-number read), not a bug-fix mandate, so `bugfix-fields.mjs`/`prefix-test.mjs` do not apply. (Same finding as the prior round's report; unchanged by this round's R1 merge.)

## Stop-channel probe
Already run and recorded once for this build in the prior round (`pack/reports/integrator.md`): two turns, one headless session, confirmed **yes** — a non-blocking `Stop` hook's `additionalContext` reaches the model on this CLI build (2.1.283). Not re-run this round (once per build, per the brief); carried forward as fact for the eventual work record.

## Why FAIL
The merge itself is clean and both budget and seam checks are green, but the mandatory single full sealed-suite run at the merged head shows a real, deterministic, non-baseline failure: `skills/multi/scripts/hooks.test.mjs`'s N2 scanner catches `scripts/four-read.test.mjs:58` (R1's own new fixture helper) building its child-process env by hand instead of through the shared `childEnv()` helper the whole suite's sealing convention requires. That is a genuine cross-territory seam gap this gate exists to catch (R1 built against its own worktree in isolation and evidently never ran the full repo-wide sealed suite before finishing, only its own territory's 136 tests — see `pack/reports/R1-gate-r5.log`, which never runs `skills/multi/scripts/hooks.test.mjs` at all). Not something I fix (fixes nothing, decides nothing) and not something to route around by excluding the file from the baseline myself (that is not the integrator's call). Reported as FAIL, triaged to R1, for the orchestrator/lead to send back.

## Failing tests + owning territory (triage table)
| Failing test | File | Owning territory | Note |
|---|---|---|---|
| `N2: no test file in this suite inherits the runner environment on its own` | `skills/multi/scripts/hooks.test.mjs:429` (scanner); root cause at `scripts/four-read.test.mjs:58` | **R1** | `commit()` fixture helper builds `env` from `process.env` directly instead of `childEnv()`; fix belongs to whoever owns `scripts/four-read.test.mjs` |
