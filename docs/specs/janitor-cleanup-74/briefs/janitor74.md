Task: Build territory janitor74 of lane 74 in your worktree: spec items 2, 3, 5 (the report part), 6, 7 and 8 (the janitor-side tests), with tests, and commit on your branch. The janitor gets a list of roots, owner-or-orphan classification, archive-then-remove, a deregistered-folder listing, an untracked-file report and timer re-registration on install; every new class defaults to report mode.
Goal: work is not lost or stalled: agents leave no worktrees, temp files or uncommitted code that nothing owns, and the janitor archives then clears what is idle instead of a person doing a hand cleanup day.
Work: wr-2026-10-02-janitor-cleanup

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/spec.md (the pinned scope; no separate contracts file, the spec IS the contract)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/briefs/scout-janitor74.md (your scout addendum: read it before any code. Where it conflicts with the spec, the spec wins. Its section 4 questions are yours to resolve under Autonomy below.)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/work/wr-2026-10-02-janitor-cleanup.record.md (read-only context; you never write the record)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/decisions/waiting/janitor-policy.md (the policy table Ben ticks; read-only, the five classes and the roots are listed there)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/docs/work/evidence/2026-10-01-cleanup-vs-janitor.md and 2026-10-01-detritus-census.md (read-only evidence, untracked in the main checkout only: every class cleaned by hand against what covers it)
- Code to read first (paths relative to your worktree): scripts/janitor.mjs (gatherState l.1024, classify l.669, applySafe l.1527, idleHours l.1163, closeoutWorktree l.1753, main l.2214), scripts/install-janitor-timer.mjs (resolveRepo l.149, scheduledCommandArgv l.186, main l.570), scripts/reclaim.mjs, scripts/path-safety.mjs, scripts/test-home.mjs, skills/janitor/SKILL.md, scripts/work-record.mjs (listRecords l.636)

PROJECT FACTS (at most 25 lines):
- Your worktree: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-janitor-cleanup-74-janitor74, branch build/janitor-cleanup-74-janitor74, cut from base 6b302f9380b93bf8ef1414f41c460a2077930f70. Work and commit there only (conventional commit messages, no Co-Authored-By, no byline, the configured git identity untouched).
- The integration worktree/branch is C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74 (branch build/janitor-cleanup-74); you never write there except your reports and state file to the absolute paths below.
- Windows host. No package.json, no npm, Node only. There is NO full suite on Windows: run `node --test` only on the files in the Gate. Never run `node scripts/run-tests.mjs` with no arguments, never a bare `node --test`. The full suite runs later on Netcup and Hetzner, by the lead.
- SAFETY OF TESTS, the hard rule of this lane: tests use scratch git repos (fs.mkdtempSync under os.tmpdir(), or makeTempHome from scripts/test-home.mjs) and a sealed or injected fake home ONLY. Never run the janitor against a real repo, ~/Code, a real worktree, the real home, the real ~/.agents or the real origin. The roots list, the home, the policy file and the clock must all be injectable, and every test must pass them: a test that falls back to os.homedir() or to `~/Code` is a defect. Never pass --apply to janitor.mjs except against a fixture repo whose origin is a fixture bare repo.
- No rm and no recursive delete by you, no forced worktree removal, no forced push, no history-discarding or tree-wiping git commands (the delete guard denies a subagent's recursive delete and forced worktree removal; that refusal is correct). The janitor code itself may remove only through git (a plain worktree removal, a branch delete after proof) or through scripts/reclaim.mjs and scripts/path-safety.mjs's vetted path; add no new raw unlink path.
- Pushes: the janitor pushes only `archive/...` refs to `origin`, never any other ref, never forced; in tests origin is a fixture bare repo. Archive commits use the host's configured git identity; if none resolves, skip that item and report it (never set an identity).
- New classes ship in REPORT mode: they print what they would do and act on nothing until a policy turns them on. The existing SAFE class keeps acting exactly as today; a one-repo run's existing rows, exit codes (0, 1, 3, never 2) and byte-stable timer units must not change.
- scripts/janitor.mjs is 2389 lines: put roots, ownership, archive and untracked-report code in NEW modules under scripts/ (for example scripts/janitor-roots.mjs, scripts/janitor-archive.mjs) with their own test files, and keep janitor.mjs edits to the wiring.
- Not in scope for the janitor to touch: BTO repos (Ben: "leave BTO to BTO"; default exclusion for any repo under `<home>/Code/BTO`) and the dotfiles repo.
- If hooks/hooks.json or hooks/codex-hooks.json changes, the gate list grows (see Gate). Hook commands fail open and finish in 5 seconds or less.
- If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block. Never set a git identity, no --no-verify, no force.

NOT (out of scope, stated explicitly):
- Territory loop74's files: skills/team-build/**, skills/multi/**, skills/decisions/**, scripts/work-record.mjs, agents/*.md, anything about packets, pointers, the ledger, phase-end commits or closeout. If you need a change there, stop and report it as a blocker.
- scripts/janitor.mjs closeoutWorktree behavior (work-record closeout depends on it; leave it byte-compatible).
- docs/work/*.record.md, docs/decisions/* (the policy page item already exists; you do not edit it), the README changelog, any release or install, any real timer registration, the Netcup and Hetzner suites.
- hooks/delete-guard.mjs and hooks/worktree-location.mjs behavior.
- Never push to a real remote; never merge into any branch; never touch another worktree.

Evidence format: cite file:line for every claim about existing code; for each of items 2, 3, 5 (report part), 6, 7, 8 name the test(s) that prove it and quote the tail of the gate log; show one printed report-mode run against a fixture. State every scout open question you resolved, the answer you chose and why, in one line each.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/janitor74-builder.md. Line 1 is the verdict, first word (VERDICT: PASS / FAIL / PARTIAL / BLOCKED).

Gate: node --test scripts/janitor.test.mjs scripts/install-janitor-timer.test.mjs scripts/reclaim.test.mjs scripts/path-safety.test.mjs scripts/work-record-closeout.test.mjs scripts/test-home.test.mjs agents/agents.test.mjs <every test file you add or change, appended here> > C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/janitor74-gate.log 2>&1. Read only the tail and the failing names. No wrapper script. If you change hooks/hooks.json or hooks/codex-hooks.json, also append skills/multi/scripts/hooks.test.mjs scripts/wiring-check.test.mjs scripts/native-package.test.mjs scripts/codex-hook-trust.test.mjs hooks/codex-unsupported.test.mjs scripts/mirror-shared-skills.test.mjs.

State file: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-74/docs/specs/janitor-cleanup-74/reports/janitor74-state.md. Keep it current after every gate.

A result of zero, "not found" or "could not determine" is a good answer. Say what you tried. Do not guess.

Autonomy: you may decide, and must record in your report, the scout section-4 questions, each by the simplest reading that keeps the spec's wording true and loses no work:
(1) item 6 trigger: a hook or installer mode from the NEW release that, when a janitor-record timer is already registered on this host and its baked plugin root differs from this release's root, re-runs the installer from this release (never installs a timer that was never installed); fail open, 5 s, no network; tests never call systemctl, schtasks or launchctl.
(2) item 7 activation: new classes act only for class ids listed in a policy file under `<home>/.agents/` (absent file = every new class reports only); writing that file is the lead's step after Ben's tick, not yours.
(3) ownership: a worktree is owned when an open record's `Worktree:` (absolute path, repo-relative path or branch name, resolved the way work-record's closeout resolves it) names it; a worktree whose branch name is `<owned branch>-<suffix>` (the territory pattern `build/<slug>-<id>`) is also treated as owned. Anything else is an orphan.
(4) ignored files in a dirty tree: archive tracked and untracked content; if ignored content would be lost, do not remove, report the row with the ignored count.
(5) deregistered folders: list them and archive when an intact `.git` directory holds changes; remove only through reclaim.mjs's vetted path if it accepts the folder, otherwise report "removal needs a hand" and leave it.
(6) no resolvable identity: skip and report that item.
(7) exclusions: `<home>/Code/BTO/**`, repos named like the dotfiles repo, and a configurable list.
Check in (BLOCKED, do not improvise) before: changing any existing SAFE-class row, exit code or timer byte output; adding any raw unlink path; touching the safety block of agents/*.md; touching anything outside the files this brief names.
Un-agent-able steps: real timer registration on any host and the Netcup/Hetzner suites are the lead's, scoped out of "done" for you. Live proof is a printed report-mode run and an archive run against fixtures only.
ETA: 120 to 180 minutes. Report or park by then.

If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

Termination: report to the path above, first line `VERDICT: <word>`, then stop. A bare "Done" means read the file; nothing is trusted from a final message alone.
