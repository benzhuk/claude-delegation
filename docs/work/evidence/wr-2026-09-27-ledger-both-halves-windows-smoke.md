VERDICT: PASS 3c6a5f0f466ec7d2d9f1c2fe165c380d459a9e59

## Suite

Ran the node test suite on the Windows second host (benzh@ben-desktop.tail219acd.ts.net) against branch build/ledger-both-halves-1, checked out at the pinned sha, moved by bundle since Windows ssh cannot reach GitHub.

`git rev-parse HEAD origin/main` on the Windows clone:

```
3c6a5f0f466ec7d2d9f1c2fe165c380d459a9e59
65d2994277d63c04b7ab0e9be9fc5dae0f8115e5
```

HEAD matches the pinned sha exactly. (A benign `warning: remote HEAD refers to nonexistent ref, unable to checkout` appeared during `git clone` from the bundle — expected, since a bundle has no HEAD symref; the subsequent explicit `git checkout` of the pinned sha succeeded.)

`node scripts/run-tests.mjs` totals from the tail of the log:

```
ℹ tests 1863
ℹ suites 0
ℹ pass 1863
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 158850.2333
```

All 1863 tests passed, 0 failed. `hooks/delegation-reminder.test.mjs` did not fail (no failures anywhere in the log, confirmed by grepping for `✖`/`not ok`/the file's own name — the one hit was an unrelated passing test whose title happens to contain the substring "not ok:false"), so no isolated rerun of that file was needed.

Full log saved at /home/ben/Code/wt-lbh/docs/work/evidence/wr-2026-09-27-ledger-both-halves-windows-suite.log.

## Smoke

Ran the transport smoke (Job 2) against the same Windows clone before it was cleaned up, using the pre-checked envelope in smoke-line.txt piped over ssh stdin into `note-send.mjs --append-ledger 2026-09-27`.

- Exit code: 0
- Command output: `mirrored line appended to C:/Users/benzh/.agents/notes/2026-09-27.md`
- Byte-compare result: PASS. `cmp` on the extracted last line of the fetched C:/Users/benzh/.agents/notes/2026-09-27.md against the exact bytes of smoke-line.txt reported no differences (exit 0). The line ends with a single `\n` (LF, not CRLF) and there is no BOM at the start of either file (verified with `od -c`).
- Line-count delta: exactly +1. Before the append: 10 lines / 4098 bytes. After: 11 lines / 4274 bytes. `cmp` of the first 10 lines of the after-copy against the full before-copy also reported no differences, confirming nothing else in the file was touched.
- Grep line from the Windows notes file (line 11, the newly appended line):

```
skills-n → skills-fable, 9.27.26 01:59 NYC [skills-n-mirror-smoke-1] FYI: Lane fifteen transport smoke, one ledger line appended over ssh by the new append mode. Needs: none
```

The append was run exactly once; it was not repeated.

## Cleanup

Ran `rmdir /s /q C:\Temp\lbh-3c6a5f0 & del C:\Temp\lbh.bundle C:\Temp\lbh-3c6a5f0.log` as its own ssh command after the smoke. It completed with no prompt and exit code 0. A follow-up `dir C:\Temp\lbh*` returned "File Not Found", confirming nothing lbh-related was left in C:\Temp.
