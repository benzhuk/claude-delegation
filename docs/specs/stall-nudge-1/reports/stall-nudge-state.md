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
  `docs/ledger/*.md` in the MAIN CHECKOUT of `--recipient-repo` (F1: resolved via
  `mainCheckout`/`gitRunner` from `skills/multi/scripts/transport.mjs`, import only, same resolver
  note-send itself uses — a linked worktree or subdirectory `--repo` now dedupes correctly) for
  `[<from>-<topic>-` (from=`collect-<host>`, topic=`stall-<branch-slug>-<tipSha7>`); ENOENT = no
  ledger yet (send); any other read error = fail closed, no ASK, one stderr line. Kill switch:
  `<defaultOutDir>/no-nudge`. `--quiet` suppresses the ASK too (F3). A `closed` record is never
  flagged silent even though `computeState` buckets it as `owned` (F2). Two attention rows sharing
  one branch tip get exactly one ASK per run: the in-memory ledger corpus grows by the sent id
  prefix after each send (F6). The ASK text names the record's own `Status:` word when it is a
  known `STATUSES` token, falling back to the row's bucket otherwise (F7). Exported pure helpers:
  `branchSlug`, `buildStallTopic`, `ownerSlugOrNull`.
- Fix round 1 (this pass, review-r1.md, sha 65e6921): applied F1-F7 exactly as review-r1.md's
  patches specify (a prior builder had already written all seven into the working tree
  uncommitted; I verified each against contracts.md/the findings rather than trusting its own
  memory, found no defects, and committed it). New/changed tests: F1 (linked-worktree dedupe, a
  `fakeSpawnWritingLedger` that resolves through the real `mainCheckout` and writes a real
  `buildEnvelope` line), F2 (closed excluded + blocked named by its own Status word), F3 (`--quiet`
  → 0 sends), F4 (fixed the acceptance test's clock to `Date.now()+5h`; asserts
  `status.summary.attention` reasons before the call count), F5 (dedupe fixture built with
  `buildEnvelope`, id `-2`, filed under the previous day), F6 (two records on one tip → one ASK).
- Gate green: `node --test scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs`
  → 63/63 pass (log at reports/build-r1-gate.log). Discriminating mutants (F1 old ledger path, F4
  `stallRows = attention`, F3 dropped quiet guard) each fail their target test, each run in a fresh
  `mktemp` copy, never reused/cleaned.
- docs/specs/collect-status-1/spec.md addendum rewritten to match: closed exclusion, `--quiet`
  suppresses the ASK, dedupe reads the main checkout (not `--recipient-repo` directly), the
  shared-tip one-ASK-per-run behavior, and the record's own Status word in the ASK text.
- Added a `!fetchFailed` guard around the whole stall-nudge call, matching the RESULT send's own
  guard: a failed fetch means `rows` reflects stale local refs, never grounds for an ASK either
  (test: "a failed fetch never sends an ASK either").

## Next
- Lead: S1 (append `--stale-hours 2` to the live Netcup ExecStart by hand, daemon-reload).
- Lead: S6 live proof (scratch record on a lane left idle on purpose, quote the ledger ASK line,
  delete the one proof branch on origin under this spec's authority).
- Opus review of the seam (crafted branch name/record field reaching the shell or the envelope;
  two hosts double-waking one lead).
- Follow-up (out of territory, flagged by review-r1.md F2): `computeState` in
  `collect-from-origin.mjs` should give `closed` its own terminal state instead of bucketing it as
  `owned`; this lane only patches around it in `computeAttention`.

## Open questions
- No numeric cap on topic length is pinned anywhere in note-send/envelope beyond the 700-char
  line; I picked 40 chars for the branch-slug half (mirrors `sanitizeHost`'s own cap) and documented
  it as a builder judgment call, not a pinned number. Flag if the lead wants a different cap.

## How to run my gate
`node --test scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs`
(run from the repo root of this worktree; hooks.test.mjs's N2 lints every `.test.mjs` in the repo
for a literal `...process.env` spread - our new tests never spawn a real child process, so it's
unaffected. The fixture repos need a git identity: if HOME is sealed for the run, drop a
`.gitconfig` with `[user] name/email` into it first, or the fixtures' `git commit` fails.)
