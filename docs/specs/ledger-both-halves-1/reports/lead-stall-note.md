VERDICT: NEEDS_FIXES 097f6541f03467de66d06c39eceddeca4917ddd0

# Lead note for fix round 2 (relaunch after a stall)

The findings to fix are those in reports/L1-review-1.md. Read it first.

What happened: the round-2 builder edited note-send.mjs and note-send.test.mjs (uncommitted, last write 01:02 NY) and said "Both green". It then ran a verification command that began with `rm -rf "$SCRATCH"` and waited on a permission prompt for 40 minutes. The lead stopped it.

For this round:
1. The uncommitted diff in /home/ben/Code/wt-ledger-both-halves-1-L1 is the previous builder's round-2 work against L1-review-1.md. Review it against the findings, then keep, finish or correct it, run the gate, and commit.
2. Never run rm, rm -rf, or any other delete, including on scratch. For a fresh scratch directory, create a NEW directory name with `mktemp -d` under the scratchpad and leave it in place.
3. Addendum from the spec author (skills-fable-ledger-both-halves-3). In skills/multi/SKILL.md, in lane thirteen's overdue paragraph, the sentence that says the recipient needs a line addressed to the sender in this host's corpus must add that the line is stamped at or after the ASK, which is what the code checks. Change no other words there.
4. The spec author accepted R2 with two constraints, both already in contracts.md R2; keep them exact:
   - `--append-ledger` reads exactly one line from stdin, accepts it only if parseEnvelope does, writes it and nothing else, and has no other side effect.
   - A mirror against an older install without the mode fails open: logged in mirrorLedger, with the exit code and delivery unchanged.
