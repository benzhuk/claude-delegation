APPROVE b726ff9ad09f3e403ade74d27ab0a497c742c729

Lane 37 codex-parity delta review, 0b9d020..b726ff9. Reviewer: Claude Opus 5.5 (claude-opus-5-5), subagent of skills-fable session 9c61c35a-82dd-4aef-8eca-c99bb0e72e31. Worktree scratchpad/wt-review-37, detached at b726ff9.

Gates, run once each:
- hooks/codex-unsupported.test.mjs: 8 pass, 0 fail.
- hooks/multi-codex-hook.test.mjs: 13 pass, 0 fail.
- scripts/native-package.test.mjs: 3 pass, 0 fail.

## Per-finding disposition

- MAJOR 1, false unsupported reasons: FIXED. hooks/codex-unsupported.json:4-5 now name the Claude-transcript parsing as the blocker, matching delegation-reminder.js:134.
- MAJOR 2, delete-guard limit undocumented: FIXED. codex/README.md:58-60 says the guard denies only spawn_agent children and that a top-level session, including codex exec, passes and is logged passed-lead. It does not claim the guard covers codex exec builders.
- MINOR 3, literal routed map in the parity test: NOT FIXED, not explicitly declined. Non-blocking: the behavior tests still fail if a route stops emitting. Leave it as a follow-up.
- MINOR 4, live proof and stale record: FIXED. L37-native-proof-r2.md retains a real `codex exec "hi"` run in a fresh scratch home, exit 0, with the wiring line and the backlog line in the model reply. The proof ran at c6212e5. The later commits change docs, tests and unsupported-reason strings only, so the runtime path proven is the one shipped. The record's Artifact field still names ad75d1e, and root must set it to b726ff9 when it accepts.
- NIT 5, shared backlog cadence: NOT ADDRESSED. Acceptable as is.

## Delta regressions hunted

- hooks/multi-codex-hook.mjs:114 widens the routes from role lead to anything but a confirmed child. The reason is real and proven live: Codex callbacks carry no transcript_path, so a real lead classifies as unknown and got nothing before this fix. The new test at hooks/codex-unsupported.test.mjs:164 covers it. Side effect: a spawned Codex child that also classifies unknown now gets the wiring and backlog advisories and one extra bounded node spawn per event. The text is advisory only and needs no ack. I accept it and note it here for follow-up.
- goalContextForLead (:136) still requires lead, so bearings/goal text is unchanged. Peer delivery, ack-after-flush and the continuation path are untouched.
- scripts/native-package.test.mjs asserts the exact PreToolUse Bash delete-guard entry and keeps the five multi-codex-hook assertions. That is stricter than before, not looser.
- The test child env now goes through childEnv(home, ...) rather than process.env, which keeps real homes out of the test. That is an improvement.
- Claude hook files are unchanged in this delta.

I would merge b726ff9 to main as is.
