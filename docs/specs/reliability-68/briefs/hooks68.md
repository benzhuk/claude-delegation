Task: Build territory hooks68 of lane 68: (A) the SessionStart plugin-version restart advisory, (B) inbox registration from main-session events only plus a refusal of a recipient repo that is not a git checkout, (C) the "guard report is a report, not a block" sentence in every shipped brief template. Tests for all three. Done means the gate below is green, the work is committed on your branch, and your report and state file are written.
Goal: Agent work gets cheaper, faster and more reliable at equal or better quality, on any agent host. This task moves "work lost or stalled" (stale-version and wrong-inbox causes must read zero at the next census).
Work: wr-2026-10-01-reliability

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/spec.md (items 1, 2 and the sentence check of item 3; the territory map at the end)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/briefs/scout-hooks68.md (read it FIRST: item 1 is largely built already, item 2's Claude-side guard exists already, the rest is gaps)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/briefs/scout-census68.md (only to see what census68 owns)
- Your worktree (all your edits happen here): C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-reliability-68-hooks68, branch build/reliability-68-hooks68, base 0f910a7a142f8bc346619136587d27dea87088d6

Contracts (pinned for this territory; the spec wins over the scout where they differ):
A. Advisory. On SessionStart, when the running plugin version differs from the installed one, print exactly one line: `plugin <running> running, <installed> installed: restart this pane` (versions as plain x.y.z, no other text on the line). Nothing else; no auto-restart. Reuse `checkStaleness` in scripts/plugin-staleness.mjs; do not fork it. Add the line builder as a new exported function there. Default design (the lead has not ruled otherwise): in `scripts/wiring-check.mjs` `--hook` mode print the one-liner instead of `staleSessionText`; leave `staleSessionText`, the dispatch guard's deny text, and the bare `--line`, `--json` and table output unchanged, so the "stale session:" assertions that police those paths stay green. Update only the `--hook` assertions that must change. Silent when not stale, when `~/.agents/ws-off` is present, and fail-open on any error. Exit stays 0 in `--hook` mode.
B. Registration. A hook event registers an inbox only when it is the main session's own event. The Claude hook already returns on `agent_id` and on `DELEGATION_REVIEW_RUN=1`; keep that and add a test for any other child-shaped input you can construct from the hook payload fields (read what hooks/multi-inbox.js and hooks/multi-codex-hook.mjs actually receive; do not invent fields). Registration refuses a `cwd` that is not inside a git checkout (cheap check: walk up for a `.git` entry with fs.existsSync; no git spawn on the hook path, the PostToolUse budget is 700 ms) and registers nothing in that case, silently, never throwing. Apply it to both hooks (Claude and Codex) through one shared helper in skills/multi/scripts/transport.mjs. In skills/multi/scripts/note-send.mjs, the inbox branch that picks `targetRepo` from `inboxRecord.cwd` must treat a cwd that exists but is not a git checkout like a missing one: fall back to the sender's repo with the existing warning, never write a ledger line into that directory. Do not touch `mainCheckout`'s behaviour for other callers.
C. Sentence. Put this sentence, verbatim, once, on its own line in each of: agents/builder.md, agents/reviewer.md, agents/runner.md, agents/integrator.md, codex/agents/builder.toml, reviewer.toml, runner.toml, integrator.toml, skills/team-build/SKILL.md, skills/delegate/SKILL.md, docs/mandate-template.md: "If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block." In the four agents/*.md it goes OUTSIDE the safety block (that block is byte-pinned identical, 11 bullets, under 2100 characters; do not change it). In the toml files follow how the existing pinned scratch sentence sits. Add one test in agents/agents.test.mjs modelled on the existing pinned-scratch-sentence and worktree-rule tests, listing all eleven places. The mandate constants inside skills/team-build/references/build-loop-workflow.js belong to census68; do not edit that file, and note in your report that it needs the sentence.

PROJECT FACTS:
- Node project, no package manager step. Tests are `node --test <file>`. Windows host: NO full suite. Run only the files in the Gate line. The full suite runs on Linux hosts later, not by you.
- Every spawned agent reads ~/.agents/lean-rules.md first. Port 3000 is another project's; start no server.
- Commits: conventional (`fix:`, `feat:`, `docs:`, `test:`), no Co-Authored-By line, no AI byline anywhere, your configured git identity only. Commit early and often on your branch. Never push.
- Worktrees live at <repo>/.claude/worktrees/<name>. Your worktree already exists; create no others.
- Temp files only under C:/Users/benzh/AppData/Local/Temp/claude/C--Users-benzh-Code-zhuk-infra-claude-delegation/a7e8fc6b-cbf3-476b-aaea-23ad30508174/scratchpad/lane-68/ . Never write temp files into a repo; never delete them.
- Tests must not touch the real home: use scripts/test-home.mjs and the fixtures the neighbouring tests use. Never read ~/.agents/notes/inboxes.json (not even to look at the real one); tests use fixture homes only.
- Do not run `git stash`, `git reset --hard`, `git clean`, checkout/restore of paths, `rm -rf`, force push. No directory deletes of any kind.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Anything under scripts/four-read.mjs, scripts/build-census.mjs, scripts/work-record.mjs, docs/census.md, skills/team-build/references/ (census68's territory).
- Any change to Orca, the multi envelope format (skills/multi/scripts/envelope.mjs), the janitor, anything of lanes 65 and 64b, hooks/hooks.json wiring (unless a test proves it must change; then report instead of editing), the version in .claude-plugin/plugin.json (no release in this lane).
- ~/.claude, ~/.agents, any chezmoi path, the dotfiles repo.
- Other worktrees, the lane-68 integration worktree, files under docs/specs/reliability-68/ other than your own report and state file.

Evidence format: cite file:line for every claim about existing code. Measured numbers (test counts pass and fail), not adjectives. List every deviation from the Contracts above and why. If you find the Claude-side registration is already fully guarded and no unguarded child path exists, say so with the evidence; that is a good answer for that sub-part, still do the non-checkout refusal.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/hooks68.md. Line 1 is `VERDICT: PASS`, `VERDICT: FAIL`, `VERDICT: PARTIAL` or `VERDICT: BLOCKED`, first word.

Gate: node --test hooks/multi-inbox.test.mjs hooks/multi-codex-hook.test.mjs hooks/agent-dispatch-guard.test.mjs scripts/plugin-staleness.test.mjs scripts/wiring-check.test.mjs agents/agents.test.mjs skills/multi/scripts/note-send.test.mjs skills/multi/scripts/transport.test.mjs > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/hooks68-gate.log 2>&1 (run it from your worktree root; add any other test file you add or change to this command and say so in your report). Read only the tail and the failing names. No wrapper script.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-68/docs/specs/reliability-68/reports/hooks68-state.md. Keep it current after every gate (sections Territory, Contracts I rely on, Done, Next, Open questions, How to run my gate; under 60 lines).

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess. A negative result is acceptable and expected for any sub-part the tree shows is already done.

Autonomy: You may choose names, helper placement and test shape. You may not widen the territory, change a pinned contract, or edit a file listed under NOT. If a contract cannot be met without touching a NOT file, stop that part and report it as BLOCKED with the reason; do not improvise.

Un-agent-able steps: no live Claude Code session test of the SessionStart line and no Linux suite; both are the lead's. Unit tests with fixture homes are your whole verification.
ETA: 60 minutes; report or park by then.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
