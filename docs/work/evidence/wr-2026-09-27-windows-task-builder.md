VERDICT: DONE 899a6e615d895aea074c51e25e3f116329f5cbd4

Territory: Lane 22, windows-task (pack/bundle.md lines 9-17). Owns scripts/install-janitor-timer.mjs, scripts/install-janitor-timer.test.mjs, and skills/janitor/SKILL.md (the doc named as J1's own territory doc in docs/specs/janitor-daily-1/spec.md:12; left unchanged since it names no XML encoding today). Branch build/windows-task-1, worktree C:/Users/benzh/Code/windows-task/wt, work-record wr-2026-09-27-windows-task. Commit sha is on the VERDICT line above; parent was the branch's open-record commit.

Goal-card line served: janitor timer (goal card's "a timer that never registered" — measure: work lost or stalled). Nearest NOT: "a symptom fix" — the fix changes the one wrong byte-encoding choice named in the defect, not a broader rewrite; and "a new mechanism while an existing one is unfed" — no new mechanism added, the existing installer is corrected so the already-fed janitor mechanism can register.

## What changed

Pinned design (pack/bundle.md:15): the .task.xml is written UTF-16LE with a BOM and declares encoding="UTF-16"; readMarked decodes a .xml starting with that BOM as UTF-16 before the marker check; everything else about the Windows path (ownership, foreign-file check, file layout, no-enable writes-only, --remove, the rest of the generated XML) stays as today.

Evidence, install-janitor-timer.mjs:
- windowsTaskXml (lines 275-284): the returned string now leads with the U+FEFF BOM character and declares encoding="UTF-16" (was encoding="UTF-8" with no BOM).
- writeFileAtomic (lines 96-108): gained an encoding parameter, default "utf8" (unchanged for every other artifact).
- planWrite (lines 386-401): threads a per-artifact encoding through to writeFileAtomic; default param means every existing caller (systemd units, launchd plist, installed.json) is untouched.
- The schtasks artifact entry (lines 755-760): declares encoding: "utf16le", the only artifact that does.
- readMarked (lines 373-386): now reads raw bytes first; a file ending .xml whose first two bytes are 0xFF 0xFE decodes via Buffer.toString("utf16le") before the marker .includes() check; every other file (and any plain-UTF-8 .xml a user wrote by hand) decodes as utf8 exactly as before — the ownership/foreign-file logic itself (planWrite/planRemove) is untouched, only the byte-to-string step feeding it changed.

Evidence, install-janitor-timer.test.mjs (the rewritten test, lines 549-627, was the old UTF-8-declaration test at the same location):
- BOM present: xmlBuf[0] === 0xff, xmlBuf[1] === 0xfe (lines 573-574).
- Declaration says UTF-16: assert.match(xml, /^\ufeff<\?xml version="1\.0" encoding="UTF-16"\?>/) (line 577).
- readMarked recognises the marker in a UTF-16 file: a second no-enable install against the same fixture reports status "unchanged" for the task xml (lines 585-595) rather than re-creating it or calling it foreign.
- readMarked still refuses a foreign file: the task xml is overwritten with a real-world-shaped UTF-16LE-with-BOM file carrying no marker; a third install call refuses to finish ("foreign (unmarked) file(s) present"), exit 1, and the foreign file is left byte-identical (lines 597-613).
- The no-enable path writes and does not shell out: a fakeExec spy is passed on every call in this test and calls.length stays 0 throughout (lines 555-556, 562, 592, 607) — no --enable flag is ever given, so nothing is shelled out to schtasks.

Not touched: header comment lines 32-33 and 20-53 (the rest of J1's pinned contract prose, updated only where it described the old UTF-8 choice at the windowsTaskXml site itself); the systemd, launchd, and collect-status generators; the --remove path's logic; the byte-identical comparisons elsewhere in the test file that read a Windows task xml back with "utf8" for before/after equality checks only (lines around 1129-1195) — those still pass because they compare two reads of the same encoding to each other, never assert on the decoded text's meaning.

Deviations/assumptions:
- "The doc the script's header names as its own": the script's own header comment does not literally cite a doc path by that phrasing; docs/specs/janitor-daily-1/spec.md:12 is what names skills/janitor/SKILL.md as this file's territory doc, so that is what I treated as owned. I read it and found nothing in it describes the XML's encoding, so no edit was needed or made.
- Did not take the /TR fallback: no code path for it exists in this diff; that decision is explicitly the lead's, made only if the live schtasks call still refuses the new UTF-16 file.
- Did not run --enable, schtasks, or any live Windows scheduling command myself, per the brief.

## Gate

Command run exactly as specified:
node --test scripts/install-janitor-timer.test.mjs skills/multi/scripts/hooks.test.mjs > C:/Users/benzh/Code/windows-task/pack/reports/B-gate.log 2>&1

Result: tests 74, pass 72, fail 0, cancelled 0, skipped 2 (both pre-existing skips unrelated to this change — the systemd generator only runs on linux fixtures, stated in-line as "the systemd generator runs only on linux hosts, and these fixtures are POSIX paths"), todo 0. Full log at C:/Users/benzh/Code/windows-task/pack/reports/B-gate.log.

## Live commands the lead should run (not run by me)

1. node scripts/install-janitor-timer.mjs --enable --json --repo <ref checkout>
   Expect exit 0 and a task xml at %USERPROFILE%\.agents\janitor\janitor-record.task.xml that schtasks now accepts (no "(1,40) unable to switch the encoding" refusal).
2. schtasks /Query /TN janitor-record /FO LIST
   Expect a Next Run Time line.
3. node scripts/wiring-check.mjs --json
   Quote the janitor line.
4. node scripts/install-janitor-timer.mjs --remove --enable --json
   Then schtasks /Query /TN janitor-record /FO LIST again, expect "cannot be found".
5. Final: node scripts/install-janitor-timer.mjs --enable --json
   left in place (Ben approved the janitor timer on all four hosts on 2026-09-27, 12:38 PM NY, per pack/bundle.md:17).
6. If the UTF-16 file is still refused live, the /TR fallback (schtasks /Create /SC ... /TR ..., 261-char limit checked in code, stated loss of WorkingDirectory/StartWhenAvailable) is the lead's own call, recorded with why it was taken.

The collect-status job is NOT wired on Windows in this lane (the collector runs on Netcup only) — say so in the record, per pack/bundle.md:17.

## Files changed

- C:/Users/benzh/Code/windows-task/wt/scripts/install-janitor-timer.mjs
- C:/Users/benzh/Code/windows-task/wt/scripts/install-janitor-timer.test.mjs
- (skills/janitor/SKILL.md read, not edited — no encoding text in it to update)

State file: C:/Users/benzh/Code/windows-task/pack/reports/windows-task-state.md
