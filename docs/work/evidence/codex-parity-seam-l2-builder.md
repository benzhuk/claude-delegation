VERDICT: PASS 004a059384e4f48751b72b790e52aa4f769c4eff

# Seam L2 fix

Changed only `scripts/work-record.mjs` and `scripts/work-record.test.mjs`; nothing was
staged or committed. An exact `VERDICT: UNSUPPORTED` first line now retains the existing
`census-missing` code but explains that the census is not complete and directs the caller
to `--no-census "<reason>"`. The generic unrecognised-header branch is unchanged.

The new real seam test invokes `build-census.mjs` on the synthetic Codex fixture, writes
its actual CLI Markdown output, passes that path to `acceptRecord`, and verifies
`census-missing`, `UNSUPPORTED`, the no-census route, and an unchanged `reviewed` status.

Focused sealed check: `node --test scripts/work-record.test.mjs` — 120 pass, 0 fail,
0 skipped, 24,171.1648ms. `git diff --check` passed.

The checkout concurrently contains root/other-territory changes in docs/work, goal-context,
and build-census files; this fix did not modify them. No live session read or installation
occurred.
