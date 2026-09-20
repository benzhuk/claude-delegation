# Merge ask template

Copy this into the actual ask. Every field is stated, not left blank — a field with
nothing to report says so (`Research: none-needed: <why>`), it is never omitted.
Every claim in a filled-in field names the command that observed it (`docs/subagent-
contract.md`'s state-over-intent rule): "pushed" means `git rev-parse origin/<branch>`
was read and matches; "merged" means the target branch's log was read, not that a merge
command ran.

```
Branch: <name>
Tip: <sha — from `git rev-parse HEAD` on the branch, read at ask time>

Review verdict: <APPROVE | NEEDS_FIXES> — reviewer tier: <mid | high>, report: <path>
Gate: <the command run and its result, e.g. `npm test` — N passed, 0 failed>

Adds: <what this merge adds that we now maintain — new files, new deps, new surface area>
Deletes: <what goes away — dead code, retired paths, files removed>

Research: <report id/path from docs/research-ladder.md, or `none-needed: <why>`>

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
- **Research** is never left implicit. If no research lane ran, say why it wasn't
  needed (small change, no defect class recurred) rather than leaving the field out.
- **Cleanup** is part of done (`skills/team-build/SKILL.md`'s Ship section) — an ask
  without a cleanup line is an ask that hasn't finished.
