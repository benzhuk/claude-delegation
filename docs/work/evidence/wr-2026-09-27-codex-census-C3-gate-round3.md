VERDICT: PASS 2f8e8ac5625740d89ae41fd9307c713bb9d2ab2b

At 2026-09-27T12:20:30Z, the integrator admitted isolated C3 round-three through the
approved process-owned Windows mutex `Global\claude-delegation-verify`. Read-only
preflight found neither the filesystem lock nor a matching heavy Node test process. The
gate used no filesystem lock or cleanup.

Command: `node --test scripts/four-read.test.mjs`

Result: native exit `0`; 68 passed, 0 failed; duration `12158.3704ms`. The immediate
native exit and full stdout/stderr transcript are versioned in the adjacent receipts.
Before Git staging, the builder-worktree source transcript was `8752` bytes with SHA-256
`FD12295448CA3C73C3AC104E3707CF59DE671D41C5E7A73B56F77C69D7726A95`; Git may normalize
line endings in the versioned transcript.

The transcript includes an expected fixture diagnostic for the deliberately unresolvable
Git range `not-a-real-ref..0123456`; the associated fail-closed test passes. This artifact
is ready for a code-only C3 delta review and remains unmerged. Fixture-provenance and C1
regression writer work are outside this gate and remain unstaged.
