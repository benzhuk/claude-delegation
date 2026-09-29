# C2 round 5: the lead amends Ruling W

- Round: 5.
- Findings: reports/C2-review-r4.md. It holds one blocker: the note-send shape accepts an unbalanced quote.
- Start from: wt/lane-closeout-1-C2 at 8bc8bd574666e81d0e7b16b4a45abf1789ff10b9.

## Amendment to Ruling W
The `<args>` of the note-send shape may contain `'` and `"` only as complete pairs on line 1. The content inside a pair has no quote of the other kind, and no `\`. A `\` anywhere on line 1 of the note-send shape is not exempt.

Apply the reviewer's exact current → replacement regex from C2-review-r4.md verbatim. Add its three regression-test rows verbatim. Also add one test that the real shape `note-send --from a --to b --kind RESULT --text "x y" --packet-file - <<'EOF'` stays exempt.

Change nothing else.

## Gate and report
The gate is as in brief-C2.md. The one known failure, GOALS.md STALE, predates this lane.

Commit, and do not push.

Report to reports/C2-r5-report.md:
- line 1: `DONE <sha>` or `BLOCKED <reason>`;
- then the gate numbers, with the log in reports/C2-r5-gate.log.

ETA 20 minutes.
