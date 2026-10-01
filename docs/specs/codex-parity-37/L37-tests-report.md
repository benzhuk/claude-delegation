VERDICT: PASS — source artifact 8b1f4bf19f8ebbbeba58f1587bd8633ab0d2e8f2; latest scoped count 8/8 pass, exit 0; prior scoped counts 21/21, 26/26, and 11/11 pass; negative controls proved removed and overlapping coverage fail.

# Lane 37 independent contract-test report

Work: wr-2026-09-28-codex-parity
Owner: lane37_tests
Artifact checked: `51072e6942db072b44183dfc668329411a46d683`

## Evidence

- Ran `node --test hooks/codex-unsupported.test.mjs` only, with `TEMP` and `TMP` set to `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests`.
- Result: 7 passed, 0 failed, exit 0. Raw output: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-unsupported.raw.log`; exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-unsupported.raw.exit`.
- Inventory comes from the actual Claude manifest. The test rejects missing coverage, overlap, unknown/duplicate/malformed unsupported rows, and permits the native-only `Interrupt` entry.
- Behavioral fixtures observe SessionStart wiring and backlog prompt/post/stop context while retaining peer and continuation text; they also retain backlog kill switches and cadence.
- A subprocess invokes `multi-codex-hook.mjs` without injected routing and observes the actual default backlog context on stdout. A bounded child route exercises early close and timeout while peer/advisory context survives.
- The scratch installer is run only against a temporary Codex home and proves the native delete guard plus its trust entry.

## State

Test and report are ready for separate add/commit. No full suite was run. Scratch artifacts are retained at the required Lane 37 path for gate review.

## Fix round: no-transcript native callback

- The Netcup sealed suite on the prior artifact `0b9d02068f2a6cbcfac8d6c2af0cbdbd9168f60f` failed this test's SessionStart assertion at `hooks/codex-unsupported.test.mjs:134`: it expected `/wiring:/` but got peer-note and continuation text only. This is a missing route result, not a timing failure; the failed fixture itself supplied a transcript path, so it cannot by itself prove the live callback's missing-metadata shape.
- Builder diagnosis report `c6212e56739e13cf3e353a636716d5ce15bc23ec` identifies the live Codex callback shape: `cwd` and `session_id`, no `transcript_path`. The fix artifact permits unknown role only for the advisory native route after confirmed children have already returned.
- Added a regression with a real `SessionStart` payload lacking `transcript_path`; it requires `wiring:` while retaining peer and continuation context. Existing focused source tests retain confirmed-child suppression.
- Replaced the test's direct child environment spread with `childEnv(home, ...)`, addressing the sealed-suite hygiene finding at the former direct spawn line.
- Ran only `node --test hooks/codex-unsupported.test.mjs hooks/multi-codex-hook.test.mjs` against `58170210871638726594cca8b9452cb7a6f1b3a8`: 21 passed, 0 failed, exit 0. Raw evidence: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-parity-fixround.raw.log`.

## Hygiene follow-up

- Ran the exact previously failing constraint, `node --test skills/multi/scripts/hooks.test.mjs`, against test artifact `52f8977ab5e486bcf0274a582f1b40640adfddeb`: 26 passed, 0 failed, exit 0. The `N2: no test file in this suite inherits the runner environment on its own` assertion passed after the subprocess switched to `childEnv(home, ...)`.
- Raw evidence: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-parity-hygiene.raw.log`; immediate exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-parity-hygiene.raw.exit`.

## Native-package scope extension

- Scope provenance: `skills-fable-lane-37-5` explicitly approved the exact prepared patch at 6:09 PM America/New_York. It changes only the first test in `scripts/native-package.test.mjs`.
- Applied against builder artifact `c121228fd2660aaf624a929f8a0a743dd0d24265`: the exact native event set now includes `PreToolUse`, while the original five adapter events remain individually constrained to `multi-codex-hook.mjs`; `PreToolUse` is pinned to one `Bash` group running `delete-guard.mjs` with timeout `10`.
- Ran only the two affected tests, `node --test scripts/native-package.test.mjs hooks/codex-unsupported.test.mjs`: 11 passed, 0 failed, exit 0. Raw evidence: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-parity-native-package.raw.log`; immediate exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-parity-native-package.raw.exit`.

## Round 3 research: SessionStart route budget

1. **Actual evidence.** The R3 Netcup full suite on `b726ff9ad09f3e403ade74d27ab0a497c742c729` had two remaining failures, both in this test file. Their assertion durations were 57.687189 ms and 58.124411 ms. Each retained peer and continuation text but omitted `wiring:`.
2. **Role distinction.** The R3 source already contained `5817021`'s route eligibility change (`role === 'child'` only), and the prior metadata-free SessionStart regression passes locally. The Netcup failures therefore do not establish an unknown-role rejection; they show that an eligible route result was absent.
3. **Environment isolation.** The route child receives exactly `deps.env`. On Netcup, the existing fixtures supplied `AGENTS_HOME` but no `HOME`, so `wiring-check --line --hook` read an ambient OS home and correctly returned silent. Builder's exact child reproduction was silent with that environment; adding only `HOME=/tmp/nonexistent` emitted `wiring: 4 flagged...`. A local isolated fixture home produced the same expected line.
4. **Discriminating regression.** The SessionStart test now supplies `childEnv(home, ...)`, which sets both `HOME` and the Windows-equivalent `USERPROFILE` without inheriting inbox credentials. It proves a controlled unwired home emits `wiring:` while a separately constructed fully wired home is silent. Both paths retain the same metadata-free callback shape and never consult a real home.
5. **Result and follow-up.** The focused regression passes 8/8, exit 0, on unchanged `b726`-equivalent runtime. A controlled 450 ms outer-race experiment previously exposed a separate SessionStart budget concern, but the observed 57/58 ms R3 failures cannot have reached that timer; it is recorded as a non-blocking follow-up, not a Lane 37 product requirement. Raw passing evidence: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/codex-parity-round3-home.raw.log`.

## Main-merge gate repair: advisory and route budgets

1. **Failure evidence.** The local merge gate at `2bad23a593d3c86bf808e6ee0da6a1dd61c21e09` failed only this test at former line 230 after 1,072.7556 ms: the peer packet remained, but `ADVISORY-PRESERVED` was absent. Raw receipt: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/main-merge-windows/sealed-suite.raw.log`.
2. **Cause.** `runCodexHook()` applied one 450 ms `withBudget()` around `Promise.all([advisory, route])`. A route whose child is killed at 400 ms can still await Windows process close past 450 ms. Since `Promise.all` remains incomplete, the outer race discarded an advisory that was already fulfilled. Peer delivery happens outside that race and correctly survived.
3. **Deterministic pre-fix proof.** The test retains real `runRoute()` early-close and timeout checks, but uses an immediate advisory plus a never-resolving injected native route for the hook-level probe. On the pre-fix source it failed 7/8, exit 1, retaining peer text and omitting the advisory. Raw: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/main-merge-advisory-beforefix.raw.log`.
4. **Minimal production fix.** Builder artifact `8b1f4bf19f8ebbbeba58f1587bd8633ab0d2e8f2` independently races advisory and route at the existing 450 ms cap, then joins their settled values. This preserves the PostToolUse timing cap without relying on a wall-clock assertion.
5. **Post-fix verification.** Ran only `node --test hooks/codex-unsupported.test.mjs` with `TEMP` and `TMP` at the Lane 37 test scratch: 8 passed, 0 failed, exit 0. Raw: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/main-merge-advisory-afterfix.raw.log`; exit: `C:/Users/benzh/orca/gates/01a0df4c-2809-7520-b1d7-876cc51a87ee/codex-parity-37/tests/main-merge-advisory-afterfix.raw.exit`.
