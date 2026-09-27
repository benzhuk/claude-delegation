VERDICT: APPROVE 899a6e615d895aea074c51e25e3f116329f5cbd4

# Review: lane 22, windows-task (build/windows-task-1 @ 899a6e6, base 0c92605)

Scope: the "Lane 22, windows-task" section of pack/bundle.md. Diff 0c92605..HEAD touches
scripts/install-janitor-timer.mjs, scripts/install-janitor-timer.test.mjs, and
docs/work/wr-2026-09-27-windows-task.record.md (the orchestrator's open-record commit). Nothing
outside the territory changed. skills/janitor/SKILL.md did not change and has no encoding text,
so it needed no edit.

Gate: `node --test scripts/install-janitor-timer.test.mjs` in the worktree: tests 48, pass 46,
fail 0, skipped 2 (the linux-only systemd skips that were already there). `git status` is clean
after the run.

## C4 fields

Cause: windowsTaskXml declared `encoding="UTF-8"` and writeFileAtomic wrote UTF-8 bytes, but Task Scheduler's `/XML` import needs UTF-16, so the live `schtasks /Create` failed with "(1,40) unable to switch the encoding". The UTF-8 choice was made only so readMarked's utf8 marker check would keep working.
Discriminating check: in a scratch copy, two mutants of the fix each break the new test. Mutant 1 makes readMarked always decode as utf8: +2 failures. Mutant 2 drops the encoding param at planWrite's writeFileAtomic call: +1 failure. The unmodified scratch copy has 1 failure of its own (the durability test fails because the scratch copy sits under %TEMP%). So the new assertions depend on both halves of the fix.
Fix location: scripts/install-janitor-timer.mjs:101-103 (writeFileAtomic encoding param), :284 (BOM + UTF-16 declaration), :369-381 (readMarked decodes the BOM), :386/:398 (planWrite threads encoding), :759 (the one artifact that sets `encoding: "utf16le"`), :875 (call site).
Simplification: the pinned design needs no smaller change. It is one encoding param with a utf8 default, and one BOM check limited to `.xml`. No new mechanism, and the ownership logic in planWrite and planRemove is untouched.

## Attack surface: results (all verified; no BLOCKER or MAJOR found)

1. **Bytes on disk are really UTF-16LE with a BOM, and the declaration matches.** I ran a scratch simulation (scratchpad/lane22/sim.mjs) that imports byte-faithful copies of HEAD and 0c92605. `cmp` confirms the HEAD copy differs only in its import path. Results:
   - The first bytes are `ff fe 3c 00 3f 00 78 00`, and the file length is even.
   - `new TextDecoder("utf-16le", {fatal:true})` decodes it with no error. The first line is `<?xml version="1.0" encoding="UTF-16"?>`, and re-encoding BOM plus text gives back the same bytes.
   - U+FEFF appears only at offset 0, not in the middle of the file.

2. **Nothing else in the XML changed.** The HEAD file decoded as UTF-16 and the 0.20.15 file decoded as UTF-8 are identical after the declaration line. That covers WorkingDirectory, StartWhenAvailable, IgnoreNew, `/s /c "...` and the last-run.log redirect.

3. **An old 0.20.15 UTF-8 `.task.xml` left on the box is recognised as ours and overwritten (checked carefully).** I installed with the 0.20.15 script first (first bytes `3c 3f 78 6d`, no BOM), then ran the HEAD install on the same home:
   - Exit 0. The task xml shows `updated` and installed.json shows `unchanged`. There are no refusals.
   - The file is now UTF-16LE with a BOM. A third run reports `unchanged`/`unchanged`.
   - Why: with no FF FE prefix, readMarked falls back to utf8 and finds the marker, and the content differs from desired (desired starts with U+FEFF), so planWrite overwrites the file.
   - The HEAD `--remove` also deletes a 0.20.15 UTF-8 file as ours (`removed`, `removed`).

4. **readMarked still refuses foreign files.** For each case below, install exits 1 with `left-untouched-foreign` and leaves the file byte-identical. `--remove` also leaves it byte-identical (`left-untouched-foreign`, and installed.json `absent`). Cases:
   - (a) a UTF-8 foreign xml;
   - (b) a UTF-16LE-with-BOM foreign xml with no marker;
   - (c) UTF-16LE marker text with no BOM (decoded as utf8, NULs between the characters, so no match: the conservative outcome);
   - (d) a UTF-16BE BOM (FE FF) file.

5. **systemd, launchd and installed.json paths are byte-identical to base.**
   - In the diff, the only changes on those paths are defaulted params (`encoding = "utf8"`).
   - installed.json from the 0.20.15 script and from the HEAD script, with the same inputs, is byte-equal after normalising the home path.
   - The launchd plist (`.plist`) can never take the BOM branch: that branch needs a `.xml` extension, so the plist keeps `encoding="UTF-8"` at :337.

6. **The no-enable path shells out nothing.** With an exec spy, install, reinstall, remove and `--enable --dry-run` all produce 0 calls. A real `--enable` against the fake exec produces exactly one call, `schtasks /Create /TN janitor-record /XML <path> /F`. The new test pins the spy at `calls.length === 0` across three calls.

7. **`--remove` deletes only marked files.** It removes our UTF-16 file and our old UTF-8 file, and leaves all four foreign cases in place. `--remove --dry-run` reports `would-remove` and deletes nothing.

8. **The atomic write with the new encoding param is right.** writeFileAtomic writes `tmp` with `encoding`, then renames it. No `*.tmp` files are left in the agents dir after the runs.

9. **The tests assert real bytes.** The test reads a raw Buffer (`xmlBuf[0] === 0xff`, `xmlBuf[1] === 0xfe`), then decodes it as utf16le for the declaration and content asserts. The foreign case writes real utf16le bytes.

10. **childEnv() in any spawn.** No spawn was added. The script's only exec is the injected `exec`, and the test file calls `main()` in-process and spawns no child. Nothing needs childEnv.

## Findings

### m1 (MINOR): the "byte-identical" guards on Windows task xml now compare a lossy view
Location: scripts/install-janitor-timer.test.mjs:1192, :1211, :1239 (and the `...Before` reads these compare against).

These lines read a file that is now UTF-16LE as `"utf8"`. The FF FE bytes decode to U+FFFD, and so would any other invalid utf8 byte pair. So "byte-identical" is no longer strictly what the assertion proves: two different byte streams can map to the same string. In practice, a change to ASCII content would still be caught.

Fix: read Buffers and compare with `assert.ok(buf.equals(before))`. Equivalently, drop the `"utf8"` argument on both the before and after reads and use `assert.deepEqual(fs.readFileSync(p), before)`. Predicted outcome: the tests still pass, and the guard becomes a real byte comparison.

### m2 (MINOR): the BOM is a literal invisible character in the source
Location: scripts/install-janitor-timer.mjs:284.

The string literal starts with a raw U+FEFF (bytes EF BB BF in the source file). An editor, a formatter, or a "strip BOM / invisible characters" pass could delete it without anyone noticing. The test would catch that, but the source reads as if no BOM were there.

Patch:
- current: `    '﻿<?xml version="1.0" encoding="UTF-16"?>\n' +` (raw U+FEFF before `<`)
- replacement: `    '﻿<?xml version="1.0" encoding="UTF-16"?>\n' +`

Predicted outcome: identical runtime string, and every test still passes.

### Note (not a code defect)
Acceptance (b), the live schtasks proof, and (c), the Netcup/Hetzner sealed suite, are not in the record yet. Those are the lead's steps. The collect-status job on Windows shares the generator, so it now also writes UTF-16. That is consistent and harmless, and the lane does not wire it on Windows.

## Verified absences
- No regression in the ownership or foreign-file logic.
- No shell-out on the no-enable path.
- The rest of the XML body is unchanged.
- The systemd, launchd and installed.json outputs are unchanged.
- The 0.20.15 upgrade path overwrites and does not refuse.
- No edits, commits or pushes were made to the reviewed tree. All trials ran on scratch copies under the session scratchpad.
