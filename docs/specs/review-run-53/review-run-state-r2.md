# Lane 53, fix round 2 — state

## Territory
`skills/team-build/scripts/review-run.mjs` + its test file, plus `skills/team-build/SKILL.md`
for N6's doc sentence only.

## Contracts I rely on
- `docs/specs/review-run-53/lead-ruling-r3.md` (wins over everything): N1 is the ruling's own
  simpler design (the sweep never signals anything), not review-r2's `/proc` `isOwnOrphan` patch.
  N2-N6 taken verbatim from `review-r2.md`.
- `docs/specs/review-run-53/review-r2.md`: findings N1-N6, the verification table, the probe list.
- `lead-ruling-r2.md` / `build-r1.md`: round 1's mode decision (`auto` stays default) and probe
  history — unchanged this round.

## Done
All 6 findings applied, one commit per finding/concern, RED before → GREEN after each:
- N1 `e9852a8` — sweep never signals a pid; a live childPid means "leave the dir, print one line".
- N2 `af8ccc9` — deny git's `=`-joined global options as wildcard (not `:*`) rules.
- N3 `9e96cd7` — `writeSidecarAtomic` exported, rename-based, never follows a symlink/hard link.
- N4 `7446ae0` — report allow rule is `Edit(//abs)`, not the inert `Write(path)`.
- N5 `069697f` — the 3 missing sweep tests (mutants verified to kill each on a scratch copy, then
  restored), plus a 30s timeout on both real-OS-process SIGTERM tests.
- N6 `1b62edb` — SKILL.md documents the empty-sidecar-on-failure behavior.
- All review-r2 verification-table partial items (r1 #1a/1b/5/6/14) are now closed by the above.
- Gate: `node --test review-run.test.mjs delete-guard.test.mjs multi-inbox.test.mjs
  mirror-shared-skills.test.mjs` → **305/305 pass**.
- Full suite: `node scripts/run-tests.mjs` → **2991/2996 pass, 5 skipped, 0 fail**, leak check 0.
- Live probes 1-4 of review-r2's list, 3 real `claude -p` runs (of a 6 budget), this host only,
  against `probes/decoy-repo`, `probes/proberepo`, `probes/fixture-plugin-guard` (all reused, none
  deleted). All PASS/confirmed — full table in `build-r2.md`.
- Final HEAD: `1b62edb1e5f2584af28936ca0c3c2c6bc02a97a8`.

## Next
Nothing of mine is pending. For whoever picks this up:
- Probe 3 showed `Edit(//abs)` (unlike the old `Write(...)`) DOES let the report write through
  under `dontAsk` — resolves round 1's open question, but the ruling keeps `auto` as default
  regardless; that decision is unchanged.
- Probe 2 showed the real reviewer wrote its report via a raw `cat > path <<EOF` Bash heredoc,
  approved by the `auto` classifier's own judgment, never touching the `Edit(//abs)` allow rule at
  all — the rule is correct and inert-free, but a model that prefers Bash bypasses it entirely.
  Same class as round 1's "residual: writes the classifier approves stay residual" gap — noted,
  not treated as a new finding since the target path was still the correct one.
- `relscratch/` (round-1 leftover, untracked, unrelated to this round) is still on disk, per the
  no-delete rule; not touched again this round.

## Open questions
None of mine. Round 1's still-open items (P4 cross-talk attribution, `dontAsk`'s exact matching
mechanism) — this round's probe 4 re-measured P4's cross-talk and got the same result (only
`flush-last.json` changed, `pid` still unrelated to any review-run process): same conclusion, now
seen twice.

## How to run my gate
```
node --test skills/team-build/scripts/review-run.test.mjs hooks/delete-guard.test.mjs hooks/multi-inbox.test.mjs scripts/mirror-shared-skills.test.mjs
node scripts/run-tests.mjs
```
Both green at HEAD `1b62edb`. Logs are in scratch (never committed) — see `build-r2.md` for the
scratch path used this round.
