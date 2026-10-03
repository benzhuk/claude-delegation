# loop74 state

## Territory
Lane 74 territory loop74, branch build/janitor-cleanup-74-loop74, worktree wt-janitor-cleanup-74-loop74 (base 6b302f93).
Spec items 1 (phase commit), 4 (auto closeout of territories), 5 (packets/pointers out of checkout, ledger ignored locally), 8 (loop-side tests).

## Contracts I rely on
- closeoutWorktree in scripts/janitor.mjs is called, never edited (janitor74 owns it).
- Envelope Details charset [A-Za-z0-9._/-]+, no abs path, tilde, drive letter, colon or ..; new convention `.agents/notes/packets/<repo-name>/<id>.md` resolved against the reader HOME.
- Loop return fields and blocker names unchanged.

## Done
- phase-commit.mjs + test (8); build-loop-workflow.js wiring (commit: runner after every Build/Fix/seam-fix call, incl. dead agents) + 8 tests; BUILD_MANDATE and agents/builder.md line.
- closeoutTerritories in scripts/work-record.mjs step 4b + scripts/closeout-territories.test.mjs (7); team-build SKILL Ship/Accept name `close --closeout`.
- transport.mjs packetDetailsFor/resolveDetailsPath/ensureLedgerIgnored; note-send, note-inbox, decisions-pickup use the home packet location; legacy docs/notes Details still resolve.
- Docs: multi SKILL, envelope.md, decisions SKILL, team-build SKILL.
- Full Gate: 1137 tests, 1132 pass, 0 fail, 5 skipped (reports/loop74-gate.log).

## Next
- Nothing in the territory. Lead: ledger ruling review (see Open questions); Netcup/Hetzner suites are the lead's.

## Open questions
- Ledger ruling is neither of the brief's two options: docs/ledger stays in the checkout, hidden by the main checkout's local .git/info/exclude (written by note-send). Keeps the cross-host mirror and every reader unchanged. Lead may rule otherwise.
- Packets already untracked in main are left to janitor74's 7-day report.
- examples.md still shows legacy docs/notes Details (still valid input).

## How to run my gate
From the worktree, the Gate line in briefs/loop74.md (17 test files), output to reports/loop74-gate.log; read only the tail.

## Fix round 2 (review r1)
- F1: build-loop-workflow.js adoptCommit carries the commit runner's sha into build/seamFixBuild at all six call sites; 3 tests.
- F2: phase-commit.mjs refuses not-worktree-root and main-checkout; fixtures now linked worktrees; prompt lists both reasons.
- F3: closeoutTerritories uses loop-state setup.territories[].branch when present, else requires tip ancestor of the lane Artifact sha ("not part of this lane"); 2 tests, fixtures merge territories into the lane.
- F5: transport agentsHomeOf; resolveDetailsPath/packetPathFor take env (note-send, note-inbox pass it). F6: `..` in Details resolves to null. 2 tests.
- F4 (ledger ruling) left for the lead. Gate (17 files incl. phase-commit and closeout-territories): 1145 tests, 1140 pass, 0 fail, 5 skipped.
