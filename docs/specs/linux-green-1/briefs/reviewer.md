# Mandate — independent reviewer, L1, linux-green-1

Task: Adversarially review L1's builder output (`mainCheckout` fix plus the new H6
test, and the V4 test fix) against the spec pack, and return
`APPROVE`/`NEEDS_FIXES` with concrete, file:line-grounded findings. Read-only; you never
edit L1's files. Spawn only after L1's own gate is green.

Goal: same as L1's own — a sealed suite green on Linux and Windows both, without
worsening rework after acceptance (`docs/GOALS.md`'s measures named in the spec's Why)
— your job is to catch anything that would silently defeat that on either platform, or
that compensates for the bug rather than fixing it.

Work: wr-2026-09-26-linux-green (`docs/work/wr-2026-09-26-linux-green.record.md`).

Inputs (by path):
- L1's own brief: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/L1.md`.
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/spec.md` and `contracts.md` —
  contracts.md wins on any disagreement; the spec's own attack brief (Acceptance
  section) is reproduced and extended below.
- `/home/ben/Code/wt-lg/docs/specs/linux-green-1/briefs/scout-L1.md` — the confirmed-red
  baseline and the UNC/`path.posix.normalize` landmine; confirm the builder's fix
  actually avoids it rather than merely happening not to trip it on the cases tested.
- L1's report and diff in its worktree (`/home/ben/Code/wt-linux-green-1-L1`) and its
  gate log at `/home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/L1-gate.log`.

PROJECT FACTS:
- `node --test <file>` is the test runner; no build step.
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- Verdict word first: `APPROVE` or `NEEDS_FIXES`, on its own at the top of your report.

NOT (out of scope):
- You never run the full-suite gate (`node scripts/run-tests.mjs`) — that's the
  integrator's job, once, across the whole build.
- You never touch `scripts/mirror-shared-skills.mjs` or any file outside L1's map, even
  to check something — read-only, and only inside L1's own files plus what's needed to
  re-run tests.
- You never grant an APPROVE to work that fails its OWN gate — if the gate log handed
  to you shows a failure, that's an immediate `NEEDS_FIXES` (or a stop-and-report if you
  were spawned before the gate ran at all — a process error to flag, not yours to fix).

Evidence format: every finding carries severity (blocker / major / minor), file:line,
and either a measured count (grep output, actual test run output) or a ready-to-apply
patch (exact old → exact new) the builder can apply verbatim. Verdict first, findings
after.

## Review fields (bug-fix review)

Your report must carry four non-empty lines for the `mainCheckout` half — `Cause:`,
`Discriminating check:`, `Fix location:`, `Simplification:` — checked by
`scripts/bugfix-fields.mjs`. Also answer explicitly: is this fix the CAUSE, or a
COMPENSATION for it (a guard that hides the symptom without removing the defect)?

## Attack brief (spec's own, reproduced, plus the landmine)

Run these against the diff yourself, don't take the builder's word for any of them:

1. **A `start` that is relative.** Confirm `mainCheckout` still resolves it through
   `path.resolve` (unchanged behaviour) — the fix must only change the absolute/
   drive-lettered/UNC branch, never the relative one.
2. **A `start` that is a UNC path** (`//host/share/...` or `\\host\share\...` before
   `toPosix`). This is the scout's named landmine: verify the fix does NOT run a
   detected UNC common dir through `path.posix.normalize`/`join`/`resolve` unguarded —
   run this yourself: `node -e "console.log(require('path').posix.normalize('//host/share/foo/'))"`
   prints `/host/share/foo/` (single leading slash) on this host; if the builder's code
   path does that to a UNC string, the leading `//` is silently lost. Trace the actual
   code, don't just trust a passing test — the builder could add a test that never
   actually exercises a `//`-prefixed common dir and still get green.
3. **A git common dir that is already absolute on each platform** — POSIX-absolute,
   drive-lettered, and UNC — each must be used as-is (per contracts R2), normalised,
   trailing slash removed, with no `path.resolve(start, c)` fallback firing for any of
   the three.
4. **A common dir with a trailing slash** — confirm it's stripped consistently on every
   branch (absolute, drive-lettered, UNC, and the relative-`start`-then-resolve
   fallback), not only the one branch the builder happened to test.
5. **The V4 positive control must still fail when the walk finds nothing.** On
   whichever platform-branch the builder wrote for symlink mode, confirm there is a
   genuine positive control (an assertion that would fail if the walk silently found
   zero files) — not just the negative assertion (no `.test.mjs`) with nothing to prove
   the walk actually ran and found real files. Read the actual test code; a builder
   under time pressure might drop the positive control on the new symlink branch while
   keeping it only on the unchanged Windows branch.
6. **The fix must not change what `note-send` writes for a worktree on either
   platform** (H6's worktree case, :363, unchanged expected string
   `'C:/Users/benzh/Code/bto_nucleus'`). Run
   `node --test skills/multi/scripts/note-send.test.mjs` yourself and confirm this
   exact test is still present, unedited, and green.
7. **The new third H6 test has no platform branch inside it**, and genuinely exercises
   the drive-lettered-`start` + bare-`.git`-runner shape the spec names — not a
   restatement of one of the two existing tests under a new name.
8. **Nothing outside L1's map changed.** `git diff --stat` against the worktree's base
   (`4c29a2b74f17bca824582d41eef80385bca1213b`) should show only
   `skills/multi/scripts/transport.mjs`, `skills/multi/scripts/note-send.test.mjs`,
   `skills/multi/scripts/mirror-shim.test.mjs`, and — only if the builder's report
   explicitly named and justified it per contracts R3 — `scripts/mirror-shared-skills.mjs`
   with nothing beyond an env/flag read. Any other file touched is a blocker.
9. **N2 still green.** Run
   `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` yourself.

Report: `/home/ben/Code/wt-lg/docs/specs/linux-green-1/reports/L1-review-<round>.md`
(e.g. `L1-review-1.md` — increment `<round>` on each re-review). Line 1 is the verdict,
first word: `APPROVE` or `NEEDS_FIXES`.

A result of zero findings is a good answer if you genuinely attacked all nine points
above and found nothing — say what you tried, don't manufacture a finding to look
thorough.

Autonomy: you decide APPROVE/NEEDS_FIXES; you never decide to merge, accept, or ship —
that's the orchestrator's and the lead's call.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
