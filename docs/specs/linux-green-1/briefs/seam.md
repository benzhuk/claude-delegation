# Mandate — seam reviewer, linux-green-1

Task: One pass, after L1 reaches `APPROVE`, scoped to where `mainCheckout`'s changed
contract meets its OTHER callers — files outside L1's own map that L1's own gate never
runs — and to whether the V4 test fix's assertion actually matches
`mirror-shared-skills.mjs`'s real runtime behaviour on this host, not just what L1's
own reviewer already checked from inside the two edited test files. This build has one
territory (L1), so there is no cross-territory prose/code mismatch to hunt — the seam
here is between L1's narrow file list and the rest of the repo that calls into it.

Goal: the spec's Why — a suite green on Linux and Windows, with no rework after
acceptance. Your job is to catch a caller of `mainCheckout` that L1's own gate (R4) does
not exercise, where the fixed function's new behaviour could silently change what that
caller does, and to catch a V4 assertion that is well-written but checks the wrong
thing about the actual install.

Work: wr-2026-09-26-linux-green (`docs/work/wr-2026-09-26-linux-green.record.md`).

Inputs (by path):
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/contracts.md` — R2 (`mainCheckout`)
  and R3 (V4) are the two halves of this seam.
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/scout-L1.md` — lists every
  caller found by grep at base: `skills/decisions/scripts/decisions-pickup.mjs:725`,
  `skills/multi/scripts/note-inbox.mjs:217,221`, and multiple call sites in
  `skills/multi/scripts/note-send.mjs` (:271,372,375,380,393,395,411,420) — confirm this
  list is still complete against the merged tree (a grep can drift if L1 added a new
  call site; it should not have, since `mainCheckout` itself is the only function L1
  touches in `transport.mjs`).
- L1's approved diff (worktree `/home/ben/Code/wt-linux-green-1-L1`) plus its reviewer
  report(s) (`reports/L1-review-*.md`).
- The integration worktree after L1 merges in: `/home/ben/Code/wt-lg`, branch
  `build/linux-green-1`.

PROJECT FACTS:
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- You are read-only against the integrated tree — you may run tests to confirm a claim,
  but you never edit a file.
- Test runner: `node --test <file>`.

NOT (out of scope):
- You do not re-litigate L1's own gate or its own reviewer's verdict on the two edited
  files themselves — if you disagree with a settled call there with NO cross-file
  angle, name it as a note, not a blocker, and defer to the orchestrator.
- You do not run the full local sealed suite (that's the integrator's job) or the
  second-host suite (that's the lead's).
- You do not edit `scripts/mirror-shared-skills.mjs` or any other file — read/run only.

Evidence format: every finding carries file:line in BOTH the changed function/test and
the consumer file where the mismatch sits, and the exact command you ran to confirm
which side is right. Verdict `APPROVE`/`NEEDS_FIXES` first.

## What to check, specifically

1. **`mainCheckout`'s callers, unexercised by L1's own gate.** L1's territory gate
   (contracts R4) runs only `note-send.test.mjs`, `mirror-shim.test.mjs`, and (if it
   exists) `transport.test.mjs` plus `hooks.test.mjs`'s N2 pattern — it never runs
   `skills/decisions/scripts/decisions-pickup.test.mjs` or
   `skills/multi/scripts/note-inbox.test.mjs`, both of which exercise callers of the
   changed function. Run both yourself:
   `node --test skills/decisions/scripts/decisions-pickup.test.mjs skills/multi/scripts/note-inbox.test.mjs`
   and confirm both are green on the integrated tree. If either fails, that's a direct
   consequence of the `mainCheckout` fix reaching a caller L1 never tested — a blocker,
   however narrow L1's own file list was.
2. **The fixed return-value shape still matches every caller's assumption.** Read each
   call site named in the scout (`decisions-pickup.mjs:725`, `note-inbox.mjs:217,221`,
   and the `note-send.mjs` sites) and confirm none of them depends on the OLD buggy
   behaviour (e.g., a caller that happened to work only because the old bug prefixed
   `process.cwd()` onto a drive-lettered path, and now silently gets a different,
   "corrected" string it wasn't expecting). This is a real risk specifically because
   these call sites' own tests may mock `git`/`runner` in a way that never hit the buggy
   branch at all, so a green run of #1 above is necessary but not sufficient — read the
   actual call sites, don't just trust their tests passing.
3. **The V4 fix's assertion matches this host's real install, not an assumption about
   it.** Independently run a REAL install (not the test's internal mock, an actual
   `node scripts/mirror-shared-skills.mjs` against a scratch `$HOME`, exactly as the V4
   test itself does) and confirm by hand: every entry under `<scratch-home>/.agents/skills`
   is a symlink (`fs.lstatSync(...).isSymbolicLink()`), each resolving into
   `/home/ben/Code/wt-lg` (or the integration worktree you're checking, if different),
   and that no `.test.mjs` file is reachable as a real (non-symlinked) file anywhere
   under that tree. This double-checks the test's own logic isn't fooled by, e.g.,
   checking `fs.readdirSync` without `{recursive:true}` and missing nested test files,
   or checking the symlink target without checking there's no ALSO-copied file beside
   it (contracts R3's "no copied file exists beside it").
4. **Positive control survives on both platform branches.** Confirm the V4 test's
   positive control (asserting the walk found real files, not that it silently found
   nothing) exists and is meaningfully different in the symlink-mode branch versus the
   unchanged Windows-mode branch — not copy-pasted in a way that would pass even if the
   symlink-mode walk were broken.
5. **Nothing outside L1's own map changed as a side effect.** `git diff --stat
   4c29a2b74f17bca824582d41eef80385bca1213b..HEAD -- . ':!docs/specs' ':!docs/work'` on
   the integration branch should show only L1's four files (three, if
   `mirror-shared-skills.mjs` was never touched per contracts R3's preferred path).

Report: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/seam.md`. Line 1 is the
verdict, first word: `APPROVE` or `NEEDS_FIXES` (or `SKIPPED` only if there is genuinely
nothing to check, which should not happen here — `mainCheckout` has real callers).

A result of zero seam findings is a good answer if you genuinely checked all five points
above; name what you checked and how.

Autonomy: you decide APPROVE/NEEDS_FIXES for the seam only; you never decide ship.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
