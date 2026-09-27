# Scout — L1 (the two files and their tests)

Read at 4c29a2b74f17bca824582d41eef80385bca1213b (/home/ben/Code/wt-linux-green-1-L1,
Linux). Confirmed red before writing anything else.

## 1. Files and symbols
- `transport.mjs:422-436` `mainCheckout` matches the spec: `toPosix(dir)` →
  `runner(['rev-parse','--git-common-dir'], start)` → :434
  `if (!path.posix.isAbsolute(c) && !/^[A-Za-z]:/.test(c)) c =
  toPosix(path.resolve(start, c));`. `path.posix` needs no new import. Ran
  `note-send.test.mjs` at base: H6's second test fails, actual
  `<worktree>/C:/Users/benzh/Code/Zhuk Projects` vs expected
  `C:/Users/benzh/Code/Zhuk Projects` — premise holds.
- `note-send.test.mjs`: H6 tests at :363, :367 ("(L1)" is this build's own tag, not
  new). "Add one H6 test" is a genuinely new third test.
- `mirror-shim.test.mjs`: V4 real-install test :269, `SKILL_FILE_EXCLUDE` assertion
  :285-293. Ran at base: fails exactly as spec says.
- `mirror-shared-skills.mjs`: `IS_WINDOWS`/`MODE` :87-88 as contracts.md says.
  `SKILL_FILE_EXCLUDE` (:85) applies only inside copy-mode (`publishCopy`, :643) —
  never `publishSymlink`. Grepped force-copy-mode names: zero hits, no such flag exists.

**Landmine (verified live):** `path.posix.normalize`/`join`/`resolve` collapse a UNC
`//host/share` prefix to a single `/`. `path.posix.isAbsolute('//host/share')` is
`true`, but normalize/join/resolve afterward silently corrupts it — inside the
reviewer's own UNC attack case.

## 2. Helpers to reuse
- Commit `1f65ca3` (R3's precedent) did NOT add a mode-forcing flag — only branched a
  dry-run assertion on the test's own `IS_WINDOWS`. R3's platform-branch fallback is the
  live path here.
- `toPosix` is the only existing normalisation helper; no repo-local UNC helper exists.

## 3. Tests that police this area
- `note-send.test.mjs:363` pins `'C:/Users/benzh/Code/bto_nucleus'` — a regression
  tripwire beyond H6's own two tests.
- `mirror-shim.test.mjs:199` and the dry-run/plan tests share `MODE` dispatch — re-run
  the whole file.
- `hooks.test.mjs` N2 pattern polices `childEnv()` use.

## 4. Open questions for the spec
- "No copied file exists beside it" (V4, symlink mode): narrow or recursive check is a
  drafting call, not resolvable from the tree.
- Whether UNC detection needs an explicit comment beyond `path.posix.isAbsolute`
  (already correct) is the drafter's call.
