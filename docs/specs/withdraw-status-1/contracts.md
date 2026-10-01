# withdraw-status-1 — pinned contracts (lead's rulings on the spec)

Spec: `docs/specs/withdraw-status-1/spec.md` (lane nine, origin/docs/lane-specs-0925 271258a). Where
this file and the spec disagree, this file wins. Base for every worktree: b7ddf11 (origin/main).

## R1. Superseded-by is a known header label
The parser rejects unknown labels (`scripts/work-record.mjs` KNOWN_LABELS, used at :101 and :577).
Add `Superseded-by` as a known, optional, single-valued label so it round-trips through the parser
and through check-acceptance. Nothing else about the label set changes.

## R2. withdraw writes only its own lines
`withdraw` rewrites the Status line, adds `Superseded-by:` when given, and appends one Log line in
the existing header Log format (`Log: <iso> withdrawn <by> <reason>`, before the first blank line;
check what four-read and validateRecord parse so the new line breaks neither). Every other byte of
the record is preserved (same discipline as accept). Refuse, exit non-zero with a clear message, and
leave the file unchanged: no --reason, empty reason, --superseded-by naming a record not on disk
(resolve against the record's own docs/work directory), source status not in {rejected, blocked,
runnable, owned}, already withdrawn. `--by` and `--at` are required, as in accept.

## R3. Exclusions
Every consumer that lists or counts work statuses excludes withdrawn, one test each:
`hooks/backlog-notice.js` (the "awaiting a fix round" line and any runnable/delivered list),
`hooks/multi-codex-hook.mjs` only if it lists records, and `scripts/collect-from-origin.mjs`,
which must never show a withdrawn record as owned or rejected (classify it as its own terminal
state, or omit it, and document which in its test). Grep for other status consumers and report them.

## R4. Docs
Every list of statuses in docs/ and skills/ (grep "rejected") gains withdrawn in one short clause;
the work-record section of docs/subagent-contract.md or docs/work-record.md gets one sentence on the
command. Nothing else in docs.

## R5. The lead does the dogfood
Only the lead writes docs/work. The builder does not touch docs/work/; the lead runs the built tool on
the two Sep 23 records at the accept turn.

## R6. Gates
- Territory gate: `node --test scripts/work-record.test.mjs hooks/backlog-notice.test.mjs scripts/collect-from-origin.test.mjs scripts/four-read.test.mjs && node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`
- Integration: `node scripts/run-tests.mjs`, no new failing test name vs base b7ddf11 (on Netcup H6
  and V4 fail on base; confirm on a base export).
- Second host: the lead runs the suite on Windows from origin before accept.

## Territory map
W1: scripts/work-record.mjs, scripts/work-record.test.mjs, hooks/backlog-notice.js,
hooks/backlog-notice.test.mjs, hooks/multi-codex-hook.mjs (only if R3 needs it) and its test,
scripts/collect-from-origin.mjs and its test, the status lists in docs/ and skills/ (R4).
Off-limits: docs/work/, scripts/build-census.mjs, scripts/four-read.mjs, scripts/janitor.mjs,
.codex-plugin/, README.md. Every prompt: never send peer notes, never set a git identity, no
trailers, never push, test child environments only through childEnv().
