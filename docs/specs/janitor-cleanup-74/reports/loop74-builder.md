VERDICT: PASS

# loop74 builder report (lane 74: items 1, 4, 5-move, 8)

Worktree wt-janitor-cleanup-74-loop74, branch build/janitor-cleanup-74-loop74, base 6b302f93. Commits: 1b7306cd, 19aab80e, f96b6bef, 8b19c27e, d4edba5c, 019092be, 5d983778, aeb30f2e, 64227d75 (the final sha is in the reply). Finished about 00:12 of a 60-minute box that started about 23:43.

GOAL line served: "work lost or stalled" (and "rework after acceptance"). Nearest NOT: "a rule no script checks" and "a symptom fix". Item 1 is enforced by a tested helper the loop runs; the BUILD_MANDATE sentence is the backup, the helper is the guarantee. Items 4 and 5 remove a manual step and a pollution source rather than patching its symptom.

## Gate (exact command, 17 files: the 15 given plus phase-commit.test.mjs and closeout-territories.test.mjs)
Log: reports/loop74-gate.log. Tail:

    ✔ source: the helper never pushes, resets, cleans, stashes or skips hooks (0.6192ms)
    ℹ tests 1137
    ℹ pass 1132
    ℹ fail 0
    ℹ skipped 5

No ledger reader's reading changed (the ledger stays where it is), so collect-status, four-read and build-census suites were not appended.

## Item 1: a dying builder still leaves committed work
- Helper: skills/team-build/references/phase-commit.mjs:45 `phaseCommit`. Refuses (stages nothing) on a clean tree, detached HEAD, protected branch, merge or rebase in progress, unmerged paths, or no configured git identity. Otherwise `git add -A` and one conventional commit. Never pushes, resets, cleans, stashes, skips hooks, or sets an identity.
- Loop: skills/team-build/references/build-loop-workflow.js:180 `PHASE_COMMIT`, :453 `COMMIT_MANDATE`, :460 `commitPhase`. A runner agent (label `commit:`) runs the helper after every Build, Fix and seam-fix builder call, including a call that returned nothing, before the result is judged. BUILD_MANDATE and agents/builder.md (outside the safety block) tell the builder to commit before its report. Return fields and blocker names are unchanged (a dead builder is still `agent-died`).
- Tests: phase-commit.test.mjs (8: dying builder, clean tree, ignored files, no identity, refusals, missing dir, CLI exit codes, source scan). build-loop-workflow.test.mjs lane-74 tests at :2575-:2686 (mandate line, runner after every Build/Fix, order build-commit-review, dead builder committed after each death, dead then PASS, a failing commit runner changes no result, seam-fix on the integration worktree, no commit after Review/Integrate/Accept).
- Dying-builder fixture (phase-commit.test.mjs:34-70). Before: the builder modified README.md, added feature.mjs and sub/deep.txt, and died. `git status --porcelain` shows `M README.md`, `?? feature.mjs`, `?? sub/deep.txt`, HEAD at the base sha. After `phaseCommit`: `committed:true, dirty:3`, HEAD moved to a new sha on branch build/x-t1, exactly those three files in the commit, status empty, one commit since base.

## Item 4: a landed lane runs closeout, leaving nothing behind
- scripts/work-record.mjs:2376 `closeoutTerritories`, called as step 4b at :2614 of `closeoutRecord`, after the lane's own merge proof and before scratch removal. It finds worktrees and branches named `<lane branch>-<id>` and removes each clean, merged one through `closeoutWorktree` (janitor.mjs, called unchanged). It prints one `removed` / `refused <reason>` / `absent` line each. A dirty, unmerged, or other-record-claimed territory is refused and kept. A lane with no territory branches prints no territory line. A failed lane merge proof never reaches the territories.
- skills/team-build/SKILL.md: the Ship merge paragraph and the Accept turn make `work-record.mjs close --closeout --by <Lead-session>` the step after a pushed merge (SKILL text plus a tested helper, not a new loop phase).
- Tests: scripts/closeout-territories.test.mjs (7): removes clean merged territory; dry-run; unmerged refused and kept; branch claimed by another record kept; no territories; failed merge proof; SKILL text pin. work-record-closeout.test.mjs and record-closed-and-skip.contract.test.mjs still pass.

## Item 5: packets, pointers and the ledger stop dirtying a durable checkout
- Packets: skills/multi/scripts/transport.mjs `packetDetailsFor` (:869), `resolveDetailsPath`, new `packetPathFor(repo,id,home)`. Packets are written to `~/.agents/notes/packets/<repo-name>/<id>.md`. Details is `.agents/notes/packets/<repo-name>/<id>.md`, which passes validateDetails (charset-valid, relative) and resolves against the reader's HOME. Old `docs/notes/...` Details still resolve against the repo. note-send.mjs, note-inbox.mjs (`packetLocation`) and decisions-pickup.mjs (`resolveDetails` with a base) use it.
- Pickup pointers: now under AGENTS_HOME/notes/packets/<repo-name>/; a pre-move receipt (detailsPath docs/notes/...) still verifies.
- Ledger: transport.mjs:836 `ensureLedgerIgnored` writes `/docs/ledger/` once into the main checkout's `.git/info/exclude` (never for a linked worktree, never duplicated). note-send calls it for the target and sender repos before the ledger append.
- Tests: note-send.test.mjs:2168-2200 (Details convention, no file in the recipient checkout, real checkout `git status --porcelain --untracked-files=all` empty, exclude line exactly once, second call `already`). note-inbox.test.mjs:483-504 (home-relative packet found, MISSING when absent, found without a repo). decisions-pickup.test.mjs (pointer under AGENTS_HOME, nothing in docs/notes, legacy receipt verifies, and a real-checkout porcelain-empty pickup test). Docs updated: multi SKILL, envelope.md, decisions SKILL.

## Scout section-4 questions
1. Who commits: a runner agent runs the tested phase-commit helper after each builder call (dead ones too), plus a BUILD_MANDATE line. The script has no shell, and the mandate alone would be a rule no script checks.
2. Merge step: the SKILL.md Ship text plus the tested closeout extension, not a new loop phase. Territory cleanup lives in `closeoutRecord` because closeout only knows the record's lane branch and derives the territory names from it.
3. Details convention: `.agents/notes/packets/<repo-name>/<id>.md`, home-relative. It is charset-valid, needs no change to validateDetails, and every reader already has a HOME.
4. Packets already untracked in main: left alone. The janitor's 7-day untracked report (janitor74) covers them (brief ruling 5).
5. Ledger ruling: neither tracked-and-committed nor moved out. It stays at `<repo>/docs/ledger/` and is hidden by the main checkout's local `.git/info/exclude`. Reason: tracked-and-committed makes every send dirty a durable checkout until someone commits (the original defect), and a send committing onto main is unsafe. Moving it out breaks the cross-host mirror and every ledger reader (collect-status, four-read, census, hooks, the SKILL's grep-the-repo-ledger instructions) and did not fit the time box. The exclude keeps `git status --porcelain` empty and changes no reader. Cost: git does not version the ledger on that machine; the `~/.agents/notes/YYYY-MM-DD.md` mirror is the durable copy. This deviates from the two options the brief named, so it is flagged for the lead.
6. `docs/work/evidence/janitor/*.json`: already handled by lane 65 and lives in janitor74's files, so untouched here.

## Deviations, assumptions, not done
- The ledger ruling above is the one deviation.
- Live proof is fixture runs only (sealed home, scratch repos). No real home, repo or ledger was touched. The Netcup and Hetzner suites are the lead's.
- examples.md still shows `docs/notes/...` Details; still valid input, left as the legacy form.
- No process started, nothing pushed, no identity set.
