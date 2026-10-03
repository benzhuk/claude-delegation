Task: Adversarially review one territory's delivered diff (janitor74 or loop74, named in your prompt) against the spec and its builder brief. Read-only; you never edit the territory's files. Verdict first: `APPROVE` or `NEEDS_FIXES (<n>)`.
Goal: work is not lost or stalled: the janitor owns, archives and clears what is idle without ever losing uncommitted code, the build loop commits every phase and closes out on landing, and the plugin's own packets never dirty a checkout.
Work: wr-2026-10-02-janitor-cleanup

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/spec.md (items 1 to 8 are the contract)
- The territory's scout file and builder brief under C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/briefs/ (scout-janitor74.md and janitor74.md, or scout-loop74.md and loop74.md): what it was asked to do, NOT do, and which scout questions it could rule on
- The builder's report and gate log in C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/ (janitor74-builder.md and janitor74-gate.log, or loop74-builder.md and loop74-gate.log)
- The territory's worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74 (branch build/janitor-cleanup-74-janitor74) or C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-loop74 (branch build/janitor-cleanup-74-loop74), base 6b302f9380b93bf8ef1414f41c460a2077930f70. Read the actual diff there (`git -C <worktree> diff 6b302f9380b93bf8ef1414f41c460a2077930f70...HEAD`), never the report's paraphrase of it.

PROJECT FACTS (at most 25 lines):
- Windows host, Node only, no package.json. There is NO full suite on Windows: re-run `node --test` yourself on the test files the diff added or changed and on the territory's Gate list (in its brief) to confirm the builder's gate log is real. Never run a bare `node --test`, never `node scripts/run-tests.mjs` with no arguments.
- Temp files only under the scratch folder your mandate names, never in a repo. Use fixture homes and fixture repos for every live check; never the real home or ~/.agents; never pass --apply to janitor.mjs against a real repo; never enable a real scheduler; never run the janitor with its default roots.
- No recursive delete, no history-discarding or tree-wiping git commands; never set a git identity; no commit trailers.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- You do not fix anything. You do not judge the cross-territory seam between the janitor and the build loop (ownership of territory worktrees, closeout against archive, packets against the untracked report): that is the seam reviewer's job, after Integrate.
- You do not review the other territory's files.

Evidence format: every finding carries a severity (BLOCKER/MAJOR/MINOR), a file:line or a measured command output, and a concrete fix (exact old -> exact new for anything mechanical). Verdict word first, on its own line, before any prose.

Attack brief, janitor74:
- Work lost: build a fixture where the archive step could lose work (untracked files, an ignored file, a file with spaces, a symlink, a submodule, a locked worktree, a detached head, a branch already on origin, an origin that rejects the push, no git identity). Does the worktree get removed before the push is confirmed? Does any path remove something with content that was not committed and pushed?
- Report mode: with no policy file, does any new class act (archive, push, remove, delete a branch)? Is the existing SAFE class output byte-identical for a one-repo run? Do exit codes stay 0, 1, 3, never 2?
- Ownership: an open record naming a worktree by absolute path, repo-relative path and branch name each protect it; a closed or accepted record does not; the territory branch pattern protects `build/<slug>-<id>` of an open record only. A worktree younger than the 24 h idle floor is never archived. A live session (open process, recent Claude or Codex session file) protects it.
- Roots: a second repo under the roots is seen; BTO and the dotfiles repo are never touched; a deregistered folder is listed; a path outside every root is not scanned; no test falls back to the real home or `~/Code`.
- Push scope: only `archive/...` refs are pushed, never forced, never main; a name collision on origin does not overwrite.
- Item 5 (report part): files older than 7 days are reported by path only and never removed; fresh files are not reported.
- Item 6: the re-registration runs only when a timer is already registered, fails open, finishes in 5 seconds, and never calls a real scheduler in tests; the generated units stay byte-stable for the existing jobs; hooks.json / codex-hooks.json changes trip none of the six hook-reading tests.
- Items 7 and 8: the policy gate is real and tested both ways; each named fixture exists (dirty worktree with untracked files, deregistered folder, second repo).

Attack brief, loop74:
- Item 1: a builder that returns nothing (dead) with uncommitted edits: is a commit made on the territory branch? A clean tree: no empty commit. A tree with only ignored files: nothing staged. Does the commit run before every report and after Build, Fix and seam-fix? Are all 129 existing build-loop assertions unchanged and green? Does the helper refuse a path that is not a worktree, and does it ever touch the main checkout?
- Item 4: closeout runs after a pushed merge and removes worktree, local and origin branch and scratch; territory worktrees and branches are removed only when clean and merged, never when dirty; a re-run is idempotent; `--by` still gates it; work-record-closeout tests unchanged.
- Item 5: after a send and after a pickup, `git status --porcelain` of a fixture checkout is empty; every reader (note-inbox, hooks, collect-status, decisions-pickup verification) resolves the new Details form and the old `docs/notes/...` form; validateDetails still refuses absolute, drive-letter, `:` and `..`; the ledger ruling is stated with a reason and the cross-host mirror still works.
- Item 8: the dying-builder fixture really has uncommitted edits before and a commit after.
- Does any change touch a janitor file, the safety block, or an existing loop return field?

Named failure class: "a cleanup that passes because it is not looking": an owner check that a prefix, case, separator or relative path defeats; a report-mode gate that silently acts; a commit helper that no-ops on the very tree it exists for. Also ask whether any fix is a cause fix or a compensation that hides the symptom.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/<territory-id>-review-r<round>.md. Line 1 is the verdict, first word: `VERDICT: APPROVE <sha>` or `VERDICT: NEEDS_FIXES (<n>) <sha>`, <sha> the full output of `git rev-parse HEAD` in the territory worktree.

A result of zero findings is a good answer, stated plainly, once you have tried every item above and can say so.

Autonomy: you decide severity and whether a finding blocks APPROVE. You do not decide whether to grant a fix round or spawn a fresh builder: that is the orchestrator's call once your report lands.

Un-agent-able steps: none expected; every check runs from a shell in the territory's worktree with a fixture home.
ETA: 30 to 45 minutes per round. Report or park by then.

JUDGMENT: adversarial correctness verdict on a cleanup that archives then removes work, and on a build loop that must never leave work uncommitted

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
