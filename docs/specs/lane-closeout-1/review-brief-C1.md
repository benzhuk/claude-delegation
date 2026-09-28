# Review brief C1 (lane 36): Scratch field, close --closeout, sweep-origin

Artifact: wt/lane-closeout-1-C1 at ad2aac97d7ff48836809b69e6584694841a03120, in the worktree /home/ben/Code/claude-delegation-wt/lane-closeout-1-C1. Diff it against base 7b00418621f3b7dc168a2c1aa2f7d3618b1b6d45.

Read the C1 rulings in contracts.md (next to this file) and the builder's report, reports/C1-report.md.

One suite failure is already known: "docs/GOALS.md ... STALE regexes". It fails at base too, so ignore it.

## What is at stake
This code deletes real things:
- worktrees and local branches;
- branches on origin, the plugin's first origin delete;
- a directory tree, removed with `fs.rmSync` where the delete guard never sees it.

A wrong refusal costs a manual step. A wrong delete loses work. Attack the delete paths first.

## Attack surface

### Scratch removal
Try to make it delete something outside the lead's own session scratch:
- a `Scratch:` value that uses `..` segments, or a trailing slash;
- a symlinked ancestor, or a symlink as the target itself;
- the session id appearing only as a substring of a segment, or only as the root, or as the target itself;
- `DELEGATION_SCRATCH_ROOTS` set to `/`, to `~`, or left empty (an empty entry resolves to cwd);
- a target that is a git worktree, contains a `.git` entry, or is the repo root;
- a Windows case mix;
- a race between check and delete: note it, don't exploit it.

Also check that `--by` must equal `Lead-session:`.

### Origin delete
Try to get a branch that should be refused past `evaluateOriginBranch` (or its equivalent):
- a fresh branch cut from main, whose tip is an ancestor of main;
- a fast-forward-merged branch with no merge commit;
- a branch whose tip is main's own tip;
- `docs/*` and `feat/*`;
- a branch named by an open record;
- the record's own branch named in a different form, such as `origin/build/x` against `build/x` against a path;
- a record whose `Artifact:` is a bare sha.

Check what happens when `git fetch` fails. It must refuse everything, never proceed on stale refs.

### sweep-origin
- It must be a dry run by default.
- `--exclude` parsing: spaces, and a trailing comma.
- Every deleted branch must get a restore line.
- Tests must use only a bare fixture origin. Grep the tests for any push to a real remote.

### closeout
- `--dry-run` must change nothing. Prove it on a fixture by comparing the tree and refs before and after.
- A dirty worktree must be reported, never forced.
- `-d`, never `-D`.
- It must refuse the main worktree, and the worktree that contains cwd.
- The Log line must be written by the script only, and only when it is not a dry run.
- `close` without `--closeout` must be byte-identical in behavior to base.

### The Scratch field
- It is a singleton.
- `SCRATCH_FROM` is a placeholder in 2099, and the checker can be injected with `opts.scratchFrom`.
- A record without a `Scratch:` line from before the cutoff gets a warning only.
- A non-absolute value is refused.

### Also
- A test that passes because it isn't looking: does every refusal test assert the specific reason, or only a nonzero exit?
- Does the builder's "unreachable refusal" fix hide a real ordering bug?

## Rules
You are read-only on the worktree.

Scratch work goes under /tmp/claude-1000/-home-ben-Code-claude-delegation/ad389ae1-f992-4dd3-8a19-2b51176675c1/scratchpad/lane-closeout/C1-review/. Use fresh names there, and a bare fixture origin.

Never run any shell deletion command, and never put one in a script you run. A reviewer on the last lane hung for 4.8 hours on a script that began with rm -rf. Exercising the code under review is fine only on fixtures inside your scratch dir, through node.

Never touch the real origin's branches.

If a command is denied, stop that step and report it verbatim.

## Report
Write the report to reports/C1-review.md.
- Line 1: `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES <sha>`.
- Then the findings. Each one carries a severity, file:line, a repro, and a concrete fix (exact old → new text where the fix is mechanical).

ETA 60 minutes.
