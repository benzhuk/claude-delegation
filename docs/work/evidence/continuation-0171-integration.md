VERDICT: PASS — release metadata prepared, uncommitted

Scope: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `README.md`, and a
new `CHANGELOG.md`; no skill, runtime, installation, activation, or record change.

- Both manifests now declare `0.17.1`, name ongoing continuation through wave/status
  closeout, and retain the explicit no-scheduler/no-automatic-owner-recovery boundary.
- README gives the same narrow user-facing behavior and keeps the no automatic restart or
  authority guarantee.
- No historical CHANGELOG existed in the repository or reachable history, so the new file
  contains only the 0.17.1 entry; there was no user content to preserve.

Validation:
- JSON parse plus delegation marketplace-entry version equality: PASS (`0.17.1` / `0.17.1`).
- `git diff --check`: PASS.
- Existing read-only `scripts/mirror-shared-skills.test.mjs`: 11/11 PASS; no installer ran.
- Read-only inventory check resolved `continue`, `team-build`, and `delegate` from this
  source tree, and both callers contain a route to continue's canonical decision.
- The three skill quick validators already passed at `bcbf466`; no skill files changed here.

Diff stat: 16 insertions, 8 deletions across four release files. No commit was made.
Limit: source inventory is valid; the known installed mirror remains 0.13.0 and requires its
separately scoped rollout, so this does not claim installed Codex discovery.
