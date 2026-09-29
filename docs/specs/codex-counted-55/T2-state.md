VERDICT: PASS

Base: `72f1dfc1c026c0e410bf6e74d910550e1fe0f843` in retained `baseline-main` scratch.

Candidate: `112313869b8777182f6e7adf6b07deb820092ec2`.

Owned tests are complete: `scripts/build-census.codex.contract.test.mjs` plus the root-authorized Codex-only changes in `scripts/build-census.test.mjs`. Native fixtures were preserved byte-for-byte. No production or consumer source was edited by T2.

Focused gate: PASS, native exit 0, 498/498 tests. Receipt: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\codex-counted-55\t2-focused-green.txt` and `.exit`.

Cause: false temporal completeness and duplicate-token attribution were insufficiently distinguished from unsupported fields.

Discriminating check: canonical identity, segment union/conflict, temporal witnesses, per-field evidence, native cache schema, response/turn counts, and real four-read propagation now have executable contracts.

Fix location: `scripts/build-census.mjs`; test locations are named in `L55-test-report.md`.

Simplification: synthetic native-shaped JSONL only; no prompt content and no new fixture framework.
