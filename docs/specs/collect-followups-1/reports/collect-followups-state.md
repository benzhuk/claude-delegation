Territory: lane 33, collect-followups-1 — Fix 1 (--stale-hours survives a reinstall) and Fix 2
(closed is terminal in computeState), files exactly as pinned in docs/specs/collect-followups-1/spec.md
Territory section.

Contracts I rely on:
- docs/specs/collect-status-1/contracts.md K1 (installed.json key order) and K3 (installer argv/CLI),
  both updated in this build to add staleHours/--stale-hours.
- docs/specs/collect-from-origin-1/contracts.md R1 (state token list), updated to add withdrawn+closed.
- work-record.mjs STATUSES (closed is a real, pre-existing status word).

Done:
- Fix 1: install-janitor-timer.mjs — DEFAULT_STALE_HOURS=2; scheduledCommandArgv/installedJsonText/
  systemdServiceUnit/windowsTaskXml/launchdPlist all thread staleHours through; main() parses/validates
  --stale-hours (0.1-48, exit 1 on refusal, matching this file's existing exit-1 convention for every
  other bound flag — see Open questions); result.staleHours set for the collect job only (janitor
  bytes untouched).
- Fix 1: collect-status.mjs parseArgs gains the same 0.1-48 range check; main() returns exit 2 early
  on a bad --stale-hours (this file's OWN deliberate exception to its "exit 0 always" promise).
- Fix 2: collect-from-origin.mjs computeState returns "closed" (terminal, like withdrawn); the old
  `r.status !== "closed"` guard in collect-status.mjs's computeAttention is removed (one place now
  decides state); NOTE_STATE_TOKENS gains "closed"; the :461 legend literal names it.
- Docs updated: collect-status-1/contracts.md K1/K3, collect-status-1/spec.md (stall-nudge closed
  clause), collect-from-origin-1/contracts.md:12 (state list — also added the pre-existing "withdrawn"
  gap while there), census.md:454 (updated, not marked historical — this is a live behavior contract).
- Gate green: `node --test scripts/install-janitor-timer.test.mjs scripts/collect-from-origin.test.mjs
  scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs` — 141/141 pass (after r1 fixes).
- Discriminating checks done in mktemp scratch copies (see build.md for exact commands/output): all
  new/changed assertions fail on the pre-fix source, pass on the fix.

Fix round 1 (review-r1.md), applied per the lead's ruling:
- F1: added the C2 "--stale-hours 0.5 given to main reaches every platform's written command and
  installed.json" test to install-janitor-timer.test.mjs, right after the bounds test. Verified in a
  mktemp scratch copy: kills M4/M5/M6/M7 (dropping staleHours on any one of systemd/Windows/launchd/
  installed.json in main()); confirmed by directly reverting M4 (systemd call) in a scratch copy and
  watching this new test fail, then restoring to green.
- F2: replaced the grep test at collect-status.test.mjs:201-211 with the exact-count + pattern-matched
  version from the review (hits.length === 2, one matching NOTE_STATE_TOKENS, one matching the legend
  line). Verified in a mktemp scratch copy: dropping "closed" from NOTE_STATE_TOKENS (M1) now fails this
  test (1 !== 2); restored to green after.
- F3: no code change — exit 1 stays for the installer's own --stale-hours refusal (lead's ruling); the
  lead amends the spec's Acceptance line in the record, not here.
- F4: added the janitor-record cross-refusal (`--stale-hours` refused for `--job janitor-record`) right
  after the --every janitor refusal in install-janitor-timer.mjs, plus one new assertion appended to the
  bounds test (C2: --stale-hours bounds...) exercising it.
- F5: contracts.md K3's "carried into every reinstall from then on" line replaced with the review's
  exact wording (reinstall always writes an explicit threshold; non-default values are not read back).
- F6: no change (nit, no fix required per ruling).

Next: none — r1 fixes applied, gate green, all discriminating checks confirmed. Report at
docs/specs/collect-followups-1/reports/build-r1.md, STATUS: DONE.

Open questions:
- F3 (exit code for --stale-hours refusal): resolved by lead's ruling — exit 1 stays, spec amendment is
  the lead's to make in the record, not a code change here.
- docs/specs/collect-status-1/spec.md's own line 27/38 "--stale-hours (default 6)" is collect-status.mjs's
  OWN CLI default and is UNCHANGED — the installer's new baked-in default of 2 is a separate value in a
  separate file/flag, matching lane 30's manual override. Not a conflict, but worth a sentence in the
  lead's read.

How to run my gate:
cd <repo> && node --test scripts/install-janitor-timer.test.mjs scripts/collect-from-origin.test.mjs \
  scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs
