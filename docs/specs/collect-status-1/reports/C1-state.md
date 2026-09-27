# C1 state — collect-status.mjs

## Territory
`scripts/collect-status.mjs` (new) and `scripts/collect-status.test.mjs` (new). Nothing else touched.

## Contracts I rely on
- contracts.md K1: default `--out` = `~/.agents/collect/<basename of resolved --repo>/`, holding
  `status.json`/`status.md`/`previous.json`.
- contracts.md K2: sender slug `collect-<sanitized host>`; note-send resolved
  `~/.local/bin/note-send` else PATH else missing; note text built only from integers and
  collect-from-origin's own state tokens; `--goal "status at <abs status.md path>"`, dropped if
  envelope-unsafe; a failed fetch sends no note and never updates `announced`.
- spec.md's "C1: collect-status.mjs" section: attention rules, change-key definition, atomic
  writes, `--quiet`/missing-note-send behavior.
- Imports `main`, `fullRef`, `refExists`, `formatTable` from `scripts/collect-from-origin.mjs`
  in-process (never shells out to it); imports `assertFieldSafe` from
  `skills/multi/scripts/envelope.mjs` (pure, no I/O) only to pre-check `--goal` before it reaches
  note-send's own validation.

## Done
- `scripts/collect-status.mjs`: full implementation — parseArgs, defaultOutDir, sanitizeHost,
  computeByState, computeChangeKey, computeAttention, resolveNoteSend, sendNote, atomicWrite,
  buildStatusMd, main. Exit 0 always (outer try/catch mirrors collect-from-origin's own promise).
- `scripts/collect-status.test.mjs`: 21 tests — pure-helper unit tests, a status.json shape test,
  change-key equal/different note-send-call-count tests, `--quiet`, missing-note-send, missing
  `--to`, atomic-write (no `.tmp-` leftovers), `previous.json` rotation, fetch-failure (no note,
  `announced` stays null), the never-writes `.git` snapshot assertion (copied from
  collect-from-origin.test.mjs's model), and a 60-line budget check on a 5-branch fixture.
- Gate green both ways: `node --test scripts/collect-status.test.mjs scripts/collect-from-origin.test.mjs`
  → 43/43 pass; `node scripts/run-tests.mjs scripts/collect-status.test.mjs` (sealed) → 21/21 pass.

## Next
- Nothing pending in this territory. C2 (installer `--job collect-status`) and C3 (wiring/GOALS/skill
  paragraph) are separate territories that depend on this file's CLI surface
  (`--repo --main --no-fetch --skip --out --to --host --merge-hours --stale-hours --quiet`) and its
  default paths (K1) — those are exactly what's implemented here.

## Open questions
- Deviations from spec.md's literal text, all judgment calls flagged in the C1 report: (1) added
  a `fetch: "ok"|"skipped"|"failed"` field to status.json (not in spec's 5-key list, but symmetric
  with the md header's mandated "fetch: failed" and harmless); (2) added `changeKey`/`announced`
  fields (spec names `announced` explicitly but not `changeKey` — needed as the persisted
  comparison basis); (3) `--to` missing is treated the same as a missing note-send binary (skip
  send, still update `announced`, say so in status.md) — spec never states this case; (4) the
  60-line budget is honored for realistic row counts but is not mechanically truncated for a
  large (e.g. 40-branch) fixture, since spec names no truncation mechanism — flagged, not fixed.

## How to run my gate
`cd <worktree> && node --test scripts/collect-status.test.mjs scripts/collect-from-origin.test.mjs`
(unsealed variant given in this build's task text) or, sealed, `node scripts/run-tests.mjs scripts/collect-status.test.mjs`
(the brief's own text). Both pass green as of this state.
