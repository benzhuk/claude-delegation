VERDICT: NEEDS_FIXES 9a6bec65e117679d7598213c5563acb2736d9422

Independent review of core scripts/continuation.mjs, scripts/continuation.test.mjs and pinned scripts/continuation-contract.mjs only. HEAD verified exact SHA; no core source edits. Dirty adapter territory deliberately excluded. Reviewer did not plan the build. Work: wr-2026-09-23-continuation-core.

Cause: tests mirror the implementation's CLI shape, skip invalidation of already-armed state on unknown prompt identity, and assert final UNKNOWN without observing the filesystem reads that preceded it. The selector also turns unreadable index entries into absence, and nested dependency normalization silently drops fsImpl.

Discriminating check: first sealed run combined original 12 tests and four independent regressions: original 12 passed, independent four failed. Expanded independent run: eight tests, three passed, five failed. Command from integration checkout: node scripts/run-tests.mjs C:/Users/benzh/AppData/Local/Temp/astra-followthrough-0923/continuation-independent.test.mjs . This temporary harness uses fixture construction helpers from the source tests but independently written adverse scenarios/assertions. No provider/network/real-home/whole-suite access. Last failed sealed home retained by runner: C:/Users/benzh/AppData/Local/Temp/sealed-home-nLs3Bk.

1. HIGH: documented bind callback marker is absent from actual CLI result.
Path: scripts/continuation.mjs:268; contract scripts/continuation-contract.mjs explicitly requires continuationBind:{requestId,epoch}.
Repro: Claude null-episode UserPromptSubmit issues epoch; run bind with that epoch; parse stdout and assert continuationBind.requestId. Actual JSON has top-level bindRequestId only and no epoch. An adapter obeying the pinned output contract cannot confirm Claude's pending binding, dropping ongoing accounting. Builder tests extract its bespoke top-level field, masking the seam failure.
Fix location: return the exact pinned nested marker and epoch in bind's success payload; test actual child-process CLI stdout against the same extractor the adapter uses. Do not resolve by accepting arbitrary shell text.

2. HIGH: unknown new prompt leaves old episode active, allowing stale Stop to allocate a turn.
Path: scripts/continuation.mjs:175-179 (also profile early return at 192).
Repro: arm known episode-1; deliver lead UserPromptSubmit with new eventKey and episodeKey:null for Codex; deliver delayed Stop for episode-1. Actual result.reason allocates continuation under prior authority. The new prompt was silently ignored instead of suspending. Related missing eventKey/unsupported-profile prompt and missing-identity SessionStart need the same conservative invalidation analysis.
Fix location: authenticated lead prompt/start invalidation must run under claim before identity/capability early returns; unknown identity may suspend but cannot issue authority or arm. Positive child still must not mutate parent state. Add armed-state tests; unbound null-input tests are insufficient.

3. HIGH: oversized evidence is fully read before the bounding/confinement check.
Path: scripts/continuation.mjs:127 calling scripts/work-record.mjs:177; safeRealFile at continuation.mjs:78-89 only runs later for evidence at 138.
Repro: selected record's proof.md exceeds 1 MiB. Instrument fsImpl.readFileSync; select returns UNKNOWN but has already read the entire proof once through validateRecord. This defeats true I/O bounds while holding the session claim; similarly validator accesses evidence before realpath confinement. Further, safeRealFile uses stat then readFileSync, so growth between them is not a hard read bound.
Fix location: preflight and bounded-read selected evidence before validator, supply validator a confined cached filesystem view or reuse a safe validation seam. Use open/fstat/read of at most limit+1 bytes rather than unlimited readFileSync, and apply aggregate read/work limits. Assert actual reads/bytes, not just final status.

4. HIGH: unreadable duplicate work file disappears, creating a false valid revision.
Path: scripts/continuation.mjs:114-120, especially catch { continue; }.
Repro: two .record.md files declare selected root ID; inject EACCES reading one. Actual snapshot status OK from surviving file; expected UNKNOWN because uniqueness cannot be established. This snapshot can be accounted and silently suppress a needed check while selected work is ambiguous. Related non-file/symlink entries and parser errors that hide IDs deserve coverage.
Fix location: record an index uncertainty and return UNKNOWN whenever selected identity uniqueness cannot be established. A deterministic root-ID filename/index contract can avoid scanning unrelated bodies, but silently ignoring unreadable candidate declarations cannot prove uniqueness.

5. MEDIUM: injected filesystem is dropped in bind/account/Stop selection.
Path: scripts/continuation.mjs:20-26 and calls at 166,264,271.
Repro: fsImpl throws EACCES on authority.md; direct snapshot rejects, but runContinuationCli bind returns exitCode 0. depsOf constructs {fs:...}, then selector invokes depsOf again expecting fsImpl and falls back to real fs. This makes targeted failure/race tests ineffective through the actual caller and violates injected dependency semantics.
Fix location: normalize dependencies once, or pass fsImpl explicitly when invoking public selection. Add caller-level injected denial tests for bind/account/Stop.

Positive independent checks: accepted-only root still emits accounting (no complete inference); accounted snapshot plus peerWillBlock consumes the opportunity even after later evidence change; fresh prompt rejects both stale account and stale stop mutations. Original focused suite confirms its covered current-identity/one-reservation/stale-afterFlush paths, but Promise.all of synchronous code does not by itself demonstrate cross-process contention or bounded lock duration.

Simplification: retain one invocation state file, existing work records and one synchronous claim; fix lifecycle invalidation, output contract and bounded reader in place. No additional scheduler, ledger, provider layer or new authority is needed. Final integrated adapter/native qualification remains parent-owned; this report provides no approval of those files or host capabilities.
