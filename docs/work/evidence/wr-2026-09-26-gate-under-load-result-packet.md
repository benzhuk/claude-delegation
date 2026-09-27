# RESULT packet — gate under load

- Main: `dad0f7933dad4f6d7b2b55b03cd992bf9566ca06`, a clean merge of `build/gate-under-load-1`, normal non-force push confirmed.
- Reviewed source: `0c00422e97755df7d01127e529c8216c756ee8f9`; compliant native Opus review session `6f7e742c-b18b-4ef4-80cb-d58bc65f874f`, `claude-opus-5-5`, exit 0, permission denials 0, APPROVE after 19/19 bounded checks.
- Load gate: postchange scoped batch 10/10 pass under real full-suite overlap; prechange baseline is retained as 42/43 fail, exit 1, with 45 concurrent calls and zero cards.
- Host gates on integrated `99c7c0110f4f5933e580e1c2a42ff1dfaf5d2f64`: Windows exit 0, 1777/1777 pass. Linux raw exit 1, 1772 pass, 2 fail, 3 skip; it is baseline-qualified only because the exact H6/V4 failures are documented permitted exceptions and lane ten remains absent from `origin/main` and the tested tree.
- Main merged-tree gate: exact `dad0f793...`, Windows direct exit 0, 1798/1798 pass, 0 fail/skip, 273313.449 ms. Receipt and raw captures are beside this packet.
- Accepted record: `docs/work/wr-2026-09-26-gate-under-load.record.md`, accepted at commit `15b3944e5ff92df4c484f9d0d14b4de6ee28efaa`.
- Census/four-read limits: Codex complete per-build response coverage, conversational lead turns, native child attribution, and hence top-tier token, lead-hour gap, rework and stalled-work measures remain unavailable. The preaccept seven-day window is not claimed as a measurement.
- Decisions Closed: posted and read back on page `3e1da11277a18174bccfea187d5c3972`; Done remains unchecked. It records the branch, main SHA, delayed-fallback and opt-in timing changes, Windows 1798/1798, and Linux baseline-qualified 1772 pass with expected H6/V4.
- Release and install were not performed.
