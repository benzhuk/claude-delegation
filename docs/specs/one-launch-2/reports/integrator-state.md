# Integrator state — one-launch-2

Territory: F1 (build/one-launch-2-F1, sha 8791423e37a85d2fee31854c7eade696fde2552e, review
APPROVE for that exact sha) — merged into build/one-launch-2.

Merge commit: 2f659bf574fa66460fe3f34cff4ae4013cd54e97 (ordinary merge, no rebase, not pushed).

Gate run 1 (post-merge, full suite): `node scripts/run-tests.mjs` from /home/ben/Code/wt-olfix
at HEAD 2f659bf574fa66460fe3f34cff4ae4013cd54e97.
Result: tests 1746 / pass 1740 / fail 3.
Failing test names: N2 (skills/multi/scripts/hooks.test.mjs), V4 (skills/multi/scripts/mirror-shim.test.mjs),
H6 (skills/multi/scripts/note-send.test.mjs).

Base comparison run: scratch worktree at base sha 33aa023bd927b44b23292d540cc0c2aed4ced212,
created under the session scratchpad, `node scripts/run-tests.mjs` there.
Result: tests 1714 / pass 1709 / fail 2.
Failing test names: V4 (skills/multi/scripts/mirror-shim.test.mjs), H6 (skills/multi/scripts/note-send.test.mjs).
Scratch worktree removed after the run (`git worktree remove`).

Diff (failing test names, this branch minus base): N2 — NEW, not present in the base run.
V4 and H6 are present in both runs (pre-existing, matches contracts.md R6's pinned list).

Territory-scoped gate (verbatim, R6/F1): `node --test skills/team-build/references/build-loop-workflow.test.mjs
skills/team-build/references/accept-prep.test.mjs` from /home/ben/Code/wt-olfix at the merge
commit: tests 100 / pass 100 / fail 0 (matches F1's own report).

Triage: N2 is a repo-wide sealed-suite invariant (skills/multi/scripts/hooks.test.mjs) that
scans every *.test.mjs file for `...process.env` spreads outside the sealed `childEnv()` helper.
F1's new file skills/team-build/references/accept-prep.test.mjs has four spawn sites
(lines 367, 395, 423, 441, each `const env = { ...process.env, ... }`) that spread
process.env directly instead of using childEnv(). This is a new failure caused by F1's own
new test file — not present in the base run, not one of the two contracts.md-pinned
pre-existing failures. Triaged to F1.

Verdict: FAIL (one new failing test name vs base: N2).

Not done (out of scope for integrator): no fix applied, no ship decision made, lead's
dogfood step untouched, R7/R8 uncommitted doc edits left as found.
