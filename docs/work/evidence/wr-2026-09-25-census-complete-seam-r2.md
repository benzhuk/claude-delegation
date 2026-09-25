VERDICT: APPROVE 1274659ff572f42bc7c9efef108fef412963baee

Round: 2. This is a delta re-review of the census-complete seam at `build/census-complete-1` @ 1274659 (CE\wt-integrate, read-only; `git status --short` is empty). The prior round's findings are in `seam-findings.md` (S1, S2, S3). The fix report is `seamfix-report.md`. Times are America/New_York unless marked Z.

## Prior findings: verified

The mutation checks below were run on a `git archive HEAD` copy under `scratchpad\seam-scratch\r2\`, never in the reviewed tree.

- **S1 (MAJOR): FIXED.**
  - Where: `skills/team-build/SKILL.md:247`.
  - What changed: the line now names the actual command. It gives `build-census.mjs --lead ... --marker ... [--role-map ...] --out <census.md>`, then `accept --census`. It says the census runs "as its own command after the last review's `Log: ... reviewed` line", and to pass the `.md`, not `--json`.
  - Pinning test: `work-record.test.mjs:1617`.
  - Mutation check: restoring the a0de219 SKILL.md makes that test fail.
  - Test weakness: the test is weaker than its name. See N1.
- **S2 (MAJOR): FIXED.**
  - What changed: `build-census.mjs:647-648` adds `- subagentFiles: <n>` to Summary always. It adds `- INCOMPLETE: <n> subagent file(s) unreadable — ...` only when a file was unreadable.
  - Pinning test: `build-census.test.mjs:317`.
  - Mutation checks: removing only the INCOMPLETE line fails exactly that test. Restoring the whole a0de219 file fails both new tests.
  - Existing pin: the "healthy path prints no UNREADABLE/unreadable/Incomplete" test still passes.
  - C2 side: C2 copies both bullets unchanged. Verified in round 1 with the same patch, and again below on the real r2 census.
- **S3 (MINOR): FIXED.**
  - What changed: at `build-census.mjs:549-556`, a file that lies wholly before the `--marker` window keeps its per-file row. It no longer adds a role row or a role file count.
  - Pinning test: `build-census.test.mjs:465`. It checks the `roleFileCounts` and `totalByRole` values, the printed `Roles:` line, the by-role bullet and the by-role table.
  - Mutation check: forcing `whollyPreWindow = false` fails exactly that test.
  - On the real lead, the phantom `judge=0, read=0, research=0, unassigned=0` rows are gone. `Roles: build=4, integrate=1, review=4, seam=1, seam-fix=1` is the true in-window set.

## Regression hunt: none found

- **Without `--marker`, S3 changes nothing.** `excludedByWindow` is always 0 then, so `whollyPreWindow` is false.
- **Under `--marker`, S3 keeps two kinds of file in the role counts.** A zero-byte file and an unreadable file both have `excludedByWindow` 0, so they still count. That is correct: unknown is never excluded.
- **The two new bullets fit C2's copier.** They match C2's copier shape `^-\s+[^:]+:\s*\S`. Nothing in `work-record.mjs` needed to change.
- **Header and timestamp sources are unchanged.** The line-1 `VERDICT: COUNTED ` prefix and the `- Window:` line (census-stale's timestamp source) are byte-identical in form to a0de219.
- **Suites pass.**
  - Both files: `node --test scripts/build-census.test.mjs scripts/work-record.test.mjs` gives 166/166 (51 + 115; 163 before plus 3 new).
  - Full and sealed suites: the builder reports 1534/1534 for each, with the known `registered-pickup` flake green on rerun. I did not rerun those.

## Dogfood r2: census-dryrun-r2.md

- Command, run from wt-integrate: `node scripts/build-census.mjs --lead <lead>.jsonl --marker "census-complete" --role-map '{"agent-a9734ae7dc3142dfa":"seam","agent-afbfab87ca4accc34":"seam-fix"}' --out CE\reports\census-dryrun-r2.md`. It exited 0.
- No `--tasks` was given. The default glob found the workflow dir, which confirms the SKILL line's "read by default" claim.
- Result:
  - `leadTurns: 4` (111 whole-session).
  - `wallClockHours: 8.76`, from Sep 24 23:11 EDT to Sep 25 07:57 EDT.
  - `by-model: claude-opus-5-5=16110727, claude-sonnet-5=38815478`.
  - `by-role: build=32684842, integrate=2810718, review=7196919, seam=5508423, seam-fix=3319918`.
  - `subagentFiles: 119`.
  - No `INCOMPLETE` line, so no file was unreadable.
- **The seam-fix builder is a new unassigned agent.** `agent-afbfab87ca4accc34` is a Task-tool builder on Sonnet ("Census seam fixes S1-S3"). It has no journal entry, so it needs its own `--role-map` entry. Without one it lands in `unassigned`, which is the documented behaviour.
- **C2 accepts this census.** On a fresh scratch copy of `gate4-fixture-repo` with a `Log: ... reviewed` line, `accept --census census-dryrun-r2.md` returned `ok:true`, `Status: accepted`, 37 `Census:` lines. Those include `leadTurns`, `by-model`, `by-role` and `subagentFiles`.
- **This dry run is not the acceptance census.** Its last timestamp, `2026-09-25T11:57:11.679Z`, predates this review's Log line. census-stale will rightly refuse it once that line is on the record.

## The exact commands for this build's record at accept time

Run these after this review's `Log: <ISO-Z now> reviewed <owner> seam r2 APPROVE 1274659` line is on the record and saved. Run each as its own command, from `CE\wt-integrate`. The record's `Status:` must read `reviewed`.

```
node scripts/build-census.mjs --lead "C:/Users/benzh/.claude/projects/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/7ce97c6a-d864-448c-ac6a-4251cab72bb0.jsonl" --marker "census-complete" --role-map '{"agent-a9734ae7dc3142dfa":"seam","agent-afbfab87ca4accc34":"seam-fix"}' --out "C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/7ce97c6a-d864-448c-ac6a-4251cab72bb0/scratchpad/census/reports/census-final.md"
```
```
node scripts/work-record.mjs accept --record docs/work/<this build's work-id>.record.md --repo . --pinned-artifact <git rev-parse HEAD of the tree being accepted> --census "C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon/7ce97c6a-d864-448c-ac6a-4251cab72bb0/scratchpad/census/reports/census-final.md"
```

- **`agent-a9734ae7dc3142dfa` is this seam reviewer.** The id is the same across both rounds, which is what puts me under `seam`.
- **`agent-afbfab87ca4accc34` is the seam-fix builder.** Use `"build"` instead of `"seam-fix"` if you want it in the build row. The loop-gates hand record grouped the fix builder with the seam reviewer, but a separate row keeps Opus reviewer tokens and Sonnet builder tokens apart.
- **Any further Task-tool agent needs its own entry.** If another one runs before accept, add its `agent-<id>` to `--role-map`. Otherwise it shows as `unassigned`, visibly.
- **The marker is safe as-is.** `census-complete` first occurs at lead line 3771 (`03:11:23.344Z`, the build's opening message). Nothing earlier in the session matches.
- **Pass the `.md`, never a `--json` file.** `accept` refuses `--json` output with `census-missing`.
- **What `accept` writes.** It rewrites the record and stores `docs/work/evidence/<work-id>-census.md`, byte-identical to the census file, next to the record's first `Evidence:` entry. Both are then commit material, the orchestrator's to commit.

## Notes (not counted)

- **N1: the S1 test passes on prose alone.** The test at `work-record.test.mjs:1617` matches `--marker` anywhere in an 800-character slice.
  - The replacement line mentions `--marker` twice: once in the command, and once in the parenthetical "`--marker` scopes a lead pane...".
  - Mutation check: deleting ` --marker "<text first seen in this build's opening message>"` from the command, leaving the prose, keeps the test green. That is the build's named failure class, in a doc pin.
  - It is non-blocking because the prose itself is correct. An optional tighter pin, replacing the `--marker` assertion:
    - current: `assert.match(section, /--marker\b/, "omitting --marker is exactly S1: a persistent lead pane then counts the whole session, silently");`
    - replacement: `assert.match(section, /`node [^`]*build-census\.mjs[^`]*--lead [^`]*--marker "[^`]*--out [^`]*`/, "the documented command itself must carry --lead, --marker and --out, not just the surrounding prose");`
  - Predicted outcome: green on HEAD, red on the mutation above.
- **Carried from round 1, unchanged and still not counted.**
  - The by-role table covers subagents only, so it does not sum to by-model. The difference is the lead window.
  - `docs/census.md:181-182` still says "file basenames only", while the output prints full paths, as the spec requires.
  - census-stale binds to the latest ISO-Z timestamp anywhere in the census text.

## Hygiene

- No edits, stages or commits in wt-integrate.
- The scratch work is under `scratchpad\seam-scratch\`: `r2\` (the HEAD export with its mutations, restored), `accept-repo-r2\`, and `r2-old-*` / `r2-new-*` copies.
- I wrote `CE\reports\census-dryrun-r2.md` as the brief asks.
