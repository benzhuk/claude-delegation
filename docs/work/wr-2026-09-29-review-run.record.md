Work: wr-2026-09-29-review-run
Scope: the spec section of this record (lane 53), from packet docs/notes/skills-fable-lane-53-1.md read at 7ab59db
Owner: skills-n
Status: accepted
Authority: build, review, integrate, push build/review-run-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; run claude -p probes and review-run on Netcup and ben-desktop under scratch dirs only; the live proof is run by skills-a from its own session; no install, no release, no edit to agents/reviewer.md, hooks/, note-send, note-inbox or the flusher
Next: census, four-read and accept pinned at 643a862, then merge, publish, close, RESULT; then lane 57
Artifact: 643a8626b7cf3b8d9711e7640ee95a548d9fb69a
Evidence: docs/work/evidence/wr-2026-09-29-review-run-review.md, docs/work/evidence/wr-2026-09-29-review-run-review-r1.md, docs/work/evidence/wr-2026-09-29-review-run-review-r2.md, docs/work/evidence/wr-2026-09-29-review-run-review-r3.md, docs/work/evidence/wr-2026-09-29-review-run-suites.md
Worktree: build/review-run-1
Scratch: /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-53
Opened: 2026-09-29T02:05:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T02:04:06Z
Base: 7ab59dbd496c062f1cbb8eb259dd5a95aa9f9088
Log: 2026-09-29T02:05:18.000Z owned skills-n picked up skills-fable-lane-53-1 (ACK skills-n-lane-53-1); worktree from origin/main at 7ab59db; Sonnet scout spawned to verify the packet's sources before the spec
Log: 2026-09-29T02:09:33.000Z owned skills-n scout DONE (lane 40 triage doc absent, scripts\/ not mirrored, no agent-by-path flag, no subprocess recursion guard); spec written with the script in skills\/team-build\/scripts so the mirror is unchanged; Opus spec red-team spawned
Log: 2026-09-29T02:23:47.000Z owned skills-n Opus spec red-team by a60c809b038e83bd7 NEEDS_FIXES 7ab59db (3 blockers: NEEDS_FIXES (n) fails the verdict regex, project settings of the reviewed sha load unattended, the delete guard treats the child as a lead; 9 major, 9 minor); all adopted in lead-ruling-redteam.md except M9 and B3, asked of skills-fable as skills-n-lane-53-2
Log: 2026-09-29T02:25:21.000Z owned skills-n skills-fable decided (skills-fable-lane-53-2): M9 keep review-run with both routes, claude default and codex reviewer.toml second; B3 (a), the delete-guard and multi-inbox one-liners are in territory with a unit test each; Sonnet builder spawned
Log: 2026-09-29T03:16:10.000Z delivered skills-n Sonnet builder ac4540ca39091f6b7 DONE 4c2b974, report 997b665 (review-run.mjs plus the two hook one-liners, gate 268 pass, full suite 2954 pass 0 fail; P1, P2a, P4, P6 pass, P2b pass on the fix but the installed 0.20.17 hook predates it, P7 found a Write escape under auto and the default moved to dontAsk unverified, P3 live inconclusive, 8 of 8 live runs used); Opus code review and probe round 2 started
Log: 2026-09-29T03:32:15.000Z rejected skills-n Opus code review by a1e775d21bce0c48b NEEDS_FIXES (14) 4c2b974 (blocker: the argv pre-approves Write and Bash tool-wide, so dontAsk cannot close P7, and git -C already got past the prefix denies in P2b; majors: user rules load into the child, PowerShell escapes the denies, a relative scratch leaks a clone, the tests never check the argv, an orphan survives SIGKILL); probe round 2 A measured the Write escape still open under dontAsk, B, D and E pass; all 14 adopted per lead-ruling-r1; fresh builder spawned
Log: 2026-09-29T04:34:05.000Z delivered skills-n fresh Sonnet fix round 1 builder a1d842159340fc53c DONE cb66b71, report 7291e4e (all 14 findings, gate 294 pass, full suite 2980 pass 0 fail; 8 of 10 live runs: dontAsk cannot write its own report, auto passes P5, P1 none, P3 exit 6, P4 clean; auto still lets a classifier-approved write and the git --git-dir= form out); lead-ruling-r2 keeps auto, re-scopes P7 to parity and requires the equals forms closed; logs untracked at 0d7b614; fresh Opus delta reviewer spawned
Log: 2026-09-29T05:06:26.000Z rejected skills-n fresh Opus delta review r2 by ac24989e022c3620e NEEDS_FIXES (6) cb66b71 (blocker: the fix-round sweep SIGKILLs a reused or forged childPid, measured; the git equals forms are still undenied; the sidecar write still follows a planted link; the Write rule is inert, Edit(//abs) is the documented form; 9 of 14 r1 fixes hold); lead-ruling-r3 adopts all, the sweep never signals; fresh builder spawned for fix round 2 of 3
Log: 2026-09-29T05:25:33.000Z delivered skills-n fresh Sonnet fix round 2 builder a5ece5b1da3b029cb DONE 1b62edb, report b17095f (N1 the sweep never signals, N2 equals forms denied, N3 rename write, N4 Edit(//abs), N5 sweep tests, N6 doc; gate 305 pass, full suite 2991 pass 0 fail; 3 of 6 live runs, all four equals and space forms denied, P5 pass under auto, dontAsk with Edit(//abs) delivers the report, P4 unchanged apart from an unrelated flush-last.json); fresh Opus delta reviewer and Windows suite started
Log: 2026-09-29T05:59:55.000Z rejected skills-n fresh Opus delta review r3 by a7ee3a035a2e55a69 NEEDS_FIXES (3) 1b62edb (F1 the victim-survives tests read a zombie as alive, so a reintroduced sweep kill passes 65 of 65, measured; F2 the win32 Edit rule and the glob refusal have no red test; F3 a completed run prints a false stale-run line once its childPid is reused); all three mechanical with verified patches, adopted verbatim; fix round 3 of 3
Log: 2026-09-29T06:14:02.000Z rejected skills-n Windows suite at 1b62edb 2958 pass, 23 fail, 1 cancelled, all in review-run.test.mjs (spawn EFTYPE: the shebang fake claude cannot spawn on win32, and the synchronous throw exits 7, not 4), the file hung about 40 min until the lead stopped that one pid; fix round 3 builder aa2dd766625652a8e stopped by the lead after 11 min silent on an rm -rf permission prompt its brief banned, F1 left uncommitted in the tree; lead-ruling-r4 combines F1 to F3 with the Windows fixes
Log: 2026-09-29T06:50:15.000Z delivered skills-n fresh Sonnet fix round 4 builder a70a34162235184ec DONE 643a862 (F1 to F3 and W1 to W3; Linux review-run 67 of 67, full suite 2993 pass 0 fail with TMPDIR=/var/tmp because /tmp was at 100 percent inode use; Windows review-run 48 pass 0 fail 19 skipped on win32, full suite 2965 pass 0 fail in 170 s); Opus delta r4 and Windows live probe started
Log: 2026-09-29T07:05:43.000Z delivered skills-n fresh Opus delta review r4 by aa0426e180c8df8eb APPROVE 643a862 (F1 to F3 and W1 verified by mutation, W2 skips all fake-dependent, review-run 67 of 67; 5 non-blocking items for a follow-up); a2 quality check and Codex-launched run started, the Windows live probe still running
Log: 2026-09-29T07:15:45.000Z delivered skills-n Sonnet runner a571d9d784d16691b Windows live probe INCONCLUSIVE, 0 of 3 runs used: claude.exe resolves, but over the Bitvise ssh token claude -p cannot log in and hangs (three hung pids stopped by the runner); probes re-staged under C:\Temp and asked of skills-fable, whose pane runs in Ben's own Windows session (skills-n-lane-53-winprobe-1)
Log: 2026-09-29T07:19:01.000Z delivered skills-n Sonnet runner a1e9750c13671facf gates: b (Codex-launched) PASS from codex exec, workspace-write fails with EROFS before the reviewer starts, danger-full-access needed, exit 0 NEEDS_FIXES (3) on the decoy, 0 denials; a2 returned NEEDS_FIXES (2) with F1 matching record line 32, but the lead rejects it as evidence because the reconstructed brief was written from line 32 itself; a clean-brief a2 rerun started
Log: 2026-09-29T07:20:19.000Z delivered skills-n Windows live probes run by skills-fable from its own pane (skills-fable-lane-53-winprobe-2): W-P7 PASS, all three attack commands denied, decoy local hooksPath unchanged; W-P5 exit 0, VERDICT first line, real claude.exe, model opus, worktree cleaned, 1 denial from the machine identity guard on a chained read-only git config --get, which is not review-run behaviour; the lead strikes its own tools-in-sidecar probe criterion (not in the spec, PowerShell absence is unit-tested on win32) and reads hooksPath as local config unchanged
Log: 2026-09-29T07:27:04.000Z reviewed skills-n Opus delta review r4 by aa0426e180c8df8eb APPROVE 643a862 is the deciding review; acceptance gates met: a2 PASS on a clean brief (NEEDS_FIXES (3) on 90beeb9, F1 names the production Stop-null mutant gap with its own production mutants), b PASS from codex exec with danger-full-access, Windows W-P7 PASS and W-P5 shape proven by skills-fable, Linux 2993 pass and Windows 2965 pass, 0 fail each
Census: - leadTurns: 30
Census: - wallClockHours: 5.38
Census: - wakes: 4 (4 note-flush, 0 Done-tick)
Census: - wakeSplit: wake 4, stopBlock 0, other 26 (coalescable 0 at hold 10m — see "Wake-opened turns" below)
Census: - stopBlocks: 0
Census: - stallNudges: unavailable (ledger dir unreadable)
Census: - by-model: claude-opus-5-5=66485265, claude-sonnet-5=147375651
Census: - by-role: unassigned=180547393
Census: - subagentFiles: 239
Census: - Total assistant turns, deduped (whole file): **1549**
Census: - Window assistant turns, deduped: **175**
Census: - leadTurns (conversational runs — see docs/census.md): **30**
Census: - Wakes (turns opened by a note-flush or Done-tick line, see docs/census.md): **4** (4 note-flush, 0 Done-tick)
Census: - Stop-blocks (multi-inbox Stop hook blocks): **0**
Census: - Stall nudges received (ledger `collect-*-stall-*` ASKs to the lead's slug, in the window): **unavailable (ledger dir unreadable)**
Census: - Window: 2026-09-29T02:05:02.388Z .. 2026-09-29T07:28:08.375Z
Census: - Turns/hour in window: **32.50**
Census: ### Lead tokens by model — whole file (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | <synthetic> | 0 | 0 | 0 | 0 |
Census: | claude-opus-5-5 | 3096 | 4685033 | 261677230 | 1035822 |
Census: ### Lead tokens by model — window (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 350 | 394330 | 32787742 | 131101 |
Census: - wakeTurns: 4, stopBlockTurns: 0, otherTurns: 26
Census: - cache_creation per turn (M6) — wake: claude-opus-5-5=6224.3; other: claude-opus-5-5=14209.0
Census: - coalescable (W1b, hold 10m, RESULT wakes only, Done-tick excluded): turns 0, upper (none), lower (none); ceiling (every RESULT wake turn) turns 2, claude-opus-5-5=2206852
Census: ### Subagent tokens by model — totals (deduped)
Census: | model | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | claude-opus-5-5 | 642 | 1588180 | 31188244 | 394676 |
Census: | claude-sonnet-5 | 2318 | 2048799 | 144542958 | 781576 |
Census: ### Subagent tokens by role — totals (deduped)
Census: | role | input | cache_creation | cache_read | output |
Census: |---|---|---|---|---|
Census: | unassigned | 2960 | 3636979 | 175731202 | 1176252 |
Census: ## Combined split (lead window + subagents)
Census: | model | output_tokens | input+cache_creation+cache_read |
Census: |---|---|---|
Census: | claude-opus-5-5 | 525777 | 65959488 |
Census: | claude-sonnet-5 | 781576 | 146594075 |
Four numbers: Top-tier tokens per build: 66485265 tokens: build 66485265 (claude-opus-5-5); partial (no spec slice): spec-census not run
Four numbers: Hours ask to accepted: 5.4h; largest gap 42.2min at 2026-09-29T03:32:41.976Z
Four numbers: Rework after acceptance: 0 commits touching build files within 7 days; 0 re-accept Log: entries after the first
Four numbers: Work lost or stalled: 0 gap(s) over 30min stalled; 2 waiting-on-agents (73.6 min); 2 unanswered ASK(s) to skills-n: skills-fable-lane-53-1, skills-fable-lane-57-1; wakes 4 (4 note-flush, 0 Done-tick); Stop-blocks 0; stall nudges 0 to skills-n
Log: 2026-09-29T07:28:13.000Z accepted skills-n artifact 643a8626b7cf3b8d9711e7640ee95a548d9fb69a

Observed: skills/team-build/scripts/review-run.mjs runs a high-tier Claude Opus review as a `claude -p --agent` child, from any host, in an isolated shared clone with origin removed.
- The child gets the installed reviewer role, byte-hashed into a sidecar. It runs under `--setting-sources user`, `--strict-mcp-config` and CLAUDE_CODE_DISABLE_CLAUDE_MDS.
- The Write rule is scoped to the report as `Edit(//abs)`. Every git global-option form is on the deny list, in both space and equals spellings, and PowerShell is dropped.
- It exits with distinct codes: 0 ok, 1 usage, 2 malformed, 3 timeout, 4 host, 5 kill switch, 6 recursion, 7 internal. The stale-run sweep never signals a process.
- hooks/delete-guard.mjs treats a DELEGATION_REVIEW_RUN=1 child as a subagent, and hooks/multi-inbox.js never registers one.
- It took one build and four fix rounds, with 14, 6, 3 and 0 findings. A reintroduced SIGKILL of foreign pids was caught in r2, and a zombie-blind test in r3.
- Launched from a Codex exec, it returned a verdict, but only under danger-full-access.
- On lane 49's commit 90beeb9, with a clean brief, it independently found the same production Stop-null mutant gap the Agent-tool Opus reviewer had found.

Predicts: the next Codex-led lane gets its high-tier review by running review-run itself instead of asking a Claude lead. That removes one peer round trip per review round from hours-ask-to-accepted. Its census counts those review tokens only through the sidecar session, as docs/census.md now says.

Gap: under `auto`, a write outside the clone that the classifier approves still runs, for example a raw Bash redirect, or a Write to a path other than the report. That is parity with the Agent-tool reviewer, which runs under the lead's own classifier (lead-ruling-r2). Prefix rules do not cover `env git ...` or an absolute-path git. The P2b delete-guard line only takes effect on a host after a release installs it. On Windows over the ssh key login, claude.exe cannot reach its login, so live Windows runs need a session in Ben's own logon.

Stall: fix round 3's Sonnet builder went silent for 11 minutes on a permission prompt for an `rm -rf` that its brief banned. The lead stopped it and folded its one finished edit into round 4. The Windows suite at 1b62edb hung for about 40 minutes in review-run.test.mjs, from spawn EFTYPE, until the lead stopped that one test pid; round 4 fixed the cause. The Windows live probe over ssh hung inside claude.exe's login, and the runner stopped its own three pids; skills-fable ran the probes from its own pane instead.

## Spec (lead, from the packet)

Measure: top-tier tokens per build (the Fable relay turns: 10 of 11 ASK wakes in the lane 51 window were skills-a asking for a reviewer spawn) and hours ask to accepted (no relay wait). Must not worsen: review quality (same reviewer role file, same model tier, same report contract) and work lost or stalled.

Scout: docs/specs/review-run-53/scout.md. Corrections to the packet, adopted here:
- The lane 40 triage doc does not exist. The five probe checks are the packet's own list, P1 to P5 below.
- `scripts/` is not mirrored today; `skills/<name>/` is, scripts folder included. So the script lives in the team-build skill, and the mirror script is unchanged. That is fewer parts than a new mirror source kind.
- No `claude` flag loads an agent file by path. The role is passed as `--agents` JSON built from agents/reviewer.md at run time, or through `--append-system-prompt` if the probe shows `--agents` does not apply it.
- No recursion guard for a subprocess spawn exists today. It is new here.
- Prior art: scripts/native-continuation-smoke.mjs:29,141-142 (the `cleanEnv` allowlist and the pinned `claude -p` argv).

### S1. The script

`skills/team-build/scripts/review-run.mjs`. The mirror publishes it as `~/.agents/skills/team-build/scripts/review-run.mjs`.

Usage:
```
node review-run.mjs --sha <commit> --brief <path> --report <path> [--repo <checkout>] [--model opus] [--timeout-min 45] [--scratch <dir>]
```
- `--repo` defaults to the cwd's git top level.
- `--scratch` defaults to the OS temp dir.
- `--sha` is resolved to the full 40-hex id with `git rev-parse --verify <sha>^{commit}`.

Steps, in order:
1. Kill switch. If `<AGENTS_HOME or ~/.agents>/no-review-run` exists, exit 5 and print on stderr: "review-run is switched off (no-review-run); ask a Claude lead to run the reviewer".
2. Recursion. If the environment carries `DELEGATION_REVIEW_RUN=1`, exit 6: "review-run refuses to run inside a review-run child".
3. Resolve the role file. It is `<plugin root>/agents/reviewer.md`, where the plugin root is the first found of:
   - `--plugin-root`;
   - walking up from the script to a directory holding `.claude-plugin/plugin.json`;
   - the `installPath` of `delegation@benzhuk` in `~/.claude/plugins/installed_plugins.json` (the mirrored copy's path).
   If none is found, exit 4. The role is always the installed or checked-out plugin's own file, never a copy. Its sha256 goes into the identity sidecar.
4. Resolve `claude`, from `--claude-bin` (a test seam) or PATH. If it is missing, exit 4 and name the host.
5. Create the worktree with `git -C <repo> worktree add --detach <scratch>/review-run-<sha7>-<random> <fullsha>`.
6. Run the child. Its cwd is the worktree, it gets the pinned argv (S2), and the prompt is the brief file's text plus one line: "Write your report to <absolute report path>. Its first line must be `VERDICT: APPROVE <fullsha>` or `VERDICT: NEEDS_FIXES <fullsha>`."
   - The child's environment is `cleanEnv` plus `DELEGATION_REVIEW_RUN=1` and `AGENTS_HOME=<worktree-sibling scratch>/agents-home`.
   - So its multi hooks, if they load, write only into scratch. `NOTE_SLUG`, `ORCA_*` and session-name variables are never passed.
   - Timeout is `--timeout-min`. On timeout, kill the child's process tree and exit 3.
7. Validate the report. It must exist, and line 1 must match `^VERDICT: (APPROVE|NEEDS_FIXES) <40hex or a prefix of at least 7 chars of fullsha>$`.
   - A missing report, a different sha, or any other first line exits 2.
   - The verdict is the report's own. The script never writes into the report: evidence keeps its original bytes.
8. Identity. The script writes `<report>.identity.json`, holding `sha`, `verdict` (or null), `exit`, `session` (the `--session-id` uuid the script generated), `model`, `role` (path and sha256), `pluginVersion`, `claudeVersion`, `host`, `startedAt` and `endedAt`. This is the reviewer identity block. A record names the session uuid as the reviewer id.
9. Always remove the worktree with `git worktree remove --force` and `git worktree prune`, on every exit path after step 5, timeout and crash included.
10. Output. Print one JSON line on stdout: `{exit, report, identity, verdict, sha, session}`.

Exit codes:
| code | meaning |
|---|---|
| 0 | a well-formed report, whatever its verdict |
| 1 | usage error |
| 2 | malformed or missing report |
| 3 | timeout |
| 4 | unsupported host, or no claude or plugin root |
| 5 | kill switch |
| 6 | recursion refused |

Only exit 0 carries a verdict.

### S2. The pinned `claude -p` invocation (pinned by probe)

Starting point:
```
claude -p --output-format stream-json --verbose --model <opus> --session-id <uuid> --permission-mode dontAsk --allowedTools <reviewer tools from frontmatter> --agents <json file> --agent reviewer
```
The builder runs P1 to P5 on Netcup against a known-good sha (d7625e0 with a small brief). It commits the final argv as a constant, with a comment naming the probe run. Each probe records pass or fail in the build report.

- **P1, the role loads.** The stream-json init event shows the model resolved to an Opus id, and a tool set equal to the reviewer frontmatter's tools, with no Agent tool. The report follows the reviewer's report contract.
- **P2, the guard hooks stay active in the child.** A child asked to run a command the user-level delete guard or git-identity guard denies gets that denial. Setting sources keep `user`, so the user's PreToolUse guards load. A child that loads no guard fails P2.
- **P3, no recursion.** A child told to run review-run gets exit 6 (the env marker), and the child has no Agent tool.
- **P4, no transport writes.** Hashes and mtimes of the real `~/.agents/notes/` tree, `inboxes.json`, `panes.json` and the repo's `docs/ledger/` are identical before and after a full run.
- **P5, zero permission denials** in a full run on the known-good sha. Count them in the stream-json.

If `--agents` with `--agent` does not satisfy P1, use `--append-system-prompt <role body>` with `--tools`/`--allowedTools` from the frontmatter, and record why. `bypassPermissions` and `--dangerously-skip-permissions` are never used.

The model comes from `--model`, default `opus`, the high-tier alias per docs/model-tiers.md:9.

### S3. The contract paragraph

Goes in skills/team-build/SKILL.md, directly after the "**Codex**: no Workflow tool" paragraph, where the Codex-lead rule lives. The scout found nothing about it in docs/subagent-contract.md.

A Codex-led lane obtains its high-tier review by running `review-run` itself, and records the report and the identity sidecar as evidence, with the sidecar's session uuid as the reviewer id. It asks a Claude lead for a reviewer only when review-run exits nonzero, and quotes the exit code. The Claude-led path is unchanged.

docs/census.md gets one line: a review-run child's transcript lands under the worktree path's project folder and is not in the lead's subagents folder. So a Codex lead's census counts its review tokens only through the identity sidecar's session. Name that gap rather than hide it.

### S4. Efficacy tests

Test file: skills/team-build/scripts/review-run.test.mjs. It uses a fake `claude` through `--claude-bin`, a node script driven by an env knob. Each test must fail without the code it covers.
- A malformed first line exits 2.
- A missing report exits 2.
- A report for a different sha exits 2.
- A timeout exits 3, and the fake's child process is gone.
- The kill switch exits 5, and the fake is never started.
- The recursion marker exits 6.
- APPROVE and NEEDS_FIXES both pass through with exit 0, and the verdict appears in the stdout JSON and the sidecar.
- The worktree is removed on every one of those paths: `git worktree list` is back to its before count.
- The child's environment has `DELEGATION_REVIEW_RUN=1`, a scratch `AGENTS_HOME`, and no `NOTE_SLUG`/`ORCA_*`.
- The role passed to the child is byte-derived from agents/reviewer.md: its sha256 is in the sidecar.
- The mirror test asserts that the mirrored team-build copy contains scripts/review-run.mjs.

Live proof:
- (a) The lead runs review-run on Netcup and on ben-desktop on d7625e0 with lane 49's brief, and quotes each report's first line and the sidecar.
- (b) skills-a runs it once from its Codex session on the same sha, and the RESULT quotes the report's first two lines. This goes through an ASK to skills-a after the code review; it is not a gate on accept.

Measure after: in the next Fable lead census, ASK wakes from skills-a per Codex lane, against 5 for lane 49 and 3 for lane 52.

### Territory

- skills/team-build/scripts/review-run.mjs and review-run.test.mjs.
- One assertion in scripts/mirror-shared-skills.test.mjs.
- skills/team-build/SKILL.md, one paragraph.
- docs/census.md, one line.

NOT agents/reviewer.md, hooks/, note-send, note-inbox, the flusher, scripts/four-read.mjs (lane 54), or scripts/mirror-shared-skills.mjs itself.
