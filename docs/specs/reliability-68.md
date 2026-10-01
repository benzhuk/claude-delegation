# Lane 68: nothing lost or stalled (plan items 11 to 14, one lane)

Written 10/1 5:20 PM America/New_York by skills-f. Measure moved: work lost or stalled, and denials per build. Check at the next census: every stall in the window is attributed to a named cause by the census, and the stale-version and wrong-inbox causes show zero.

## Scope, pinned
1. **Stale plugin version advisory (item 13).** A SessionStart check compares the plugin version the session is running with the one installed in the plugin cache and prints one line, "plugin 0.20.18 running, 0.20.19 installed: restart this pane", when they differ. Nothing else; no auto-restart. Today four panes kept 0.20.18 after the install until Ben restarted them by hand.
2. **Inbox registration from main-session events only (item 14).** Subagent hook events re-register the lead's inbox under the subagent's cwd, so notes land in a probe folder. Register only from the main session's own events, and refuse a recipient repo that is not a git checkout. Evidence today: skills-a's registration pointed at the removed `orca/workspaces/claude-delegation/gudgeon` folder for 20 hours.
3. **Frozen pane flagged (item 11).** The stall census flags a pane whose transcript stops while its work record is open and in a working state, with the gap length, as "pane silent" distinct from "waiting on a peer". The plugin cannot fix Orca's occlusion freeze; it can name it. The team-build and runner briefs already say a PostToolUse guard report is a report, not a block; check that sentence is in every shipped brief template and add it where missing.
4. **Secret guard denials counted (item 12).** The census reads the guard's log and reports denials per build. The denoised-prose detector pattern that is still open is narrowed with a test from today's refusal (`docs/work/evidence/2026-10-01-census-read-0.20.18.md`, item 11: a scratchpad script that only summed census JSON was refused as "references a secret file"). No new bypass flag.
5. Tests for 1 to 4.

## Not in scope
Any change to Orca; the multi protocol's envelope; the janitor; anything in lane 65 or 64b.

## Build shape
Through the build-loop Workflow as lane 67 left it, so this lane's record carries a `Workflow:` line and its own per-lane numbers. Sonnet builds, Opus reviews, one red-team round at most. Worktree under `<repo>/.claude/worktrees/`. Full suite once on Netcup and once on Hetzner at accept, none on Windows. Merge under the 9/26 grant. No release in this lane.

Every execution brief carries: if any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Due on main: 10/2 3:00 PM America/New_York.

## Added 10/1 5:40 PM NY (lead ruling, before the lane started)
6. The build-loop's per-phase state-file write runs on Haiku, not Sonnet (`build-loop-workflow.js` near line 567). One model and one test assertion; nothing else changes.
7. Added 5:30 PM NY from the 64b and 65 reports: the lead-side merge step refuses when the lane's record is not `Status: accepted` on the branch being merged, with a test. Accept before merge, always.
