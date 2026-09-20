# Merge ask template

Copy this into the actual ask. Every field is stated, not left blank — a field with
nothing to report says so in the form its own line prescribes (`Deletes: 0 — nothing
retired`), it is never omitted. Goal and Nearest non-goal are the one exception: they
are OMITTED, not filled with a placeholder, when the project has no goal card (see below).
Every claim in a filled-in field names the command that observed it (`docs/subagent-
contract.md`'s state-over-intent rule): "pushed" means `git rev-parse origin/<branch>`
was read and matches; "merged" means the target branch's log was read, not that a merge
command ran.

```
Branch: <name>
Tip: <sha — from `git rev-parse HEAD`, read at ask time>
Pushed: <sha — from `git rev-parse origin/<branch>`, read at ask time> — equal to Tip: <yes | no>
  (no means the ask is premature: push, re-read both shas, then ask)
Base: <target branch> @ <sha — `git rev-parse origin/<target>`>, behind by <n>
  (`git rev-list --count HEAD..origin/<target>`)

<!-- Goal / Nearest non-goal: include the next two lines ONLY if the project has a goal
card (project config `goal_card`, default `docs/goals/card.md` — GOAL/NOT/DONE/KILL/
SOURCE lines). No card yet: delete both lines entirely, never fill them with a placeholder. -->
Goal: <the card's GOAL line this change serves>
Nearest non-goal: <one NOT line quoted verbatim from the card, and one sentence on why
  this change does not cross it>

Review verdict: <APPROVE | NEEDS_FIXES> — reviewer tier: <mid | high>, report: <path>
Gate: <the command run and its result, e.g. `npm test` — N passed, 0 failed>

Adds: <N files, N deps — read from `git diff --stat <base>...HEAD` — and in one line what
  we now have to keep passing the gate forever. "none" is valid only when that diff shows
  0 added files and 0 added deps>
Deletes: <N files/paths removed, named, from the same diff. If none, write "0 — nothing
  retired", so the ledger shows the build was purely additive>

Research: <report path, plus its verdict line copied verbatim> or
  `none-needed: <the cost-tier test it passed — files touched, 0 new deps, no new
  long-lived mechanism, no defect class at round 3>`

Cleanup: <worktree removed? scratch cleared? stray branches gone? — state what was
  observed (`git worktree list`, `git branch --list`), never what was intended>
```

## Field notes

- **Tip** is read fresh at ask time, not copied from an earlier status — a stale tip
  makes the whole ask describe a branch that no longer exists.
- **Review verdict** always names the reviewer's tier (`docs/model-tiers.md`) — an
  `APPROVE` from a mid-tier reviewer on a high-risk territory is a different fact than
  one from a high-tier reviewer, and the ask must let the reader tell them apart.
- **Adds / Deletes** is the maintenance ledger, not a diff summary — "adds a new script"
  matters less than "adds a script we now have to keep passing `npm test` forever."
- **Goal / Nearest non-goal** turns "serves the goal" from free text into a check
  against the project's own goal card (project config `goal_card`, default
  `docs/goals/card.md`) — naming the nearest NOT line, quoted verbatim, is not
  rubber-stampable the way a free sentence is. Conditional, not constant: a project
  with no goal card yet gets both lines DELETED from the ask, never filled with a
  placeholder — a field whose value is the same string on every ask stops being read
  within a week.
- **Research** is never left implicit, and "small change" is not a reason on its own —
  name the cost-tier clauses it passed (`docs/research-ladder.md`). A non-empty `Adds:`
  line and a `none-needed:` research line in the same ask contradict each other.
- **Cleanup** is part of done (`skills/team-build/SKILL.md`'s Ship section) — an ask
  without a cleanup line is an ask that hasn't finished.
