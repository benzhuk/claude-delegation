# Review brief M1 (lane 25), Opus, read-only

Worktree /home/ben/Code/claude-delegation-wt/multi-cross-host-1, artifact 3ba1cb4 (diff 0c92605..3ba1cb4, plus docs). Spec: docs/specs/multi-cross-host-1/spec.md (pinned text wins). Builder report: docs/specs/multi-cross-host-1/reports/M1-report.md and its state file (read its Open Questions).

Attack brief:
1. Refusal conditions: prove each of the five pinned conditions is enforced exactly. Hunt a path where a note nobody here can read still lands only in the local ledger with exit 0 or 2 (ACK/FYI kinds, --no-type, quiet kinds, a --by or --needs variant, a slug differing only in case, an inbox file that is unreadable or malformed, an inbox registered for a different slug). And the reverse: a legit path now refused (--to ben, --recipient-repo, a real mirror target, a registered inbox, the typed path with an ambiguous pane). Does the refusal write NOTHING (no ledger, no mirror, no outbox, no wake queue)?
2. Callers: grep every note-send caller in scripts/, hooks/, skills/ (collector collect-status.mjs, note-flush overdue BLOCKED, janitor, goal-card, decisions). Does any live caller now hit exit 6 and lose a note it used to record? Name file:line.
3. Defect 2: ACK answers only a Needs: ack ASK, only from the ASK's `to`, only with re = the ASK id, only at or after the ASK instant. Try self-ACK, stale ACK, ACK re a different id, ACK to a review ask, a Needs line with extra text ("ack by 22:00"), a cross-host ACK that exists only in the mirror half. Does the rewritten pinned test still assert the review case?
4. The builder's reinterpretation of "typed path still exits 2 after the ledger write when an inbox IS registered": is the clause really untestable, or did it miss a shape (inbox registered, typed kind, pane lookup still runs)? Judge.
5. A check that passes because it isn't looking: mutate the refusal off (or flip one condition) and confirm at least one test fails; same for the ACK rule. Revert your mutation via node fs or git checkout of that one file only; never leave the tree dirty. No rm, no deletion commands.
6. Docs: SKILL.md exit table, envelope.md N3, overdue-asks-1 spec dated line; accurate against code?

Run: node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs (not the full suite).
Findings: severity, file:line, concrete fix, ready patch for mechanical ones. Report to docs/specs/multi-cross-host-1/reports/M1-review.md, line 1 exactly `VERDICT: APPROVE <full sha>` or `VERDICT: NEEDS_FIXES <full sha>`. Do not commit. Never touch docs/work/. Never send a real note.
