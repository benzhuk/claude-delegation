VERDICT: PASS 05240dcb7bbf9f04663c45c63b3f8b315aa8e8a2

At 2026-09-27T12:01:04Z, the integrator admitted the isolated C3 proposal through
the approved process-owned Windows mutex `Global\claude-delegation-verify`. Read-only
preflight found neither the filesystem lock nor a matching heavy Node test process. The
gate used no filesystem lock or cleanup.

Command: `node --test scripts/four-read.test.mjs`

Result: native exit `0`; 65 passed, 0 failed; duration `5331.21ms`. The immediate
native exit and full stdout/stderr transcript are versioned in the adjacent receipts.
Before Git staging, the builder-worktree source transcript was `8402` bytes with SHA-256
`05BACA5C651AB8D59BA3B80A4A4ADAE68D0B456D7CF1E221E4E7407480BE86F5`; Git may normalize
line endings in the versioned transcript.

The transcript includes an expected fixture invocation of a deliberately unresolvable
Git range, `not-a-real-ref..0123456`; its diagnostic appears on stderr while its
corresponding fail-closed test passes. This proposal remains unmerged pending root
adjudication and a separate review decision.
