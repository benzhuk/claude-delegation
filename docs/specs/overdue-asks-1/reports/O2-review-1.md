VERDICT: NEEDS_FIXES (1) 773defd80cc097605ce96071be59c161d33eb638
NEEDS_FIXES

# O2 review, round 1

Reviewed at `773defd80cc097605ce96071be59c161d33eb638` (`git rev-parse HEAD` in
/home/ben/Code/wt-overdue-asks-1-O2), branch `build/overdue-asks-1-O2`. Base is `d5d769f`.
Builder commits: `90a5fb8` (the edit) and `773defd` (report, state and gate log).

## Summary
The sentence is copied exactly and the `BUILD_MANDATE` side is correct. The `agents/builder.md`
side puts the new bullet inside the shared `<!-- safety-block -->` fence, and
`agents/agents.test.mjs` requires that fence to be byte-identical across all four agent files,
to have exactly 11 bullets and to stay under 2100 characters. As a result the full suite goes
from green to 3 failures, so R7's integration gate ("ZERO failures on Linux") cannot pass. The
territory gate (build-loop-workflow.test.mjs) does not run this test, which is why it is green.

## Findings

### F1 — BLOCKER: the new builder.md bullet inside the safety-block fence breaks 3 tests in agents/agents.test.mjs
Evidence (measured, not inferred):
- `agents/builder.md:18` puts the new bullet between `<!-- safety-block:start -->` (line 13)
  and `<!-- safety-block:end -->` (line 26).
- `agents/agents.test.mjs:77-85` requires builder.md's safety block to be byte-identical to
  those in integrator.md, reviewer.md and runner.md. It fails because the other three were not
  changed, and changing them is outside O2's territory (R6).
- `agents/agents.test.mjs:115-122` requires exactly 11 bullets (`'... change this test
  deliberately'`). The block now has 12, so this fails.
- `agents/agents.test.mjs:124-128` requires the block to be under 2100 characters. It is now
  2266, so this fails.
- `node --test agents/agents.test.mjs` at HEAD gives 21 passing and 3 failing (the 3 above). At
  base `d5d769f`, extracted to a scratch copy, it gives 24 passing and 0 failing.
- The full suite `node scripts/run-tests.mjs` at HEAD gives 1799 tests, 1793 passing and
  3 failing. The failures are exactly these three tests and nothing else.
- Root cause: scout-O2.md said "No test file was found for agents/builder.md's prose ... confirm
  with a repo-wide search before assuming none exists". The builder report says no such test
  exists, but running `grep -rl safety-block` finds `agents/agents.test.mjs` straight away.

Fix, option A (recommended; stays inside O2's two files and needs no test change). Move the
bullet out of the fence so it becomes the first bullet of builder.md's builder-only list, right
after `<!-- safety-block:end -->`. The sentence starts "A builder never…", so it fits the
builder-only section rather than a block that reviewer.md, runner.md and integrator.md also have
to carry. The trade-off: it is no longer on the line directly after the `rm -rf` bullet. It is
still in the same file's rule list, about 8 lines below. Contracts R6 and the spec require
"beside the existing line"; the reviewer brief's "still inside the safety-block fence" is the
scout's reading, and the scout did not know the fence is pinned by a test. The lead should
confirm this reading. Patch for `agents/builder.md`:

Current (lines 17-19):
```
- Never discard or overwrite work you did not just write: no `git reset --hard`, `git clean`, `git stash`, `git checkout`/`git restore` of paths, any force push (`--force`, `--force-with-lease`), `rm -rf`, or `Remove-Item -Recurse -Force`. If the work seems to need one, stop and report.
- A builder never deletes a directory, its own scratch included; a recursive delete waits on a permission prompt nobody is watching, which is how a lane lost 3.5 hours on 2026-09-26. Removal of worktrees and scratch is the lead's own standalone command.
- Never set or switch a git, GitHub or deploy identity: no `-c user.*`, `--author`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `--no-verify`, no login or account switch.
```
Replacement:
```
- Never discard or overwrite work you did not just write: no `git reset --hard`, `git clean`, `git stash`, `git checkout`/`git restore` of paths, any force push (`--force`, `--force-with-lease`), `rm -rf`, or `Remove-Item -Recurse -Force`. If the work seems to need one, stop and report.
- Never set or switch a git, GitHub or deploy identity: no `-c user.*`, `--author`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `--no-verify`, no login or account switch.
```
Current (the two lines at the fence end, then the blank line, then the first builder-only bullet):
```
<!-- safety-block:end -->

- The spec and pinned contracts live in a doc referenced by path in your prompt — read
```
Replacement:
```
<!-- safety-block:end -->

- A builder never deletes a directory, its own scratch included; a recursive delete waits on a permission prompt nobody is watching, which is how a lane lost 3.5 hours on 2026-09-26. Removal of worktrees and scratch is the lead's own standalone command.
- The spec and pinned contracts live in a doc referenced by path in your prompt — read
```
Predicted outcome, checked on a scratch copy outside the reviewed tree: `agents.test.mjs` gives
24 passing and 0 failing, because the fence is byte-identical to base again. The bullet count
stays at 11, the block goes back to its base length (under 2100), and the "builder body names
all six state file sections" test still passes. The `BUILD_MANDATE` edit does not change.
build-loop-workflow.test.mjs is not affected (83 passing and 0 failing, as at HEAD).

Fix, option B (only if the lead rules the sentence must be inside the fence). This goes beyond
R6's O2 file list and needs an explicit lead ruling:
- Add the same bullet at the same position in the safety block of `agents/integrator.md`,
  `agents/reviewer.md` and `agents/runner.md`.
- Change `agents/agents.test.mjs:118` from 11 bullets to 12.
- Deliberately raise the ceiling at `agents/agents.test.mjs:127` from 2100 to at least 2300,
  with a comment that cites this lane, since this is a token-cost decision.
- Decide whether `codex/agents/runner.toml`, which carries a copy of the safety block, gets the
  sentence too. No test pins it.
Downside: every reviewer, runner and integrator prompt would carry a rule that starts
"A builder never…". I do not recommend this option.

## Attack-brief checks (O2) — results
1. **Sentence is verbatim: PASS.** I extracted the quoted sentence from spec.md:20 by script and
   compared it byte for byte.
   - It appears exactly once in builder.md as `- <sentence>`.
   - I parsed the `BUILD_MANDATE` string literal. Its value contains the sentence exactly
     (`lead\'s` unescapes to `lead's`), with no paraphrase and nothing added.
2. **Placement: mixed.**
   - build-loop-workflow.js: PASS. The sentence is inside `BUILD_MANDATE` (lines 148-149),
     between the "no destructive git (…)" clause and "Never send peer notes.". It is used only
     by the build, fix and seam-fix prompts (lines 237, 239 and 338), and no other mandate is
     touched.
   - builder.md: the new bullet sits right after the `rm -rf` bullet, inside the fence, as the
     brief asked. That position is exactly what causes F1.
3. **No collateral edits: PASS.** `git diff d5d769f HEAD` for the two files shows builder.md
   +1 line and build-loop-workflow.js 1 line changed. `cat -A` shows no whitespace churn or CRLF.
   `REVIEW_MANDATE`, `INTEGRATE_MANDATE`, `SETUP_MANDATE` and `ACCEPT_MANDATE` are
   byte-unchanged. The only other files in the builder's commits are under
   `docs/specs/overdue-asks-1/reports/`. The builder did not touch `docs/work/`; the
   spec/contracts/record differences against `3bd6ef6` all come from the lead's `d5d769f`.
4. **R9 still passes: PASS.** I ran `node --test
   skills/team-build/references/build-loop-workflow.test.mjs` myself: 83 passing, 0 failing,
   including `✔ R9: every mandate constant carries the note-send prohibition` and the R9
   rendered-prompt test. `BUILD_MANDATE` still ends with `Never send peer notes.`. The new text
   adds no `\nconst ` or `\n//` that could cut the regex capture short.
5. **No test-file changes beyond necessity: PASS.** build-loop-workflow.test.mjs is unchanged.
   There are no new assertions.

## Other notes (not findings)
- The builder report's first line is `VERDICT: PASS`, which is correct for a builder mandate.
- The builder recorded that `briefs/scout-O2.md` was missing from its worktree and read it from
  /home/ben/Code/wt-oa. That is a setup gap, and the builder handled it correctly.
- My full-suite run left the suite's own sealed home at `/tmp/sealed-home-f3AVU8`; the runner
  leaves it for inspection. I did not remove it; removal is the lead's call. My scratch copies
  are under
  /tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/.
  The reviewed tree was not modified (`git status --short` is clean).
