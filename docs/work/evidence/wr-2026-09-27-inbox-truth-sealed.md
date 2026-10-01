VERDICT: PASS

# Lane 29 sealed host gates

Candidate evidence head: `d1345220822651c762fa5a5a461e5bbe94620c7c`.
Reviewed source artifact: `c8c16be67ef4e832e90ec2f78ebdf570001fd60f`.
The three owned source files and two owned tests are byte-identical between
those revisions; the later candidate commits add only review and evidence
material.

| Host | Actual suite result | Native / wrapper exit | Raw receipt |
| --- | --- | --- | --- |
| Windows | 2,480 passed, 0 failed, 2 skipped | 0 / local wrapper completed | `L29-sealed-windows.log`, `L29-sealed-windows.exit` |
| Netcup | 2,478 passed, 0 failed, 4 skipped | 0 / SSH 0 | `L29-sealed-netcup-suite.log`, `L29-sealed-netcup-suite.exit` |

Windows used the process-owned, non-deleting `Global\claude-verify` mutex.
Netcup used the existing remote verification lock, an already fetched exact
checkout at `/home/ben/orca-gates/inbox-truth-1-d134522082`, and the
pre-resolved existing Node binary. Its actual-suite receipt records verified
working directory, exact HEAD, and the runner path before `node
scripts/run-tests.mjs` started.

Netcup has two Node launches and one actual suite. The first launch fetched
and checked out the correct SHA but ran Node from `/home/ben`, so the runner
was not loaded and zero tests ran; it exited 1 with `MODULE_NOT_FOUND`. Its
immutable raw pair is retained as `L29-sealed-netcup-launch-failed.log` and
`L29-sealed-netcup-launch-failed.exit`. The original same-byte pair remains
at `L29-sealed-netcup.log` and `L29-sealed-netcup.exit`. A local PowerShell
parser error occurred before SSH or Node started; its raw text was not saved
as a separate receipt. Root adjudication authorized the corrected first
actual suite, which is the passing Netcup result above. No Windows suite was
rerun.
