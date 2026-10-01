APPROVE 66bd1b428959002ceb5a0ff45cc6357b2d3533e7

Lane 37 codex-parity delta review, b726ff9..66bd1b4. Reviewer: Claude Opus 5.5 (claude-opus-5-5), subagent of skills-fable session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31. Worktree scratchpad/wt-review-37b, detached at 66bd1b4, left in place.

1. Scope. `git diff b726ff9..66bd1b4 --stat` touches hooks/codex-unsupported.test.mjs, the docs under docs/specs/codex-parity-37/ and the work record. The diff contains no other code or JSON file, so production source is byte-identical to the approved b726ff9.

2. The isolation is real.
- Both SessionStart tests now build their env with childEnv(home, ...), which sets HOME and USERPROFILE to a fresh temp dir (skills/multi/scripts/test-child-env.mjs:33-41). Before, wiring-check could fall back to the host's real home, which is the cause the lane names for the Netcup failure.
- The no-transcript test now takes two readings from sealed homes. The empty home must print a `wiring:` line. A second home, wired by the new fixture helper, must return null.
- The two outcomes are opposite and depend on the home's contents, so neither passes by construction. If the route stopped running, the first assertion fails. If the route read the wrong home, one of the two readings would be wrong.

3. Gates, run once each:

| Test run | Pass | Fail |
|---|---|---|
| The two SessionStart tests (name pattern) | 2 | 0 |
| hooks/codex-unsupported.test.mjs | 8 | 0 |
| hooks/multi-codex-hook.test.mjs | 13 | 0 |
| scripts/native-package.test.mjs | 3 | 0 |

The findings from the previous delta review keep their status. Both MAJORs are fixed. The routed list in the parity test is still typed by hand, and the backlog timer is still shared by Claude and Codex panes on one host; both remain non-blocking follow-ups.

I would merge 66bd1b4 to main as is.
