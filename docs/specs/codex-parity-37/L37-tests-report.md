VERDICT: PASS — artifact 51072e6942db072b44183dfc668329411a46d683; focused count 7 pass / 0 fail; native exit 0; negative controls proved removed and overlapping coverage fail.

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
