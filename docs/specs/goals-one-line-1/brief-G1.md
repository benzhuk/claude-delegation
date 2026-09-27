# Builder brief G1 (lane 27, goals-one-line)

Worktree: /home/ben/Code/claude-delegation-wt/goals-one-line-1 (branch build/goals-one-line-1). Work only there.
Spec: docs/specs/goals-one-line-1/spec.md (pinned text wins; spec-full.md beside it is context only). Implement the pinned render and every Acceptance unit test it lists.
Territory (exclusive): skills/decisions/scripts/goals-mirror.mjs, skills/decisions/scripts/goals-mirror.test.mjs, skills/decisions/templates/goals-page.md, and ONLY the "Releasing" paragraph of docs/pane-setup.md. Lane 26 (another lead, in flight) owns decisions-render.mjs, skills/decisions/SKILL.md, decisions-handback.mjs, docs/decisions/** and the "Closing a lane" paragraph of pane-setup.md: read them, never edit them. NOT docs/GOALS.md. If you need a line outside the territory, stop and report it.
Reference: docs/specs/goals-one-line-1/goals-page-live-before.md is a fresh read of the live Goals page (the marker callout and the per-goal toggles today). Use it to make the Detail-toggle byte-for-byte test realistic; do not write to Notion.

Required extra: run the new render against the real docs/GOALS.md (read-only, stdout or a scratch file) and put in your report (a) whether it renders or refuses, (b) each refusing goal heading with the offending token. Do not fix GOALS.md; the lead routes that.
Also report how the live mirror step is run (exact command sequence for the render and the anchored edits), because the lead runs it once live after review.

Gate: node --test skills/decisions/scripts/goals-mirror.test.mjs plus the decisions-read test, then the full suite once: node scripts/run-tests.mjs > docs/specs/goals-one-line-1/reports/G1-gate.log 2>&1, 0 fail.

Rules:
- Never run rm, rm -rf, git clean or any deletion; tests clean fixtures via node fs. Fresh dir names for scratch.
- Never call notion.js write commands (edit, publish, replace-md, append-md); reading is not needed either. Never send a note.
- Never set a git identity (no -c user.*, --author, GIT_* env, --no-verify), no trailers, no force, no reset --hard, no stash. git add, commit, push as separate commands. Conventional commits. Push: git push -u origin build/goals-one-line-1.
- Never touch docs/work/.
- A denied command stops that step; report it verbatim.

Report: docs/specs/goals-one-line-1/reports/G1-report.md, line 1 `DONE <sha>` or `BLOCKED <reason>`, then per pinned rule: file:line, test names, the GOALS.md render result, the live-step commands, gate numbers. State file: reports/G1-state.md. ETA 60 minutes.
