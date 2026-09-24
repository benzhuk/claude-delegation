# Historical build records retained unchanged

These eight original records are archived because their implementations already shipped, while the records still say runnable or delivered. Their original bytes and missing acceptance history are preserved. This is not a retroactive claim that the later strict artifact-acceptance gate ran.

- Package P1–P4 and integrator `a185dc82` are ancestors of 0.12.0 release `cad92e9`. [The existing run-return evidence](../../evidence/package-build-run-return.md) records the four APPROVEs, integrator PASS and actual pilot. P5 records that pilot, but lacks a later per-record acceptance receipt.
- Rename R1 `57b4372`, R2 `3b64350`, R3 `a583e97` and seam repair `5012a4a` are ancestors of 0.13.0 release `5392b9e`. The initial scout incorrectly associated these with0.12; direct ancestry checks corrected that association before this disposition.

The current `listRecords` entry point reads only direct `docs/work/*.record.md`, so these retained originals no longer masquerade as active ready work. No current Children link or filename caller targets them. Historical commit links and evidence remain intact; skill references to P5's work ID describe its historical run. The archived files' before/after SHA256 hashes matched during the move.

Disposition by Astra, September 23, 2026, America/New_York. These builds must not be repeated to repair missing old bookkeeping. Current work keeps its actual artifact, review and acceptance evidence in the active directory.
