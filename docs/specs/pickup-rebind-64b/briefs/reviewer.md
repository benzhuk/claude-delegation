Task: Independently review territory rebind64b's changes (the `rebind` verb in decisions-pickup.mjs, its tests, and the SKILL.md sentence) against spec.md scope items 1-6 and scout-rebind64b.md, read-only and adversarial. Spawn only after rebind64b's own gate (C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/rebind64b-gate.log) is green; read the builder's report first, then the diff of `build/pickup-rebind-64b-rebind64b` against base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516, in worktree `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/wt-pickup-rebind-64b-rebind64b`.
Goal: confirm a repo move can no longer strand a pickup page, without weakening the safety the pickup exists for: a live project is never taken over, no evidence is rewritten unless it first verified, the receipt owner is never rewritten, and no resend or accounting of an uncertain delivery becomes possible through the new verb.
Work: wr-2026-10-01-pickup-rebind (docs/work/wr-2026-10-01-pickup-rebind.record.md in `C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b`; read-only for you too).

Inputs (by path):
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/spec.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/briefs/scout-rebind64b.md
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/briefs/rebind64b.md (the mandate the builder worked to, including its "Rulings needed" rule and the narrow readings it prescribed)
- C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/rebind64b-report.md and rebind64b-gate.log

PROJECT FACTS: pure Node, `node --test <files>`, no build step, Windows host has no full suite (run only focused files if you must run anything). Header-line shape `/^[ \t*+-]{0,20}<Label>:\**[ \t]{0,20}(.+)$/mi`. Never set a git identity, never push, no trailers, never send peer notes. Never read or touch the real pickup state directory under the agents home, `registrations.json`, or any live page; build any probe in a `makeTempHome` sealed home or under the scratch folder named in the work record. If any command is denied by a permission prompt, sandbox or guard hook, stop that step and report it verbatim; never do the same thing through another tool or shell. A PostToolUse guard report is a report, not a block.

NOT (out of scope, stated explicitly):
- Do not edit any file. Findings only, with file:line and a ready-to-apply patch (exact old -> exact new) for anything mechanical.
- Do not run the live rebind or publish, the Netcup/Hetzner suites, or touch `docs/work/`.
- Do not re-run an integration-wide suite.

Evidence format: `VERDICT: APPROVE` or `VERDICT: NEEDS_FIXES` as the literal first line. Every finding carries severity, file:line or a measured count, and a concrete fix. Construct each attack, do not only read.

Attack brief:
1. Take-over: with the old path still existing (a directory, a file, a symlink, a case-variant on Windows), a `--from-project` that equals neither the receipt's project nor a canonical form of it, a `--repo` that is a linked worktree of another repository, a `--repo` whose `.agents/project.json` does not bind the page: each must refuse with no file changed. Hash the receipt and every capture before and after.
2. Evidence order: confirm nothing is written before every capture (the two the receipt names and any extra under the saved scope) and the pointer under the new transportRepo have verified. Tamper one byte of `originalBytes`, the digest, `page`, `projectScope`, `owner`, `from`; delete a capture; make one unreadable: each must refuse and leave all files byte-identical.
3. Completeness of the binding: grep every place a project or transport path is stored or compared (receipt fields, captures, `exactSendInputs.argv`, pointer, outcome path, ledger lookups, `settleRound`, `openPrivateCapture`, `status`, `pickupOnce`). Name any path-bearing field the verb leaves stale, and show a PREPARED or SENDING receipt after rebind carrying no old path. Confirm `projectScope`, `privateCaptureRef`, `detailsPath` and `noteId` are byte-identical (scripts/build-census.mjs parses the note id).
4. Owner: `receipt.owner` is never rewritten under any `--owner`; a differing `--owner` only sets the existing handoff marker and a later `closeRound`/`account` settles it; the same `--owner` sets nothing; no send occurs (grep sends in the new tests).
5. Atomicity and crash: inject a failure after the first capture rewrite, after the last capture, and at the receipt write; re-run each. Each must finish or refuse cleanly, never leave a state `status` calls TAMPERED that a second `rebind` cannot repair. A second `rebind` after success must refuse and change nothing.
6. Regression: the five existing "different authorization project" refusals (decisions-pickup.mjs 966, 997, 1288, 1416, 1511 at base) and tests 833-896 and 1358-1480 are unchanged and green; `receiptPaths` is unchanged.
7. Scope: the diff touches only decisions-pickup.mjs, decisions-pickup.test.mjs, SKILL.md and skill-text.test.mjs; no waiver flag, no publish change, no registrations.json handling; SKILL.md carries one sentence and `skill-text.test.mjs` one pin and agree with the CLI usage string.
8. Fixture honesty: the fixture is synthetic, reproduces the moved-repo state (old path gone, pointers present under the new root, receipt bound to the old path), and the four named tests fail at base. Re-run `node scripts/prefix-test.mjs --base b52e3faeb197dcb32f2fdfaf5931dc13a2f1b516 --test <path> --repo <dir>` for them yourself and quote the exit codes.
9. Every "Rulings needed" item in the builder report: say whether the narrow reading taken is acceptable and which alternative the lead must rule on.

Report: C:/Users/benzh/Code/zhuk-infra/claude-delegation/.claude/worktrees/lane-64b/docs/specs/pickup-rebind-64b/reports/reviewer-report.md. Line 1 is the verdict, first word.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
