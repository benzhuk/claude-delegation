VERDICT: PASS 591d136bc0968c0c559536109c5b9d5ecbb5a0d9

# Upstream census regression probe

Snapshot: `591d136bc0968c0c559536109c5b9d5ecbb5a0d9`. It was dirty before this
read-only probe: `docs/census.md`, `scripts/build-census.mjs`, and
`scripts/build-census.test.mjs` modified; two unrelated evidence files untracked. The
upstream metadata-only branch remains moving, so these are snapshot observations only.

The named original review note/probe/results files were not present in the accessible
main or integration checkouts. I recreated only their documented synthetic conditions in
`C:\Users\benzh\AppData\Local\Temp\codex-parity-1\upstream-regression-probe.mjs`.

Observed discriminators:
- Healthy default plus workflow discovery counted 2 files and `incomplete: false`.
- Injected `EACCES` on default `subagents/` produced that directory in `unreadableDirs`
  and `INCOMPLETE`, rather than the former silent clean zero.
- Injected `EACCES` on `subagents/workflows/` likewise produced that workflows path in
  `unreadableDirs` and `INCOMPLETE`.
- The real formatted incomplete report made `checkAcceptance` throw
  `census-incomplete` before any acceptance identity check.
- A census with a stale header `leadLastMessageAt` plus a future-dated role label made
  `checkAcceptance` throw `census-stale`; `extractCensusTimestamp` read only the stale
  header timestamp.

No source, repository record, installation, private transcript, commit, or full suite
was changed or run by this probe. This reports regression observations only, not approval.
