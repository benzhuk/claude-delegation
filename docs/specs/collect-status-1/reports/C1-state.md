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
  writes, `--quiet`/missing-note-send behavior, status.md's 60-line cap.
- Imports `main`, `fullRef`, `refExists`, `formatTable` from `scripts/collect-from-origin.mjs`
  in-process (never shells out to it); imports `assertFieldSafe` from
  `skills/multi/scripts/envelope.mjs` (pure, no I/O) only to pre-check `--goal` before it reaches
  note-send's own validation.

## Done (round 2 — every C1-review-r1.md finding applied)
- F1 (MAJOR): change detection now compares against `previousStatus.announced` (not `.changeKey`),
  so a change seen during a failed-fetch run is announced on the next good run instead of lost.
  `scripts/collect-status.mjs:324`.
- F2 (MAJOR): `buildStatusMd` now enforces the 60-line budget for real — caps attention entries
  then table rows (table header always kept, `formatTable` output byte-identical on the slice),
  appends `(+K more, see status.json)` when anything is cut. `scripts/collect-status.mjs:231-266`.
- F3 (MINOR): a failed send's `note: send exit N` now shows in status.md (was gated on `!sent`,
  which never held for an attempted send). `scripts/collect-status.mjs:237`.
- F4 (MINOR): an unresolved `--main` ref no longer sends a false "0 lanes" note; gate now
  `!fetchFailed && mainSha && !sameAsPrevious`. `scripts/collect-status.mjs:327`.
- F5 (MINOR): merge-hours boundary test now sits exactly at the threshold (4h / 4h+1s).
- F6 (MINOR): never-writes snapshot now walks the whole repo root, not just `.git`.
- F7 (MINOR): header comment now says the fixture builders are copied (not reused/imported) from
  `collect-from-origin.test.mjs`; `after()` cleanup no-ops under `FIXTURE_ROOT` (sealed run already
  cleans the whole fixture tree via `makeTempHome`'s own `cleanup()`).
- F8 (MINOR, documentation only): noted in C1.md that note-sending is Linux/macOS only —
  `resolveNoteSend` looks for the literal `note-send`, never `note-send.cmd`.
- NIT (optional, applied): status.json write now goes temp-file-first, then rotates the old file
  to `previous.json`, then renames the temp file into place — shrinks the "no status.json at all"
  window to two back-to-back renames.
- 3 new regression tests added (F1, F4, F2's 40-row budget case) plus the F5 boundary edit.

## Next
- Nothing pending in this territory. C2 (installer `--job collect-status`) and C3 (wiring/GOALS/skill
  paragraph) are separate territories that depend on this file's CLI surface
  (`--repo --main --no-fetch --skip --out --to --host --merge-hours --stale-hours --quiet`) and its
  default paths (K1) — those are exactly what's implemented here.

## Open questions
- Deviation 3 (round 1, unchanged): `--to` missing is treated the same as a missing note-send
  binary (skip send, still update `announced`, say so in status.md) — spec never states this case.
- Deviation 5 (round 1, unchanged): `announced` still advances for `--quiet`/missing-note-send/
  missing-`--to` (contracts.md only pins the fetch-failure case as "does not update announced").
  F1's fix only changed the failed-FETCH case; these three configuration/operator cases are a
  separate, still-open interpretation.
- F8's Windows gap (documented, not fixed): a Windows collector never sends a note; whether it
  should spawn `process.execPath` against the plugin's own `note-send.mjs` is a lead call, not
  taken here (K2 forbids a shell either way).

## How to run my gate
`cd <worktree> && node --test scripts/collect-status.test.mjs scripts/collect-from-origin.test.mjs`
→ 46/46 pass as of round 2 (log: `docs/specs/collect-status-1/reports/C1-gate.log`).
