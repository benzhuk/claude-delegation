VERDICT: PASS

Territory T2 (backlog notice), spec v2.1 C3 + round-3 red-team addendum A1 applied
(confirmed applied — see below). Worktree
`C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\wt-T2`,
branch `feat/next-build-T2`, commit `2859a6a`.

## Files changed

- `hooks/backlog-notice.js` (new) — the hook.
- `hooks/backlog-notice.test.mjs` (new) — 11 tests.
- `hooks/hooks.json` — added a `backlog-notice.js` entry to `UserPromptSubmit`
  (timeout 10), `Stop` (timeout 10), `PostToolUse` (timeout 5); no existing entry
  touched.
- `skills/multi/scripts/hooks.test.mjs` — only the "V3: hooks.json parses, and
  every command goes through ${CLAUDE_PLUGIN_ROOT}" test body extended (a count
  assertion + a per-event presence check for the new hook). Nothing else in the
  file touched.
- `scripts/required-wiring.default.json` — appended `switch-ws-off-backlog`
  (`~/.agents/ws-off-backlog`).
- `docs/backlog-notice.md` (new, 25 lines — brief asked for ~20; noted as a minor
  deviation in the state file, not a contract change).

## A1 applied

Read `next-build/spec-addendum-r3.md` item A1 before writing the cheap-exit logic.
C3's original wording (docs/work directory's own mtime) is wrong because a
directory's mtime never advances on an in-place edit — records change Status in
place. Implemented exactly as A1 specifies: sentinel `printedAt` is the only gate
for every event; PostToolUse gets a second stat-only gate (newest `*.record.md`
mtime + file count vs. sentinel); sentinel rewritten only on an actual print.
Tested both directions: an in-place edit inside the 120s window prints nothing;
the same edit, once the sentinel's stored `printedAt` is backdated past the
window (test-side clock fake, not an injected `now` in the hook itself — matches
how every other hook test in this repo fakes elapsed time), produces a new line.
Also tested the PostToolUse-vs-other-events asymmetry A1 specifies (PostToolUse
stays silent past the window when nothing changed; UserPromptSubmit does not).

## Gate

`node --test hooks/backlog-notice.test.mjs skills/multi/scripts/hooks.test.mjs`
-> 37 pass, 0 fail. Log:
`C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\reports\T2-gate.log`.

Also hand-verified (outside the gate, for the integrator's benefit): the exact
wiring-check probe from the spec's "Gates and acceptance" section returns one row,
`state: "info"`, `why` ending `(off)`; and a manual live-hook probe (proper JSON —
my first attempt at this by hand had unescaped Windows backslashes in the JSON,
which is a shell-quoting bug in my own probe script, not the hook; the hook's own
`readInput()` correctly treats malformed JSON as `{}` and fails toward "nothing to
report" rather than crashing) confirms the first-call/second-call-silent/Stop-
prints-systemMessage-only behavior described in the spec.

## Deviations / assumptions

- `docs/backlog-notice.md` is 25 lines against the brief's "20 lines" target.
- A1 doesn't specify PostToolUse behavior on a cold start (no sentinel yet): I skip
  the second gate in that case (nothing to compare against), so a first-ever
  PostToolUse call behaves like UserPromptSubmit/Stop. Noted in the state file as a
  judgment call, not a contract change.
- No `Needs` — nothing outside my territory required a change.

Full detail, contracts relied on, and continuation notes:
`C:\Users\benzh\AppData\Local\Temp\claude\C--Users-benzh-orca-workspaces-claude-delegation-gudgeon\9c61c35a-82dd-4aef-8eca-c99bb0e72e31\scratchpad\next-build\reports\T2-state.md`.

## Round 2

Review at `…\reports\T2-review.md`: NEEDS_FIXES (5). Fixes on commit `d0737ce`
(worktree still `wt-T2`, branch `feat/next-build-T2`).

- **MAJOR 1** (`backlog-notice.js:151-160` / `:279` at review time — cheap exit
  never engages until something has printed, so a repo with no `docs/work` or an
  all-`owned` ledger paid for the parser import + full parse on every
  `PostToolUse`): applied the reviewer's patch verbatim — `cheapExit` now stats
  `docs/work` unconditionally right after the freshness check and exits at once
  when `fileCount === 0`, before the `PostToolUse`-only sentinel comparison reuses
  that same scan.
  **Orchestrator's ruling on the residual** (binding, applied): the sentinel now
  carries two independent kinds of state — `printedAt` (moved only when a line
  actually prints, A1.4 unchanged) and the scan fields `newestMtimeMs`/`fileCount`
  (recorded by a new `writeScanOnly` on *every* `PostToolUse` evaluation that gets
  past the 120s gate, printed or not). `readSentinel` no longer discards a
  scan-only sentinel — it returns `printedAt: null` instead of `null` outright.
  Net effect: an all-owned ledger is parsed once, then stat-only until a record
  file actually changes. Added the requested test (all-owned ledger, `PostToolUse`
  twice, `CLAUDE_PLUGIN_ROOT` broken before the second call, stderr must stay
  empty on that second call) — green.
- **MAJOR 2** (the second gate's OPEN direction was untested — mutating the match
  check to `if (true)` passed 11/11): appended both tests from
  `…\scratchpad\probe\new-tests.txt` verbatim. Re-verified myself: mutating
  `hooks/backlog-notice.js`'s match check to `if (true) {` now fails
  "PostToolUse past the window reprints after an IN-PLACE edit", confirming the
  gap is closed; reverted the mutation before committing.
- **MINOR 4** (any non-`Stop` event got `additionalContext`, including a
  theoretical `SessionStart`): applied the reviewer's patch verbatim —
  `outputFor` returns `null` for anything but `UserPromptSubmit`/`PostToolUse`/
  `Stop`; `main()` now builds the payload, returns early when it's `null`, and
  only then calls `emit`.
- **MINOR 5** (`docs/backlog-notice.md` at 27 lines against the "20 lines"
  target): trimmed to 14 lines, no content dropped, no doc-vs-code drift.
- **MINOR 3** (`Owner:` ignored on a `runnable` record) is explicitly not mine
  per the coordinator's instruction and the reviewer's own routing — left
  untouched, belongs to T1 as a validator code.

Gate re-run: `node --test hooks/backlog-notice.test.mjs skills/multi/scripts/hooks.test.mjs`
-> 40 pass, 0 fail (37 prior + 3 new: the two MAJOR 2 tests and the MAJOR 1
residual test). Log refreshed at the same path as before.

Verdict: PASS.
