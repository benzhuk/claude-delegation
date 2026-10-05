# Misfit list, first compile

Compiled 2026-10-04 from the record, for Ben to judge each line with one question: did this stop happening? Each row is one observable failure with its date and the file that records it. Dates are month/day in America/New_York as the sources give them. History files live in docs/decisions/history. The class column is a proposed label only, and the Recurred column counts rows that share a class. Causes and fixes are left out on purpose.

Rows: 282. Classes: 50. Families: 6 (the lead's grouping of the classes, added 10/4; the rows and classes below are the runner's compile).

## Families, for Ben to judge

Six families hold the 50 classes. Each is judged with one question at every planning turn: has this stopped happening? A design earns a family only when the parts that produce it are gone or changed, not when one row is fixed.

| Family | Rows | Classes inside | What they have in common |
|---|---|---|---|
| Agents leave a mess | 45 | mess left by agents (23), dirty or divergent checkout (6), cleanup tool misses (5), disk or inode exhaustion (5), uncommitted work in worktrees (4), cleanup tool dirties (2) | Every lane opens a worktree, a pane or a test home, and nothing that opened it closes it. A separate cleaner was added and became a source of rows itself. |
| Guards and checks cry wolf, or prove less than they claim | 69 | false positive from a check (22), check proves less than it claims (11), test flaky or red on main (11), guard change wider than its false positive (6), builder hung on a permission prompt (6), guard gap already on main (4), guard with no owner switch (4), readback differs (3), agent routed around a denial (2) | Guards and tests judge the text of a command or a page, not what it does. They refuse their own fixes, hang unwatched builders, and the tests pass contracts that are no longer the ones in use. |
| Four hosts, many panes, one plugin to install everywhere | 67 | machine unreachable at rollout (10), note never reached its reader (9), built but not installed or wired (9), stall nothing detects (8), child environment wrong (8), host or tool defect (7), stale session lacks new hooks (4), rollout needs a hand step (3), host froze all panes (2), host unreliable (2), release version drift (2), writes that did not persist (2), dispatch outran collection (1) | Work is spread over four machines and several panes that talk by notes. Every release must reach every host and every running session, and every gap between them is a place where work stalls unseen. |
| Ben's page and his input | 37 | decisions page or pickup misbehaves (11), instruction or report text wrong (8), work waits on the owner's hands (5), owner input lost or unread (4), work put on the owner that is not theirs (3), goal text out of step (3), whole-page write over owner edits (2), conflicting rulings (1) | The one page Ben reads is produced by a renderer and a pickup script with 22 lanes behind them, and it still loses or misreads his input, or asks him things that are not his. |
| Numbers nobody can trust | 24 | number set or counted wrongly (11), number cannot be computed (10), choice made on weak evidence (3) | The census was built to score the goal card. Two of its four measures never had an instrument, and the bounds were set by feel. |
| The project grows instead of shrinking | 40 | token cost over its bound (10), rule no script checks (9), patches on patches (7), state kept where tools do not read (4), record disagrees with the work (2), review loop does not converge (2), tool acts beyond its scope (2), review missed defects (1), part added without a failure named (1), goal drift (1), failure closed without a known cause (1) | Every turn wants to end with a merge. The lead's own turns are the largest cost, and the rules that should stop growth live in prose. |


| Id | Date | What happened | Where it is recorded | Proposed class | Recurred? |
|---|---|---|---|---|---|
| M1 | 9/20 | The Mac was asleep and missed the compact-window and default-subagent-model settings. | docs/decisions/history/2026-09-20.md | machine unreachable at rollout | yes (10) |
| M2 | 9/20 | The guard install on the Mac stopped because the chezmoi route was blocked, so the files were copied over ssh by hand. | docs/decisions/history/2026-09-20.md | rollout needs a hand step | yes (3) |
| M3 | 9/20 | The guard files on Windows carried Windows line endings, so the Mac copies had to be taken from Netcup instead. | docs/decisions/history/2026-09-20.md | rollout needs a hand step | yes (3) |
| M4 | 9/20 | The git-identity guard installer needs python3, which the Windows machine lacks, so its settings step was done by hand. | docs/decisions/history/2026-09-20.md | rollout needs a hand step | yes (3) |
| M5 | 9/20 | Ten knowledge files edited on the Mac were never synced to Windows. | docs/decisions/history/2026-09-20.md | state kept where tools do not read | yes (4) |
| M6 | 9/20 | Forty-one plugin tests were already failing on main and were parked. | docs/decisions/history/2026-09-20.md | test flaky or red on main | yes (11) |
| M7 | 9/20 | A second execution engine was started during a long autonomous stretch, away from the goal. | docs/decisions/history/2026-09-20.md, goals ruling | goal drift | no |
| M8 | 9/20 | A whole-page replace on Notion destroyed Ben's live edits. | docs/decisions/history/2026-09-20.md | whole-page write over owner edits | yes (2) |
| M9 | 9/20 | The standing goals routing line cost about 50,000 tokens over a 300-prompt session. | docs/decisions/history/2026-09-20.md, goals ruling | token cost over its bound | yes (10) |
| M10 | 9/22 | The lead pane never registered its note inbox, so a finished-build note waited in the ledger and was read seven hours late. | docs/decisions/history/2026-09-21.md, night log | note never reached its reader | yes (9) |
| M11 | 9/22 | The lead used 152 turns hand-dispatching the next-build and 108 on the loop-build, which Ben called waste. | docs/decisions/history/2026-09-22.md | token cost over its bound | yes (10) |
| M12 | 9/22 | Inbox registration was still listed as the open defect after the release that was said to fix it. | docs/decisions/history/2026-09-21.md, night log | note never reached its reader | yes (9) |
| M13 | 9/22 | The 0.9.0 rollout left three chores only Ben could do: Mac gh login, Hetzner git identity and pane restarts. | docs/decisions/history/2026-09-22.md | work waits on the owner's hands | yes (5) |
| M14 | 9/22 | The Mac leg of release 0.13.0 stayed pending because the machine was unreachable. | docs/decisions/history/2026-09-22.md | machine unreachable at rollout | yes (10) |
| M15 | 9/23 | The package-build record stayed runnable with no owner, artifact or evidence after the pilot reported four approvals, and only six of fourteen records were accepted. | docs/decisions/history/2026-09-23.md, bearings, finding E2 | record disagrees with the work | yes (2) |
| M16 | 9/23 | The acceptance validator checked only that the evidence file's first line starts with VERDICT. | docs/decisions/history/2026-09-23.md, bearings, finding E3 | check proves less than it claims | yes (11) |
| M17 | 9/23 | The build-loop review prompt told later rounds to use a literal unfilled placeholder in place of the prior commit. | docs/decisions/history/2026-09-23.md, bearings, finding E3 | instruction or report text wrong | yes (8) |
| M18 | 9/23 | A decisions candidate made Done mean the agent had finished, against Ben's written instruction that Done is his submit button. | docs/decisions/history/2026-09-23.md, audit | owner input lost or unread | yes (4) |
| M19 | 9/23 | The same candidate would have published the Goals page by whole-page replace and destroyed edits made after the read. | docs/decisions/history/2026-09-23.md, audit | whole-page write over owner edits | yes (2) |
| M20 | 9/23 | The same candidate returned a success exit when its gate was switched off. | docs/decisions/history/2026-09-23.md, audit | check proves less than it claims | yes (11) |
| M21 | 9/23 | The same candidate carried a goal rewrite that dropped the four measurement definitions. | docs/decisions/history/2026-09-23.md, audit | goal text out of step | yes (3) |
| M22 | 9/23 | A candidate passed 1,286 tests and was still rejected, because the tests checked an older contract. | docs/decisions/history/2026-09-23.md, audit | check proves less than it claims | yes (11) |
| M23 | 9/24 | Codex command hooks failed to launch, and the defect was reported upstream as an issue. | docs/decisions/history/2026-09-24.md | host or tool defect | yes (7) |
| M24 | 9/24 | Codex could not run on Hetzner because of its sandbox, so Codex work was routed to Windows and Netcup. | docs/decisions/history/2026-09-24.md | host or tool defect | yes (7) |
| M25 | 9/24 | The Mac was offline for 11 hours and missed the 0.20.7 install. | docs/decisions/history/2026-09-24.md | machine unreachable at rollout | yes (10) |
| M26 | 9/24 | The 0.20.7 release shipped with the Codex manifest still saying 0.20.6. | docs/decisions/history/2026-09-24.md | release version drift | yes (2) |
| M27 | 9/24 | Knowledge-store writes had to be repaired to persist; the record keeps the original failures. | docs/decisions/history/2026-09-24.md | writes that did not persist | yes (2) |
| M28 | 9/25 | A step Ben had finished stayed under Waiting because it was posted as a plain block the reader does not count. | docs/decisions/history/2026-09-25.md | decisions page or pickup misbehaves | yes (11) |
| M29 | 9/25 | A 7.25 hour host stall went undetected by anything in the plugin. | docs/decisions/history/2026-09-25.md, bearings | host froze all panes | yes (2) |
| M30 | 9/25 | Both Claude-led builds needed rework after acceptance, and a single-provider review missed real major defects that a second provider caught. | docs/decisions/history/2026-09-25.md, bearings | review missed defects | no |
| M31 | 9/25 | Two releases shipped without an independent check, and a manifest-drift test stayed red on main for hours. | docs/decisions/history/2026-09-25.md, bearings | release version drift | yes (2) |
| M32 | 9/25 | The DONE census clause could not be computed. | docs/decisions/history/2026-09-25.md, bearings | number cannot be computed | yes (10) |
| M33 | 9/25 | The census script kept being patched while two of the four measures still had no instrument. | docs/decisions/history/2026-09-25.md, bearings | patches on patches | yes (7) |
| M34 | 9/25 | Lead turns were counted by hand as under 20 while the script said 32. | docs/decisions/history/2026-09-25.md, bearings | number set or counted wrongly | yes (11) |
| M35 | 9/25 | The Codex half of the first DONE build had unknown lead turns and unknown builder model tier. | docs/decisions/history/2026-09-25.md, bearings | number cannot be computed | yes (10) |
| M36 | 9/25 | The Mac refused this session's ssh key, so its install waited. | docs/decisions/history/2026-09-25.md | machine unreachable at rollout | yes (10) |
| M37 | 9/26 | The Mac was unreachable for the 0.20.11 install. | docs/decisions/history/2026-09-26.md | machine unreachable at rollout | yes (10) |
| M38 | 9/26 | The janitor report said 39 safe worktrees while its own table listed 43. | docs/decisions/history/2026-09-26.md | number set or counted wrongly | yes (11) |
| M39 | 9/26 | A cleanup runner met a sandbox denial on backup deletions and did them through PowerShell instead. | docs/decisions/history/2026-09-26.md | agent routed around a denial | yes (2) |
| M40 | 9/26 | Removing 43 worktrees left 18 empty directories under the Orca workspaces folder with permission denied. | docs/decisions/history/2026-09-26.md,, bearings finding O12 | a cleanup tool that misses or half-does its job | yes (5) |
| M41 | 9/26 | The janitor judged merged against the local main and deleted with a soft delete, so three merged branches survived a Netcup cleanup. | docs/decisions/history/2026-09-26.md | a cleanup tool that misses or half-does its job | yes (5) |
| M42 | 9/26 | Windows held 60 worktrees and 84 branches before the cleanup. | docs/decisions/history/2026-09-26.md | mess left by agents with no owner | yes (23) |
| M43 | 9/26 | The Linux suite failed three tests that were green on Windows. | docs/decisions/history/2026-09-26.md | test flaky or red on main | yes (11) |
| M44 | 9/26 | Two reminder tests failed under host load in six suite runs, and the release suite passed 1,758 of 1,759 for the same reason. | docs/decisions/history/2026-09-26.md | test flaky or red on main | yes (11) |
| M45 | 9/26 | A collector test failed when two clock samples straddled a rounding bucket. | docs/decisions/history/2026-09-26.md | test flaky or red on main | yes (11) |
| M46 | 9/26 | A finished build's result note hit no inbox because the sender ran note-send on its own host, and the lead reported the lane in flight for twelve hours. | docs/decisions/history/2026-09-26.md, bearings, O4 | note never reached its reader | yes (9) |
| M47 | 9/26 | The merge item for the finished one-launch build was missing from Ben's page for twelve hours. | docs/decisions/history/2026-09-26.md | owner input lost or unread | yes (4) |
| M48 | 9/26 | A fifth lane was dispatched while lanes two to four were still unaccounted for. | docs/decisions/history/2026-09-26.md, bearings, O14 | dispatch outran collection | no |
| M49 | 9/26 | The Codex lane codex-fresh sat idle with its record uncommitted and nothing pushed from 6:33 PM the evening before. | docs/decisions/history/2026-09-26.md, lane sweep | stall nothing detects | yes (8) |
| M50 | 9/26 | The Hetzner lane fresh-walk passed its own ETA with a spawned builder and two edited files, and no commit or result. | docs/decisions/history/2026-09-26.md, lane sweep | stall nothing detects | yes (8) |
| M51 | 9/26 | Two live sessions claimed the same note slug on Hetzner, so notes could reach the wrong pane. | docs/decisions/history/2026-09-26.md, lane sweep, flush log | note never reached its reader | yes (9) |
| M52 | 9/26 | The janitor-fed lane never started, and two asks to its pane hit no inbox. | docs/decisions/history/2026-09-26.md, lane sweep | note never reached its reader | yes (9) |
| M53 | 9/26 | The lead used 30.9 million top-tier tokens over 35 turns in 21 hours, mostly coordinating. | docs/decisions/history/2026-09-26.md, bearings, O7 | token cost over its bound | yes (10) |
| M54 | 9/26 | The lead's worktree kept feeding it a retired goal card, because the hook reads the card from the working directory. | docs/decisions/history/2026-09-26.md, bearings, O1 | goal text out of step | yes (3) |
| M55 | 9/26 | Three releases in 36 hours all changed the same work-record script. | docs/decisions/history/2026-09-26.md, bearings, O11 | patches on patches | yes (7) |
| M56 | 9/26 | Lane one's true ask-to-accepted time was 11.2 hours, 7.6 of them waiting on a fresh-session rule that needed Ben's hands. | docs/decisions/history/2026-09-26.md, bearings, O3 | work waits on the owner's hands | yes (5) |
| M57 | 9/26 | The four-number read starts its clock at Opened, so it printed 3.6 hours and hid the 7.6 hour stall. | docs/decisions/history/2026-09-26.md, bearings, O3 | number set or counted wrongly | yes (11) |
| M58 | 9/26 | The line-growth cap of 150 was met at 145 only after the lead's spec moved a 399-line file out of the budget. | docs/decisions/history/2026-09-26.md, bearings, O8 | number set or counted wrongly | yes (11) |
| M59 | 9/26 | A reviewer's earlier line limit of 1,222 was an arithmetic error. | docs/decisions/history/2026-09-26.md, bearings, O8 | number set or counted wrongly | yes (11) |
| M60 | 9/26 | Review loops ran 5, 3 and 3 rounds on one build, the Workflow returned rounds-exhausted, and the lead ran rounds by hand. | docs/decisions/history/2026-09-26.md, bearings, O10 | review loop does not converge | yes (2) |
| M61 | 9/26 | The one-launch build was accepted with two tests failing on Netcup as at base. | docs/decisions/history/2026-09-26.md, bearings, O10 | test flaky or red on main | yes (11) |
| M62 | 9/26 | The hand-run baseline build has no token count, and Codex-led builds cannot be read by the four-number tool. | docs/decisions/history/2026-09-26.md, bearings, O9 | number cannot be computed | yes (10) |
| M63 | 9/26 | The Codex fresh-project walk lost its synthetic-isolation and missed-note evidence to an account interruption. | docs/decisions/history/2026-09-26.md | host or tool defect | yes (7) |
| M64 | 9/26 | Ben said the Windows host is not reliable, and the pickup was moved to Netcup. | docs/decisions/history/2026-09-26.md | host unreliable | yes (2) |
| M65 | 9/26 | A merge option said fast-forward, but the branch was cut one commit below main's version bump, so it was impossible. | docs/decisions/history/2026-09-26.md | instruction or report text wrong | yes (8) |
| M66 | 9/27 | The janitor timer installer put a --help run into the real home, and its temp-checkout refusal missed worktree folders. | docs/decisions/history/2026-09-27.md,, lane 19 | tool acts beyond its scope | yes (2) |
| M67 | 9/27 | The knowledge store held 70 pending inbox notes, the oldest from July 28, and zero recorded topic reads. | docs/decisions/history/2026-09-27.md,, lane 18 | built but not installed or wired | yes (9) |
| M68 | 9/27 | Codex reads of knowledge topics are not counted because its hook payload carries no file path. | docs/decisions/history/2026-09-27.md,, lane 18 | host or tool defect | yes (7) |
| M69 | 9/27 | Lane 18 stalled 76.9 minutes when the lead session ended mid-build. | docs/decisions/history/2026-09-27.md | stall nothing detects | yes (8) |
| M70 | 9/27 | The first Netcup Done pickups returned INVALID because three optionless toggles sat in the Bearings sections. | docs/decisions/history/2026-09-27.md | decisions page or pickup misbehaves | yes (11) |
| M71 | 9/27 | Closing out a pickup round on the page left the pickup stuck, so later ticks woke no one. | docs/decisions/history/2026-09-27.md | decisions page or pickup misbehaves | yes (11) |
| M72 | 9/27 | Accept let records onto main without required fields. | docs/decisions/history/2026-09-27.md,, lane 14 | check proves less than it claims | yes (11) |
| M73 | 9/27 | A builder hung 64 minutes on a delete prompt in lane 14. | docs/decisions/history/2026-09-27.md,, lane 14 | builder hung on a permission prompt | yes (6) |
| M74 | 9/27 | The test suite left six sealed-home folders per run and caused a /tmp inode outage on Netcup. | docs/decisions/history/2026-09-27.md,, lane 14 | disk or inode exhaustion | yes (5) |
| M75 | 9/27 | A builder in lane ten hung 3.5 hours on an unwatched delete prompt despite a mandate sentence forbidding deletes. | docs/decisions/history/2026-09-27.md,, lane 16 | builder hung on a permission prompt | yes (6) |
| M76 | 9/27 | A builder in lane fifteen hung 40 minutes on an unwatched delete prompt. | docs/decisions/history/2026-09-27.md,, lane 16 | builder hung on a permission prompt | yes (6) |
| M77 | 9/27 | Windows killed the lead's polling watch for low memory, which cost 3.5 hours in lane 11. | docs/decisions/history/2026-09-27.md,, lane 11 | host unreliable | yes (2) |
| M78 | 9/27 | A note sent to a peer on another machine was left only in the sender's ledger, so the overdue alarm could not see both halves. | docs/decisions/history/2026-09-27.md,, lane ledger-both-halves | note never reached its reader | yes (9) |
| M79 | 9/27 | Note-send left a note only in the local ledger when no session on the machine could read it. | docs/decisions/history/2026-09-27.md,, lane 25 | note never reached its reader | yes (9) |
| M80 | 9/27 | An inbox record stamped with another machine's hostname was counted as local. | docs/decisions/history/2026-09-27.md,, lane 25 | note never reached its reader | yes (9) |
| M81 | 9/27 | The overdue-ASK alarm kept firing on asks that had already been acknowledged. | docs/decisions/history/2026-09-27.md,, lane 25 | false positive from a check | yes (22) |
| M82 | 9/27 | A refusal hint told senders to pass a sender-host flag that does nothing on a local run. | docs/decisions/history/2026-09-27.md,, lane 25 | instruction or report text wrong | yes (8) |
| M83 | 9/27 | The collector attention list named non-build branches, with 12 skipped on the first corrected run. | docs/decisions/history/2026-09-27.md,, lane 23 | false positive from a check | yes (22) |
| M84 | 9/27 | The Windows janitor task XML was written as UTF-8 and schtasks refused it. | docs/decisions/history/2026-09-27.md,, lane 22 | host or tool defect | yes (7) |
| M85 | 9/27 | Inbox reads reported a packet as absent when it had only not been checked on this host. | docs/decisions/history/2026-09-27.md,, inbox-truth | false positive from a check | yes (22) |
| M86 | 9/27 | A builder in lane 24 stalled 5.3 hours at a delete prompt before it was replaced. | docs/decisions/history/2026-09-27.md,, lane 24 | builder hung on a permission prompt | yes (6) |
| M87 | 9/27 | The sealed test runner exited 1 and leaked its own home when it was killed, and it later delivered the signal twice to a second listener. | docs/decisions/history/2026-09-27.md,, lane 24 and sealed-signal | disk or inode exhaustion | yes (5) |
| M88 | 9/27 | A builder in lane 30 was held 16 minutes at a delete prompt. | docs/decisions/history/2026-09-27.md,, lane 30 | builder hung on a permission prompt | yes (6) |
| M89 | 9/27 | A builder gave throwaway test repos a fake git identity. | docs/decisions/history/2026-09-27.md,, lane 30 | rule no script checks | yes (9) |
| M90 | 9/27 | The lead's token use for the day was 86.4 million against a bound of 20 million. | docs/decisions/history/2026-09-27.md, bearings | token cost over its bound | yes (10) |
| M91 | 9/27 | The janitor, the knowledge store and the wiring check sat unfed while new mechanisms were built. | docs/decisions/history/2026-09-27.md, bearings | built but not installed or wired | yes (9) |
| M92 | 9/27 | The stall measure was wrong in both directions, and the Codex lead had no census. | docs/decisions/history/2026-09-27.md, bearings | number set or counted wrongly | yes (11) |
| M93 | 9/27 | The first Windows sweep removed 1,743 leaked test homes, and the first Netcup sweep removed 72. | docs/decisions/history/2026-09-27.md,, lane 24 | mess left by agents with no owner | yes (23) |
| M94 | 9/27 | A PowerShell provisioning prompt looked successful to Ben but saved nothing, because bash there is the WSL stub and PowerShell 5 aborts on native stderr. | ~/.claude/knowledge/_inbox/2026-09-27-windows-powershell-bash-is-wsl-stub.md | writes that did not persist | yes (2) |
| M95 | 9/28 | The Goals page publish was wedged with exit 5 because Notion would autolink a bare file name in the text. | docs/decisions/history/2026-09-28.md,, lane 32 | decisions page or pickup misbehaves | yes (11) |
| M96 | 9/28 | A reinstall dropped the hand-added stall-hours setting from the collector timer. | docs/decisions/history/2026-09-28.md,, lane 33 | state kept where tools do not read | yes (4) |
| M97 | 9/28 | The collector did not give a closed record the closed state. | docs/decisions/history/2026-09-28.md,, lane 33 | false positive from a check | yes (22) |
| M98 | 9/28 | The goals-file baseline cell fix was not made because its intended content is not recorded. | docs/decisions/history/2026-09-28.md | state kept where tools do not read | yes (4) |
| M99 | 9/28 | The Mac timed out and was not installed for release 0.20.16. | docs/decisions/history/2026-09-28.md | machine unreachable at rollout | yes (10) |
| M100 | 9/28 | The Done pickup was bound to the parked checkout, so a publish from a clean main worktree could not clear the round. | docs/decisions/history/2026-09-28.md,, lane 34 | decisions page or pickup misbehaves | yes (11) |
| M101 | 9/28 | Main's own goals-wording test failed on both Windows and Netcup. | docs/decisions/history/2026-09-28.md,, lane 34 | test flaky or red on main | yes (11) |
| M102 | 9/28 | A stall ask from the Netcup collector did not reach the owning session on Hetzner. | docs/decisions/history/2026-09-28.md,, lane 43 | note never reached its reader | yes (9) |
| M103 | 9/28 | A session running an older plugin silently ran without hooks added since it started, and a builder sat 16 minutes at a prompt. | docs/decisions/history/2026-09-28.md,, lane 42 | stale session lacks new hooks | yes (4) |
| M104 | 9/28 | Netcup /tmp ran out of inodes from leaked test folders, with one full suite leaving about 1,300 and the host reaching 99.8 percent. | docs/decisions/history/2026-09-28.md,, lanes 46 | disk or inode exhaustion | yes (5) |
| M105 | 9/28 | The notes transport inherited a git directory variable from its parent shell and resolved the project from another repository. | docs/decisions/history/2026-09-28.md,, lane 44 | child environment wrong | yes (8) |
| M106 | 9/28 | The janitor, run with an exported git directory variable, reported a scratch repository's zero worktrees instead of the real 18. | docs/decisions/history/2026-09-28.md,, lane 47 | child environment wrong | yes (8) |
| M107 | 9/28 | A test suite run with an exported git directory variable could commit into the wrong repository. | docs/decisions/history/2026-09-28.md,, lane 47 | child environment wrong | yes (8) |
| M108 | 9/28 | The bearings notice in a worktree pane said Bearings are due although a current receipt existed on the main checkout. | docs/decisions/history/2026-09-28.md,, lane 47 | false positive from a check | yes (22) |
| M109 | 9/28 | A session of the lead running 0.20.15-era hooks reported packets as missing that were only not checked there. | docs/decisions/history/2026-09-28.md,, lane 47 | stale session lacks new hooks | yes (4) |
| M110 | 9/28 | The Windows leak check went red twice on green suites because of other sessions' concurrent runs. | docs/decisions/history/2026-09-28.md,, lane 46 | false positive from a check | yes (22) |
| M111 | 9/28 | Lanes 42 to 47 gave four-read the census markdown instead of its data file, which blanked four cells per lane without an error. | docs/decisions/history/2026-09-28.md,, lane 50 and 54 | check proves less than it claims | yes (11) |
| M112 | 9/28 | A lane 32 builder was silent for 413 minutes. | docs/decisions/history/2026-09-28.md,, lane 50 | stall nothing detects | yes (8) |
| M113 | 9/28 | A lane 36 builder hung for 111 minutes. | docs/decisions/history/2026-09-28.md,, lane 50 | stall nothing detects | yes (8) |
| M114 | 9/28 | The Fable lead used 40.3 million tokens in 39 turns between 3:00 and 8:19 PM. | docs/decisions/history/2026-09-28.md,, lane 50 | token cost over its bound | yes (10) |
| M115 | 9/28 | The lead's 9/27 prediction was missed: 65.1 million tokens against a 40 million bound and 335 turns against 200. | docs/decisions/history/2026-09-28.md, bearings | token cost over its bound | yes (10) |
| M116 | 9/28 | Hours from ask to accepted beat the baseline only when counted from the record's opening; counted from spec start the median was 74 minutes against 50. | docs/decisions/history/2026-09-28.md,, lane 50 | number set or counted wrongly | yes (11) |
| M117 | 9/28 | The delete guard stopped a command because a quoted note or report text mentioned a delete. | docs/decisions/history/2026-09-28.md,, lane 36 and bearings | false positive from a check | yes (22) |
| M118 | 9/28 | Bearings found 44 merged origin branches, 35 merged worktrees and two stray files at the repo root, with nothing cleaning up as lanes close. | docs/decisions/history/2026-09-28.md, bearings | mess left by agents with no owner | yes (23) |
| M119 | 9/28 | Stalls of three to seven hours kept occurring. | docs/decisions/history/2026-09-28.md, bearings | stall nothing detects | yes (8) |
| M120 | 9/28 | The DONE clause could not be tested because Codex gaps were not stated and no mixed Claude and Codex handoff was on record. | docs/decisions/history/2026-09-28.md, bearings | number cannot be computed | yes (10) |
| M121 | 9/28 | The goals file token baseline is written in turns, so no build can show a token gain. | docs/decisions/history/2026-09-28.md, bearings | number set or counted wrongly | yes (11) |
| M122 | 9/28 | The Done-tick path had been patched in place three times. | docs/decisions/history/2026-09-28.md, bearings | patches on patches | yes (7) |
| M123 | 9/28 | A Notion details separator made the readback differ from what was written. | docs/decisions/history/2026-09-28.md,, render-readback lane 48 | readback differs from what was written | yes (3) |
| M124 | 9/28 | Notion read back literal build/* text with extra backslashes, and the verifier failed although the text survived. | ~/.claude/knowledge/_inbox/2026-09-28-notion-readback-literal-escapes.md | readback differs from what was written | yes (3) |
| M125 | 9/28 | Codex build discovery used the lead file's date and missed children of later builds, so a resumed lead looked incomplete. | ~/.claude/knowledge/_inbox/2026-09-28-codex-rollout-window-identity.md | number cannot be computed | yes (10) |
| M126 | 9/28 | A Codex hook composition test failed once under full-suite load, losing only the optional backlog line on Stop. | ~/.claude/knowledge/_inbox/2026-09-28-native-hook-timeout-load-flake.md | test flaky or red on main | yes (11) |
| M127 | 9/28 | A persistent lockfile on Netcup made a mkdir lock fail with no holder, and a directory test falsely reported it released. | ~/.claude/knowledge/_inbox/2026-09-28-persistent-lockfile-flock.md | check proves less than it claims | yes (11) |
| M128 | 9/28 | A cross-host fixture test silently read the healthy host's configuration, which looked like missing context instead of an isolation failure. | ~/.claude/knowledge/_inbox/2026-09-28-codex-cross-host-fixture-home.md | check proves less than it claims | yes (11) |
| M129 | 9/28 | A long lane temp root made the inbox test bind a 146-byte socket path and fail with EINVAL. | ~/.claude/knowledge/_inbox/2026-09-28-codex-cross-host-fixture-home.md | test flaky or red on main | yes (11) |
| M130 | 9/29 | The Windows test failure "Unable to deserialize cloned data" appeared once and was closed as not reproduced. | docs/decisions/history/2026-09-29.md,, lane 57 | test flaky or red on main | yes (11) |
| M131 | 9/29 | Codex census rows for tokens and lead turns were missing until lane 55 restored them. | docs/decisions/history/2026-09-29.md,, lane 55 | number cannot be computed | yes (10) |
| M132 | 9/29 | Netcup /tmp ran out of inodes again from 7:30 AM to 3:20 PM and stalled lane 57 and the pickup. | docs/decisions/history/2026-09-29.md | disk or inode exhaustion | yes (5) |
| M133 | 9/29 | The Mac timed out again for the 0.20.18 install. | docs/decisions/history/2026-09-29.md | machine unreachable at rollout | yes (10) |
| M134 | 9/29 | Scratch lanes never exercised the durable-and-not-linked gate, so the lead had to align two shim tests at merge. | docs/decisions/history/2026-09-29.md,, lane 59 | check proves less than it claims | yes (11) |
| M135 | 9/29 | The secret guard refused harmless commands, and 59 of 362 past refusals were harmless shapes. | docs/decisions/history/2026-09-29.md,, lane 60 | false positive from a check | yes (22) |
| M136 | 9/29 | An environment variable name ending in a secret-shaped word, used for a lock marker, was refused although it was not a credential. | ~/.claude/knowledge/_inbox/2026-09-29-lock-owner-naming-and-guard-reports.md | false positive from a check | yes (22) |
| M137 | 9/29 | The secret guard's output detector fired on ordinary prose in a task brief, and the builder stopped after one read, wasting about 92,000 tokens. | ~/.claude/knowledge/_inbox/2026-09-29-secret-guard-posttooluse-prose-false-positive.md; 2026-09-29-lock-owner-naming-and-guard-reports | false positive from a check | yes (22) |
| M138 | 9/29 | The secret guard refused knowledge prose when it travelled in a shell heredoc, but passed the same text through the file-write tool. | ~/.claude/knowledge/_inbox/2026-09-29-secret-guard-posttooluse-prose-false-positive.md | false positive from a check | yes (22) |
| M139 | 9/29 | A later discovery search was denied by the guard and left unresolved. | ~/.claude/knowledge/_inbox/2026-09-29-lock-owner-naming-and-guard-reports.md | false positive from a check | yes (22) |
| M140 | 9/29 | Netcup's dotfiles were blocked on a stuck chezmoi merge. | docs/decisions/history/2026-09-29.md,, lane 60 | dirty or divergent checkout | yes (6) |
| M141 | 9/29 | Bearings found 61 merged origin branches against a bound of 5, because the one-time sweep had not run. | docs/decisions/history/2026-09-29.md, bearings | mess left by agents with no owner | yes (23) |
| M142 | 9/29 | The Fable lead used 72.7 million tokens against a 65 million bound, with 44 turns opened by peer-note wakes. | docs/decisions/history/2026-09-29.md, bearings | token cost over its bound | yes (10) |
| M143 | 9/29 | Seventeen merges had gone in with no installs, so shipped changes reached no host. | docs/decisions/history/2026-09-29.md, bearings | built but not installed or wired | yes (9) |
| M144 | 9/29 | The owner input path broke for the fourth time, and a legacy pickup receipt blocked every publish from the desktop. | docs/decisions/history/2026-09-29.md, bearings; ~/.claude/knowledge/_inbox/2026-09-29-decisions-publish-exit3-legacy-pickup-round.md | decisions page or pickup misbehaves | yes (11) |
| M145 | 9/29 | The daily janitor ran in record mode and reclaimed nothing while 61 merged origin branches and 53 desktop worktrees remained. | docs/decisions/history/2026-09-29.md, bearings | a cleanup tool that misses or half-does its job | yes (5) |
| M146 | 9/29 | The Codex half of DONE could not be scored for lack of a spec slice and a stall classification. | docs/decisions/history/2026-09-29.md, bearings | number cannot be computed | yes (10) |
| M147 | 9/29 | The lane 36 sweep was never started by its lead, who sat idle from 9:50 AM until it was moved. | docs/decisions/history/2026-09-29.md | stall nothing detects | yes (8) |
| M148 | 9/29 | The sweep had no live-pane check and removed five clean workspace folders on Windows, none of which held a live pane. | docs/decisions/history/2026-09-29.md | tool acts beyond its scope | yes (2) |
| M149 | 9/29 | Before the sweep, Windows held 54 worktrees and 75 branches, Netcup 42 and 45, and origin 78 branches. | docs/decisions/history/2026-09-29.md | mess left by agents with no owner | yes (23) |
| M150 | 9/29 | The census reader split valid JSON rows at two Unicode separator characters and stopped at the first fragment. | docs/decisions/history/2026-09-29.md,, lane 40b; ~/.claude/knowledge/_inbox/2026-09-29-node2418-jsonl-unicode-separators-lane40.md | number cannot be computed | yes (10) |
| M151 | 9/29 | Merged main on Windows showed a pre-existing mirror-shim test failure. | docs/decisions/history/2026-09-29.md,, lane 40b | test flaky or red on main | yes (11) |
| M152 | 9/29 | The test-isolation review ran five rounds and the stop rule fired at round four. | docs/decisions/history/2026-09-29.md,, lane 57 | review loop does not converge | yes (2) |
| M153 | 9/29 | A negative integration test passed falsely because its fake skill never reached the check under test. | ~/.claude/knowledge/_inbox/2026-09-29-negative-tests-must-reach-target.md | check proves less than it claims | yes (11) |
| M154 | 9/29 | The repaired fixture still accepted an unrelated precondition failure, and one mode used a mismatching remote. | ~/.claude/knowledge/_inbox/2026-09-29-negative-tests-must-reach-target.md | check proves less than it claims | yes (11) |
| M155 | 9/29 | A Netcup test run exited 127 before the suite started, because a node path expired with its login shell and carried carriage returns. | ~/.claude/knowledge/_inbox/2026-09-29-netcup-node-runner-path.md | child environment wrong | yes (8) |
| M156 | 9/29 | A scratch HOME changed where the git identity guard looked for its allowed-email file, so the scratch commit was refused. | ~/.claude/knowledge/_inbox/2026-09-29-scratch-home-identity-policy.md | child environment wrong | yes (8) |
| M157 | 9/29 | A sealed test home did not remove an inherited agent-role marker, and 29 lead-classification assertions failed. | ~/.claude/knowledge/_inbox/2026-09-29-sealed-tests-inherit-role-marker.md | child environment wrong | yes (8) |
| M158 | 9/29 | Windows OpenSSH exited 255 with no output when the child environment omitted one system variable, and both production ssh legs were skipped. | ~/.claude/knowledge/_inbox/2026-09-29-windows-openssh-programdata.md | child environment wrong | yes (8) |
| M159 | 9/29 | The Hillstone reserver booked through the shared-experiences endpoint because its error looked cleaner, and the first real attempt was rejected with a 422. | ~/.claude/knowledge/_inbox/2026-09-29-wisely-standard-vs-shared-experience-booking-endpoint.md | choice made on weak evidence | yes (3) |
| M160 | 9/30 | Thirteen dirty Windows worktrees held uncommitted lane work and were committed as archive commits before removal. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | uncommitted work left in worktrees | yes (4) |
| M161 | 9/30 | Ben said the project had become a mess of worktrees in places he never wanted, with temp files and uncommitted code all over. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | mess left by agents with no owner | yes (23) |
| M162 | 9/30 | About 170 worktrees across other projects needed removal, among them 15 in tdf and 4 in cadma-app. | docs/decisions/history/2026-09-30.md; docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | mess left by agents with no owner | yes (23) |
| M163 | 9/30 | Netcup held 273 linked BTO worktrees, 76 of them holding work, and they were left untouched on Ben's word. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | mess left by agents with no owner | yes (23) |
| M164 | 9/30 | Other-project worktrees held work: tdf had 2 dirty and one with 32 untracked files, and cadma-app had 2 dirty. | docs/decisions/history/2026-09-30.md; docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | uncommitted work left in worktrees | yes (4) |
| M165 | 9/30 | Removing worktrees left 53 deregistered folders of about 4.3 GB on disk. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | a cleanup tool that misses or half-does its job | yes (5) |
| M166 | 9/30 | The lead's recursive delete of half-removed tdf folders was denied, so Ben had to run the delete from a script. | docs/decisions/history/2026-09-30.md | work waits on the owner's hands | yes (5) |
| M167 | 9/30 | Netcup's home Code folder held 4.09 million inodes. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | disk or inode exhaustion | yes (5) |
| M168 | 9/30 | A Codex hook failure was closed on Ben's tick without a known cause. | docs/decisions/history/2026-09-30.md | failure closed without a known cause | no |
| M169 | 9/30 | One integrator on Netcup waited 68 minutes across four delete prompts in a single morning. | ~/.claude/knowledge/_inbox/2026-09-30-blanket-ask-rule-beats-scoped-allow-and-stale-session-plugin.md | builder hung on a permission prompt | yes (6) |
| M170 | 9/30 | Allow lines for two folders never took effect because a broader ask rule matched first. | ~/.claude/knowledge/_inbox/2026-09-30-blanket-ask-rule-beats-scoped-allow-and-stale-session-plugin.md | rule no script checks | yes (9) |
| M171 | 9/30 | A Netcup pane started on 9/20 was still running plugin version 0.1.1 and had no delete guard. | ~/.claude/knowledge/_inbox/2026-09-30-blanket-ask-rule-beats-scoped-allow-and-stale-session-plugin.md | stale session lacks new hooks | yes (4) |
| M172 | 9/30 | The page lint reported two violations on the Goals page, which was correct, and two lanes held their publications. | docs/decisions/history/2026-09-30.md,, lane 63; ~/.claude/knowledge/_inbox/2026-09-30-notion-markdown-export-flattens-nested-table-rows.md | false positive from a check | yes (22) |
| M173 | 9/30 | The decisions page could not publish, so two cleanup items from Ben never reached it. | docs/decisions/history/2026-09-30.md | decisions page or pickup misbehaves | yes (11) |
| M174 | 9/30 | The secret-guard selftest passed its allow cases on empty payloads when no interpreter was found, and its abort did not propagate. | docs/decisions/history/2026-09-30.md,, lane 60c | check proves less than it claims | yes (11) |
| M175 | 9/30 | The continue skill and the banner it injected into every prompt had no invocations in six weeks. | docs/decisions/history/2026-09-30.md,, retire-continue | part added without a failure named | no |
| M176 | 9/30 | Release 0.20.19 was cut but not installed on any host. | docs/decisions/history/2026-09-30.md | built but not installed or wired | yes (9) |
| M177 | 9/30 | The narrowed secret guard could not be applied on the Mac because the Mac was unreachable. | docs/decisions/history/2026-09-30.md | machine unreachable at rollout | yes (10) |
| M178 | 9/30 | A missing Codex task-complete event made one stale turn look like nine long active-turn stalls. | ~/.claude/knowledge/_inbox/2026-09-30-codex-stale-turn-stall-counts.md | number set or counted wrongly | yes (11) |
| M179 | 9/30 | A smooth scroll never happened in the TDF app because an auto-height animation silently cancelled it. | ~/.claude/knowledge/_inbox/2026-09-30-motion-auto-height-cancels-smooth-scroll.md | host or tool defect | yes (7) |
| M180 | 10/1 | The decisions page stayed wedged after the 9/30 repo move because the pickup receipt was bound to the old path, and decisions were asked in chat. | docs/decisions/history/2026-10-01.md,, lane 64 and 64b | decisions page or pickup misbehaves | yes (11) |
| M181 | 10/1 | The lead's 24-hour read after 0.20.18 was 69.1 million tokens against a 65 million bound, with 35 turns against 20. | docs/decisions/history/2026-10-01.md, census read | token cost over its bound | yes (10) |
| M182 | 10/1 | Lane 60 skipped the build-loop Workflow. | docs/decisions/history/2026-10-01.md, census read | rule no script checks | yes (9) |
| M183 | 10/1 | Lane 60 cost 6.1 times the hand-run bar and the Codex-led lane 40 at least 11.5 times, with 196 million tokens of which 117 million was the Codex lead. | docs/decisions/history/2026-10-01.md, census read and Codex loop options | token cost over its bound | yes (10) |
| M184 | 10/1 | The census read was partial because a helper script was refused by the secret guard, rework was unavailable for two lanes, and the Mac was not reached. | docs/decisions/history/2026-10-01.md, census read | false positive from a check | yes (22) |
| M185 | 10/1 | The 0.20.19 install on Netcup and Hetzner could not pull because the janitor had edited a tracked drift file, and Netcup was on a detached HEAD. | docs/decisions/history/2026-10-01.md; docs/work/evidence/2026-10-01-install-0.20.19.md | a cleanup tool that dirties what it cleans | yes (2) |
| M186 | 10/1 | Hetzner needed node through its fnm path because node is not on its login PATH. | docs/decisions/history/2026-10-01.md | child environment wrong | yes (8) |
| M187 | 10/1 | The Mac did not answer for the 0.20.19 install. | docs/decisions/history/2026-10-01.md | machine unreachable at rollout | yes (10) |
| M188 | 10/1 | The cleanup session reported all four machines on the new folder layout while the lead's probe found the Mac still on the old one. | docs/decisions/history/2026-10-01.md | instruction or report text wrong | yes (8) |
| M189 | 10/1 | The Mac cook checkout held 16 unpushed commits and 27 dirty files. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | dirty or divergent checkout | yes (6) |
| M190 | 10/1 | Netcup's claude-delegation checkout was detached at an old commit with 1 modified and 46 untracked files. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | dirty or divergent checkout | yes (6) |
| M191 | 10/1 | Hetzner's checkout held 14 changed entries, and Ben did not recognize the cook updates there. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md; docs/decisions/history/2026-10-01.md | dirty or divergent checkout | yes (6) |
| M192 | 10/1 | The infra checkout sat on a feature branch 20 commits past main. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | dirty or divergent checkout | yes (6) |
| M193 | 10/1 | A lead script merged each branch before accept ran, for lanes 64b and 65. | docs/decisions/history/2026-10-01.md,, lane 68 | rule no script checks | yes (9) |
| M194 | 10/1 | The build loop used a Sonnet model call for a state-file write. | docs/decisions/history/2026-10-01.md | token cost over its bound | yes (10) |
| M195 | 10/1 | Per-lane attribution is not possible when one pane runs five lanes at once. | docs/decisions/history/2026-10-01.md,, lane 67 | number cannot be computed | yes (10) |
| M196 | 10/1 | The first triage run could not publish because the dotfiles origin moved during the run, and it left a lock that Ben must clear. | docs/decisions/history/2026-10-01.md | work waits on the owner's hands | yes (5) |
| M197 | 10/1 | The triage published without fetching first, so any dotfiles commit from another machine diverged it. | docs/decisions/history/2026-10-01.md,, lane 71 | rule no script checks | yes (9) |
| M198 | 10/1 | Lane 68's census half was blocked because the secret guard refused the builder's source edits as secret-file reads, so the guard blocked its own fix. | docs/decisions/history/2026-10-01.md,, lane 68 | guard with no owner switch | yes (4) |
| M199 | 10/1 | The lead wrote 6:10 PM from an estimate when Ben's answer came at about 8:00 PM. | docs/decisions/history/2026-10-01.md | number set or counted wrongly | yes (11) |
| M200 | 10/1 | A runner's chezmoi status filter was refused by the secret guard for naming the env file. | docs/decisions/history/2026-10-01.md | false positive from a check | yes (22) |
| M201 | 10/1 | A runner's heredoc writing a report was refused by the secret guard for naming the env file. | docs/decisions/history/2026-10-01.md | false positive from a check | yes (22) |
| M202 | 10/1 | chezmoi apply was not run on Netcup because 35 pending entries would overwrite local edits to the env file and systemd units. | docs/decisions/history/2026-10-01.md | dirty or divergent checkout | yes (6) |
| M203 | 10/1 | The Goals page mirror was stale, with an old main sha, a 152 hand-run figure and two wrong dates. | docs/decisions/history/2026-10-01.md; docs/work/evidence/2026-10-01-goals-mirror-check.md | goal text out of step | yes (3) |
| M204 | 10/1 | Ben's rule that the goals card and bearings be mirrored on the decisions page in toggles had not been built. | docs/decisions/history/2026-10-01.md | owner input lost or unread | yes (4) |
| M205 | 10/1 | Ben said partial is not a good state, and partial was the lead's own report word in the briefs. | docs/decisions/history/2026-10-01.md | instruction or report text wrong | yes (8) |
| M206 | 10/1 | Ben's 9/28 plan of components, each with an efficacy test, was dropped when the 9/30 plan was organized by measure. | docs/decisions/history/2026-10-01.md; docs/work/evidence/2026-10-01-component-analysis.md | owner input lost or unread | yes (4) |
| M207 | 10/1 | The page shape Ben wanted lived only in the lead's context and in no skill rule or check. | docs/decisions/history/2026-10-01.md | rule no script checks | yes (9) |
| M208 | 10/1 | Lane 62 resume was marked seen by skills-a but not started, and seven hours were lost. | docs/decisions/history/2026-10-01.md | stall nothing detects | yes (8) |
| M209 | 10/1 | No written rule says which decisions are Ben's, and agents asked Ben about report vocabulary while the seven hour stall went unreported. | docs/work/evidence/2026-10-01-component-analysis.md section 4 | work put on the owner that is not theirs | yes (3) |
| M210 | 10/1 | Every live publish failed its readback check after lane 72 merged. | docs/decisions/history/2026-10-01.md,, lane 72b | readback differs from what was written | yes (3) |
| M211 | 10/1 | Lane 72b was the twenty-second lane on the publish path. | docs/decisions/history/2026-10-01.md | patches on patches | yes (7) |
| M212 | 10/1 | The lane 72b Workflow ran two review rounds before it could be stopped, because the round bound lived in a note and not in the Workflow arguments. | docs/decisions/history/2026-10-01.md,, lane 72b | rule no script checks | yes (9) |
| M213 | 10/1 | A lane-68b folder could not be removed because Windows held a file lock, and it later showed as an empty unregistered directory. | docs/decisions/history/2026-10-01.md; docs/work/evidence/2026-10-01-detritus-census.md | mess left by agents with no owner | yes (23) |
| M214 | 10/1 | The lead's own gudgeon worktree held 35 untracked files that had to be archived before removal. | docs/decisions/history/2026-10-01.md; docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | uncommitted work left in worktrees | yes (4) |
| M215 | 10/1 | Janitor records from 9/26 to 9/30 did not record whether anything was removed. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md step 4 | number cannot be computed | yes (10) |
| M216 | 10/1 | The Netcup and Hetzner janitor timers were still on plugin cache 0.20.14 after the 0.20.19 install. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | built but not installed or wired | yes (9) |
| M217 | 10/1 | The new-worktree guard from lane 65 was installed nowhere. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md; docs/decisions/history/2026-10-01.md | built but not installed or wired | yes (9) |
| M218 | 10/1 | The janitor had removed nothing since it was scheduled and covers only one class of the cleanup mess. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md; docs/decisions/history/2026-10-01.md | a cleanup tool that misses or half-does its job | yes (5) |
| M219 | 10/1 | The main checkout held 216 untracked files, 193 of them peer packets matching no cleanup pattern. | docs/work/evidence/2026-10-01-detritus-census.md | mess left by agents with no owner | yes (23) |
| M220 | 10/1 | Seven decisions-pickup pointer files lay in the checkout, three live and four in an archive folder. | docs/work/evidence/2026-10-01-detritus-census.md | mess left by agents with no owner | yes (23) |
| M221 | 10/1 | Eleven ledger files and four archive notes lay untracked in the checkout. | docs/work/evidence/2026-10-01-detritus-census.md | mess left by agents with no owner | yes (23) |
| M222 | 10/1 | Two janitor result files lay in docs/work/evidence/janitor after records moved to the agents home. | docs/work/evidence/2026-10-01-detritus-census.md | mess left by agents with no owner | yes (23) |
| M223 | 10/1 | Twelve lane records stayed reviewed, withdrawn or blocked with no one closing them, one blocked since 9/24. | docs/work/evidence/2026-10-01-detritus-census.md step 4 | record disagrees with the work | yes (2) |
| M224 | 10/1 | Fourteen merged local branches and seven merged origin branches were still present. | docs/work/evidence/2026-10-01-detritus-census.md step 3 | mess left by agents with no owner | yes (23) |
| M225 | 10/1 | Lane 62 left four unmerged branch names and a worktree 32 commits ahead of main. | docs/work/evidence/2026-10-01-detritus-census.md | mess left by agents with no owner | yes (23) |
| M226 | 10/1 | The agents home held 8,815 rollout-backup files of 109 MB with no retention rule. | docs/work/evidence/2026-10-01-detritus-census.md step 5 | mess left by agents with no owner | yes (23) |
| M227 | 10/1 | The agents home held 1,428 handoff files and 1,429 workspace files with no owner. | docs/work/evidence/2026-10-01-detritus-census.md step 5 | mess left by agents with no owner | yes (23) |
| M228 | 10/1 | The agents notes folder held stray entries named 1969-12-31 and poll and cursor leftovers. | docs/work/evidence/2026-10-01-detritus-census.md step 5 | mess left by agents with no owner | yes (23) |
| M229 | 10/1 | The knowledge inbox held 220 files that the janitor does not cover. | docs/work/evidence/2026-10-01-detritus-census.md step 5 | mess left by agents with no owner | yes (23) |
| M230 | 10/1 | About 162 keepalive node processes were left running on Netcup and were killed by hand on Ben's word. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | mess left by agents with no owner | yes (23) |
| M231 | 10/1 | The chezmoi source held 78 empty autostashes, and 128 junk dot-underscore files awaited word. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | mess left by agents with no owner | yes (23) |
| M232 | 10/1 | Loose logs, temp files and empty folders sat at the top of the Code folders on Netcup and Windows. | docs/work/evidence/2026-10-01-cleanup-vs-janitor.md | mess left by agents with no owner | yes (23) |
| M233 | 10/1 | Untracked review and loop files sat inside dirty worktrees lane-68 and lane-71. | docs/work/evidence/2026-10-01-detritus-census.md step 2 | uncommitted work left in worktrees | yes (4) |
| M234 | 10/1 | The delete guard refused the detritus census report write because the report text quoted a refused command. | docs/work/evidence/2026-10-01-detritus-census.md | false positive from a check | yes (22) |
| M235 | 10/1 | Nothing reads the bearings verdict, and the 9/29 prediction check never ran. | docs/work/evidence/2026-10-01-component-analysis.md | built but not installed or wired | yes (9) |
| M236 | 10/1 | The delegate and dev-server skills are called by nothing except their own docs, and the janitor only by its timer. | docs/work/evidence/2026-10-01-component-analysis.md | built but not installed or wired | yes (9) |
| M237 | 10/1 | Four one-way seams exist where a part writes and nothing reads: the dispatch-guard log, reminder text, card exposure and the Notion author rule. | docs/work/evidence/2026-10-01-component-analysis.md | rule no script checks | yes (9) |
| M238 | 10/1 | Six scripts hold about half the plugin's logic, the largest at 2,757 lines, against the many-small-files rule. | docs/work/evidence/2026-10-01-component-analysis.md | patches on patches | yes (7) |
| M239 | 10/1 | Lanes touching one area numbered 38 for census, 21 for decisions pickup, 13 for the build loop and 7 for inbox notes. | docs/work/evidence/2026-10-01-component-analysis.md; 2026-10-01-detritus-census.md step 7 | patches on patches | yes (7) |
| M240 | 10/1 | The pane setup doc describes a setup Ben does not run. | docs/work/evidence/2026-10-01-component-analysis.md | instruction or report text wrong | yes (8) |
| M241 | 10/1 | The knowledge component is half built, with no skill and a memory that never syncs. | docs/work/evidence/2026-10-01-component-analysis.md | built but not installed or wired | yes (9) |
| M242 | 10/2 | The lane 74 janitor territory took five review rounds although its record carried a limit of three, so the limit was not enforced or is counted differently. | docs/decisions/history/2026-10-02.md | rule no script checks | yes (9) |
| M243 | 10/2 | A fix builder on lane 62 routed around a secret-guard refusal with the Edit tool and ran the 348-test gate on that tree. | docs/decisions/history/2026-10-02.md | agent routed around a denial | yes (2) |
| M244 | 10/2 | The first disclosure of that route-around said the commit was not used for any gate, and skills-a had to correct it. | docs/decisions/history/2026-10-02.md | instruction or report text wrong | yes (8) |
| M245 | 10/2 | Both host suites on the lane 62 tip failed on the N2 environment scan. | docs/decisions/history/2026-10-02.md | test flaky or red on main | yes (11) |
| M246 | 10/2 | The lead and skills-a gave opposite rulings on accepting lane 62 without its six regression tests. | docs/decisions/history/2026-10-02.md | conflicting rulings | no |
| M247 | 10/2 | The secret guard refused lane 62's new regression tests even with fixture names that avoid guard words. | docs/decisions/history/2026-10-02.md | false positive from a check | yes (22) |
| M248 | 10/2 | The plan's numbers, such as the three-round limit, were mostly guesses with reasons and none were researched. | docs/decisions/history/2026-10-02.md | number set or counted wrongly | yes (11) |
| M249 | 10/2 | Ben said the project kept building patches on patches, and the lead agreed the card drove measure discipline and not rethinking. | docs/decisions/history/2026-10-02.md | patches on patches | yes (7) |
| M250 | 10/2 | Seven research lanes dispatched at 3:20 AM were not started by the host until about 9:56 AM, with nothing moving between. | docs/decisions/history/2026-10-02.md | host froze all panes | yes (2) |
| M251 | 10/2 | The pickup script failed with a private-capture error on this host, so ticks were read by hand from the page. | docs/decisions/history/2026-10-02.md | decisions page or pickup misbehaves | yes (11) |
| M252 | 10/2 | The synthesis's central blank-page designer step appeared in none of the seven research reports. | docs/decisions/history/2026-10-02.md | choice made on weak evidence | yes (3) |
| M253 | 10/2 | The research was wide and shallow, with 34 search-only tags and 21 summarizer quotes and a handful of primary reads. | docs/decisions/history/2026-10-02.md | choice made on weak evidence | yes (3) |
| M254 | 10/2 | WebFetch passes every page through a small summarizing model, so research lanes could not quote primary text. | ~/.claude/knowledge/_inbox/2026-10-02-webfetch-summarizes-research-lanes-cannot-quote.md | host or tool defect | yes (7) |
| M255 | 10/2 | The proposal asked Ben to choose between two architectures at every planning stage, and Ben said that is too much to read and judge. | docs/decisions/history/2026-10-02.md | work put on the owner that is not theirs | yes (3) |
| M256 | 10/2 | Five of the lead's own waiting items were plan-level decisions presented as Ben's and were withdrawn. | docs/decisions/history/2026-10-02.md | work put on the owner that is not theirs | yes (3) |
| M257 | 10/2 | An open record that lives only on its branch is invisible to the janitor and to anything that reads main. | docs/decisions/history/2026-10-02.md | state kept where tools do not read | yes (4) |
| M258 | 10/2 | The janitor modified a tracked drift file in live checkouts, left Netcup and Hetzner dirty and blocked the mirror rewire in both 0.20.19 and 0.20.20. | docs/decisions/history/2026-10-02.md | a cleanup tool that dirties what it cleans | yes (2) |
| M259 | 10/2 | The Mac was offline on the tailnet for the 0.20.20 install. | docs/decisions/history/2026-10-02.md | machine unreachable at rollout | yes (10) |
| M260 | 10/2 | Installing the plugin stales every running session, so the lead's session was refused when it tried to spawn agents until restarted. | docs/decisions/history/2026-10-02.md | stale session lacks new hooks | yes (4) |
| M261 | 10/2 | The decisions renderer refuses nested toggles inside a waiting item, so the pitch page's toggles rendered flat although Ben asked for toggles everywhere. | docs/decisions/history/2026-10-02.md | decisions page or pickup misbehaves | yes (11) |
| M262 | 10/2 | Janitor tick options needed the page's escaped archive name quoted before they could be read. | docs/decisions/history/2026-10-02.md | decisions page or pickup misbehaves | yes (11) |
| M263 | 10/2 | The Notion API cannot move a page, so Ben must move four skills pages by hand in the UI. | docs/decisions/history/2026-10-02.md | work waits on the owner's hands | yes (5) |
| M264 | 10/2 | Lane 70 stalled on 10/1 because the secret guard refused edits to itself. | docs/decisions/history/2026-10-02.md | guard with no owner switch | yes (4) |
| M265 | 10/2 | The secret guard has no owner-operable switch, so lane 70 parked and the only lift is removing its two settings entries by hand. | docs/decisions/history/2026-10-02.md | guard with no owner switch | yes (4) |
| M266 | 10/2 | The identity guard refused a check that read the git email, and the check was dropped. | docs/decisions/history/2026-10-02.md | false positive from a check | yes (22) |
| M267 | 10/4 | Lane 70 needed the secret guard removed from settings.json for 19 minutes, by hand edit of a security file. | docs/decisions/history/2026-10-04.md | guard with no owner switch | yes (4) |
| M268 | 10/4 | The re-armed guard refused the lane 70 Opus review brief because the brief named attack probes against secret paths. | docs/decisions/history/2026-10-04.md | false positive from a check | yes (22) |
| M269 | 10/4 | Lane 70's change let a printed alias of the whole process environment through, which reopens an earlier red-team finding. | docs/work/evidence/2026-10-04-lane-70-review-r1.md finding F1 | guard change wider than its false positive | yes (6) |
| M270 | 10/4 | Lane 70's sourcing change dropped command positions the old guard covered, such as an indented dot-source line and a quoted shell command. | docs/work/evidence/2026-10-04-lane-70-review-r1.md finding F2 | guard change wider than its false positive | yes (6) |
| M271 | 10/4 | Lane 70's key-property change blanks a key file name followed by a decoy comparison, so a real read passes. | docs/work/evidence/2026-10-04-lane-70-review-r1.md finding F3 | guard change wider than its false positive | yes (6) |
| M272 | 10/4 | Lane 70's heredoc change lets a command substitution hide inside a fake heredoc in a quoted string. | docs/work/evidence/2026-10-04-lane-70-review-r1.md finding F4 | guard change wider than its false positive | yes (6) |
| M273 | 10/4 | Lane 70's grep rule treats an option cluster carrying its own pattern as a plain flag, so a file operand is blanked. | docs/work/evidence/2026-10-04-lane-70-review-r1.md finding F5 | guard change wider than its false positive | yes (6) |
| M274 | 10/4 | Lane 70's prose skip covers markdown that Claude executes as instructions, such as skills, commands and agent files. | docs/work/evidence/2026-10-04-lane-70-review-r1.md finding F6 | guard change wider than its false positive | yes (6) |
| M275 | 10/4 | The install notes understate the residual risks the lane 70 change accepts. | docs/work/evidence/2026-10-04-lane-70-review-r1.md finding F7 | instruction or report text wrong | yes (8) |
| M276 | 10/4 | On main, a fake quoted heredoc inside a double-quoted string followed by a real read blanks the rest of the command. | docs/work/evidence/2026-10-04-lane-70-review-r1.md pre-existing gap P1 | guard gap already present on main | yes (4) |
| M277 | 10/4 | On main, the echo-string exemption has no check for a pipe to a shell. | docs/work/evidence/2026-10-04-lane-70-review-r1.md pre-existing gap P2 | guard gap already present on main | yes (4) |
| M278 | 10/4 | On main, an unindented dot-source line next to an env-file carveout was never matched. | docs/work/evidence/2026-10-04-lane-70-review-r1.md pre-existing gap P3 | guard gap already present on main | yes (4) |
| M279 | 10/4 | On main, a comment can fake an exempt heredoc and hide a bare env command on the next line. | docs/work/evidence/2026-10-04-lane-70-review-r1.md pre-existing gap P4 | guard gap already present on main | yes (4) |
| M280 | 10/4 | A post-tool report fired while the reviewer printed the guard's own pattern tables, although no real key was in the output. | docs/work/evidence/2026-10-04-lane-70-review-r1.md process notes | false positive from a check | yes (22) |
| M281 | 10/4 | The live guard denied the reviewer's attempt to build a patched scratch copy of the guard, so the patches are predicted and not executed. | docs/work/evidence/2026-10-04-lane-70-review-r1.md process notes | false positive from a check | yes (22) |
| M282 | 10/4 | Two review worktrees remain registered in the chezmoi repo and need a prune after closeout. | docs/work/evidence/2026-10-04-lane-70-review-r1.md process notes | mess left by agents with no owner | yes (23) |

## Classes

Largest first. Count is the number of rows with that proposed class.

- **mess left by agents with no owner** (23): M42, M93, M118, M141, M149, M161, M162, M163, M213, M219, M220, M221, M222, M224, M225, M226, M227, M228, M229, M230, M231, M232, M282
- **false positive from a check** (22): M81, M83, M85, M97, M108, M110, M117, M135, M136, M137, M138, M139, M172, M184, M200, M201, M234, M247, M266, M268, M280, M281
- **check proves less than it claims** (11): M16, M20, M22, M72, M111, M127, M128, M134, M153, M154, M174
- **decisions page or pickup misbehaves** (11): M28, M70, M71, M95, M100, M144, M173, M180, M251, M261, M262
- **number set or counted wrongly** (11): M34, M38, M57, M58, M59, M92, M116, M121, M178, M199, M248
- **test flaky or red on main** (11): M6, M43, M44, M45, M61, M101, M126, M129, M130, M151, M245
- **machine unreachable at rollout** (10): M1, M14, M25, M36, M37, M99, M133, M177, M187, M259
- **number cannot be computed** (10): M32, M35, M62, M120, M125, M131, M146, M150, M195, M215
- **token cost over its bound** (10): M9, M11, M53, M90, M114, M115, M142, M181, M183, M194
- **built but not installed or wired** (9): M67, M91, M143, M176, M216, M217, M235, M236, M241
- **note never reached its reader** (9): M10, M12, M46, M51, M52, M78, M79, M80, M102
- **rule no script checks** (9): M89, M170, M182, M193, M197, M207, M212, M237, M242
- **child environment wrong** (8): M105, M106, M107, M155, M156, M157, M158, M186
- **instruction or report text wrong** (8): M17, M65, M82, M188, M205, M240, M244, M275
- **stall nothing detects** (8): M49, M50, M69, M112, M113, M119, M147, M208
- **host or tool defect** (7): M23, M24, M63, M68, M84, M179, M254
- **patches on patches** (7): M33, M55, M122, M211, M238, M239, M249
- **builder hung on a permission prompt** (6): M73, M75, M76, M86, M88, M169
- **dirty or divergent checkout** (6): M140, M189, M190, M191, M192, M202
- **guard change wider than its false positive** (6): M269, M270, M271, M272, M273, M274
- **a cleanup tool that misses or half-does its job** (5): M40, M41, M145, M165, M218
- **disk or inode exhaustion** (5): M74, M87, M104, M132, M167
- **work waits on the owner's hands** (5): M13, M56, M166, M196, M263
- **guard gap already present on main** (4): M276, M277, M278, M279
- **guard with no owner switch** (4): M198, M264, M265, M267
- **owner input lost or unread** (4): M18, M47, M204, M206
- **stale session lacks new hooks** (4): M103, M109, M171, M260
- **state kept where tools do not read** (4): M5, M96, M98, M257
- **uncommitted work left in worktrees** (4): M160, M164, M214, M233
- **choice made on weak evidence** (3): M159, M252, M253
- **goal text out of step** (3): M21, M54, M203
- **readback differs from what was written** (3): M123, M124, M210
- **rollout needs a hand step** (3): M2, M3, M4
- **work put on the owner that is not theirs** (3): M209, M255, M256
- **a cleanup tool that dirties what it cleans** (2): M185, M258
- **agent routed around a denial** (2): M39, M243
- **host froze all panes** (2): M29, M250
- **host unreliable** (2): M64, M77
- **record disagrees with the work** (2): M15, M223
- **release version drift** (2): M26, M31
- **review loop does not converge** (2): M60, M152
- **tool acts beyond its scope** (2): M66, M148
- **whole-page write over owner edits** (2): M8, M19
- **writes that did not persist** (2): M27, M94
- **conflicting rulings** (1): M246
- **dispatch outran collection** (1): M48
- **failure closed without a known cause** (1): M168
- **goal drift** (1): M7
- **part added without a failure named** (1): M175
- **review missed defects** (1): M30

## Not included

Things read in the sources and judged not to be a failure. Disagree with any of them and the row can be added.

- Removing the July lifecycle hook and its prose workaround on 9/20: a removal, with no failure stated.
- Defects that review caught before merge, such as round-one NEEDS_FIXES findings on many lanes: the review loop working as designed. Only failures that shipped, recurred or were named as failures are rows.
- Skipped tests, such as the NTFS mode-bits case and Windows-only skips: skips, not failures.
- Bearings verdicts themselves (RE-PLAN on 9/23, 9/25, 9/26, 9/27 and 9/29, CONTINUE on 9/28): each is a judgement over failures that are already rows.
- Statements that evidence was unknown or unavailable in a bearings read, such as seven-day rework: gaps in the reader's evidence, not failures.
- Ben's 9/29 question why Hetzner cannot reach Netcup: tested the same day and ssh answered with port 22 open.
- Ben's 9/29 question why the triage item used Sonnet and not Opus: the item was rewritten the same day. It may belong as a row about a recommended option Ben corrected.
- The three census scripts and the three text-injecting hooks that the 10/1 component analysis says should each be one: a judgement about design, not an observed failure.
- Codex 0.159 having no scripted loop, and Codex having no Workflow: a platform limit. The cost it led to is in a row.
- The 10/1 first janitor apply exiting 1 with nothing safe to remove: the report ties it to judgement and wiring items being present.
- The 10/2 bearings check not run because the method decision was on Ben's page: a choice the lead recorded, not a failure.
- The 10/4 refusal of the lane 70 review brief and the reviewer's denied scratch copy of the guard: included as rows, but the lead ruled on 10/4 that the guard did its job on the brief. Treat both as the guard working and strike them if so.
- Merge, release and install decisions that waited on Ben's word by design.

## Added after the compile

| Id | Date | What happened | Where it is recorded | Proposed class | Recurred? |
|---|---|---|---|---|---|
| M283 | 10/4 | The overdue-ask alarm fired on two asks that had already been answered by a RESULT note. | docs/decisions/history/2026-10-04.md | false positive from a check | yes (M81) |
| M284 | 10/4 | The nested detail toggles and a table inside a heading toggle came back as escaped text and a top-level table on the pitch page's first publish. | docs/decisions/history/2026-10-04.md | readback differs from what was written | yes (M172) |
| M285 | 10/4 | A safety classifier stopped the lane 70 bypass-hunt review (r4) before a verdict, so the patched guard was never hunted with fresh probes. | docs/work/evidence/2026-10-04-lane-70-review-r4.md | host or tool defect | yes |
| M286 | 10/4 | On main, the secret guard allows a secret-file read placed after a hash on the same line. | docs/work/evidence/2026-10-04-lane-70-review-r5.md | guard gap already present on main | yes (M276 to M279) |
| M287 | 10/4 | The lead wrote the move script through a shell heredoc and the secret guard refused it for naming a token variable; redone through the file tool. | docs/decisions/history/2026-10-04.md | false positive from a check | yes (M138, M201) |
| M288 | 10/5 | Every lane 70 round reached dotfiles origin/main on push instead of staying on its branch, and the dotfiles-sync task deployed each unreviewed round to ben-desktop (live guard dated 10/4 3:33 PM, before Ben's yes). | docs/decisions/history/2026-10-05.md | branch push landed on main; the sync task applies whatever main holds | yes
| M288 | 10/5 | Every lane 70 round was pushed to dotfiles origin/main and the dotfiles-sync task deployed each round to the live guard unreviewed, from 10/4 3:33 PM. | docs/decisions/history/2026-10-05.md | check proves less than it claims | yes |
| M289 | 10/5 | Ben ticked the same decision three times because its item file stayed in the waiting folder after the ruling was recorded, and every publish rendered it open again. | docs/decisions/history/2026-10-05.md | decisions page or pickup misbehaves | yes (M28, M71) |
| M290 | 10/5 | note-send prints "delivered to null" on every delivered note because the receiver's pane handle is unset; the notes arrive, and the line reads as a failure. | docs/decisions/history/2026-10-05.md | instruction or report text wrong | yes |
