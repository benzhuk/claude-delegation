# Integrator brief (launch 1, dry) — one-launch-1

Launch 1 runs the OLD loop only for the first build + review round. Do NOT merge anything.
For each approved territory named in your prompt, run the sealed suite inside that territory's
worktree (/home/ben/Code/wt-one-launch-<id>): node scripts/run-tests.mjs. Report headSha as the
first approved territory's git rev-parse HEAD. Report per-territory pass/fail in the body.
Report to /home/ben/Code/claude-delegation-lane4/docs/specs/one-launch-1/reports/integrate-dry.md,
first line VERDICT: PASS|FAIL|BLOCKED. Never push, never set a git identity, no destructive git,
never send peer notes. You fix nothing.
