VERDICT: APPROVE 4c2bd1e2b6dfffee0b11164c8cdbad18309feb8e

# X1 final review: Codex fresh-project evidence reconciliation

- **Reviewed SHA:** `4c2bd1e2b6dfffee0b11164c8cdbad18309feb8e`, one commit on top of `c05a497`.
- **Reviewer:** Claude Code / `claude-opus-5-5`, session `415ff943-9d2b-4e82-b932-58017acd01e4`.
- **Method:** read-only exact-SHA Git inspection plus retained transcripts, shared note state, and continuation state. No edits, tests, hooks, or probes were run.
- **Scope:** docs only: corrected walk/state/X2 reports, recovery note, evidence pointer, and prior reviews. Nothing under `hooks/`, `scripts/`, `skills/`, or `.codex-plugin/` changed.

This approval covers the docs-only evidence correction. It does not accept the lane.

## Disposition

| Recovery finding | Disposition |
|---|---|
| X-1 parent pane bound to scratch slug | Resolved. `walk.md:13` states parent transcript/id use and the `x1-scratch-codex` binding at 6:43:53 PM America/New_York; `walk.md:98` calls the missed-note outcome unavailable. |
| X-2 unreproducible continuation hash | Resolved. The hash is no longer proof; `x2-findings.md:10` labels the rerun/hash unavailable for independent verification. |
| X-3 OS-error-5 contradiction | Resolved. `walk.md:30` distinguishes unified-exec outer-shell failure from the verified route; `walk.md:119` scopes the observed route. |
| X-4 claims beyond spec | Resolved. `state.md:5-8` remain PARTIAL and `walk.md:131` enumerates what the route does not prove. |

The preserved live transcript is 51 lines, SHA-256 `f1faefecac92f7a6b53dc3dcd8495ea6761553d8fc2f77e73ed7fd471e45bd76`; it verifies card/bearings and peer-delivery context for the stated Orca `powershell.exe` launch route. `inbox-recovery-0926.md` preserves original pre-field lead `01a0daaa-63a0-7f81-a42f-6883d7c68961` and recovery lead `01a0df4c-2809-7520-b1d7-876cc51a87ee` without treating recovery as a new build.

Residual shared-state risk is honestly bounded: the old `term_617edbd1` terminal is closed and its foreign registry entries cannot safely be unbound from the current pane. A note to `x1-scratch-codex` would surface only if the old parent thread resumed.

## Blocking for record readiness, outside this approved artifact

- **R-1 — MAJOR:** the committed work record still has `Artifact: none`, `Evidence: none`, the estimated opening time, and no recovery/review provenance. Move it through the work-record tool to this artifact (or successor), its canonical evidence, measured opening time, and reviewer identity; retain original and recovery lead identities explicitly.
- **R-2 — MAJOR at reviewer observation:** reviewer hooks temporarily registered `skills-a` to the reviewer session. The recovery lead must own/rebind and verify its `codex-queue` thread before waiting on or sending a RESULT. The current owner separately confirmed that repair after review.

## Nonblocking

- Reword the remaining historical “isolated” phrases in `walk.md` so they cannot imply parent-session isolation.
- List each outstanding specification discrepancy with its `spec.md` location for owner pickup.
- Name the foreign leftover registry entries for any future supported janitor operation.

## Minimum next gate

Commit the record update through the work-record tool, while retaining `Status: reviewed` rather than accepting. Then verify the recovery lead owns `skills-a`; only after the sealed suite, `check-acceptance`, and the required census disposition may acceptance be considered. Merging still requires Ben.
