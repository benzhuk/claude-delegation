VERDICT: READY db88bbd892f24d0928df031c759852e0314f4559

# Lane40 independent contract-test report

Date: 2026-09-29 America/New_York

Branch: `build/knowledge-triage-40-tests`

Base: `9cad287a5a0567d1e4fbe9e1ccfc25117828b620`

Test commits: `888729f` and `db88bbd`

The four owned test paths contain 38 new contract cases. The two new files are below the 800-line limit (`knowledge-gather.test.mjs` 583 physical lines; `knowledge-triage.test.mjs` 432 physical lines). Every fixture uses a temporary or sealed `FIXTURE_ROOT` home. SSH, Claude, Git and chezmoi are real Node command-prefix children; scheduler execution is injected. No live store, SSH host, Claude account, task, settings, Notion page or Git publication was touched.

## Contract coverage

- Gather/import: stable top-level selection, source bytes/hash/mtime, fixed pending/null alias reasons, unreachable-host truth, local/two-remote content deduplication, repeated gather, changed same-name versions, safe names/case collisions, atomic visible outcomes, and managed evidence retention.
- Archive/reconcile: status-frontmatter mutation matched against original bytes, cross-month destination stability, changed origins and conflicting archives preserved, resurrected source reported, origin-missing and superseded terminal outcomes reported once, and staged bytes retained for unresolved/terminal states.
- Tar and resources: checksum/path/link/global-PAX rejection, truncated stream rejection, 1 MiB skip with continued import, 1000-entry bound, GNU/libarchive metadata keys, and actual local GNU tar 1.35 plus libarchive/bsdtar 3.8.8 PAX producers with a long-path record.
- Process isolation: the full pinned SSH options, environment allowlist with secret/API/Git identity exclusions, bounded host timeout, nested timeout, and zombie-aware proof that owned grandchildren die.
- Runner: writer and kill-switch skips, missing skill/CLI, existing ATTENTION, cap 60 deterministic selection, exact digest-slug prompt sentence, managed/oversize/unsupported residue, two-run lock and skill-deferral escalation, job-local concurrency, nested nonzero, token-unavailable truth and aggregate token math, session recording, out-of-selection attention, and missing digest entry residue.
- Publication: HEAD movement alone is insufficient; fixture commands distinguish unchanged HEAD, unrelated HEAD, fresh remote mismatch and committed-DIGEST identity. Changed publication failures become ATTENTION; a no-change remote mismatch defers without ATTENTION.
- Installer/counts: existing job generator bytes remain stable, triage XML is disabled/interactive/PT2H with chosen first-run date, create-query-enable-run order, writer-only exit 2, triage-only removal, UTF-16LE BOM, and read-log session exclusion with absent/corrupt/non-array fallback.

## Discrimination and verification

The fixtures contain four explicit fault variants requested by the brief:

1. Duplicate import: identical local/netcup/hetzner bytes must produce no second canonical note, including on repeat gather.
2. Unchecked origin move: changed source, conflicting archive and resurrection each require a non-success disposition while both source and evidence remain.
3. Unrelated publication HEAD: the fake Git child advances HEAD but reports no DIGEST-touching commit; success is forbidden.
4. Child-only kill: fake SSH and Claude children each spawn a grandchild; the deadline assertions fail if the tree, rather than only the direct child, is not terminated.

Structural verification passed for all four test files with `node --check` and `git diff --check`. Under the bounded `Global\claude-verify` mutex, the pre-integration count suite produced 16 pass / 1 expected fail: the sole failure is the newly required session exclusion in production. The Lane40-filtered installer suite produced 1 pass / 4 expected fails: existing-job byte stability passes, while the four unimplemented third-job behaviors fail. The new gather/runner files were not executed against this branch because their production modules do not exist at the test base; import failure is expected and was not presented as a green gate.

## Limitations and integration gate

Root added the bounded test-only command/time seams in `test-seam-ruling.md` after dispatch. Those root-owned files are deliberately absent from the test commits. The integrated gate must use the identical revised contract, merge production, then run exactly:

```text
node --test scripts/knowledge-triage.test.mjs scripts/knowledge-gather.test.mjs scripts/install-janitor-timer.test.mjs scripts/knowledge-counts.test.mjs
```

Run that one focused gate under `Global\claude-verify`. Mocked Git/chezmoi output proves operation semantics and false-positive rejection; it does not prove an actual publication. The later G1 live proof remains required for real commit/push/remote identity.
