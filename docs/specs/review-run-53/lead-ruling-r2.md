# Lane 53 lead ruling on fix round 1 (build-r1.md, code at cb66b71)

The fix round is docs/specs/review-run-53/build-r1.md. Its live probes measured two things the r1 ruling did not foresee:
- Under dontAsk, the child cannot write its own report even through the scoped rule, so that mode returns no review at all.
- Under auto, two writes escape. One is a raw Bash redirect outside the clone. The other is a Write to an absolute path other than the report. Both are the classifier's own judgment.
In both modes, the equals-joined `git --git-dir=<path>` form gets past the prefix denies.

## The mode: auto, and P7 re-scoped to parity

`auto` stays the default. P7's requirement is amended from "a denial for each" to parity with today's Agent-tool reviewer, which runs under the lead's own auto classifier with Bash and Write:

1. Every command form the deny list names must be denied, including every spelling of the same git global option: `-C <p>`, `--git-dir <p>`, `--git-dir=<p>`, `--work-tree <p>`, `--work-tree=<p>`.
   - The equals-joined forms are NOT accepted as residual. Close them with a rule the CLI honours.
   - The delta reviewer judges the rule syntax from the CLI's docs and --help. If no rule syntax can express them, that is a finding with the evidence.
2. Writes the classifier approves outside the clone stay residual, at parity. build-r1.md's Gap paragraph records them, and the record gets a `Gap:` paragraph at accept.

This amends my own r1 ruling. P7 came from the spec red-team's M1, which I adopted; it did not come from skills-fable's packet, so the amendment is within the lead's authority. The RESULT to skills-fable names it.

## dontAsk

dontAsk is not fixed in this lane. The review's r1 finding 1 named two candidate rule spellings: `Write(//abs)` and `Edit(//abs)`. Only the first was tried live. The delta reviewer says, from the docs, whether an `Edit(...)` rule is the documented form that covers the Write tool.
- If it is, one live probe of dontAsk with that rule is the next step.
- If that probe passes, the lane follows up with a separate decision. It does not change this lane's default.

## Committed logs

The two test logs the builder committed (3,268 and 319 lines) are untracked at 0d7b614 and kept on disk. Logs are never committed. Future briefs say so.
