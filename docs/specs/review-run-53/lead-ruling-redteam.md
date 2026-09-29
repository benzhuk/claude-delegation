# Lane 53 lead ruling on the spec red-team (NEEDS_FIXES 7ab59db)

The red-team is docs/specs/review-run-53/redteam.md, a copy of the reviewer's report. Every finding is adopted with its replacement text, except the two decisions below, which change the packet's own direction and so belong to its author, skills-fable. Where this ruling and the record's spec disagree, this ruling wins.

Adopted as written:
- **B1:** the verdict regex matches accept's normalization, NEEDS_FIXES (n) included.
- **B2:** `--setting-sources user`, `--strict-mcp-config`, and probe P6.
- **B3:** P2 splits into P2a and P2b, each of which must pass on its own. For the fix, see Decision 2.
- **M1:** permission mode `auto` first, and `dontAsk` only by probe, with a reason. `--disallowedTools` is always passed. Isolation is a shared clone with its origin removed, not `worktree add`. Probe P7.
- **M2:** the environment is the caller's minus a denylist, never `cleanEnv`, and the argv never names the session.
- **M3:** the agents JSON carries effort and omitClaudeMd. `--effort` and `--tools` are always on the argv. The fallback is `--system-prompt` before `--append-system-prompt`. P1 gains parts (i) to (iii).
- **M4:** the report path is absolute and new, never overwritten, and never inside the run directory.
- **M5:** owner.json, one try/finally, signal handling, a sweep of stale runs, cleanup retries, exit 7 for an internal error, and the Codex tool-timeout rule.
- **M6:** the sidecar is copied into the repo but never listed in `Evidence:`. The reviewed Log line names the model and the session.
- **M7:** role order is `--plugin-root`, then the installed user or project entry, then walk-up. The cache is never scanned. A root inside the reviewed repo exits 4. The sidecar carries roleSource and installedRoleSha256.
- **M8:** probes run on Netcup and ben-desktop. The a2 quality check on 90beeb9 must return NEEDS_FIXES and name the Stop-null mutant gap. A Codex-launched run gates accept, and if skills-a cannot run it, the lead runs it from a Codex exec on Netcup.
- **m1 to m9**, all as written:
  - the prompt goes on stdin, and a claude.cmd shim exits 4;
  - KNOWLEDGE_DIR goes to scratch;
  - `--scratch` is required;
  - the census line gets the fuller text;
  - `--sha` is validated, the git environment is stripped, and only node builtins are imported;
  - prune runs only when the path is gone;
  - the path is `skills/team-build/scripts/`, and the mirror test asserts it;
  - the inline-reply fallback applies;
  - Bash(claude:*) is on the disallow list, and the marker is documented as accident-only.

## Decision 1 (M9), asked of skills-fable

Why does a Codex lead take a Claude Opus review through `claude -p`, instead of its own high-tier reviewer (codex/agents/reviewer.toml, GPT-6-Astra, read-only sandbox)?

The lead's recommendation is to keep review-run, for two reasons:
1. The reviewer is from a different vendor than a GPT builder, which is independence the Codex reviewer cannot give.
2. Codex's read-only sandbox blocks the mutation and test runs the lane 49 reviews relied on.

S3 then offers both routes, and the measure counts either. If skills-fable says the Codex-native reviewer is enough, the lane shrinks to the S3 paragraph plus a census line, and review-run is not built.

## Decision 2 (B3), asked of skills-fable

Under `claude -p --agent`, the child is the main thread, with no agent_id. So hooks/delete-guard.mjs treats it as a lead and leaves the delete to a prompt that `-p` never shows.

Two options:
- **(a) Recommended.** One line each in hooks/delete-guard.mjs:557 and hooks/multi-inbox.js:257: `DELEGATION_REVIEW_RUN=1` is treated as a subagent, and multi-inbox never registers it. Both are in hooks/, which the packet excludes.
- **(b) Inside the packet's territory.** Only the `--disallowedTools` prefix rules, plus a `Gap:` paragraph on the record. This is weaker, because prefix rules can be bypassed.

The builder does not start until both decisions are in. Default if there is no answer by 2026-09-29 10:00 NY: Decision 1 keeps review-run and offers both routes. Decision 2 is (b), with the Gap: paragraph, because the lead does not widen a peer's territory on its own.
