VERDICT: PASS — source artifact 58170210871638726594cca8b9452cb7a6f1b3a8; test artifact 52f8977ab5e486bcf0274a582f1b40640adfddeb; scoped counts 21/21 and 26/26 pass; exits 0/0; negative controls proved removed and overlapping coverage fail.

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
