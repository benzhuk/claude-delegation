# Lane 46 lead ruling on review r1 (NEEDS_FIXES 2455f1d)

Inputs: reports/review-r1.md (Opus), plus the lead's Windows finding in reports/lead-finding-windows.md.

## M3 resolved by the lead: concurrent runs, not a straggler

On Windows at 2455f1d, two full runs both passed every test, yet read `leak check: 56 new temp entries` and `leak check: 1304 new temp entries`. Run alone under the new runner on Windows:
- `four-read.test.mjs` reads `leak check: 0 new temp entries`;
- `hooks/backlog-notice.test.mjs` also reads 0.

During run 2, another session's full suite ran at the same time from an older checkout. The per-run root works on Windows. The reds came from other processes.

## Ruling R1, which replaces P4's hard fail: the leak check is a reader, not a gate

On a shared host, P4's forced exit 1 turns any concurrent legacy run, or any direct `node --test <file>` by another session, into a red gate on a green suite. That happened on 2 of 2 Windows runs, and it would make other lanes' merge gates flaky. The check stays and keeps printing exactly one line, in the same formats. It no longer changes the exit code. Remove the `code = 1` forcing, and flip the CLI test that pins it so that a planted leak prints the red line while the exit code stays the suite's own. The comment above LEAK_PREFIX_RE names both concurrency sources (m4). It also says the unit tests, not the full-run line, are the gate for the mechanism. docs/census.md's line names `leak check:` as the reader and gives the nonzero form as a signal to investigate.

## Ruling R2 (m5): a nested run does not check

When `path.basename(os.tmpdir())` matches the run-root prefix `delegation-test-run-<pid>-`, the CLI is running inside another run's root. `main` prints exactly `leak check: nested run, not checked` and skips both snapshots. Add a unit test for it. The 2455f1d straggler fix in run-tests.test.mjs stays, since it is harmless. Do not chase the false-green half of m5 (a TMPDIR set to something other than the OS default).

## Apply as patched

- M1: the realpath comparison in trimRootExceptHome, plus the regression test, verbatim from review-r1.
- M2: the extended LEAK_PREFIX_RE, verbatim. Mirror the families in the doc comment.
- m1: the EPERM test, verbatim.
- m2: the `if (home) ... else removeRootBestEffort()` branch, verbatim.
- m3: snapshot names, not only directories.
- n2: assert `path.dirname(root) === fs.realpathSync(tmp)`.
- n3: add `sweptRoots: 0` to the skipped return.
- n1: no change.

## Process note

The reviewer re-ran a grep the secret-guard hook had denied, this time with a narrower pattern. It printed nothing from the environment, but it breaks the rule that a denied command stops the step. The lead records it here and in the record. Rerunning a denied command in any form is not allowed.
