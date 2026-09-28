# stall-nudge-state

## Territory
`scripts/collect-status.mjs`, `scripts/collect-status.test.mjs`, `docs/specs/collect-status-1/spec.md`.
Branch `build/stall-nudge-1`. Not touched: installer, note-send/inbox/flush, work-record scripts,
run-tests.mjs, test-home.mjs.

## Contracts I rely on
docs/specs/stall-nudge-1/contracts.md S1-S6 (S1 timer flag is lead's job, not builder's; S2 dedupe
via ledger grep, fail-closed on read error; S3 Owner validity; S4 kill switch path = `defaultOutDir`
+ `no-nudge`; S5 argv shape + ordering after status.md/RESULT; S6 no live proof from builder).
docs/specs/stall-nudge-1/spec.md pinned rule + acceptance. note-send's envelope grammar
(`skills/multi/scripts/envelope.mjs`: SLUG_RE, assertFieldSafe, timeParts) read-only, never edited.

## Done
- `sendStallNudges` in collect-status.mjs: after status.md + the RESULT, one ASK per attention row
  whose reason matches `silent-over-*-h`. Owner read from the row's own tip blob via `git show
  <tipSha>:<recordPath>` + `parseRecord` (work-record.mjs, import only). Dedupe reads
  `docs/ledger/*.md` under `--recipient-repo` for `[<from>-<topic>-` (from=`collect-<host>`,
  topic=`stall-<branch-slug>-<tipSha7>`); ENOENT = no ledger yet (send); any other read error =
  fail closed, no ASK, one stderr line. Kill switch: `<defaultOutDir>/no-nudge`. Exported pure
  helpers: `branchSlug`, `buildStallTopic`, `ownerSlugOrNull`.
- Tests added (8 new, 59 total in gate): pure helpers; one integration test covering the full
  acceptance state matrix (2.1h ASK, 1.9h/accepted-merged/accepted-unmerged/rejected/withdrawn/
  no-record all silent) with exact argv assertions; dedupe (same tip silent, new tip asks again);
  kill switch (no ASK, attention row still in status.md); S3 owner none/missing/bad-grammar; S2
  ledger read error (docs/ledger as a plain file, forces ENOTDIR regardless of privilege).
- Discrimination proof for dedupe + kill switch done in a scratch copy outside the repo
  (`scratchpad/stall-nudge-discrim/`, see build.md) - both fail once their guard is disabled.
- docs/specs/collect-status-1/spec.md: new addendum section documenting the ASK, argv, dedupe,
  kill switch, and "a healthy run costs one ASK, answered by a Log line" language.
- Gate green: `node --test scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs`
  → 60/60 pass (log at reports/stall-nudge-gate.log).
- Added a `!fetchFailed` guard around the whole stall-nudge call, matching the RESULT send's own
  guard: a failed fetch means `rows` reflects stale local refs, never grounds for an ASK either
  (test: "a failed fetch never sends an ASK either").

## Next
- Lead: S1 (append `--stale-hours 2` to the live Netcup ExecStart by hand, daemon-reload).
- Lead: S6 live proof (scratch record on a lane left idle on purpose, quote the ledger ASK line,
  delete the one proof branch on origin under this spec's authority).
- Opus review of the seam (crafted branch name/record field reaching the shell or the envelope;
  two hosts double-waking one lead).

## Open questions
- No numeric cap on topic length is pinned anywhere in note-send/envelope beyond the 700-char
  line; I picked 40 chars for the branch-slug half (mirrors `sanitizeHost`'s own cap) and documented
  it as a builder judgment call, not a pinned number. Flag if the lead wants a different cap.
- `--quiet` does NOT suppress the stall ASK (only the kill switch and note-send-missing do) -
  the pinned rule only names the kill switch as a suppressor; --quiet suppressing the RESULT was
  never extended to the ASK. Worth confirming this reading in review.

## How to run my gate
`node --test scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs`
(run from the repo root of this worktree; hooks.test.mjs's N2 lints every `.test.mjs` in the repo
for a literal `...process.env` spread - our new tests never spawn a real child process, so it's
unaffected).
