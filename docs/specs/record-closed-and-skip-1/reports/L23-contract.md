READY

Fixture repair after the failed independent gate: CLI IO now uses its established stdout/stderr writers; Git fixtures use `makeTempHome({ gitIdentity: true })` and clean their sealed homes; continuation fixtures prove `validateRecord(...) === []` before snapshotting, use `Owner: none` for runnable, and use the header owner in the closed receipt.

Contract matrix (not run pending implementation gate):

- Actual temporary Git repository: `close` accepts an accepted record, requires a merge ancestor of `origin/main`, writes the fixed closed receipt, and validator accepts the result.
- Byte-preserving refusals: source not accepted, non-ancestor merge, already closed, and stale `--at`; terminal `closed` also refuses withdraw.
- Validator: hand-edited closed status without accepted/closed receipts is a finding.
- Continuation: one valid selected record for every `STATUSES` value, including `closed` and `withdrawn`, yields `OK` buckets.
- Prefixes: collector explicit `build/`, `feat/`, and empty prefix; status default `build/`, skipped count, excluded noise row, empty-prefix inclusion, legend, and `lane` heading.
- Change key: independently written default and explicit-prefix status files retain a key for identical listed rows while Markdown presents `lane`; adding the formerly skipped row changes the key.

This test intentionally imports the pinned additive public API (`closeRecord`) and will fail before the implementation exposes it.
