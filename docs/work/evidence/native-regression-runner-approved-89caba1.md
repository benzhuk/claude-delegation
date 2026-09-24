VERDICT: APPROVE 89caba14fa503b775bd97905aabaf11c4ecb2048

Exact scope: scripts/native-continuation-smoke.mjs, scripts/native-continuation-smoke.test.mjs and docs/native-continuation-testing.md. Targeted working diff against artifact was empty. No source edits; Codex adapter/package and overall product excluded.

Cause: previous quiet-account false positive and direct-child-only timeout are addressed by successful model-visible account evidence plus matching post-run state, owned process-tree termination and bounded server/socket cleanup.

Discriminating check: independently reran node scripts/run-tests.mjs scripts/native-continuation-smoke.test.mjs C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-runner-independent.test.mjs : 5/5 pass. Original independent predicates extract the actual scenario assertions, so they verify the execution path as well as the new exported test helper. Original owned-grandchild timeout repro now finds the child dead. Durable open-connection probe verifies bounded socket destruction. No production compatibility logic was added for test doubles.

Independently reran actual native source CLI from unrelated C:/Users/benzh/AppData/Local/Temp using exact C:/Users/benzh/.local/bin/claude.exe, version 2.1.281. All three cases PASS; output C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/native-runner-independent-89caba/summary.json. Unaccounted: 4 requests, 96,703-byte transcript, one block and one refire. Accounted: 4 requests, successful Messages-visible account revision equals post-run accountedRevision, active bound state, attempted false and zero blocks. Interrupt: 5 requests, native acknowledgement, STALE_EPOCH, replacement unbound with no binding. Native kill cleanup is not used as cancellation proof.

Fix location: runChild now settles once and targets the owned process tree on deadline; closeOwnedServer bounds shutdown and destroys accepted sockets. Accounted result includes visible account revision and checks it against the sole active bound, unattempted state. Hook wrapper receives a deadline. New durable tests cover the two findings and active-socket shutdown.

Simplification: retain one portable source runner with three cases, shared process/server lifecycle, disposable homes and local synthetic provider. Minor nonblocking cleanup remains: scenario repeats the same predicates exported in assertScenario; invoke the shared helper directly to prevent future test/runtime divergence. Current predicates are identical and both paths were reviewed/tested.

Limits: process-tree cleanup observed on Windows; POSIX process-group branch inspected but not executed. No full suite, real auth/settings or network provider was used. Native proof establishes synthetic-response Claude mechanics only; approval is for these three runner files, not Codex or the complete harness release.
