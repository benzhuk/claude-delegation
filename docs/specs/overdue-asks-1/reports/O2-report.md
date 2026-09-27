VERDICT: PASS

# O2 report — agents/builder.md and BUILD_MANDATE, one pinned sentence

## Round 2 — fix for review finding F1 (2026-09-26)
Reviewer round 1 (`docs/specs/overdue-asks-1/reports/O2-review-1.md`) found one
BLOCKER, F1: placing the new bullet inside `agents/builder.md`'s
`<!-- safety-block:start -->` / `<!-- safety-block:end -->` fence broke three tests in
`agents/agents.test.mjs` (byte-identical-fence-across-four-files, exactly-11-bullets,
under-2100-chars), because that fence is shared verbatim with `integrator.md`,
`reviewer.md` and `runner.md`, which O2 may not touch. The reviewer verified this by
running `node --test agents/agents.test.mjs` (21 pass / 3 fail at the reviewed HEAD,
24 pass / 0 fail at base) and proposed fix option A: move the bullet out of the fence,
to become the first builder-only bullet right after `<!-- safety-block:end -->`.

Applied fix option A exactly as the reviewer specified, since it stays inside O2's two
files and needs no test-file change:
- Removed the bullet from between the `rm -rf`/`Remove-Item -Recurse -Force` bullet and
  the git-identity bullet inside the fence (was line 18).
- Re-inserted the identical sentence, unchanged, as the first bullet of the
  builder-only list, immediately after `<!-- safety-block:end -->` and before "The spec
  and pinned contracts live in a doc referenced by path in your prompt — read...".
- `BUILD_MANDATE` in `build-loop-workflow.js` was already correct per the review (no
  finding against it) and is untouched in round 2.

Verification after the fix:
- `node --test agents/agents.test.mjs`: 24 passing, 0 failing (matches the reviewer's
  predicted outcome exactly; was 21/3 before the fix).
- Territory gate `node --test skills/team-build/references/build-loop-workflow.test.mjs`:
  83 passing, 0 failing (unchanged from round 1 — this territory's own gate never
  exercised agents.test.mjs, which is why F1 was invisible to it). Log refreshed at
  `docs/specs/overdue-asks-1/reports/O2-gate.log`.
- The sentence is still verbatim (byte-for-byte identical to round 1's and the spec's
  text) — only its position in `agents/builder.md` moved, no rewording.
- `agents/integrator.md`, `agents/reviewer.md`, `agents/runner.md`,
  `agents/agents.test.mjs`, and all four other mandate constants remain untouched (still
  outside O2's territory).

Note on the reviewer's "Other notes" section (round 1): the reviewer left a sealed-home
scratch directory at `/tmp/sealed-home-f3AVU8` from its own full-suite run and its own
scratch copies under its scratchpad; neither belongs to this territory and neither was
touched here.

## Scope
Territory O2 per `docs/specs/overdue-asks-1/spec.md` and `contracts.md` R6: add exactly
one sentence, verbatim —

> A builder never deletes a directory, its own scratch included; a recursive delete
> waits on a permission prompt nobody is watching, which is how a lane lost 3.5 hours on
> 2026-09-26. Removal of worktrees and scratch is the lead's own standalone command.

— to `agents/builder.md` (beside its existing `rm -rf` line) and to the `BUILD_MANDATE`
constant in `skills/team-build/references/build-loop-workflow.js`. No other change in
either file.

## A note on the brief's file paths
My brief and the spec/contracts point to
`/home/ben/Code/wt-overdue-asks-1-O2/docs/specs/overdue-asks-1/briefs/scout-O2.md` for
the scout addendum. That path does not exist in my worktree — only `spec.md` and
`contracts.md` are present under `docs/specs/overdue-asks-1/` here. The lead's setup
worktree, `/home/ben/Code/wt-oa` (same base commit d5d769f, branch
`build/overdue-asks-1`, briefs/reports untracked there), has the full brief set,
including `briefs/scout-O2.md` and `briefs/O2.md`. I read both from that path instead
of guessing content. This is a setup/worktree-sync gap, not a contract disagreement; I
am recording it rather than acting on it, per the brief's "check in before touching
any file outside this territory's list" — no file outside my territory was touched to
resolve this, I only *read* from the other worktree.

## Edits (before/after, file:line)

### agents/builder.md (round 2 — final state, per fix for F1)
Round 1 had placed the bullet inside the shared safety-block fence (line 18, between
the `rm -rf` bullet and the git-identity bullet). Round 2 moved it out, per reviewer fix
option A. Final state:

Fence (lines 13-26) is now byte-identical to base `d5d769f` again — the `rm -rf` bullet
(line 17) is directly followed by the git-identity bullet (line 18), no insertion
between them:
```
17: - Never discard or overwrite work you did not just write: no `git reset --hard`, `git clean`, `git stash`, `git checkout`/`git restore` of paths, any force push (`--force`, `--force-with-lease`), `rm -rf`, or `Remove-Item -Recurse -Force`. If the work seems to need one, stop and report.
18: - Never set or switch a git, GitHub or deploy identity: ...
```
The bullet now lands right after `<!-- safety-block:end -->` (line 26), as the first
bullet of the builder-only list, before the "spec and pinned contracts" bullet:
```
26: <!-- safety-block:end -->
27:
28: - A builder never deletes a directory, its own scratch included; a recursive delete waits on a permission prompt nobody is watching, which is how a lane lost 3.5 hours on 2026-09-26. Removal of worktrees and scratch is the lead's own standalone command.
29: - The spec and pinned contracts live in a doc referenced by path in your prompt — read
```

### skills/team-build/references/build-loop-workflow.js
Before (line 148-149):
```
148: const BUILD_MANDATE =
149:   'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no destructive git (reset --hard, clean, stash, force-push, rm -rf). Never send peer notes.'
```
After (line 148-149, same two physical lines — the string stays one JS-string line):
```
148: const BUILD_MANDATE =
149:   'Report to disk; first line of your report is VERDICT: PASS, FAIL, or BLOCKED; never set or switch a git identity; no destructive git (reset --hard, clean, stash, force-push, rm -rf). A builder never deletes a directory, its own scratch included; a recursive delete waits on a permission prompt nobody is watching, which is how a lane lost 3.5 hours on 2026-09-26. Removal of worktrees and scratch is the lead\'s own standalone command. Never send peer notes.'
```

`git diff --stat`: `agents/builder.md | 1 +` and
`skills/team-build/references/build-loop-workflow.js | 2 +-` (one line replaced by
one line, i.e. one line changed) — confirmed no other lines touched in either file.
`REVIEW_MANDATE`, `INTEGRATE_MANDATE`, `SETUP_MANDATE`, `ACCEPT_MANDATE` are
byte-for-byte unchanged (grepped and diffed).

## Autonomy calls (per brief's "Autonomy" section)
- Insertion point in `agents/builder.md`, round 1: as its own bullet immediately after
  the existing `rm -rf`/`Remove-Item -Recurse -Force` bullet, inside the safety-block
  fence — matched scout-O2.md's reading of the spec's "beside" wording, but the
  reviewer found (and I verified) that this breaks three tests in
  `agents/agents.test.mjs` that pin the fence byte-identical across all four agent
  files (F1). Round 2 moved the bullet to just after `<!-- safety-block:end -->`, as
  the first bullet of the builder-only list — same file, same rule list, about 8 lines
  below the `rm -rf` bullet rather than directly beside it. This is the reviewer's
  recommended fix option A; I did not seek a further ruling since option A stays inside
  O2's two-file scope and needs no test-file change, per the reviewer's own
  recommendation.
- Punctuation inside `BUILD_MANDATE`: inserted the sentence as its own two sentences
  (already internally punctuated by the spec's pinned text) between the existing
  "no destructive git (...)." clause and "Never send peer notes.", so the mandate reads
  as a natural run of imperative clauses. The sentence's own apostrophe (`lead's`) is
  escaped as `\'` to match this file's existing single-quoted-string convention
  (confirmed precedent at the `description:` field near line 3 and the `markerFlag`
  line near 354, both of which use `\'` inside single-quoted strings).
- No test assertion added; no file touched outside `agents/builder.md` and
  `build-loop-workflow.js`.

## Verification
- `node --check skills/team-build/references/build-loop-workflow.js` — syntax OK.
- Gate: `node --test skills/team-build/references/build-loop-workflow.test.mjs` — 83
  tests, 0 failures, 0 skipped. Full log at
  `docs/specs/overdue-asks-1/reports/O2-gate.log`.
- Ran the test (not just read the code) and confirmed both R9 checks pass:
  `✔ R9: every mandate constant carries the note-send prohibition` and
  `✔ R9: no rendered prompt across build/review/integrate/setup/seam/accept-prep
  contains any note-send instruction other than the prohibition itself`.
- Confirmed by grep that the literal phrase `Never send peer notes.` is still present,
  unbroken, and trailing in `BUILD_MANDATE` (line 149) — quoted above in the "after"
  block.
- No test-file change was needed or made: `skills/team-build/references/build-loop-workflow.test.mjs`
  is untouched (`git status` shows no modification to it), matching contracts R6's
  "update it ONLY if a test pins the mandate text" and scout-O2.md's finding that no
  such test exists beyond the R9 phrase check, which passes.

## Out-of-scope items — confirmed untouched
- `skills/multi/scripts/note-flush.mjs`, its test, `skills/multi/SKILL.md` (territory O1).
- `REVIEW_MANDATE`, `INTEGRATE_MANDATE`, `SETUP_MANDATE`, `ACCEPT_MANDATE`.
- `skills/team-build/references/build-loop-workflow.test.mjs`.
- `docs/work/`.
- No directory was deleted, my own scratch (none created beyond the reports dir, which
  I `mkdir -p`'d and am leaving in place) included.

## Commit
`90a5fb8f232cabbd5d13c75b9ea4fe8e86aea992` on branch `build/overdue-asks-1-O2` in
`/home/ben/Code/wt-overdue-asks-1-O2`:
`docs(O2): add directory-deletion rule to builder.md and BUILD_MANDATE`.

## Cleanup
No dev server, no background process, no scratch directory was started or created by
this task beyond the report/state files under `docs/specs/overdue-asks-1/reports/`,
which are left in place per the brief. Nothing to kill or reap.
