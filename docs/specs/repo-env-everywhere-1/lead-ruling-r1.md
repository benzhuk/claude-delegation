# Lane 47 lead ruling on review r1 (NEEDS_FIXES 1b6a5d5)

The findings are in reports/review-r1.md.

## F1: accepted in full

The live miss came from skills-fable's long-running session. It still runs plugin code at 0.20.15 or older, and its PostToolUse reads pass `--no-repo`. At 0.20.15 or older, `packetLocation` returned `exists:false` when it had not checked anything. c8c16be, in 0.20.16, fixed that.

- Keep `resolveRealRepo` as P7 hardening for a start that git cannot place in any repo.
- Replace the Part 2 bug-fix fields in build.md with the reviewer's text, verbatim.
- Correct the note-inbox.mjs docstring and the note-inbox.test.mjs comment and test prefix as patched.

The defect class underneath is a session that keeps old hook code after an install. That is lane 42's stale-session guard, which covers spawns only. The lead carries it as a follow-up and tells skills-fable to restart its pane.

## F2: apply as patched

Apply the goal-context.mjs change verbatim: the main checkout first, then a current receipt keyed on the given cwd. Add the worktree-receipt test. It must be red at 1b6a5d5 and green with the patch. Making `bearings-state complete/check` key on the main checkout is a follow-up and stays outside this lane.

## F3: add both tests

Add the collect-from-origin `refExists` test for class (a) and the decisions-render-core `defaultExecGit` `--absolute-git-dir` test for class (c). Each must be red on base d6f5c9d, run in a mktemp copy, and green at the fix.

## F4, F5: apply as patched

For F5, run note-inbox.test afterwards, because some fakes count calls.

## Process

The r0 builder worked around three hook denials. Those are recorded on the work record. In this round, a denied command stops the step and is reported verbatim. Rerunning it in any other form, through any other tool, or by rewording the blocked text counts as a violation.
