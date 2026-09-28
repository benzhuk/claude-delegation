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
  scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs` — 140/140 pass.
- Discriminating checks done in mktemp scratch copies (see build.md for exact commands/output): all
  new/changed assertions fail on the pre-fix source, pass on the fix.

Next: none — both fixes complete, gate green, docs updated. Report at
docs/specs/collect-followups-1/reports/build.md, STATUS: DONE.

Open questions:
- Acceptance says "--stale-hours 0 and 99 are refused (exit 2) by the installer and by collect-status
  parseArgs." install-janitor-timer.mjs's own refusal path returns exit 1 uniformly for every bound
  flag (--hour, --every, and now --stale-hours) — the existing, heavily-tested convention. I kept that
  convention rather than special-casing one flag to exit 2, and gave collect-status.mjs (which
  otherwise always exits 0) the deliberate exit 2. Flagging this reading for the lead to confirm.
- docs/specs/collect-status-1/spec.md's own line 27/38 "--stale-hours (default 6)" is collect-status.mjs's
  OWN CLI default and is UNCHANGED — the installer's new baked-in default of 2 is a separate value in a
  separate file/flag, matching lane 30's manual override. Not a conflict, but worth a sentence in the
  lead's read.

How to run my gate:
cd <repo> && node --test scripts/install-janitor-timer.test.mjs scripts/collect-from-origin.test.mjs \
  scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs
