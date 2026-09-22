VERDICT: APPROVE 17265e8
(round 2 verdict: APPROVE d0737ce)

T2 backlog-notice, round-2 delta re-review (Opus), diff 2859a6a..d0737ce only (3 files, +122/-28; no
hooks.json, wiring-json or hooks.test.mjs change in this delta — round 1 cleared those).

Fixes verified as specified: MAJOR 1 at `hooks/backlog-notice.js:185-197` — `scanWorkDir` runs
unconditionally before any import, `fileCount === 0` exits, inner duplicate scan gone, patch verbatim.
MAJOR 2: both my tests appended verbatim at `:253-281`. MINOR 4: `:243-249` + `:328-331` (null-guard).
MINOR 5: `docs/backlog-notice.md` is 14 lines. MINOR 3 correctly left alone, routed to T1.
- A1.4 amendment (`writeScanOnly`, `:138-155`, `:317-325`): scan fields on every evaluated
  PostToolUse, `printedAt` only on a print, an existing `printedAt` preserved; `readSentinel` now
  yields `printedAt: null` and `cheapExit:188` guards on it. Residual closed — probed on the six
  REAL records: call 1 silent, stderr empty, sentinel `{"newestMtimeMs":…,"fileCount":6}` with no
  `printedAt`; call 2 with a deliberately BROKEN `CLAUDE_PLUGIN_ROOT` is still silent with EMPTY
  stderr, i.e. the parser is not imported at all. 20x PostToolUse on that ledger: 42.7ms/call vs
  32.5ms bare node — stat-only, no parse.
- No suppression regression: an in-place `owned` -> `runnable` edit on a real record makes the very
  next PostToolUse print the C3 line, and UPS still prints (a scan-only sentinel never gates UPS).
- Stop emits `systemMessage` only, `decision` undefined, exit 0; `decision` appears nowhere in the
  hook. The `if (true)` mutation of the second gate now FAILS the suite (1 of 14) — blind spot closed.
- Gate `node --test hooks/backlog-notice.test.mjs skills/multi/scripts/hooks.test.mjs`: 40 pass /
  0 fail. Wiring probe on a fresh mkdtemp home: one row, `state:"info"`, `why` ending `(off)`.

Note (not a finding): the no-print path records its scan after the parse, so a record written in
that window is recorded as seen and surfaces one call late — same class as the post-print write.

## Round 3 (delta d0737ce..17265e8, seam finding F5) — APPROVE

Diff is exactly two lines in `hooks/backlog-notice.js:301,304`: the literal seven-status array is
gone, `let statuses;` is assigned only from `parser.STATUSES`. `classify` (`:223`) is its sole
consumer, `scripts/work-record.mjs:9` exports it, no other file changed.
- Behaviour unchanged, probed under `childEnv` with fresh mkdtemp homes: a mixed ledger prints the
  same C3 line on UserPromptSubmit and the same `systemMessage` on Stop, an unknown status is still
  skipped and counted on stderr only, and the zero-record/empty-dir short-circuit still exits before
  the import (broken plugin root -> silent, empty stderr).
- Failed-import path unchanged and announces no backlog: UPS and PostToolUse both exit 0 with empty
  stdout and the single `could not load the parser` stderr line.
- Gate `node --test hooks/backlog-notice.test.mjs skills/multi/scripts/hooks.test.mjs`: 40 pass / 0
  fail. No regression found in the delta.

Note (not a finding, for T1/integrator): the removed literal was also the guard for a parser that
imports but exports no `STATUSES` — that case now throws in `classify` and is swallowed by
`main().catch`, so the hook goes silent with no stderr at all (probed). Optional one-line hardening
inside the existing `try`, after `statuses = parser.STATUSES;`:
`if (!Array.isArray(statuses)) throw new Error('work-record.mjs exports no STATUSES');`
so the condition takes the announced failed-import path instead of silence.
