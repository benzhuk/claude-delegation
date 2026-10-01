VERDICT: APPROVE 8abcc84c2365a8e389424a95fc8dd04140ef8c1a

# Review: lane 61 hand-run baseline and continue census (commit dab7c5f)

Scope: `docs/work/evidence/baseline/hand-run-baseline.md` and `docs/work/evidence/continue/census-0929.md` at dab7c5f. Read-only. No command was denied by a prompt, sandbox or guard hook. No secret file was opened, and no transcript text was printed: only the `timestamp`, `type`, `message.role` and content-block-type fields at the cited lines, plus counts.

## Finding 1 (minor, blocking because it is a factual error in a public evidence file): the 29 s window caveat names the wrong build

`hand-run-baseline.md:5` says: "Second, build 3's census window starts 29 s after the ask line used here (it starts at line 35, a fuller restatement of the line-13 ask)."

Evidence:
- Lines 13 and 35 are build 2's ask lines (row 2, `hand-run-baseline.md:10`, session 1a1af44b). Line 13 = 2026-09-08T13:27:43.966Z and line 35 = 2026-09-08T13:28:12.006Z, 28.04 s apart (about 29 s when rounded from the whole seconds). The N4 census `--from` is 2026-09-08T13:28:12.006Z, which is line 35.
- Build 3 (row 3, session caee6158) has ask line 6 = 2026-08-31T18:44:40.058Z, and the N2 census `--from` is that same value, so there is no offset.

The same sentence's first caveat ("the census windows for builds 2 and 3 also cover unrelated work running in the same session") may have the same numbering slip. I could not check it without reading turn text. The builder should confirm which builds it means.

Patch (`hand-run-baseline.md:5`):
- current: `Second, build 3's census window starts 29 s after the ask line used here (it starts at line 35, a fuller restatement of the line-13 ask).`
- replacement: `Second, build 2's census window starts 29 s after the ask line used here (it starts at line 35, a fuller restatement of the line-13 ask).`

Predicted outcome: the caveat then matches row 2's evidence cell, which already says "ask 13 (09:27:43; restated at 35, 09:28:12)", and the N4 census window.

## Baseline file: what was verified (no defects)

Spot-check of builds 1 (N3, Netcup, 97a20911) and 4 (W1, Windows, 59c7d404). Each cited line is a `type=user, role=user` record unless noted:
- Build 1: the timestamps match the file at every cited line. Ask 17397 is 2026-09-15T00:55:07.387Z = 20:55:07 ET. Accept 21069 is 13:21:30.355Z = 09:21:30 ET next day. Conditional go 19669 is 23:31:30 ET. Rework 21087 is 09:23:00 and 21403 is 09:43:46, both after the accept. For the stall, line 20193 is assistant at 02:25:36 and line 20216 is a meta user record at 04:41:36, so 2.27 h is correct.
- Build 4: the timestamps match. Ask 46 is 18:01:33 ET. Accept 845 is 22:43:44 ET. For the gap, line 674 is an attachment at 18:37:22 and line 675 is a tool_result at 21:39:46, so 3.04 h is correct. A scan of every event gap in lines 46 to 845 finds exactly this one gap over 2 h. The same scan finds no gap over 2 h in build 5 (1046 to 1631), which matches its row. Build 5's ask 1046 (17:55:53) and accept 1631 (21:55:04) timestamps also match.
- Extra check: build 1's "~58 files" is correct. Its window has 58 distinct repo-relative paths edited across the lead and 91 subagent transcripts.
- Hours arithmetic for all 5 rows: 12h26m23s = 12.44, 8h40m58s = 8.68, 1h34m59s = 1.58, 4h42m11s = 4.70, 3h59m11s = 3.99. All correct.
- Medians: tokens sorted 8,446,104 / 11,407,524 / 17,298,421 / 46,706,274 / 132,533,844, median 17,298,421. Hours median 4.70. Rework (2,1,0,0,0) median 0. Lost (1,2,0,1,0) median 1. All correct.
- Tokens: all 5 figures equal the candidate list (`candidates.md` lines 41, 53, 78, 90, 102). They also equal the build-census output itself: `out/N3.json`, `N4`, `N2`, `W1` and `W2`, taking `combined` and `lead.windowByModel` for the top-tier model and summing input + cache_creation + cache_read + output. That gives 132,533,844 / 46,706,274 / 17,298,421 / 8,446,104 / 11,407,524. The census `--from`/`--to` values in `out/cmds.txt` and `out/cmds2.txt` match the candidate windows, and the Netcup builds use the corrected cmds2 pass that includes `--tasks`.

## Census file: what was verified (no defects)

- The cited source files have no diff between fef771a (the HEAD the file cites) and dab7c5f.
- String 1 matches `scripts/continuation.mjs:69` character for character, and it is returned at :231, :236 and :249.
- String 2 matches `scripts/continuation.mjs:179` character for character. The summary format is built at :178, the peer-only `snapshot=unknown` path is at :193-196, `stopResult` is at :192-203, the diagnostic is at :199, and the off switches are at :42.
- `hooks/multi-hook-core.mjs`: `STOP_REASON` at :144-145 matches the quoted text exactly. The block wrapper `output: { decision: 'block', reason: text }` is at :181, the peer-append is at :175-178, and the additionalContext wrap is at :186-198. All confirmed.
- Wiring claims confirmed:
  - `hooks/hooks.json` lines 8/34/50/67 are SessionStart/UserPromptSubmit/Stop/PostToolUse via `multi-inbox.js`.
  - Neither hooks json contains "continuation".
  - `hooks/codex-hooks.json:3-7` holds five events.
  - Other cited locations are correct: `multi-inbox.js:43-44`, :295-299 and :378/:402, and `multi-codex-hook.mjs:34-35` and :258/:268.
  - `continuation-native.mjs` is 201 lines. `SKILL.md` is 49 lines, with its description at line 3 and the commands at 32-37.
  - Commits 2f2d928 (17:33 ET), d79056b and 2b21a37 are all dated 2026-09-23.
- The headline follows from the tables:
  - Skill columns are 0 in every row on all three hosts.
  - The (b2) Claude column is 3, only in Windows W39, and all 3 are probe. That matches section 5 (one session, 2026-09-23, 23:32/23:41/23:43).
  - Epoch totals add up: 463+158=621 (17+2=19 probe), 717+318=1035 (5+26=31), 46+105=151 (10+0=10). Section 6 repeats the same totals.
  - File-count sums hold: 1509+1=1510, 5988+12=6000, 196+22=218.
  - Week starts are correct: 2026-08-17 and 2026-09-28 are Mondays and ISO W34 and W40.

Advisory (non-blocking): `census-0929.md:17` says the Stop text is "returned as `reason` at :181". On the peer-only path, :181 returns it as `context` instead. `composeContinuationResult` (:172) accepts either one, so the conclusion stands.

## Privacy (both files)

Pattern counts (case-insensitive), with no match text printed:
- Notion / notion.so / notion.site / any `http(s)://` URL: 0 in both files.
- Client and project names from the candidate list (the two work-project names, the web-app and pipeline repo names, the four person names from the candidate asks, the new-project name, the analytics vendor): 0 in both files. The baseline uses "work project A/B" throughout.
- Key-shaped strings (`sk-`, `ghp_`, `gho_`, `github_pat`, `AKIA`, `eyJ`, `xox[bp]`, `AIza`, PEM headers, ssh keys, 32+ hex): 0 real.
  - Baseline: 1 `sk-` hit at line 5, which is the "ask-to" in "t**ask-to**-accept".
  - Census: 2 runs of 32+ `[A-Za-z0-9_-]` at line 120, which are a session UUID (36 chars) and a temp directory name (39 chars). Neither is a key.
- Tailnet IPs and email addresses: 0 in both files.

Advisory (non-blocking, outside the brief's categories): `census-0929.md` names the three machine hostnames (lines 52/111, 69/112, 86/113; the Netcup one is a 20-digit provider server ID). It also names a scratch temp cwd path (line 120). If host identity should stay out of a public repo, replace them with "Windows / Netcup VPS / Hetzner VPS".

## r2 (delta re-review at 8abcc84)

- Finding 1 is fixed. `git diff dab7c5f 8abcc84 -- docs/work/evidence/baseline` changes one line (`hand-run-baseline.md:5`), and the word-level diff is exactly `3's` -> `2's`. Nothing else under `docs/work/evidence/baseline` changed. The only other file in the commit is this review file.
- First caveat ("the census windows for builds 2 and 3 also cover unrelated work"):
  - I ran one read-only, counts-only pass over the five census windows, using the same `--from`/`--to` values as `out/cmds*.txt`.
  - A guard hook blocked that step. The Bash tool returned this, verbatim: `PostToolUse:Bash hook blocking error from command: "C:/Users/benzh/.claude/hooks/secret-guard.sh posttooluse": [C:/Users/benzh/.claude/hooks/secret-guard.sh posttooluse]: SECRET DETECTED IN OUTPUT: a key-shaped literal is now in the transcript (tool: Bash). Tell Ben immediately; the value must be rotated; offer secret-tool.sh scrub after rotation.`
  - The printed output was counts only: subagent-file counts, token sums, and turn counts per build. I saw no key-shaped text in it. The pass did read the lead transcripts' user-turn text in memory to count turns, and those transcripts are already known to hold one pasted token-like string (`candidates.md` line 15). I stopped the step there and did not re-run it. Ben should treat the hook alert as live until he has checked it.
  - What the halted pass showed: no build window (1 to 5) has a subagent that started before the ask and was still active inside the window. So builds 2 and 3 carry no leftover subagent work from earlier in the session, and nothing in these counts supports or refutes "unrelated work" for builds 2 and 3. Owner text turns in the window: build 2 has 9, build 3 has 8. Settling the question needs a read of turn text, which this review does not do.
  - Not blocking. The caveat only hedges the token figures (it says they may overstate a build). No number in the table depends on it.
- The verdict moves to APPROVE for 8abcc84 on the evidence content. The guard-hook alert above still stands and needs Ben's attention.
