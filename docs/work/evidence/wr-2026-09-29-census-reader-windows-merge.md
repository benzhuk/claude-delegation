VERDICT: FAIL 4faa110328b9e5f7543e6a48d209a79ef859dc4c

# Merged-main native Windows gate

- Tested merge: `4faa110328b9e5f7543e6a48d209a79ef859dc4c`
- First parent: `07671c9ab4d855711e063dc0524dbb914c003c34`
- Accepted-lane second parent: `fdb59ca1996c25c615fc59b4dc997abce70000f2`
- Checkout: `C:\Users\benzh\Code\claude-delegation`
- Command, invoked exactly once in the normal native environment: `node scripts/run-tests.mjs --no-sweep`
- Raw output: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\census-reader-40b\windows-merge\raw.log`
- Process exit: `1`
- Result: 3,327 tests; 3,235 pass; 1 fail; 0 cancelled; 90 skipped; 1 todo; duration 174,062.6706 ms.
- Sealed-home check: `leak check: 0 new temp entries`.

## Failure

`skills/multi/scripts/mirror-shim.test.mjs:177:1`

`R4: Windows plans BOTH shims — .cmd for cmd/PowerShell, extensionless for Git Bash`

The assertion expected 8 Windows shims but production planned 10 (`10 !== 8`). The output contained the expected `.cmd` and extensionless pairs for `note-send`, `note-inbox`, `note-flush`, and `note-notify`, plus an additional pair for `reclaim`:

- `C:\Users\benzh\AppData\Local\Temp\delegation-test-run-55524-6xAlYE\mirror-home-bazb8C\.local\bin\reclaim.cmd -> C:\Users\benzh\Code\claude-delegation\scripts\reclaim.mjs`
- `C:\Users\benzh\AppData\Local\Temp\delegation-test-run-55524-6xAlYE\mirror-home-bazb8C\.local\bin\reclaim -> C:\Users\benzh\Code\claude-delegation\scripts\reclaim.mjs`

The failing suite left its sealed home for inspection at `C:\Users\benzh\AppData\Local\Temp\delegation-test-run-55524-6xAlYE\sealed-home-31Glhh`, as designed for a failing run.

## Preflight and checkout state

- HEAD and both merge parents matched the supplied SHAs exactly.
- `DELEGATION_REVIEW_RUN` was naturally absent (`False`); it was not changed.
- Runtime competing-suite inspection found zero `node.exe` processes running `run-tests.mjs` or `node --test`.
- The nonblocking `Global\claude-verify` acquisition succeeded. The mutex was held through raw-log close and released in `finally`.
- `git status --porcelain --untracked-files=no` was empty before and after the run. Unrelated untracked notes were ignored as instructed.
- No source-equivalence claim to the earlier reviewed artifact is made; this gate tested the supplied merged-main commit directly.

## Skip groups

The 90 skips divide into these declared host or fixture limitations; exact test names and reasons remain in `raw.log`:

- 49: POSIX-shaped reclaim fixtures force `platform: "linux"` and are rejected as non-native paths on Windows; Windows-context twins exercise the applicable code paths.
- 19: no spawnable fake Claude executable on Windows; covered by the live Windows probe.
- 9: POSIX signal-handler behavior is unavailable because Windows terminates the child directly.
- 3: a `.cmd` stand-in cannot exercise the chezmoi subprocess fixture on the current patched Node runtime.
- 3: systemd generator fixtures require Linux/POSIX paths.
- 2: `/proc/<pid>/cwd` probes are Linux-only.
- 1: `chmod 0` does not deny reads on Windows.
- 1: directory symlinks require privileges on Windows.
- 1: Windows has no POSIX permission bits for the stale-entry fixture.
- 1: the PID-1 ownership discriminator is Linux-only.
- 1: `unshare -rm` is unavailable in this environment.

## Todo

- `F10 probe P-allow: recorded as documented behavior above this test, not re-run here (needs a live claude CLI)`

The capture wrapper emitted a post-suite `Tee-Object` append diagnostic while attempting to append `GATE_EXIT=1` after the raw log had closed. The caller still received exit 1, and `raw.log` contains the complete TAP totals, named failure, retained-home notice, and zero-leak result. No repair, retry, cleanup, source edit, marker change, HOME override, or git-identity change was performed.
