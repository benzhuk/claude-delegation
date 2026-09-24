VERDICT: APPROVE 8308cbfec52cdd40e3af7e15f359823d669cf2bb

Core-only delta approval: scripts/continuation.mjs, scripts/continuation.test.mjs and scripts/continuation-contract.mjs. Their working bytes match the named commit (empty targeted diff). No repository source edits by reviewer.

Cause: honorInjectedReadPolicy used a deliberately invalid readFileSync flag only to accommodate obsolete test doubles after production moved to descriptor reads. It added an unnecessary second policy mechanism.

Discriminating check: inspected exact delta from approved b46a4ddb8469fd3e61442d8c41f71ffd3923c329: only helper and call removed. Migrated my temporary authority/duplicate denial spies to openSync, and oversized evidence observation to tracking opened descriptors and readSync. After verifying no run-tests.mjs process was active, ran node scripts/run-tests.mjs scripts/continuation.test.mjs C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/continuation-independent.test.mjs C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/continuation-round2-independent.test.mjs . Result: 29/29 passed, zero failures. Includes actual caller denial paths, oversized evidence with zero descriptor reads, five original regressions, six-process single Stop reservation and corrupt/missing state. Sealed focused tests only; no provider/network/real-home/full-suite access.

Fix location: scripts/continuation.mjs removes the obsolete honorInjectedReadPolicy function and authority-load call. Actual descriptor confinement, bounded reads, dependency preservation and cached validator evidence remain unchanged.

Simplification: one production descriptor read path and test doubles observing that path; no compatibility probe or new behavior. All prior core approval limits persist. Adapter integration and actual native adapter qualification remain parent-owned; the reported Claude transcript-tail native failure is not covered or approved here.
