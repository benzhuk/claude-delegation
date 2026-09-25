VERDICT: APPROVE 6311556cc17c62d364d056a595f3c2fe3a71b150

# P3 (docs) final delta re-review: Codex goal and bearings parity

Candidate: 6311556cc17c62d364d056a595f3c2fe3a71b150, one commit ("docs: clarify Codex hook update route") on top of fadc073. Checkout: C:/Users/benzh/orca/workspaces/claude-delegation/astra-codex-p3, read-only. HEAD is 6311556 and `git status --short` is empty.
Delta: README.md (+5/-4) and docs/native-use.md (+2). `git diff --check fadc073 6311556` is clean. I also read the builder's report, Temp/codex-parity-1/p3-final-fix-report.md.

## The two findings open at fadc073

### N1 MINOR (per-event classification wording): FIXED
- README.md:62-63 now reads "When native / metadata on an event positively classifies". The repeated "native" is gone.
- README.md:66-67: the confirmed-children sentence now starts on its own line, and both lines are 90 columns or less.
- The changelog, README.md:249-250, now reads "when native metadata on an event positively / classifies a lead".
- A search for `SessionStart metadata`, `native native` and `roughly` across README.md, docs/native-use.md and skills/bearings/SKILL.md finds nothing.
- All four places now say the same thing, and it matches `classifyCodexRole` reading the transcript's `session_meta` on every event (hooks/continuation-native.mjs:43-73).

### R1 MINOR (re-apply the hooks after a plugin update): FIXED
- docs/native-use.md:50 is indented to sit inside step 3, right after the `--codex-hooks-only` commands. It says: "After every plugin update, rerun this step from the updated durable checkout, because the Codex hook runs the adapter at the path it was wired from."
- That matches the source. The hook command is the repo path the wiring ran from (scripts/mirror-shared-skills.mjs:69-75), and the trust hash covers only the command (scripts/codex-hook-trust.mjs:509-514).

## Regressions in the delta
None found:
- The only changes are the three wording edits above.
- No behavior, install or live claim was added.
- The switch spelling `ws-off-goalcard` is unchanged.
- The rest of the 0.20.9 changelog entry and all older entries are unchanged.
- The route order, the native-alternative label and the duplicate-hooks warning are unchanged from fadc073.
- The README lines longer than 100 columns (26-29, 168+) predate this delta.

## Findings from earlier rounds, all closed
- F2 to F7, N2: fixed, as verified in the earlier rounds.
- N1 and R1: fixed in this round.

## Condition on this approval (F1)
This approves the documentation only. It is not approval of the runtime behavior the docs describe. The a141cee contract ("P3 and integration") requires the integrated seam review to check every behavior sentence against the final reviewed P1 SHA before acceptance. The sentences to check are:
- docs/native-use.md:86-104
- skills/bearings/SKILL.md:56-73
- README.md:62-71
- README.md:249-259

The work record must name that P1 SHA. If the P1 review changes behavior, P3 must be edited before acceptance. The P1 candidate 5225d21 has not been reviewed yet.

## What I did not check
I ran no hooks, tests, installs or native runtime, and read no transcripts.
