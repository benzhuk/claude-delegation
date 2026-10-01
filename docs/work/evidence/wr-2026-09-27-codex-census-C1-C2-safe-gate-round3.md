VERDICT: PASS 1be32d8aa9f90181024d9fa158793ea1daa549fd

At 2026-09-27T11:55:23Z, the integrator admitted the builder's changed artifact through
the authorized process-owned Windows mutex `Global\claude-delegation-verify`. Read-only
preflight found no filesystem lock and no matching heavy Node test process. The focused
gate used no filesystem lock or cleanup.

Command: `node --test scripts/build-census.test.mjs`

Result: native exit `0`; 77 passed, 0 failed; duration `541.945ms`. The immediate native
exit is versioned in the adjacent `.exit` receipt and the full stdout/stderr transcript is
versioned in the adjacent `.log` receipt. Before Git staging, the builder-worktree source
transcript was `9521` bytes with SHA-256
`CF7E27E376C899F9A1D0122728CD218C751278540E095FD5D395686FECF3AEBA`; Git may normalize
line endings in the versioned transcript.

The authorized read-only in-memory Claude golden comparison then passed:

```text
NODE_EXIT=0
EXPECTED_BYTES=1889 SHA256=d367eb6abcb1b7a469b78a72a5c641d7b93ee65221f796c4459dbb8db0ec54d2
ACTUAL_BYTES=1889 SHA256=d367eb6abcb1b7a469b78a72a5c641d7b93ee65221f796c4459dbb8db0ec54d2
GOLDEN=IDENTICAL
```

The comparison executed `scripts/build-census.mjs` with the exact fixture arguments
recorded in `docs/specs/codex-census-0927/claude-golden-base.md`; it wrote no temporary
file. This artifact is ready for a fresh independent review, not yet accepted or merged.
