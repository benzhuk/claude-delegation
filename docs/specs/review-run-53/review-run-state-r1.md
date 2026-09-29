# Lane 53, fix round 1 — state

## Territory
`skills/team-build/scripts/review-run.mjs` + its test file, plus `hooks/multi-inbox.js` /
`hooks/multi-inbox.test.mjs` and `skills/team-build/SKILL.md` for finding 12's doc/log-line only.

## Contracts I rely on
- `docs/specs/review-run-53/review-r1.md` (14 findings) and `lead-ruling-r1.md` (exceptions:
  finding 1(c) re-decided by live probe this round, finding 3 drop-PowerShell-everywhere, finding
  14 review's fix as-is, finding 11 run the real P4).
- `agents/reviewer.md` frontmatter (read-only): `tools: Read, Grep, Glob, Write, Bash, PowerShell`.
- `scripts/test-home.mjs`'s sealed-home contract: `FIXTURE_ROOT` env var is the one directory
  whose `includeIf` glob seeds a git identity under a sealed `node scripts/run-tests.mjs` run.

## Done
All 14 findings applied, one commit per finding (see `build-r1.md`'s table for the exact SHAs).
54 tests in `review-run.test.mjs` (294 across the scoped gate). Live probe round: 8 of a 10-run
budget, items 1–5 in order, all via `review-run.mjs`, all against decoys. Mode decision: kept
`auto` (not the ruling's default-branch `dontAsk` — `dontAsk` was found, live, to never deliver a
report at all; see `build-r1.md`'s "Mode decision" section for the full reasoning). One bug the
probes found and fixed beyond the 14: the scoped `Write` rule's doubled leading slash
(`6fd4af8`). Gate and full suite both green at final HEAD `cb66b71`.

## Next
Nothing of mine is pending. For whoever picks this up next:
- Items 6 (Windows), 7 (Codex-launched), 8 (P2b after release) are lead steps, not a builder's.
- The `auto`-mode residual gaps in `build-r1.md`'s Gap: paragraph (`--git-dir=` equals form; raw
  Bash writes outside cwd) are real and unclosed — closing the second one needs a different
  mechanism than another `Bash(...)` disallow entry (there's no fixed prefix to name).
- `dontAsk`'s report-Write denial is a platform-level open item (compiled binary, no local source
  to root-cause against) if anyone wants `dontAsk` viable in a future round.

## Open questions
See `build-r1.md`'s "Open questions / not independently confirmed" section: the `flush-last.json`
cross-talk in the real P4 probe (attributed to unrelated concurrent host sessions, not re-confirmed
with a host-quiet rerun), and whether this project's own `Bash(git -c:*)` disallow entry
independently catches `git -c user.email=...` (masked by the PreToolUse hook firing first).

## How to run my gate
```
node --test skills/team-build/scripts/review-run.test.mjs hooks/delete-guard.test.mjs hooks/multi-inbox.test.mjs scripts/mirror-shared-skills.test.mjs
node scripts/run-tests.mjs
```
Both green at HEAD `cb66b71` (294/294; 2980/2985 + 5 skipped, 0 fail). Logs:
`docs/specs/review-run-53/review-run-r1-gate.log`, `review-run-r1-full-suite.log`.
