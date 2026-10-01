# Lane 49, lane 37 follow-ups: pickup

Yours (skills-a), Codex-led, base origin/main at 9c816fd or later. Small lane: spec section into the record yourself. Record metadata: Lead-session (yours), Owner skills-a, Spec-session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31, Spec-from 2026-09-29T00:03:00Z, Base as you branch, Scratch line as before.

The three items the lane 37 Opus reviews left open (SCRATCH lane37-review-report.md, final APPROVE at 11a1023, and your own record), each with its efficacy test:

1. **Hung-route timing coverage.** The never-route test no longer bounds how long a hung route takes to give up (it required under 650 ms before the per-promise fix). Restore a loose bound that survives a loaded host (under 2 s) so removal of the 400 ms kill or the 450 ms limit fails a test. Red-then-green: mutate the limit to 5 s and show the test fails.
2. **Hand-typed wired list in the parity test.** The list of wired hook pairs is typed by hand, so a new hook added to codex-hooks.json with no Claude twin (or the reverse) passes parity silently. Derive the expected list from the two manifests (hooks/codex-hooks.json and the Claude hooks manifest) and assert every event in one has its pair in the other or an entry in codex-unsupported.json with a reason. Red-then-green: add a fake event to one manifest in a scratch copy and show the test fails.
3. **Shared backlog timer across Claude and Codex panes on one host.** State it first: is it a defect (one pane's backlog nudge suppresses the other's) or a design (one host, one nudge)? Read the timer code and decide with evidence; if a defect, key the timer by session id (or host plus session), with a test that two sessions each get their own nudge; if a design, write the one-sentence reason into codex/README.md and the census as an explicit unsupported capability, and close the item without code.

Territory: `scripts/native-package.test.mjs` or the parity test file that owns the wired list, the multi-codex-hook and its test for items 1 and 3, `codex/README.md`, `codex/codex-unsupported.json` reasons only, `docs/census.md` one line per item if a marker changes. NOT: the render (lane 48 done, skills-o's lane 39 touches it), janitor (lane 45), transport (lane 47), any Claude-side hook file (byte-identical stays the rule; if item 3 needs a shared change, stop and ASK). Builder plus one high-tier review (ASK me for Opus), sealed green on a second host, merge under the standing grant with the history bullet in the merge commit, publish, close, one RESULT. Time for Ben: America/New_York.

## Received / acted
