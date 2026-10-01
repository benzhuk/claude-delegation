Task: In worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-pickup-rebind-64b-rebind64b` (branch `build/pickup-rebind-64b-rebind64b`, base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516) add a `rebind` verb to `decisions-pickup.mjs` that moves a pickup receipt's project binding after a repo move, exactly as spec.md "Scope, pinned" items 1-6 and its Investigation section 3 (steps a to e) design it, smallest form. Done means the gate below is green, the four named tests exist and fail at the base sha (a missing `rebind` export counts as failing) and pass on your branch, and SKILL.md names the verb. The live run on the real page is the lead's, not yours.
Goal: a repo move must not strand a pickup page (the 9/30 page 3e1da11277a18174bccfea187d5c3972 is bound to the pre-move path and refuses "this page is bound to a different authorization project"); measure: work lost or stalled.
Work: wr-2026-10-01-pickup-rebind (docs/work/wr-2026-10-01-pickup-rebind.record.md in the integration worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b`; read-only for you, the lead writes it).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/spec.md (the pinned scope; there is no separate contracts.md, spec.md is the contract)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/briefs/scout-rebind64b.md (line drift against the spec's citations, the binding the investigation missed, the policing tests, the open questions; read it before you start)

PROJECT FACTS (repo-specific; your own instruction files are not loaded for you):
- Pure Node (v24), no build step, no install. Windows host: there is NO full suite here; run `node --test` only on the files named in the gate. The lead runs the full suite on Netcup and Hetzner.
- Territory files, and only these: skills/decisions/scripts/decisions-pickup.mjs, skills/decisions/scripts/decisions-pickup.test.mjs, skills/decisions/SKILL.md, skills/decisions/scripts/skill-text.test.mjs (one new pin only). Work in the worktree path above; every path in this brief outside it is read-only.
- Tests run sealed: `makeTempHome` from scripts/test-home.mjs; every child process goes through `childEnv()` from skills/multi/scripts/test-child-env.mjs, never a bare spread of the parent environment. Use the existing `fixture()`, `deps()` and `buildWedge()` helpers in decisions-pickup.test.mjs for the moved-repo fixture: build the stuck round in a sealed repo, then move the repo directory (rename) so its old path no longer exists, keeping its `.agents/project.json` and its untracked `docs/notes/*.pointer.json` files, which is the 9/30 state. Synthesise it; never copy the real receipt, captures or pointers.
- Never read, copy, write or run against the real `~/.agents` state (`ws/decisions-pickup`, receipts, captures, `registrations.json`) or the real page. Never call `notion.js`. The registered pickup file `registrations.json` is host config and not yours.
- Header-line shape for report fields: `/^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi`. SKILL.md is wrapped near 92 columns and `skill-text.test.mjs` pins multi-line `\n` patterns: insert your sentence, never re-wrap an existing line, and no SKILL.md line may start with `**`.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.
- Never set or switch a git identity, no `--no-verify`, no force, no recursive deletes, no reset/clean/stash. Commit on your branch only, conventional messages, no trailers. Never push. Never send peer notes.
- Other lanes (65, 66, 67) run against the same hosts; stay inside your file list.

Shape the spec pins (implement these, nothing wider):
- CLI: `node skills/decisions/scripts/decisions-pickup.mjs rebind --page <id> --repo <new project root> --from-project <old path> [--owner <lead>]`, plus an exported `rebind(options, deps)` taking `deps.agentsHome`, `deps.fsImpl`, `deps.git`, `deps.now` like its siblings. Add `rebind` to `parseArgs` and `runCli` and to the usage message; `--from-project` is required for it.
- Under `acquireClaim(paths.claim)`, modeled on `settleRound`: `newProject = registeredProject(--repo)`; read the receipt (a missing receipt, a legacy v1 receipt, or an `account`-style unreadable one refuses). Refuse unless the receipt's `project` equals `--from-project` canonicalised through `canonicalThroughExistingAncestor` (compare with `canonicalPathKey` so Windows case does not matter) AND that old path does not exist (`fs.existsSync`/`lstat`; a live project is never taken over). Both are PickupError refusals that leave every file byte-identical.
- Verify every saved capture against the OLD identity BEFORE writing anything (`verifyOnePrivateCapture` for `privateCaptureRef` and `reconciliationPrivateCaptureRef`; skip the pointer check at this stage, it lives at the old path). A TAMPERED, MISSING or unreadable capture refuses with no write.
- Rewrite `project` and `transportRepo` (= `durableTransportRepo(newProject)`) in the receipt and in each saved capture with `atomicJson`, KEEPING `projectScope`, `privateCaptureRef`, `reconciliationPrivateCaptureRef`, `detailsPath`, `noteId`, `owner` and every other field. `verifyReceiptEvidence` must return OK afterwards (the pointer then resolves under the new transport to the existing untracked file).
- Never rewrite `receipt.owner`. If `--owner` is given and differs from `receipt.owner`, set `handoffStatus: 'PENDING_MANUAL_HANDOFF'`, `requestedOwner`, `handoffObservedAt` exactly as the existing marker write does (decisions-pickup.mjs:1148-1158 at base); `closeRound`/`account` already settles it (1491-1494). No other change to settle logic.
- Every existing "different authorization project" refusal stays unchanged and still fires for a live second project (decisions-pickup.test.mjs:833-896 must stay green untouched).

Narrow readings to take where the spec is silent (scout-rebind64b.md section 4); each goes under "Rulings needed" in your report with the alternative you did not take:
1. States: rebind any v2 receipt state (it changes no state and so cannot cause a send); refuse a v1 legacy receipt. If you find a state where rebinding is unsafe, park and ask.
2. `exactSendInputs.argv`: rewrite the values after `--recipient-repo` and `--sender-repo` to the new transportRepo (the old path would otherwise be sent from a PREPARED receipt); leave `id`, `topic`, `text`, `details`, `kind`, `needs` untouched. Prove with a test.
3. Captures: rewrite the two the receipt names, and also every other capture file under `captures/<receipt.projectScope>/` that parses as this page's capture with the old `project`/`transportRepo` (earlier rounds, an orphan next round). Those extra files are verified by page, projectScope, project, transportRepo and `sha256(originalBytes) === digest` (their round differs from the receipt's); one that fails refuses with no write.
4. Order and crash: validate everything first (no writes), then write captures (each atomic), then the receipt LAST. A re-run after a crash midway must finish the job: a capture already at the new identity is accepted and skipped; one still at the old identity is verified and rewritten; anything else refuses. After the receipt carries the new project, a second `rebind` is a clean refusal (receipt project is no longer `--from-project`), not a rewrite.
5. Pointer: before any write, refuse if the pointer for the receipt's `detailsPath` is not present and exact under the NEW transportRepo (check with `verifyPointer` on the receipt rewritten in memory), so a rebind never leaves a receipt that status calls POINTER_INVALID.
6. Output: on success print the JSON of `receiptStatus` for the updated receipt plus `rebound: { from, to }` and exit 0.

Tests (decisions-pickup.test.mjs, from the 9/30 moved-repo fixture; name them with the prefix `rebind 64b:`):
- moved repo: `status` before rebind gives PENDING_MANUAL_HANDOFF "bound to a different authorization project"; after `rebind` `status` is the receipt's real state with `evidenceIntegrity.status` OK; `project`/`transportRepo` are the new root; `projectScope`, `privateCaptureRef`, `detailsPath`, `noteId`, `owner` unchanged; `exactSendInputs.argv` carries the new repo twice; `openPrivateCapture` returns the saved bytes. A second variant with `--owner` different: `owner` unchanged, handoff marker set, and `closeRound`/`account` with that lead accounts the round and clears the marker.
- existing old path refused: recreate a directory at `--from-project` (or copy rather than move); refused, every file byte-identical, and a live second project still gets the old refusal.
- tampered capture refused: change `originalBytes` of the saved capture; refused, receipt and captures byte-identical. Also one for a tampered earlier-round capture (narrow reading 3) and one for a missing pointer (narrow reading 5).
- second rebind: clean refusal, files unchanged.
- crash resume: make the receipt write fail once (inject a failing `fsImpl.renameSync` for the receipt file only) after captures are rewritten, then re-run; it completes and status is OK.
- CLI wiring: one test through `runCli` or a child process with `childEnv()` and `AGENTS_HOME` set to the sealed home.
- `skill-text.test.mjs`: one pin that SKILL.md contains the `decisions-pickup.mjs rebind` command string.

SKILL.md: add one sentence (it may wrap across lines) in the pickup section, near the "global to the registered page" paragraph, naming `decisions-pickup.mjs rebind --page <id> --repo <new project root> --from-project <old path> [--owner <lead>]` as the verb for a repo move, and that rounds opened after it use the new project's scope while the old round keeps its saved one. No other SKILL.md edit.

NOT (out of scope, stated explicitly):
- registrations.json (host config; the lead repointed it by hand on 10/1), any waiver flag, any publish change, decisions-render.mjs, decisions-render-publish.mjs, note-flush.mjs, and every file outside the territory list.
- Any live action: no `rebind` or `publish` or `account` or `--once` against the real page or the real `~/.agents` state, no `notion.js`. Live run after merge is the lead's.
- `docs/work/` (the lead is the only writer), `docs/decisions/history/`, and the spec pack's other files.
- No integration-wide test run; your gate is scoped.

Evidence format: cite `file:line` for every claim; for each of the four named tests (moved repo to status OK, existing old path refused, tampered capture refused, second rebind) give the test name, its path, and the `scripts/prefix-test.mjs --base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516 --test <path> --repo <dir>` exit code and one-line result at the base sha; quote the exact receipt `project`, `transportRepo`, `state` and error strings before and after for the fixture.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/rebind64b-report.md. Line 1 is the verdict, first word.

Gate: node --test skills/decisions/scripts/decisions-pickup.test.mjs skills/decisions/scripts/registered-pickup.contract.test.mjs skills/decisions/scripts/skill-text.test.mjs skills/decisions/scripts/decisions-render-publish.test.mjs > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/rebind64b-gate.log 2>&1. Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/rebind64b-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: decide implementation details inside your file list without checking in (helper boundaries, fixture layout, test names, SKILL.md wording). Check in (park with a report) before editing any file outside the list, before changing the assertion of any existing test, on any state where rebinding looks unsafe, and on any open question the narrow readings above cannot settle.

Un-agent-able steps: the live rebind and publish on page 3e1da11277a18174bccfea187d5c3972, the registrations.json repoint, the Netcup and Hetzner full-suite runs, the push, and accept are the lead's, scoped out of your "done".

ETA: 75-100 minutes (one verb of about 100 lines, nine tests, one SKILL.md sentence). Report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
