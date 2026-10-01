# Builder brief M1 (lane 25, multi-cross-host)

Worktree: /home/ben/Code/claude-delegation-wt/multi-cross-host-1 (branch build/multi-cross-host-1, base 0c92605). Work only there.
Spec: docs/specs/multi-cross-host-1/spec.md. Implement both pinned rules (Defect 1: exit 6 refusal, --local-ok; Defect 2: an ack ask is answered by the recipient's ACK) and every Acceptance test it lists. The spec's pinned text wins over anything else. Line numbers in it are from 0c92605.
Territory (exclusive): skills/multi/scripts/note-send.mjs, skills/multi/scripts/note-flush.mjs, note-send.test.mjs, note-flush.test.mjs, skills/multi/SKILL.md (exit table), skills/multi/references/envelope.md, docs/specs/overdue-asks-1/spec.md (a dated amend line). Any other file: stop and report it as needed, do not edit.
Kill switch: the new refusal must be bypassable by --local-ok (the spec's); note in the report whether any existing caller in the repo (grep note-send in scripts/, hooks/, skills/) now hits exit 6, and list each.

Gate: node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/note-flush.test.mjs, then the full suite once: node scripts/run-tests.mjs > docs/specs/multi-cross-host-1/reports/M1-gate.log 2>&1. Expected: 0 fail.

Rules:
- Never run rm, rm -rf, git clean or any deletion; tests clean their fixtures via node fs inside the test. Use fresh dir names for scratch.
- Tests use fixture homes and fixture ledgers only; never write to the real ~/.agents or the real docs/ledger, never send a real note.
- A nested process must not inherit ORCA_TERMINAL_HANDLE or NOTE_SLUG (the test-child-env helper exists for this).
- Never set a git identity (no -c user.*, --author, GIT_* env, --no-verify), no trailers, no force, no reset --hard, no stash. git add, commit, push as separate commands. Commit early, conventional commits. Push the branch when green: git push -u origin build/multi-cross-host-1.
- Never touch docs/work/.
- A denied command stops that step; report it verbatim.

Report: docs/specs/multi-cross-host-1/reports/M1-report.md, line 1 `DONE <sha>` or `BLOCKED <reason>`, then per-rule: what changed (file:line), each Acceptance test name, the caller list, gate numbers. State file: docs/specs/multi-cross-host-1/reports/M1-state.md (update as you go). ETA 60 minutes.
