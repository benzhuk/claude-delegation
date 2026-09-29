Work: wr-2026-09-29-test-ipc
Scope: the spec section of this record (lane 57), from packet docs/notes/skills-fable-lane-57-1.md read at 0b517ba
Owner: skills-n
Status: owned
Authority: build, review, integrate, push build/test-ipc-57-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; run the suite on Netcup under scratch dirs; the live Windows full gate is coordinated with skills-a, one suite per machine; no install, no release
Next: stop rule fired; a fresh Sonnet builder applies lead-ruling-r4 (R4-1, R4-2, R4-4, R4-7 patches plus the Known limits paragraph), then the same reviewer delta-verifies
Worktree: build/test-ipc-57-1
Scratch: /var/tmp/lane-57
Opened: 2026-09-29T07:30:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T04:14:20Z
Base: 0b517bab993ae1a3c70c6fa4caeb4b1375135fb5
Log: 2026-09-29T07:32:29.000Z owned skills-n picked up skills-fable-lane-57-1 (ACKed earlier as skills-n-lane-57-1) after lane 53 closed; worktree from origin/main at 0b517ba; the pinned hypothesis's fix is already on main (run-tests.mjs strips NODE_TEST_CONTEXT and NODE_TEST_WORKER_ID, and spawns with process.execPath), so the lane starts with diagnosis
Log: 2026-09-29T07:33:11.000Z owned skills-n Sonnet builder a5e5c7ba904a02656 spawned with the five-step Research line, diagnosis before fix, ETA 60 min
Log: 2026-09-29T07:44:08.000Z owned skills-n Sonnet builder a5e5c7ba904a02656 DONE, no cause confirmed on Linux (4 concurrent full suites under CPU stress, all 3024 pass; a 3-level garbage-byte probe never produced the error); two real env gaps found in test files, run-tests.test.mjs childEnv spawns keep NODE_TEST_WORKER_ID and test-home.test.mjs spawnAndSignal passes no env; nothing changed; diagnosis at docs/specs/test-ipc-57/diagnosis.md; ruling asked of skills-fable
Log: 2026-09-29T08:35:48.000Z owned skills-n skills-fable ruled A (skills-fable-lane-57-2, ACK skills-n-lane-57-3): fix both gaps and make the rule mechanical in the N2 scanner (skills/multi/scripts/hooks.test.mjs:434), territory extended to the two test files, the scanner and its test; no Windows repro now, close as not reproduced with a reopen trip-wire
Log: 2026-09-29T08:36:06.000Z owned skills-n Sonnet fix builder a74bdb75006b180e2 spawned: scanner red first, then both gaps, ETA 45 min
Log: 2026-09-29T08:52:47.000Z delivered skills-n Sonnet fix builder a74bdb75006b180e2 DONE 0824e76e0372390f7309756462053a4cb8aba489 (scanner red at b63db1a on test-home.test.mjs:66 and :523, 9 reasoned exemptions; both gaps fixed; full suite 3030 tests 3025 pass 0 fail); report docs/specs/test-ipc-57/build.md
Log: 2026-09-29T08:56:21.000Z delivered skills-n Windows full suite at 0824e76: 3030 tests, 2996 pass, 1 fail (N2: all 9 exemptions miss on win32 because the keys use / and the scanner reports backslash paths); fix folded into the round after the Opus review; evidence docs/specs/test-ipc-57/win-0824e76-fail.md
Log: 2026-09-29T09:02:31.000Z rejected skills-n Opus reviewer a6d6df3d585206a42 NEEDS_FIXES (8) 0824e76 (F1 a measured false green, the call extent is not comment-aware; F2 file:line exemption keys; F3 to F5 scope gaps); ruling docs/specs/test-ipc-57/lead-ruling-r1.md adds W1 (path separators) and removes the inert -e special case; a fresh Sonnet builder, the prior one being over 150k tokens
Log: 2026-09-29T09:02:49.000Z owned skills-n fresh Sonnet fix-round-1 builder af9f91cafc871abba spawned on lead-ruling-r1.md, ETA 60 min
Log: 2026-09-29T09:27:15.000Z delivered skills-n fix-round-1 builder af9f91cafc871abba DONE 1135839b7dac29bb8520094aa982af07821aaab2 (W1 and F1 to F8; red at 0824e76 for W1, F1, F2 both ways, F4 and F7; 1167b9a red re-confirmed; 8 files and 14 sites exempted by count; full suite 3035 tests 3030 pass 0 fail); report docs/specs/test-ipc-57/build-r1.md
Log: 2026-09-29T09:30:50.000Z delivered skills-n Windows full suite at 1135839: 3035 tests, 3002 pass, 0 fail, 33 skipped (the one printed probe failure is run-tests.test.mjs's intentional nested child); Opus delta review r2 sent to a6d6df3d585206a42
Log: 2026-09-29T19:24:39.000Z rejected skills-n Opus delta reviewer a6d6df3d585206a42 NEEDS_FIXES 1135839 by static trace (R1 HIGH, an env key set to the parent process environment inside a multi-line template still slips; R2 MEDIUM, regex literals mis-extend a call, the fix is a loud tripwire; R3 LOW, false reds). Stall: from about 07:30 to 15:20 NY every shell on Netcup failed with ENOSPC because /tmp had 0 free inodes; the reviewer could not measure, and the lead could not record or spawn until /tmp was freed
Log: 2026-09-29T19:24:56.000Z owned skills-n ruling r2 written (R1 to R3 adopted, F7 as built accepted); a fresh Sonnet fix-round-2 builder spawned, the r1 builder being over 150k tokens, ETA 45 min
Log: 2026-09-29T19:31:23.000Z delivered skills-n fix-round-2 builder a5d58c760806b036f DONE 9e36a082ab6516103c993766bb417f69cddd3040 (R1 to R3 each red at 1135839 and green after; the note-inbox mutation is flagged at 369; per-file exemption counts match with zero offenders; full suite 3038 tests 3033 pass 0 fail); report docs/specs/test-ipc-57/build-r2.md
Log: 2026-09-29T19:34:30.000Z delivered skills-n Windows full suite at 9e36a08: 3038 tests, 3005 pass, 0 fail, 33 skipped (the printed probe failure is run-tests.test.mjs's intentional nested child); fresh Opus reviewer a8b20b656347dd02d on review r3
Log: 2026-09-29T19:46:08.000Z rejected skills-n fresh Opus reviewer a8b20b656347dd02d NEEDS_FIXES (5) 9e36a08 (N1 and N2 blocking, silent passes on composite env values and on a regex-desynced extent; N3 to N5 low); lead intervention ruling r3 adopts the measured patches, with flag-when-unsure and a stop rule; the round-2 builder a5d58c760806b036f resumes (under 150k)
Log: 2026-09-29T19:56:14.000Z delivered skills-n Sonnet builder a5d58c760806b036f fix round 3 DONE ae7dfce (N1 to N5 per lead-ruling-r3, each fixture red at 9e36a08 and green after; exemptions 15 sites in 10 files, zero offenders; three files 95 pass, full suite 3043 tests 3038 pass 0 fail); report docs/specs/test-ipc-57/build-r3.md
Log: 2026-09-29T20:08:31.000Z rejected skills-n Opus reviewer a0f9c69898dd85c75 NEEDS_FIXES (8) ae7dfce (R4-1 a regex after => desyncs the scanner and passes an env-less node spawn silently, R4-2 an env key anywhere in the call seals it, R4-3 inheritance through a variable, R4-4 env undefined in an options variable, R4-5 and R4-6 design limits, R4-7 and R4-8 low); Windows suite at ae7dfce PASS 3043 tests 3010 pass 0 fail; the stop rule fires, ruling r4 ships with the limit documented, docs/specs/test-ipc-57/lead-ruling-r4.md

## Spec (lead, from the packet)

Defect: on a loaded Windows full gate at cd5fecc (lane 55, skills-a), scripts/run-tests.test.mjs failed as a whole file process with "Unable to deserialize cloned data due to invalid or unsupported version." Three standalone runs of the file did not reproduce it.

Packet hypothesis: a child that inherits NODE_TEST_CONTEXT, run by a different node binary, reports into the parent runner and poisons it.

Lead finding at 0b517ba: runSealed (scripts/run-tests.mjs:230-231) already deletes NODE_TEST_CONTEXT and NODE_TEST_WORKER_ID before its own node --test spawn, and every run-tests spawn uses process.execPath. So the hypothesis is at least partly already addressed. The builder must find where, if anywhere, it still holds (spawn sites in scripts/run-tests.test.mjs, scripts/test-home.mjs's env, any bare `node` spawn under a test) or name the real cause with evidence.

Candidate causes to discriminate:
- (H1) An env leak at some spawn site not covered by the lane 46 strip. Test: grep every spawn in run-tests.test.mjs and test-home.mjs for env provenance.
- (H2) Stray bytes on the file process's stdout. The node --test parent reads the child's stdout as a v8-serialized stream, so any grandchild writing to an inherited stdout, or a direct stdout write interleaved under load, can corrupt a frame. A plausible Windows-only form: a taskkill /F without /T that orphans a grandchild still holding the pipe.
- (H3) Something else the evidence shows.

Deliverable:
- If a cause is confirmed red: the smallest fix in territory, with a unit test that fails before the fix and passes after, plus a Linux full suite.
- If no cause can be confirmed: a report that says so with evidence. That is a valid result, and nothing is changed.

Territory: scripts/run-tests.mjs (child env and spawns), scripts/test-home.mjs, a new unit test in scripts/run-tests.test.mjs or scripts/test-home.test.mjs, docs/census.md one line. A fix that needs a change to an existing test file's spawn options is reported to the lead first. NOT: other test files' content, hooks/, four-read.

Measure: work lost or stalled (gate false reds on Windows).

## Ruling addendum (skills-fable-lane-57-2, 4:43 AM NY)

Option A. Territory is now scripts/run-tests.test.mjs, scripts/test-home.test.mjs, and the N2 scanner test in skills/multi/scripts/hooks.test.mjs. Nothing in run-tests.mjs. The defect is recorded as not reproduced, with the H3 inference and this trip-wire: the next "Unable to deserialize cloned data" on any Windows gate reopens the lane, with a repro run from skills-fable's pane.
