# G1 lead ruling — September 26, 2026 (America/New_York)

Base: `68d2a154505665f98280d73e88e4a4d6cf05b020`. Spec source is `docs/specs/2026-09-26-gate-under-load.md@b786916`; the pack's `spec.md` is an exact local copy, not a path claimed to exist at that revision.

The scout correctly identifies that an immediate call after a lossy fan-out is not guaranteed to cross the threshold. Source lines 417–428 fire at 40 recorded batches or after the existing time fallback; they do not promise a maximum number of concurrent calls needed to reach 40. This establishes a test-premise mismatch, not cancellation in the production hook.

Keep the specified fan-out and process-exit checks. If no concurrent process fired, advance the fixture's existing fired timestamp past the documented fallback interval, then require the single sequential PostToolBatch call to exit zero and emit the card. Use the existing time-test helper/pattern; do not sleep thirty minutes, poll until green, modify the tally to fake a crossing, or change production code. The test's name and explanation must identify the time fallback. This preserves the actual delayed-never-cancelled promise and fails when the hook never fires.

The sibling counter/threshold assertions remain byte-for-byte unchanged. Independent Opus review must challenge never-firing and early/duplicate firing behavior and verify the opt-in is read only in the timing test. No new public contract/stub is needed for these two test-local changes. No production module or sealed-runner modification is authorized.

The spec's deliberately concurrent single-file-under-one-suite exercise is a bounded load experiment. Outside that exercise, serialize expensive verification. Never run a second unrelated suite alongside it, kill another lane's process, or accept a retry as a replacement for a recorded failed observation.
