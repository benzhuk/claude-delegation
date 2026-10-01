# Mandate — independent reviewer (per territory), merge-on-acceptance-1

Task: Adversarially review ONE territory's builder output (M1 or M2 — you are spawned
once per territory, fresh each time) against the spec pack, and return
`APPROVE`/`NEEDS_FIXES` with concrete, file:line-grounded findings. Read-only; you never
edit the territory's files. Spawn only after that territory's own gate is green.

Goal: same as the territory's own — "hours ask to accepted" and "work stalled" for M1,
"work lost or stalled" for M2 — from `docs/GOALS.md`'s goal card; your job is to catch
anything that would silently defeat that goal or reintroduce the design contracts.md
explicitly rejected.

Work: wr-2026-09-26-merge-on-acceptance (docs/work/wr-2026-09-26-merge-on-acceptance.record.md).

Inputs (by path):
- The territory's own brief: `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/briefs/M1.md`
  or `.../briefs/M2.md` (whichever you're reviewing).
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/spec.md` and `contracts.md` —
  contracts.md wins on any disagreement.
- `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/redteam.md` — the
  reasoning behind M2's reduction; know it so you don't ask for the dropped design back.
- The builder's report and diff in its worktree (`/home/ben/Code/wt-merge-on-acceptance-1-M1`
  or `-M2`) and its gate log at
  `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/<territory>-gate.log`.

PROJECT FACTS:
- `node --test <file>` is the test runner; no build step for either territory's own gate.
- Never set or switch a git identity; never push; no trailers; never send peer notes.
- Verdict word first: `APPROVE` or `NEEDS_FIXES`, on its own at the top of your report.

NOT (out of scope):
- You never run the full-suite gate (`node scripts/run-tests.mjs`) — that's the
  integrator's job, once, across all territories.
- You never touch files outside the territory you were assigned.
- You never grant an APPROVE to work that fails its OWN territory's gate — if the gate log
  handed to you shows a failure, that's an immediate `NEEDS_FIXES` (or a stop-and-report if
  you were spawned before the gate ran at all — that's a process error to flag, not yours
  to fix).

Evidence format: every finding carries severity (blocker / major / minor), file:line, and
either a measured count (grep output, test name) or a ready-to-apply patch (exact old →
exact new) the builder can apply verbatim. Verdict first, findings after.

## Attack brief — M1 (the merge gate and the page entry)

You are reviewing prose edits across five files. Attack these specifically:
1. **Test pins broken silently.** Run
   `node --test skills/decisions/scripts/skill-text.test.mjs scripts/work-record.test.mjs`
   yourself, even if the builder's gate log says green — confirm it independently. Then
   grep decisions SKILL.md for any line starting with `**` (the `doesNotMatch` pin) and
   confirm the exact wraps at the file's current :49-50 and ~:306-307 (they must be
   UNCHANGED byte-for-byte from before this build, since M1's edit range starts at :56).
2. **The old mechanism left behind.** `grep -rn "merge item\|merges to main take your word"`
   across the whole repo (excluding `.git`) — if anything still names the deleted
   mechanism (in prose, not just code), that's a blocker.
3. **GOALS.md untouched.** Confirm `docs/GOALS.md` has zero diff in this territory's
   worktree, and that the builder's report names line 21's contradiction explicitly
   (rather than silently ignoring it or silently fixing it, which would violate the
   explicit-exclusion instruction).
4. **The Closed-entry shape is exact and non-bold.** `Merged <branch> at <sha>, <M-D>:
   <one-line changelog>; suite <n> of <n> on <host>.` — a plain bullet. Check every place
   it's written or exemplified in the edited files matches this shape exactly, especially
   that no example line the builder wrote starts with `**` (that would itself trip
   `skill-text.test.mjs`'s pin AND recreate the Notion-owner-comment collision the pin
   exists to prevent).
5. **R3's conflict rule is the STRICT one.** Confirm the new team-build SKILL.md text says
   ANY merge conflict (not just non-additive) blocks the merge and produces a Waiting
   item — the spec's original "additive prose" carve-out must NOT survive into the final
   text; contracts.md R3 explicitly overrides it.
6. **R4's ordering.** Confirm the text is explicit that the second-host gate log is
   committed as record evidence BEFORE `accept` runs, not appended after — a plausible
   builder mistake is to describe the second-host check as happening any time before
   merge, losing the "before accept" ordering that makes it usable as `Evidence:` on the
   record.
7. **R5's Done-window rules actually landed.** This is easy to miss since it's not in the
   spec.md text at all, only contracts.md/the territory map. Confirm all three
   Done-window rules AND the pickup-host sentence are present, in `decisions/SKILL.md`,
   in their own right (not folded loosely into the merge-item rewrite where they'd be easy
   to lose).
8. **The release/install sentence exists in BOTH skill files**, and decision-item.md's new
   release-item shape genuinely uses `No default: installs take your word per item` as
   NEW text (not a copy-paste of the deleted merge-item line with s/merges/installs/ that
   accidentally keeps stale surrounding words).

## Attack brief — M2 (feed registered pickup's status line)

This territory was deliberately reduced from a new-reader design to an ~8-line status-line
change. Attack for scope creep back toward the dropped design, AND for the standard
flusher attack angles the spec's original acceptance section named (most of which no
longer apply to this reduced scope — confirm they don't apply rather than assuming):
1. **No new mechanism.** Diff the territory's worktree against base and confirm: no new
   state file next to `flush.log`, no new log line, no new kill-switch NAME (only the
   existing `ws-off`/`ws-off-decisions` checked), no new page read, no new network call,
   no new timer/poll cadence, nothing under `hooks/lib`, nothing in
   `skills/decisions/scripts/decisions-pickup.mjs`. Any of these is a blocker — it means
   the builder rebuilt the design redteam.md explicitly killed.
2. **"Post twice for one flip" / "block a drain" / "run without a token"** — the spec's
   original three attacks. Confirm they're moot for THIS scope (the status line reads
   existing state, it doesn't send anything or drive a drain) and confirm the existing
   tests that already prove these properties for the underlying mechanism
   (`decisions-pickup.test.mjs:257,302,460,940-960`, `registered-pickup.contract.test.mjs`)
   are untouched and still pass — run them yourself even though M2's own gate doesn't
   require them, since a careless edit to `note-flush.mjs` outside `buildFlushStatus`
   could still break them.
3. **The two existing `deepEqual` tests.** Confirm the pre-existing
   `assert.deepEqual(status.json, {...})` tests for missing/unreadable heartbeats were
   either updated to include the new `pickup` key, or the builder found a way to add the
   key that doesn't touch those exact object shapes — read the diff, don't just trust
   green (a builder could "fix" this by weakening the assertion instead of correctly
   extending it — that's a `NEEDS_FIXES`).
4. **The three new tests are genuinely independent.** Absent-registration,
   present-annotation, and disabled-switch should each construct ONLY the fixture state
   they're testing (not, e.g., a registration file AND a disabled switch in the same test
   without asserting which one wins) — confirm the disabled-switch precedence (checked
   before registration) is both implemented and tested, matching `runPostFlushPickup`'s
   own order.
5. **N2 still green.** Run `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`
   yourself. If any new test spreads `process.env` directly instead of using `childEnv()`,
   this fails repo-wide, not just locally — treat any N2 failure as a blocker regardless
   of how small the new test code looks.
6. **The SKILL.md sentence is accurate.** Confirm the one or two sentences added to
   `skills/multi/SKILL.md` correctly describe what "not registered on this host" means
   (no registration file — normal/expected on most hosts) rather than implying something
   is broken.

Report: `/home/ben/Code/wt-moa/docs/specs/merge-on-acceptance-1/reports/<territory>-review-<round>.md`
(e.g. `M1-review-1.md`, `M2-review-1.md` — increment `<round>` on each re-review). Line 1
is the verdict, first word: `APPROVE` or `NEEDS_FIXES`.

A result of zero findings is a good answer if you genuinely attacked all the angles above
and found nothing — say what you tried, don't manufacture a finding to look thorough.

Autonomy: you decide APPROVE/NEEDS_FIXES; you never decide to merge, accept, or ship —
that's the orchestrator's and the lead's call.

Termination: report to the path above, first line `VERDICT: <word>`, then stop.
