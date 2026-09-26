VERDICT: APPROVE 071c6aaef0d175a10e7dbc817576441ef118f8e4

# Delta review: build/one-launch-2 at 071c6aa (from F1 APPROVE 4eb7bd1)

Scope: `4eb7bd1e91f716f902c86681a075eff67e473fc4..071c6aaef0d175a10e7dbc817576441ef118f8e4` in /home/ben/Code/wt-olfix.
Commits in range, first-parent: c904a4a (merge of F1 at 4eb7bd1), 657cde8 (docs: reports, evidence, work record),
071c6aa (merge of build/collect-from-origin-1 at 3048d19). I made no change to the reviewed tree. The only file I wrote is this report.
One scratch export of base 33aa023 was made with `git archive` under the session scratchpad. It is outside the repo.

No blocking findings. There are 0 NEEDS_FIXES items. There are two informational notes (N1, N2) and one note about a known flaky test outside this delta (N3).

## 1. F1's approved code arrived unchanged: VERIFIED

- `git diff 4eb7bd1 071c6aa -- skills` is empty (0 lines). `git diff --quiet 4eb7bd1 071c6aa -- skills hooks .codex-plugin README.md` also exits 0.
- `git merge-base --is-ancestor 4eb7bd1 071c6aa` is true.
- `git diff --name-status 4eb7bd1 071c6aa` lists 38 paths. 37 of them are under `docs/`. Only one path is outside docs:

| non-docs path | side | evidence |
|---|---|---|
| `scripts/collect-from-origin.test.mjs` | lane six (3048d19 side). It was introduced by 5e67b85 "fix(collect-from-origin): round-5 Windows path-separator fix" | blob `76388f2` at 33aa023, 4eb7bd1 and 657cde8. Blob `aabbf91` at 3048d19 and 071c6aa. `git diff --quiet 4eb7bd1 657cde8 -- . ':!docs'` exits 0, so our side has no change outside docs. |

- The docs paths come from two places. `docs/specs/one-launch-2/**`, `docs/work/evidence/wr-2026-09-26-one-launch-fix-*` and `docs/work/wr-2026-09-26-one-launch-fix.record.md` come from our side (c904a4a/657cde8). This includes the R7/R8 additions to `docs/specs/one-launch-2/contracts.md`. `docs/specs/collect-from-origin-1/**`, `docs/work/evidence/wr-2026-09-26-collect-from-origin*` and `docs/work/wr-2026-09-26-collect-from-origin.record.md` come from the lane-six side.

## 2. Merge 071c6aa is clean: VERIFIED

- Parents: 657cde8 and 3048d19. Merge base: 33aa023.
- The two diffs are byte-identical: `git diff 657cde8 071c6aa` and `git diff 33aa023 3048d19` (3090 lines each, `cmp` reports IDENTICAL). So the merge brings in exactly lane six's delta and nothing else.
- The two sides change no file in common: `comm -12` of `git diff --name-only 33aa023 657cde8` (30 paths) and `git diff --name-only 33aa023 3048d19` (17 paths) is empty. That leaves nothing to resolve.
- `git merge-tree --write-tree 657cde8 3048d19` exits 0 with tree `f7694bdb736d53ac43d7b4200d63afadb1918714`. That equals 071c6aa's recorded tree `f7694bd...`, so the merge commit's tree is the automatic union with no hand edits.

## 3. Tests: GATE MET (only H6 and V4 fail)

- `node --test scripts/collect-from-origin.test.mjs skills/team-build/references/build-loop-workflow.test.mjs skills/team-build/references/accept-prep.test.mjs`: tests 122, pass 122, fail 0. This includes the new lane-six test "changedRecordPaths / row.recordPath: always forward-slash, never path.sep, regardless of OS".
- `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`: "N2: no test file in this suite inherits the runner environment on its own" passes.
- `node scripts/run-tests.mjs` ran twice:
  - Run 2: tests 1747, pass 1742, fail 2. The failures are exactly `V4: a real install writes one shim per command...` (skills/multi/scripts/mirror-shim.test.mjs:269) and `H6: a plain checkout resolves to itself, and backslashes are normalised (L1)` (skills/multi/scripts/note-send.test.mjs:367).
  - Run 1: fail 3. The failures were V4, H6 and one intermittent failure, which is covered in N3.
- H6 and V4 also fail on base 33aa023. I ran those two files on a `git archive 33aa023` scratch export and got `fail 2` with the same two names. This matches `docs/specs/one-launch-2/reports/integrator-gate.log:1797-1818`.

## 4. Lane six against lane seven contracts R1-R8: no contradiction found

- R1-R4, R6 and R7 cover `skills/team-build/**`, which lane six leaves alone (point 1). Lane six's only code-bearing change is in `scripts/`, which lane seven does not own ("Nothing under scripts/" in contracts.md, territory paragraph). That change is test-only: it swaps `path.join` for `path.posix.join` in `writeRecord` and adds one test (scripts/collect-from-origin.test.mjs:45-48, :511-530). It does not touch `work-record.mjs` or `build-census.mjs`, the two scripts that accept-prep.mjs (R2) shells out to. So the R2 helper contract and the R3 stubs are unaffected.
- R5 (Base is one sha) is met. The lane-six record header has `Base: 5f057a3959323bd0fd01231e6fe6d47688991cec` (docs/work/wr-2026-09-26-collect-from-origin.record.md:13). That is one 40-hex sha, and both ac9c842 and 05b9bcc are ancestors of it.
- R8 (no `Base-of:` header line) is met. `grep -n -i 'base-of'` finds only a Log line (:64) and a body line (:110, "Base parents (Base-of, kept in the body ...): ac9c842..., 05b9bcc..."). The body line comes after the header's blank line (:109), so work-record.mjs never sees an unknown label.

## Notes (non-blocking, no fix needed for this acceptance)

N1 (info, lane-six record wording). contracts.md R5 calls 5f057a3 lane six's "merge commit". In fact 5f057a3 is a single-parent docs commit ("docs(work): lane six base is ac9c842+05b9bcc") whose parent b8f7cef is the merge. b8f7cef's literal parents are 918fc72 and 05b9bcc, not ac9c842 and 05b9bcc. This does not contradict R5: Base is still one sha, and its history contains both named parents. Only the wording is imprecise.
Fix, if wanted later: change "its merge commit 5f057a3" in contracts.md R5 to "its base commit 5f057a3 (on top of merge b8f7cef)". This is docs only and needs no code change.

N2 (info). The lane-six Log line at docs/work/wr-2026-09-26-collect-from-origin.record.md:64 says "Base-of keeps the two parents". What exists is the body line at :110, not a `Base-of:` header, which R8 forbids. This is consistent with R8. No action.

N3 (pre-existing flaky test, outside this delta). Run 1 of the full suite also failed `one injected selection invokes exactly one bound entry and maps lifecycle states to safe summaries` at skills/decisions/scripts/registered-pickup.contract.test.mjs:98 (assert at :116). It then passed in run 2 and in 5 of 5 isolated runs. `git diff --stat 33aa023 071c6aa -- skills/decisions` is empty, so this delta did not cause it.
- Cause: the test's reference ordering uses `path.resolve(a.repo).localeCompare(...)` (test :109). The implementation sorts by UTF-16 code unit (`a < b`, skills/decisions/scripts/decisions-pickup.mjs:649-652). The two repo dirs are `mkdtempSync` names, `registered-project-XXXXXX` vs `registered-project-two-XXXXXX`, and the two orderings disagree when the random first suffix character sorts differently under locale collation than by code unit. A measured check over the 62 characters in `[a-zA-Z0-9]` against `...-two-` found 6 disagreements, about a 10% flake rate.
- Discriminating check: `node -e 'console.log("/t/registered-project-Uabcde" < "/t/registered-project-two-x", "/t/registered-project-Uabcde".localeCompare("/t/registered-project-two-x"))'` prints `true 1`, so the two orderings disagree.
- Fix location: skills/decisions/scripts/registered-pickup.contract.test.mjs:109. This belongs to another lane and is not required for this acceptance.
- Ready-to-apply patch:
  - current: `const canonical = [fx.entry, second].sort((a, b) => path.resolve(a.repo).localeCompare(path.resolve(b.repo)) || a.page.localeCompare(b.page));`
  - replacement: `const key = (e) => \`${fs.realpathSync(path.resolve(e.repo))}\0${e.page}\`; const canonical = [fx.entry, second].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));`
  - Predicted outcome: the reference ordering matches the implementation's code-unit ordering for every random suffix, so the test is deterministic.
- Simplification: the test's reference ordering should use the implementation's documented code-unit order instead of a separate locale-based ordering.

## Conclusion

F1's approved code (4eb7bd1) reaches 071c6aa byte-for-byte under `skills/`. The only non-docs change is lane six's test-only Windows fix, and it arrives through a clean, conflict-free merge whose tree equals the automatic union. The integration suite's only failures are H6 and V4, which also fail on base. Nothing on the lane-six side contradicts R1-R8. APPROVE at 071c6aaef0d175a10e7dbc817576441ef118f8e4.
