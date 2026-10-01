PARTIAL

Why PARTIAL: one helper step was stopped by a guard hook (verbatim below), the rework number is unavailable for lanes 60 and 60c, and the Mac was not reached. Everything else asked for was read.

# Census read, 0.20.18 window, delegation plugin

Run 2026-10-01 about 1:00 PM to 1:25 PM America/New_York (clock read from PowerShell). Read-only except this file. No test suite run, nothing committed, pushed, sent or written to Notion.

Method and definitions
- Scripts: `scripts/build-census.mjs` and `scripts/four-read.mjs` from the main checkout `C:\Users\benzh\Code\zhuk-infra\claude-delegation`, unmodified. Last commit touching them: d40dd1b0 (9/29 11:22 PM) and cf8f5fc5 (9/29 10:35 PM). Checkout HEAD when run: b8f06098. Not a fresh detached worktree of origin/main, because the brief said to use main as it stands.
- Window start: 0.20.18 install, 2026-09-29 3:24 PM NY (19:24Z). Confirmed by the plugin cache dir `delegation/0.20.18` creation time on this desktop, 9/29 3:24:34 PM. 0.20.17 dir was created 9/28 5:48 PM.
- Window end ("the pause"): Ben's "i am pausing" message in the lead transcript, 9/30 7:24:16 PM NY (23:24:16Z, line 38395 of the lead jsonl). The hand-off file was written at 9:15 PM; the lead session kept working on cleanup after 7:24 PM and none of that is in the window.
- Top-tier tokens, definition used by both scripts: sum of input + cache_creation (cache write) + cache_read + output over every counted file, for models matching `fable,opus` (Claude) or `gpt-6-astra,gpt-5.6-sol` (Codex). Sonnet and other mid-tier models are not top-tier and are not in the number. This is "with cache". "Non-cache" is input + output only. For Codex the script's native_input already contains cached input; the line below uses the script's exclusive input + output as non-cache.
- The hand-run bar (17.3M) is stated in `docs/work/evidence/baseline/hand-run-baseline.md` only as "the build-census top-tier (lead-model family) figure". The summing rule is stated in `docs/work/evidence/wr-2026-09-29-baseline-review.md` line 31: "summing input + cache_creation + cache_read + output". So the bar is with-cache and the same definition as this read. A non-cache version of the bar was not computed (the per-build census files are not in the repo).
- Per-lane numbers are the four-read for each record, run fresh: census window Opened to last `accepted` Log line, spec slice (the spec session's top-tier usage, Spec-from to Opened) added where the spec session transcript was reachable. Hours are Opened to the FIRST accepted. Lead turns are the lane lead's `leadTurns` in the lane window (the orchestrator or Codex lead), not the Fable lead's.
- Rework is "to date": every 7-day rework window in this read ends 10/6 or later, so none is closed. The script counts any non-merge commit touching a file of the build range, including the lane's own close and accept record commits.
- Overlap warning: lanes 59, 60 and 60b were led concurrently by the same Netcup session (f6c8ae21), so their windows share one lead transcript and one set of subagents. Their token and stall numbers overlap and must not be added. Lane 57 opened 9/29 3:30 AM, before the install.

## The numbers

Bar row first. "x bar" is the with-cache tokens divided by 17,298,421.

| Row | Lead (host) | Ask to accepted (NY) | Top-tier tokens, cache included (x bar) | Top-tier non-cache | Hours | Lead turns | Rework after acceptance (script, to date) | Lost or stalled (script) |
|---|---|---|---|---|---|---|---|---|
| HAND-RUN BAR (lane 61, medians of 5) | hand-run | | 17,298,421 | not computed | 4.70 | not stated | 0 | 1 |
| Lane 40 knowledge triage | Codex skills-a (Windows) | 9/29 3:17 PM to 9/30 12:15 AM | 198,297,339 (11.5x) = build 198,096,202 + spec slice 201,137 | 5,636,298 (input 4,665,842 + output 970,456, lead and native descendants) | 9.0 | 19 (926 native responses) | 2: b52757b, 0edd4d9 (both the lane's own close and accept commits); 0 re-accept | stalled count unsupported on Codex; 0 native response gaps over 30 min (heuristic, max 6.5 min); wakes 19; Stop-blocks 1; stall nudges 0; unanswered ASKs 0 |
| Lane 40b census reader (follow-up to 40, not asked) | Codex skills-a (Windows) | 9/29 11:00 PM to 11:52 PM | 29,588,573 (1.7x) = 29,249,205 + 339,368 | 667,189 (547,466 + 119,723) | 0.9 | 1 (122 responses) | 2 (close and accept commits); 0 re-accept | unsupported on Codex; 0 gaps over 30 min (heuristic, max 3.2 min); wakes 1 |
| Lane 59b mirror shim | Claude Opus skills-n (Netcup) | 9/30 9:34 AM to 9:49 AM | 5,223,811 (0.30x) = 4,475,175 + 748,636 | 30,888 (90 + 30,798) | 0.2 | 5 | 2 (close and accept commits); 0 re-accept | 0 stalled; 0 waiting-on-agents; wakes 0; Stop-blocks 0 |
| Lane 60 secret guard | Claude Opus skills-n (Netcup) | 9/29 5:39 PM to 10:54 PM | 105,764,906 (6.1x) = 100,785,941 + 4,978,965 | 917,121 (1,744 + 915,377) | 5.3 | 59 | unavailable (see unseen item 3); record holds 2 `accepted` Log lines (10:54 PM and 10:56 PM), so 1 re-accept entry by the script's rule | 4 stalled: agent a96da4ee9794f0460 silent 83.0 min from 9/29 6:05 PM, a367a2ba2b2f5efb9 60.8 min from 6:28 PM, a8ae668d19e0620ae 58.6 min from 6:30 PM, a9a2e9f8daa2e2466 34.5 min from 8:18 PM; plus 1 waiting-on-agents (31.3 min, not counted as stalled); wakes 0; Stop-blocks 0 |
| Lane 60b artifact repo (blocker of 60, not asked) | Claude Opus skills-n (Netcup) | 9/29 9:53 PM to 10:52 PM | 28,681,279 (1.7x) = 25,454,182 + 3,227,097 | 183,486 (456 + 183,030) | 1.0 | 19 | 3: 0ff833b (retire-continue refactor, another lane), 33ed493 and aaa649f (close and accept commits); 1 re-accept entry (10:53 PM merged line) | 0 stalled; wakes 0 |
| Lane 60c selftest on Windows | Claude Opus skills-n (Netcup) | 9/30 9:34 AM to 10:18 AM | 9,258,383 (0.54x) = 8,509,747 + 748,636 | 67,333 (204 + 67,129) | 0.7 | 11 | unavailable (same cause as lane 60) | 0 stalled; wakes 0 |
| Lane 61 baseline | Claude Opus skills-o (Windows) | 9/29 5:54 PM to 9/30 9:40 AM | 7,487,958 (0.43x) = 6,676,166 + 811,792 | 65,519 (158 + 65,361) | 15.8 | 9 | 3: ee6dcf6, 0b05fc7, de37916 (close, accept, "record scratch", all docs); 0 re-accept | 1 stalled: one lead gap of 916.9 min from 9/29 6:13 PM; 0 waiting-on-agents; wakes 3; Stop-blocks 0 |
| Lane 63 page-lint table | Claude Opus skills-o (Windows) | 9/30 6:30 PM to 6:53 PM | 4,047,269 (0.23x) = 3,665,805 + 381,464 | 37,080 (80 + 37,000) | 0.4 | 6 | 3: 74a8e3e (second-host suite note), c7d8ec9, 30420ab (close and accept); 0 re-accept | 0 stalled; wakes 1 |
| Retire continue | Claude Opus skills-o (Windows) | 9/30 9:46 AM to 10:05 AM | 7,625,136 (0.44x) = 3,902,660 + 3,722,476 | 23,294 (90 + 23,204) | 0.3 | 5 | 2 (close and accept commits); 0 re-accept | 0 stalled; wakes 0 |
| Lane 58 clear-done (also in window, not asked) | Claude Opus skills-n (Netcup) | 9/29 3:27 PM to 3:51 PM | 15,692,337 (0.91x), no spec slice (Spec-from equals Opened) | 154,255 (280 + 153,975) | 0.4 | 13 | 3: 27ecce3 (a feature commit, notion-writing), 037e37a, aeaf55a (close and accept) | 0 stalled; wakes 0 |
| Lane 59 janitor acts (also in window, overlaps 60 and 60b) | Claude Opus skills-n (Netcup) | 9/29 5:13 PM to 9/29 10:26 PM | 101,902,668 (5.9x), no spec slice | 964,508 (1,734 + 962,774) | 5.2 | 54 | 6: 0ff833b, d2fb5cc, b426e8a, cf8f5fc (lane 60b fix commits), 40a21b3, a578741 (close and accept); 1 re-accept entry | 4 stalled, the same four agents as lane 60; wakes 2 |
| Lane 57 test-ipc (also in window; opened before the install) | Claude Opus skills-n (Netcup) | 9/29 3:30 AM to 4:35 PM | 63,427,062 (3.7x) = 53,681,225 + 9,745,837 | 435,677 (910 + 434,767) | 13.1 | 39 | 3: 0ff833b, dfd465e, d97a406 (retire refactor, close, accept) | 3 stalled gaps (45.7, 113.0, 459.3 min, all starting before the install); wakes 6 |
| FABLE LEAD, install to pause (9/29 3:24 PM to 9/30 7:24 PM, 28.0 h) | Claude Fable 9c61c35a (Windows) | | 77,039,769 | 319,268 (10,124 + 309,144) | 27.9 span of messages | 60 (410 API turns) | not applicable | wake-opened turns 40 (43,663,361 tokens, 56.7%); wakes 40 note-flush, 0 Done-tick; Stop-blocks 0; stall nudges 0 |
| FABLE LEAD, first 24 h after install (9/29 3:24 PM to 9/30 3:24 PM) | same | | 69,090,374 (cache write 1,189,010; cache read 67,622,567; input 9,276; output 269,521) | 278,797 | 21.3 span of messages | 50 (361 API turns) | not applicable | wake-opened turns 35 (40,205,766 tokens, 58.2%); other turns 15; Stop-blocks 0; stall nudges 0 |
| FABLE LEAD, prior window as checked on 9/29 (9/28 3:00 PM to 9/29 3:00 PM), re-run | same | | 72,687,068 (identical to the 9/29 checks file) | 348,859 | 13.6 span | 91 (389 API turns) | not applicable | wake-opened turns 44 (34,138,669 tokens, 47.0%); stop-block turns 1 |
| FABLE LEAD, the 24 h immediately before the install (9/28 3:24 PM to 9/29 3:24 PM) | same | | 72,624,440 | 332,341 | 23.5 span | 86 (387 API turns) | not applicable | wake-opened turns 42 (33,038,093 tokens, 45.5%); stop-block turns 1 |

Notes on the table
- Record-time numbers for cross-check (from each record's own Four numbers lines): lane 40 build 196,222,205 (re-run 198,096,202); lane 60 build 99,390,373 (re-run 100,785,941, window end 2 minutes later); lanes 59b, 61 and 63 match to the token. Lane 61 record-time rework was 1 commit, re-run 3.
- Bar comparison needs the unit stated: the bar is a hand-run lead session's top-tier figure. The lane rows above are the lane lead plus Opus subagents plus the Fable spec slice; Sonnet builder tokens are excluded as mid-tier.
- Fable lead earlier windows quoted from earlier files, not re-run: 9/26 8:00 AM to 9/27 8:00 AM 86,439,578 (108 lead turns, `2026-09-27-bearings-census.json` and `2026-09-27-bearings-prediction-check.md`); 9/27 8:00 AM to 9/28 8:00 AM 65,108,489 (`2026-09-28-bearings-check.md`).
- Other Fable sessions on this desktop in the same windows (all under `Code\Zhuk Projects`, tdf and hillstone, not this project; wakes 0 in each). 24 h window: 4660b908 10,591,203; 986a8552 4,680,207. Install-to-pause window: 4660b908 52,766,227; 986a8552 4,680,207; 9271b2b1 1,924,212; 001c0ea5 6,322,248. Sum with the plugin lead: 24 h 84,361,784; install to pause 142,732,663.

## Prediction check

Quoted exactly.

`docs/work/evidence/2026-09-29-bearings-assessment.md`, Prediction section:
> Claim: in the 24 hours after 0.20.18 is installed on ben-desktop, the Fable lead session reads at most 20 wake-opened turns. Its claude-fable-5-1 total is at most 65M. If 0.20.18 is not installed on ben-desktop by 2026-09-30 3:00 PM New York, record the prediction as failed on deployment, not as untestable.

> Check at 2026-10-01 3:00 PM New York, from a fresh detached worktree of origin/main, for each Fable lead session on ben-desktop, with the window starting at the install time: `node scripts/build-census.mjs --lead <each Fable lead .jsonl> --from <install time, UTC> --to <install time + 24h, UTC> --json` ... Read `lead.windowByModel["claude-fable-5-1"]` summed over its four columns, and the wakeTurns line. Both bounds must hold, summed over every Fable lead session.

`docs/work/evidence/2026-09-29-bearings-response.md`:
> Prediction adopted as written by the reviewer: in the 24 hours after 0.20.18 is installed on ben-desktop, the Fable lead reads at most 20 wake-opened turns and at most 65M claude-fable-5-1 tokens, summed over every Fable lead session on the desktop; if the install has not happened by 3:00 PM New York on 2026-09-30, the prediction is recorded as failed on deployment. Check on 2026-10-01 at 3:00 PM New York with the build-census command in the assessment.

> What would make me reconsider before then: a second Fable lead session in the window (the census read only this one), or evidence that review-run was live on a host during the window.

Reading, window 9/29 19:24:00Z to 9/30 19:24:00Z, session 9c61c35a, the one Fable lead session of this project on the desktop:
- Install condition: met. Installed 9/29 3:24 PM, before the 9/30 3:00 PM deadline.
- Wake-opened turns: 35 against a bound of at most 20. Not held.
- claude-fable-5-1 tokens: 69,090,374 against a bound of at most 65M, over by 4,090,374. Not held.
- Result: FAILED, both bounds. The same two bounds also fail on the longer install-to-pause window (40 wake-opened turns, 77,039,769 tokens), and fail on the sum over every Fable session on the desktop (84,361,784 in 24 h, which includes two other-project sessions).
- Against the prior comparable window (9/29 check window, re-run, identical to the 9/29 file): tokens 72,687,068 to 69,090,374 (down 3,596,694); wake-opened turns 44 to 35; lead turns 91 to 50; wake-bucket share 47.0 percent to 58.2 percent.
- Against the 9/29 reconsider conditions: (a) a second Fable lead session in the window: none found for this project (the only other Fable sessions on the desktop are the tdf and hillstone sessions listed above, plus BTO sessions on Netcup that were not read); (b) evidence that review-run was live on a host in the window: lane 40's record has 9 Log lines naming review-run, the first at 9/29 5:17 PM NY (21:17:21Z), so review-run ran from a checkout on the Windows host inside the window. Whether the Fable lead pane itself loaded 0.20.18 cannot be told from the census: the pane's transcript starts 9/20 3:16 PM NY and the RESUME file says a session runs the plugin version it started with. For the lead's ruling.

## What the census could not see

Named so no gap reads as a zero.

1. Detached Claude roles in Codex-led lanes 40 and 40b. Lane 40's counted graph is the Codex lead plus 59 native descendant rollouts. Shell-launched Claude sessions (Opus reviewers via review-run, probe runners, nested Claude runs, Sonnet scouts) are outside it. The lane 40 record has 20 Log lines naming Opus, 9 naming review-run and 5 naming a runner or high-tier runner. Their tokens are not in 198,297,339 or 29,588,573, so those two figures are floors for top-tier tokens. Plan item 1 (collect shell-launched Claude sessions by lane) is not in the script: the last commit touching it is d40dd1b0 on 9/29.
2. Stall attribution on Codex. `lead.codex.fields.stalls` reads UNSUPPORTED. The 0 shown for lanes 40 and 40b is a count of native API response gaps over 30 minutes (heuristic, max 6.5 min and 3.2 min), not a stall count. Plan item 2 is not built.
3. Rework linkage. (a) No record field links a follow-up lane to its parent, so the census counts follow-ups as new lanes: lane 59b (mirror shim, "from skills-fable-janitor-59-4") is a follow-up of lane 59; its commit 9bc9490 touches `skills/multi/scripts/mirror-shim.test.mjs`, which is not among lane 59's 39 changed files, so lane 59's rework line does not name it. Lane 60b is the blocker lane for 60 and appears in lane 59's list only through its file overlap. (b) Lanes 60 and 60c: four-read reads the range `Base..Artifact` in the Artifact-repo (`/var/tmp/lane-60/dot`, `/var/tmp/lane-60c/dot`, which exist on Netcup, not on this host). The record's Base is a plugin-repo sha, and checked on Netcup read-only both ranges give "Invalid revision range" in the dotfiles repo, so rework is unavailable for both, not zero. (c) The script counts the lane's own close and accept record commits and unrelated lanes' commits that touch the same files (0ff833b appears under five lanes), so its counts are not rework in the owner's sense. (d) No 7-day window is closed.
4. Hosts. Netcup reached: the only claude-delegation lead transcript in the window is f6c8ae21; copied read-only to scratch with its subagents (295 files) and read. Hetzner reached: its newest claude-delegation transcript is 9/28 9:28 PM; sessions in the window there are other projects; no lane in the window was led there. Mac not reached (not tried; the 9/30 hand-off says it did not answer), so any Mac-led work, Mac plugin version, or Mac Fable session is unseen. BTO-project Fable sessions on Netcup were seen in a file listing only and not read (Ben's rule: BTO is not touched).
5. Which plugin version each pane ran. Only this desktop's cache dir was read (0.20.18 present, created 9/29 3:24:34 PM). The versions on the lead pane, skills-n (Netcup), skills-o and skills-a panes are unseen.
6. Idle versus busy. The census counts a wake as a turn opened by a note-flush delivery; a note that arrives inside a running turn is not counted. It does not record whether the pane had been idle for any length of time.
7. Concurrent lanes inside one lead session (lanes 59, 60, 60b on f6c8ae21) cannot be separated. Their tokens, stalls and spec slices overlap. Spec slices were not computed for lanes 58 and 59 (Spec-from equals Opened).
8. The Fable lead's own spend is not allocated to lanes except through each lane's spec slice. The Fable lead tokens between lanes (cleanup, decisions, bearings) sit only in the lead rows.
9. Non-cache bar. The hand-run baseline has no non-cache figure; the non-cache column has nothing to sit next to.
10. Lane naming. "Lane 59b" is the record `wr-2026-09-30-mirror-shim` (its Scope names 59b). `wr-2026-09-29-clear-done-accounted` is lane 58 by its spec path (`docs/specs/clear-done-58`).
11. A step stopped by a guard hook. After the lane census runs, one Bash call (a small Node script written to the scratchpad to sum both token definitions per lane from the census JSON files) was refused:

```
PreToolUse:Bash hook error: [C:/Users/benzh/.claude/hooks/secret-guard.sh pretooluse]: SECRET-GUARD: blocked — command references a secret file. Use ~/.claude/scripts/secret-tool.sh (check|fingerprint|sync|set|grep-safe|scrub) — it never prints values. To read a non-secret part of that file, copy the needed non-secret lines via secret-tool grep-safe.
```

I stopped that step. I did not retry that script by any other tool or shell. The lane figures in the table were instead copied from the four-read output files the earlier, approved `four-read.mjs` runs had already written (the script's own printed lines, read with the Read and Grep tools); the non-cache column is the input plus output from the script's own companion line, added by hand, and the lane census `leadTurns`, wakes and window lines came from the census markdown the same way. The with-cache and non-cache split for the spec slices alone was not computed. The earlier summary script `summ.mjs` (lead windows) ran before the refusal and is unaffected. The PostToolBatch hook output seen after one tool call was a report and did not stop anything.

## Exact commands run

Paths: R = `C:\Users\benzh\Code\zhuk-infra\claude-delegation` (forward slashes in the shell), L = `C:/Users/benzh/.claude/projects/C--Users-benzh-orca-workspaces-claude-delegation-gudgeon`, S = the session scratchpad `C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-Code-zhuk-infra-claude-delegation\7c8f73be-9876-404d-b713-1af6cd2df213\scratchpad`, NC = `S/netcup-lead`. All outputs went to S.

Reading
- Read: `~/.agents/lean-rules.md` (via `cat`), `docs/census.md`, `docs/plan-to-done-2026-09-30.md`, `docs/work/evidence/2026-09-29-bearings-{assessment,response,checks}.md`, `docs/work/evidence/baseline/hand-run-baseline.md`, `docs/work/evidence/wr-2026-09-29-baseline-review.md` (line 31), `docs/HANDOFF-2026-09-30-cleanup-and-pause.md`, `docs/RESUME-plugin-work.md`, the record files under `docs/work/` for the lanes above, the four-read and census outputs in S.
- `git log`, `git show --stat`, `git diff --name-only dff1e00c..72f736b6`, `git cat-file -t 9bc9490`, `git merge-base --is-ancestor 9bc9490 HEAD` in R.
- `stat -c '%w %n' ~/.claude/plugins/cache/*/delegation/0.20.18` and `0.20.17`.
- Pause time: `node S/findpause.mjs L/9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl` (prints only line number and timestamp of the owner's message).
- Fable sessions on this desktop: `node S/scan-fable.mjs /c/Users/benzh/.claude/projects 2026-09-29T19:24:00Z 2026-10-01T18:00:00Z` (counts assistant records per model per file; no content printed).
- cwd of the four other Fable sessions: `node S/cwd.mjs <4 files>` (prints cwd paths and counts).
- Plugin-version strings in the lead transcript: `node S/ver.mjs L/9c61c35a-...jsonl` (counts only; inconclusive, see unseen item 5).

Fable lead census (run in R, lead file `L/9c61c35a-82dd-4aef-8eca-c99bb0e72e31.jsonl`)
- Install to pause: `node scripts/build-census.mjs --lead <lead> --from 2026-09-29T19:24:00Z --to 2026-09-30T23:24:16Z --out S/lead-install-to-pause.md --json S/lead-install-to-pause.json`
- 24 h after install: same with `--to 2026-09-30T19:24:00Z`, outputs `S/lead-24h.*`
- 9/29 check window re-run: `--from 2026-09-28T19:00:00Z --to 2026-09-29T19:00:00Z`, outputs `S/lead-prior-0929check.*`
- 24 h before install: `--from 2026-09-28T19:24:00Z --to 2026-09-29T19:24:00Z`, outputs `S/lead-prior-24h-before-install.*`
- Summary of the JSON: `node S/summ.mjs <the four json files>`
- Other desktop Fable sessions: `node scripts/build-census.mjs --lead C:/Users/benzh/.claude/projects/C--Users-benzh-Code-Zhuk-Projects/<id>.jsonl --from 2026-09-29T19:24:00Z --to <2026-09-30T19:24:00Z or 2026-09-30T23:24:16Z> --json ... --out ...` for ids 4660b908-4d9d-4d60-9c72-bf5a3dd87ff8, 986a8552-39bb-4d3d-8683-560bdcc174e9, 9271b2b1-335f-4b86-b451-987a6268f407, 001c0ea5-7a97-490d-86ea-a6dcead32d75 (two exited 1 with "--from/--to window holds no assistant messages" for the 24 h window, 9271b2b1 and 001c0ea5, because they started later).
- First attempt of the 24 h, prior and 24 h-before runs failed with `build-census: --lead needs a value` (my shell variables were not set in the background subshells); rerun with the variables set on their own lines; no output of the failed attempts was used.

Netcup (read-only)
- `ssh ben@100.69.249.18 "bash -lc 'cd ~/Code/zhuk-infra/claude-delegation && git rev-parse --short HEAD && git status --short | head -5; sha256sum scripts/build-census.mjs scripts/four-read.mjs; ls ~/.claude/projects | head -30; ls -la ~/.claude/projects/*/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl; date -u; node --version'"` (its scripts differ from main's, HEAD 0c92605, so the Windows main scripts were used on a copy of the transcript).
- `ssh ben@100.69.249.18 "cd ~/.claude/projects/-home-ben-Code-claude-delegation && tar -cf - f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/subagents" | tar -xf -` into NC (340 MB, 295 agent files). Also `du`, `ls` listings of the same directory.
- Rework replication for lanes 60 and 60c: `git -C /var/tmp/lane-60/dot diff --name-only 1a76c542..ba985167` and the `/var/tmp/lane-60c/dot` equivalent, plus `git log --no-merges --since <accepted> --until <+7d> <artifact>..HEAD -- <files>`; both ranges returned "Invalid revision range".
- A `find ~/.claude/projects -name '*.jsonl' -newermt '2026-09-29 15:00:00'` with `grep -c claude-fable` per file (counts only) on Netcup and on Hetzner (`ssh ben@100.111.119.54`); Hetzner also `ls -la ~/.claude/projects/*/*.jsonl`.

Per-lane runs (generated by `node S/lanes.mjs`, one pass over all twelve records; commands as logged in `S/lanes-run-full.log`). For each record, `--from` = the record's Opened, `--to` = its last `accepted` Log time:
- Lane 40: `node scripts/build-census.mjs --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee --from 2026-09-29T19:17:00.000Z --to 2026-09-30T04:15:42.727Z --json S/lanes/L40-knowledge-triage.census.json --out ...census.md`; spec slice `--lead L/9c61c35a-...jsonl --from 2026-09-29T19:15:53.000Z --to 2026-09-29T19:17:00.000Z`; then `node scripts/four-read.mjs --record R/docs/work/wr-2026-09-29-knowledge-triage.record.md --census <census.json> --spec-census <spec.json> --ledger R/docs/ledger --lead-slug skills-a --git R --json ... --out ... --lead-session 01a0df4c-2809-7520-b1d7-876cc51a87ee`
- Lane 40b: Codex session as above, `--from 2026-09-30T03:00:00.000Z --to 2026-09-30T03:52:52.164Z`; spec slice `--from 2026-09-30T02:59:00.000Z --to 2026-09-30T03:00:00.000Z`; slug skills-a.
- Lane 59b: `--lead NC/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e.jsonl --from 2026-09-30T13:34:35.000Z --to 2026-09-30T13:49:02.000Z`; spec slice `--from 2026-09-30T13:34:00.000Z --to 2026-09-30T13:34:35.000Z`; slug skills-n.
- Lane 60: NC lead, `--from 2026-09-29T21:39:28.000Z --to 2026-09-30T02:56:05.000Z`; spec slice on the Fable lead file `--from 2026-09-29T21:22:00.000Z --to 2026-09-29T21:39:28.000Z`; slug skills-n.
- Lane 60b: NC lead, `--from 2026-09-30T01:53:46.000Z --to 2026-09-30T02:53:54.000Z`; spec slice on NC `--from 2026-09-30T01:50:00.000Z --to 2026-09-30T01:53:46.000Z`.
- Lane 60c: NC lead, `--from 2026-09-30T13:34:35.000Z --to 2026-09-30T14:18:47.000Z`; spec slice on NC `--from 2026-09-30T13:34:00.000Z --to 2026-09-30T13:34:35.000Z`.
- Lane 61: `--lead L/588290d9-ee43-400b-a808-cf44c407171c.jsonl --from 2026-09-29T21:54:57.000Z --to 2026-09-30T13:40:10.000Z`; spec slice on the Fable lead file `--from 2026-09-29T21:54:00.000Z --to 2026-09-29T21:54:57.000Z`; slug skills-o.
- Lane 63: 588290d9 lead, `--from 2026-09-30T22:30:34.000Z --to 2026-09-30T22:53:59.000Z`; spec slice on the Fable lead file `--from 2026-09-30T22:30:00.000Z --to 2026-09-30T22:30:34.000Z`.
- Retire continue: 588290d9 lead, `--from 2026-09-30T13:46:10.000Z --to 2026-09-30T14:05:05.000Z`; spec slice on the Fable lead file `--from 2026-09-30T13:34:00.000Z --to 2026-09-30T13:46:10.000Z`.
- Lane 58: NC lead, `--from 2026-09-29T19:27:04.000Z --to 2026-09-29T19:51:38.000Z`, no spec slice.
- Lane 59: NC lead, `--from 2026-09-29T21:13:00.000Z --to 2026-09-30T02:31:41.000Z`, no spec slice.
- Lane 57: NC lead, `--from 2026-09-29T07:30:00.000Z --to 2026-09-29T20:35:29.000Z`; spec slice on the Fable lead file `--from 2026-09-29T04:14:20.000Z --to 2026-09-29T07:30:00.000Z`.
- Every `four-read.mjs` call used `--ledger R/docs/ledger --git R` and `--lead-session` of the record's Lead-session. Exit codes: every `build-census.mjs` and `four-read.mjs` call in the table exited 0. Lanes 60 and 60c printed `fatal: cannot change to '/var/tmp/lane-60/dot'` (and `lane-60c`) on stderr, which is the unavailable rework above.
- Scripts in S that only read and count: `scan-fable.mjs`, `findpause.mjs`, `ver.mjs`, `cwd.mjs`, `summ.mjs`, `lanes.mjs`. The refused script was `lanetable.mjs` (not run).

Cleanup: no process was left running; nothing was started in the background beyond jobs that were waited on.
