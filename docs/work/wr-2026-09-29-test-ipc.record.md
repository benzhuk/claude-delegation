Work: wr-2026-09-29-test-ipc
Scope: the spec section of this record (lane 57), from packet docs/notes/skills-fable-lane-57-1.md read at 0b517ba
Owner: skills-n
Status: owned
Authority: build, review, integrate, push build/test-ipc-57-1, merge into main on acceptance under the standing grant of 2026-09-26 without Ben; run the suite on Netcup under scratch dirs; the live Windows full gate is coordinated with skills-a, one suite per machine; no install, no release
Next: Sonnet builder diagnoses first (Research line), then fixes or reports a confirmed absence; Opus review after
Worktree: build/test-ipc-57-1
Scratch: /var/tmp/lane-57
Opened: 2026-09-29T07:30:00.000Z
Lead-session: f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e
Spec-session: 9c61c35a-82dd-4aef-8eca-c99bb0e72e31
Spec-from: 2026-09-29T04:14:20Z
Base: 0b517bab993ae1a3c70c6fa4caeb4b1375135fb5
Log: 2026-09-29T07:32:29.000Z owned skills-n picked up skills-fable-lane-57-1 (ACKed earlier as skills-n-lane-57-1) after lane 53 closed; worktree from origin/main at 0b517ba; the pinned hypothesis's fix is already on main (run-tests.mjs strips NODE_TEST_CONTEXT and NODE_TEST_WORKER_ID, and spawns with process.execPath), so the lane starts with diagnosis
Log: 2026-09-29T07:33:11.000Z owned skills-n Sonnet builder a5e5c7ba904a02656 spawned with the five-step Research line, diagnosis before fix, ETA 60 min

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
