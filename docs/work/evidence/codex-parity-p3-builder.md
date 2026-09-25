VERDICT: PASS 0eebff1a0b6c8ea129d538dbf49f382d47ef3c3b

# P3 documentation report

Artifacts: `a7dcd5219520b5135633b11e5c8f8a58b7a69879`, then
`0eebff1a0b6c8ea129d538dbf49f382d47ef3c3b`

Changed only:
- `skills/bearings/SKILL.md`
- `docs/native-use.md`
- `README.md`

The docs now describe the P1 contract with the review corrections: native SessionStart
metadata must be available and positively classify a lead; each eligible prompt receives
the card/advisory without fired/tally state; missing versus rejected cards, the three
switches, per-checkout receipts, advisory authority limits, and unverified Codex slash
invocation are explicit. The next entry remains 0.20.9 with no version bump.

Checks: `git diff --check` passed; all relative Markdown links in the three changed files
resolved locally; reviewed the diff against the P3 scout, adjudicated contracts, and
accepted review instructions.

Limitations: no install, hook execution, native runtime, private transcript, tests, or
full suite was run. The 0.20.6 rollout remains installation evidence, not proof of this
uninstalled source change or universal event execution. P1's final runtime SHA must be
checked at the integration seam before these source claims can be accepted as matching
the implementation; this standalone documentation branch is not that evidence.
