VERDICT: NEEDS_FIXES (6) 64227d754cf0a7f14eee90961ca91e9cd2f9b2b8

# loop74 review, round 1

Territory worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-loop74, branch build/janitor-cleanup-74-loop74, HEAD 64227d754cf0a7f14eee90961ca91e9cd2f9b2b8 (from `git rev-parse HEAD`), base 6b302f93. Worktree clean. I read the diff itself (`git diff 6b302f93...HEAD`, 18 files, +1069/-59), not the report's summary of it.

Findings: 1 BLOCKER, 1 MAJOR, 4 MINOR. Approval depends on the BLOCKER and the MAJOR. The MINORs are for the lead to rule on.

GOAL line served: "work lost or stalled". Nearest NOT: "a symptom fix". F1 is the failure class the brief names: a commit helper whose loop wiring breaks on the very tree it exists for, while its tests pass because the stub never returns the sha a real reviewer would report.

## Gate re-run (mine, not the builder's log)
I ran the 15-file Gate, plus phase-commit.test.mjs and closeout-territories.test.mjs, plus collect-status, four-read and build-census. The log is in my scratch folder.
- 1394 tests, 1387 pass, 2 fail, 5 skipped. Both failures are in the unchanged `scripts/work-record-closeout.test.mjs` (l.373 and l.922), and both are `EEXIST` / "already exists" on fixed-name temp dirs (`%TEMP%/closeout-test-by-9`, `closeout-test-by-reporoot-33`, built from a per-process counter at l.105). These dirs were gone a moment later. I re-ran `work-record-closeout.test.mjs` and `closeout-territories.test.mjs` alone: 82/82 pass. So this is a collision with a concurrent run of the same file (most likely the janitor74 lane), not this territory. It is outside this territory's scope and is not counted.
- build-loop-workflow.test.mjs: 129 base tests, now 137. The only base lines changed are two harness lines: the stub routes `commit:` labels into `commitCalls`, and the `workLabels` filter excludes `commit:`. The expected lists are unchanged. Every base assertion is green.

## F1: BLOCKER. A phase commit moves HEAD, so the territory or seam is BLOCKED `review-sha-mismatch` whenever the helper actually commits
- Evidence: `skills/team-build/references/build-loop-workflow.js:908,912,957,961` (territory) and `:1125,1129` (seam-fix) discard `commitPhase`'s result. The reviewer then runs `git rev-parse HEAD` and gets the phase-commit sha. The loop compares that with the builder's stale sha: `:940` and `:989` `sameSha(review.sha, build.sha)`, and `:1162` `sameSha(reReview.sha, seamFixBuild.sha)`.
- Measured: I ran a scratch copy of the test harness against the unmodified script. The builder returns `aaaaaaa1`, the commit runner returns `committed:true, sha cccc…`, and the reviewer reports the real HEAD `cccc…`. Result: `{"id":"T1","verdict":"BLOCKED","blocker":"review-sha-mismatch"}`. The seam path, same setup: `{"verdict":"BLOCKED","blocker":"review-sha-mismatch"}`, blockers `[{"id":"seam","reason":"review-sha-mismatch"}]`.
- The seam case fires on every seam-fix round in practice. The integration worktree always carries untracked lead files: `git -C lane-74 status --porcelain` shows `?? docs/specs/janitor-cleanup-74/briefs/`, `?? …/reports/` and `?? docs/work/wr-2026-10-02-janitor-cleanup.loop-state.json`. So the seam-fix phase commit always commits.
- Why the tests miss it: the builder's test at `build-loop-workflow.test.mjs:2594` scripts `"commit:T1:r1": { committed: true, sha: "a".repeat(40) }` but has the reviewer answer `aaaaaaa1`, the pre-commit sha. A real reviewer would never report that.
- Cause: the loop's own commit changes the territory HEAD, but the loop keeps checking reviews against the sha the builder reported before that commit.
- Discriminating check: script a commit runner that returns `committed:true` with sha X, and a reviewer (or seam re-reviewer) that returns X. Today: BLOCKED `review-sha-mismatch`. After the fix: APPROVE with sha X.
- Fix location: build-loop-workflow.js, the six `await commitPhase(...)` call sites.
- Simplification: the fix carries the sha the commit runner returns into `build` / `seamFixBuild`. It adds no new phase and no new return field.
- Patch (I applied it on a scratch copy and re-ran: both probes pass, territory `APPROVE sha cccc…` and seam `APPROVE sha dddd…`; nothing else fails except the test noted below):
  1. Insert immediately before `async function commitPhase(worktree, label, phaseName, message) {`:
     ```js
     function adoptCommit(b, c) {
       return b && c && c.committed === true && /^[0-9a-f]{7,40}$/i.test(String(c.sha ?? '').trim()) ? { ...b, sha: String(c.sha).trim() } : b
     }
     ```
  2. Each territory call site, exact old → new (four lines: 908, 912, 957, 961):
     `await commitPhase(t.worktree, ` → `build = adoptCommit(build, await commitPhase(t.worktree, ` and close it with one extra `)` at the end of the line.
  3. Each seam call site (1125, 1129):
     `await commitPhase(integrationWorktree, ` → `seamFixBuild = adoptCommit(seamFixBuild, await commitPhase(integrationWorktree, ` and close it with one extra `)`.
  4. Test fix: at `build-loop-workflow.test.mjs:2588`, change `"review:T1:r1": reviewResult("NEEDS_FIXES", "aaaaaaa1", "f1.md")` to `reviewResult("NEEDS_FIXES", "a".repeat(40), "f1.md")`, the sha a real reviewer would see. With the patch, the stale value makes that test fail (`commit:T1:r2` never runs), which confirms the patch takes effect. Add one test per path (territory and seam): commit runner `committed:true` sha X, reviewer sha X, expect APPROVE and state sha X.
  - Predicted outcome: a builder that leaves edits gets them committed and reviewed at the new HEAD. A dead or refusing commit runner leaves `build` untouched, as today. `build.sha` still means "the HEAD the reviewer must match", so no return field changes meaning.

## F2: MAJOR. The helper commits whatever checkout encloses the path, including a main checkout, and does not refuse a path that is not a worktree root
- Evidence: `skills/team-build/references/phase-commit.mjs:50` checks only `rev-parse --is-inside-work-tree`. It never checks that the path is the worktree root, or that it is a linked worktree rather than a main checkout. The only main-checkout protection is the branch name (`main`/`master`, l.24 and l.63).
- Measured (scratch fixture `fx1`): a main checkout (`git init -b main`) switched to `build/lane-x`, with untracked `rootjunk.txt` and `sub/s.txt`. `phase-commit.mjs --worktree fx1/sub --json` returned `{"committed":true,…,"dirty":2}`, exit 0. Commit 987c7ea contains `rootjunk.txt` and `sub/s.txt`, and `git worktree list` shows fx1 is the main worktree. A mistyped or relative territory path that lands inside a durable checkout on a feature branch commits that checkout's untracked files: the claude-delegation main checkout holds dozens of untracked `docs/notes/*` files today.
- Fix (mechanical): insert after the `inside` check (l.51):
  ```js
  const norm = (p) => { let r = path.resolve(p); try { r = fs.realpathSync.native(r); } catch { /* compare resolved */ } return process.platform === "win32" ? r.toLowerCase() : r; };
  const top = git(worktree, ["rev-parse", "--show-toplevel"], env);
  if (top.status !== 0 || norm(top.stdout.trim()) !== norm(worktree)) return result({ reason: "not-worktree-root", detail: top.stdout.trim() });
  const gd = git(worktree, ["rev-parse", "--git-dir"], env);
  const cd = git(worktree, ["rev-parse", "--git-common-dir"], env);
  if (gd.status === 0 && cd.status === 0 && norm(path.resolve(worktree, gd.stdout.trim())) === norm(path.resolve(worktree, cd.stdout.trim()))) return result({ reason: "main-checkout" });
  ```
  Then add `not-worktree-root` and `main-checkout` to the "is an answer, not an error" list in `phaseCommitPrompt` (build-loop-workflow.js:457). In `phase-commit.test.mjs`, `makeRepo` (l.24) must create the territory with `git worktree add` from a base repo, because every current fixture is a main checkout and would now refuse. Add two tests: a subdirectory refuses `not-worktree-root`, and a main checkout on `build/x` refuses `main-checkout`, each with HEAD unmoved and the files left in place.
  - Predicted outcome: the fx1 run returns `not-worktree-root`. The repo root of fx1 returns `main-checkout`. A linked territory worktree (the loop's only real target) commits as before.

## F3: MINOR. The territory match is by name prefix, so a record-less lane named `<lane branch>-<alnum>` is swept
- Evidence: `scripts/work-record.mjs:2375` (`TERRITORY_ID_RE`) and `:2387`. Measured with a scratch copy of closeout-territories' fixtures: lane `build/lane-p` landed, and a different lane `build/lane-p-v2` was freshly cut from main with a worktree and no record yet. Closeout printed `territory-worktree: removed …/terr-v2-…` and `territory-branch: removed build/lane-p-v2`.
- Impact: no committed or uncommitted content is lost. The tree was clean and the tip was on main, and an open record or any ignored file still protects a worktree. But it removes another lane's live worktree, which is the "owner check a prefix defeats" class. Real lane names end in digits (`build/janitor-cleanup` vs `build/janitor-cleanup-74`).
- Fix (judgment): take the territory branches from the lane's own `docs/work/<work>.loop-state.json` `setup.territories[].branch` when that file exists. It sits next to the record and names exactly `build/janitor-cleanup-74-janitor74` and `-loop74` for this lane. When the file is absent, keep the pattern, but additionally require `git merge-base --is-ancestor <tip> <Artifact sha>`: the territory was merged into this lane, not merely into main. Predicted: `build/lane-p-v2` (tip = a main commit after the lane merged) is refused `not part of this lane`, and real territories are still removed. The current fixtures merge territories straight into main, so they would need to merge into the lane branch first.

## F4: MINOR (the lead's ruling). The ledger ruling is a third option the spec does not offer
- Spec item 5 pins "`docs/ledger/` is either tracked (committed by the flusher daily) or moved out". The builder chose a local `.git/info/exclude` (`transport.mjs:835-851`, called from `note-send.mjs:824`) and flagged it openly.
- Verified: note-send is the only `docs/ledger` writer (grep). `targetRepo` and `senderRepo` are always `mainCheckout(...)` (`note-send.mjs:471`, `642-692`). `info/exclude` lives in the common dir, so it covers linked worktrees too. Every ledger reader is unchanged, and collect-status, four-read and build-census pass. The measurable criterion (`git status --porcelain` empty after a send and a pickup) holds.
- Cost: the ledger files still sit in the checkout as ignored files. Git never versions them, and `git clean -X` deletes them; the `~/.agents/notes` mirror is the durable copy. This is a contract deviation. It needs the lead's explicit ruling (accept the third option, or require one of the two the spec names), not a reviewer's silence.

## F5: MINOR. Pickup pointers follow AGENTS_HOME, but Details is resolved against HOME
- `decisions-pickup.mjs:96-97` writes under `$AGENTS_HOME/notes/packets/...` when AGENTS_HOME is set. `note-inbox.mjs:127/352-357` and `transport.mjs:875-880` resolve `.agents/notes/packets/...` against `os.homedir()`. On a host with `AGENTS_HOME` set to anything other than `~/.agents`, every new pickup pointer reads as `packet MISSING`.
- Fix: in `resolveDetailsPath`, resolve the `PACKET_DETAILS_PREFIX` form as `path.posix.join(agentsHomeOf(home, env), d.slice('.agents/'.length))`, with `agentsHomeOf = env.AGENTS_HOME || home + '/.agents'`, and pass `env` from note-inbox and note-send. Or document that AGENTS_HOME must equal `~/.agents`. Predicted: with `AGENTS_HOME=/x`, a pickup followed by note-inbox reports the packet found.

## F6: MINOR. A `..` in a home-anchored Details resolves outside the packets folder
- `transport.mjs:878`: `path.posix.join(home, '.agents/notes/packets/../../../.ssh/x')` yields `<home>/.ssh/x`. The ledger regex (`envelope.mjs:30`) admits `..`, and `parseEnvelope` does not re-validate. The hook then prints `(packet: <home>/.ssh/x)` to the model. The same class already exists on the legacy repo-relative path (`note-inbox.mjs:362`), but the new form anchors it at HOME, which holds the secrets.
- Patch: in `resolveDetailsPath`, change `if (!d) return null;` to `if (!d || d.split('/').includes('..')) return null;`. Predicted: such an entry shows `packet: <details>, not checked here` and no HOME path is printed. All current tests are unaffected, since none uses `..`.

## Attack-brief answers (verified absences included)
- Item 1, dead builder with edits: committed. `phase-commit.test.mjs:34-70` is real (before: `M README.md`, `?? feature.mjs`, `?? sub/deep.txt`, HEAD at base; after: one commit with exactly those three files, status empty). Loop tests cover the commit after each death and after the respawn. Clean tree: no commit (tested). Only ignored files: nothing staged (porcelain excludes ignored; tested). Order: commit after every Build, Fix and seam-fix call, before the result is judged; no commit after Review, Integrate or Accept. The 129 base assertions are unchanged and green. Not a worktree / main checkout: see F2. It never pushes, resets, cleans or stashes, and never sets an identity (source scan test plus my read). No identity: reports `no-identity`, files untouched.
- Item 4: closeout reaches territories only after the lane's merge proof (step 4b, `work-record.mjs:2614`). Clean and merged territories are removed through `closeoutWorktree` unchanged, which counts ignored files as dirty. Dirty or unmerged ones are refused and kept (tested). Re-run is idempotent (measured: second run exit 0, every line `absent`, no territory lines). `--by` still gates everything (measured: wrong `--by` refuses all steps, exit 2). work-record-closeout tests are unchanged (82/82 alone). The SKILL Ship text names the closeout after a pushed merge. Prefix weakness: see F3.
- Item 5: the send and pickup porcelain-empty tests exist and pass. note-inbox and the multi hooks (through note-inbox's `packetExists`) resolve both forms. collect-status does not read Details. decisions-pickup verifies both new and legacy pointers. `envelope.mjs` is unchanged, so validateDetails still refuses absolute, drive-letter, `:` and `..` (envelope.test green). The ledger ruling is stated with a reason (see F4). The cross-host mirror code is untouched.
- Item 8: the dying-builder fixture really has uncommitted edits before and a commit after (assertions at l.46-69).
- No janitor file, no safety block and no existing return field or blocker name is touched (diff stat; agents.test green; `commitPhase`'s answer is only logged).
- Note for the lead, not counted: once F1 is fixed, the seam-fix phase commit runs `git add -A` on the integration worktree and so sweeps the lead's briefs, reports and loop-state.json into a `chore(seam)` commit before accept-prep. Lanes commit these files as evidence anyway, and it does not fall between accept-prep and accept, so it does not trip the Artifact pin. A record the lead has edited but not committed would also be swept.

Fix-round scope: F1 and F2 (with their tests) are what approval depends on. F3, F5 and F6 are small. F4 is the lead's ruling.
