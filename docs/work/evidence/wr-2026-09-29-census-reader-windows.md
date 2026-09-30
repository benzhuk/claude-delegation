VERDICT: PASS 4f4edbc4e470e6faa4f9598763dbb4800468bb3e

# Native Windows full gate

- Reviewed artifact: `4f4edbc4e470e6faa4f9598763dbb4800468bb3e`
- Tested integration HEAD: `5ba374e9c505006a93600927e0f968ed6fedafb7`
- Checkout: `C:\Users\benzh\orca\workspaces\claude-delegation\census-reader-40b`
- Command, invoked exactly once in the normal native environment: `node scripts/run-tests.mjs --no-sweep`
- Raw output: `C:\Users\benzh\orca\gates\01a0df4c-2809-7520-b1d7-876cc51a87ee\census-reader-40b\windows-r1\raw.log`
- Process exit: `0`
- Result: 3,327 tests; 3,236 pass; 0 fail; 0 cancelled; 90 skipped; 1 todo; duration 175,848.5205 ms.
- Sealed-home check: `leak check: 0 new temp entries`.
- Failing tests: none.

## Preflight and source identity

- `DELEGATION_REVIEW_RUN` was naturally absent (`False`); it was not changed.
- Runtime competing-suite check found zero `node.exe` processes running `run-tests.mjs` or `node --test`.
- The nonblocking `Global\claude-verify` acquisition succeeded. The mutex was held through raw-log close and released in `finally`.
- `git status --short -- scripts skills hooks agents` was empty before and after the run.
- HEAD is docs-only relative to the reviewed artifact for this gate. The executable/test trees are byte-identical by Git tree identity:
  - `scripts`: `494cf5de26883ffece918750e1ec65064d37ef2b`
  - `skills`: `6e48c12d5068bd77dc2c4ea636e58cf83dc8aa0e`
  - `hooks`: `c920f5928d748f4b3c226dc220cdb111e265fb69`
  - `agents`: `8c4499cf5a5bc95830159a7ea6afca009108d9fb`
- The runner's sealed home was `C:\Users\benzh\AppData\Local\Temp\delegation-test-run-50076-n93d4w\sealed-home-W6wqEc`.
- Expected fixture diagnostics appeared on stdout/stderr, including deliberately induced git, janitor, and review-run errors. TAP classified every such case successfully; no unexpected failure was reported.

## Skips

The 90 named skips below are reproduced from the TAP output. Their complete skip reasons and timings remain in `raw.log`; they are platform or fixture limitations declared by the tests.

1. C2: systemd unit and timer text for --job collect-status — exact bytes
2. C2: --stale-hours 0.5 appears in the systemd ExecStart too (all three generators, lane 33 F1)
3. C2 review round 1, m2: --out is resolved to an absolute path (never left relative to the repo's own WorkingDirectory), and a control character (e.g. a real newline) is refused outright
4. review finding R2-1: an unreadable matched session directory (EACCES, not ENOENT) counts as unknown (NaN), never as idle
5. review finding 2: a SAFE worktree with a live process sitting in it (cwd) survives --apply even once idle past the floor
6. seam review MEDIUM 1: a SAFE worktree with a live process sitting in a real '..live' child dir is still refused, not misread as outside
7. seam review r2: worktreeHasOpenProcess fails closed inside a private PID namespace, discriminated through an injected statImpl (no real unshare needed)
8. F11: --write-allow SKIPs as chezmoi-managed when a fake chezmoi on PATH lists the settings file (relative to $HOME)
9. F11: --write-allow SKIPs as "chezmoi check failed" when chezmoi is on PATH but errors
10. F9: --write-allow SKIPs the codex rules file as chezmoi-managed
11. F8: target equal to process.cwd() is refused
12. S: happy path removes with fs, dry-run removes nothing
13. S: session id mismatch is refused
14. S: unset session id is refused
15. S: the scratchpad directory itself is refused, not just its contents
16. T: happy path removes with fs, dry-run removes nothing
17. T: whole delegation-<name>-XXXX directory removes as one unit
18. T: a top dir not prefixed delegation- is refused
19. T: owned by another uid is refused (no root required - inject ctx.uid)
20. F3: a nested linked-worktree .git FILE inside a T dir is refused
21. F3: a nested repo with a non-empty worktrees/ subdir is refused
22. T dir containing a path from the cwd's own git worktree list is refused
23. a symlink target is refused, never followed
24. a target equal to HOME is refused
25. an absent target does not block other arguments and does not fail the run
26. W: happy path - dry-run prints without removing, live removes via applySafe (F1 idle floor cleared)
27. W: refused when younger than the classify-level age floor (real now)
28. W: F1 - SAFE but not yet idle 24h is refused distinctly from the age floor
29. W: a dirty worktree is refused, never removed
30. W: the main worktree itself is refused
31. HIGH1: a target INSIDE a linked worktree living inside a T dir is refused, even with cwd outside the worktree's repo
32. HIGH1 (re-review finding 1): a plain repo's own main checkout, with NO other linked worktrees, is refused too - ruling r2's 'any .git entry' rule, not only 'has other linked worktrees'
33. HIGH1 (re-review finding 1, P2b): the T top itself is the plain repo - a target inside it is still refused
34. HIGH1 (re-review finding 1, P2c): a plain repo whose .git/worktrees/ is empty (its one linked worktree already removed) is still refused
35. H1d (mutation-provable): an unreadable ancestor .git entry refuses, rather than being treated as absent
36. HIGH2 (re-review finding 2): a bare repo backing a live linked worktree with an unpushed commit is refused, and so is anything inside it
37. HIGH2 (re-review finding 2): a plain delegation-* dir with no git shape at all stays removable
38. HIGH2: the class-root st_dev baseline catches a target that is ITSELF a differently-mounted directory (mutation M5b-provable: the fix's own baseDev change)
39. HIGH2: a same-filesystem bind mount (st_dev identical) is refused via the mount table (injected mountinfo)
40. HIGH2: an unreadable mount table fails closed (refused), never silently passes
41. H2c (mutation-provable): a target lying under an ANCESTOR bind mount is refused as 'lies under a bind mount', not just 'crosses'
42. HIGH2 (measured, unshare -rm): a real same-device bind mount landing on a T target is refused and the sentinel survives
43. re-review MEDIUM3 (mount check): a same-filesystem bind mount at a dir literally named '..m' is still refused, not misread as an escape
44. re-review MEDIUM3 (F8 cwd check): a cwd of '<top>/..work' still refuses <top>, not misread as escaping it
45. MEDIUM3: an rmSync failure prints a failed line and does not crash; later arguments still run
46. seam review MEDIUM 3: a live process with its cwd inside a T target is refused, not silently removed
47. seam review MEDIUM 3: an in-use check that cannot answer ('unknown') refuses with 'in-use check failed', never a confident match
48. seam review r2: a live process whose cwd is a SUBDIRECTORY of the T target refuses the target
49. MEDIUM5: a removed W line carries a restore hint
50. M5c (mutation-provable): a partial W removal (git deregistered it, contents already gone) prints its own restore-hint line
51. MEDIUM6: a T argument given through a symlinked posixVarTmpRoot (darwin's own /var/tmp shape) is accepted and rmSync receives the REAL path
52. MEDIUM6: a symlink ONE LEVEL BELOW the root is still refused (the rewrite never touches anything below the root)
53. MEDIUM7 (M7-provable): a T top dir that is group- or world-writable is refused
54. MEDIUM7 (M7-provable): an S claude-<uid> dir that is group- or world-writable is refused
55. LOW10: an unreadable idle-age source gives 'idle age unknown', never 'active in last 24h'
56. LOW10: a negative idle age (clock running ahead) gives 'mtime in the future', never 'active in last 24h'
57. LOW11: an unreadable subdirectory during the walk refuses the whole invocation, rather than silently skipping what it hides
58. L11 (mutation-provable): an unreadable subdirectory's READDIR failure refuses too, not just an lstat failure
59. LOW13: a target that becomes a symlink between validation and removal is refused at the re-check, not removed
60. a path that is neither S, T, nor a live worktree is refused
61. F3: one unremovable stale entry does not abort the sweep, and the partial count is still printed
62. SIGTERM to a runSealed wrapper with a foreign listener delivers once and removes its home (R1, POSIX only)
63. SIGTERM to only the runner terminates its immediate suite controller and removes the runner home (R1, POSIX only)
64. a SIGTERM sent to the whole process group re-raises on the runner and removes its own sealed home (F1, POSIX only)
65. P2: a child run killed with SIGTERM leaves no root at all (POSIX only)
66. P2: a failing run under a SYMLINKED temp dir still keeps the sealed home (POSIX only)
67. a child killed with SIGINT removes its registered home, then re-raises so the OS reports the real signal (POSIX only)
68. a child killed with SIGTERM removes its registered home, then re-raises so the OS reports the real signal (POSIX only)
69. a child killed with SIGHUP removes its registered home, then re-raises so the OS reports the real signal (POSIX only)
70. a kept (unregistered) home survives SIGTERM - keep() truly removes it from the leak-fix registry (POSIX only)
71. an existing SIGTERM listener receives one delivery and owns the eventual exit (F4, POSIX only)
72. a malformed first line exits 2
73. a missing report exits 2, and (m8) the inline reply is saved to reply.txt, never to --report
74. a report for a different sha exits 2
75. a timeout exits 3, and the fake's process is gone (process-tree kill, M5)
76. APPROVE passes through with exit 0; the verdict is in the stdout-shaped output and the sidecar
77. NEEDS_FIXES (n) also passes through with exit 0 (B1: the reviewer role's own contract, not the packet's stricter regex)
78. B1: APPROVE with an em dash, a CRLF report, and a BOM report all pass with exit 0
79. B1: APPROVE with no sha exits 2
80. the child's environment carries DELEGATION_REVIEW_RUN=1 and a scratch AGENTS_HOME, and never NOTE_SLUG/ORCA_*/the messaging socket, even when the caller's env sets them all
81. finding 10: the sidecar carries roleBodySha256, an absolute claudeBin, resolvedModel from the init event, and installedRoleSha256 (null when nothing is installed)
82. finding 10: installedRoleSha256 is computed independently of roleSource — a --plugin-root flag run still reports what is actually installed
83. finding 10: a failed cleanup is surfaced on the stdout-shaped output too (cleanup + wtDir), not just the sidecar
84. the role passed to the child is byte-derived from the resolved reviewer.md: its sha256 is in the sidecar
85. finding 4: a run given a relative --scratch never writes anything into the reviewed repo (git status stays clean), and still succeeds
86. finding 6: owner.json is rewritten with the real childPid and timeoutMin right after spawn
87. finding 5 (kills M4/M5/M6): the real spawn-boundary argv is byte-identical to buildArgv's own output, and agents.json is byte-identical to buildAgentsJson(parseRoleFile(roleBytes))
88. finding 5 (kills M13): SIGTERM to review-run itself actually kills the fake's real OS process, not just its own child handle
89. finding 5: cleanup never follows a symlink inside wt/ out to a canary file elsewhere
90. M5: SIGTERM to review-run while the fake is running exits with the timeout code and the clone dir is gone

## Todo

- `F10 probe P-allow: recorded as documented behavior above this test, not re-run here (needs a live claude CLI)`

No repair, rerun, sweep, cleanup, source edit, marker change, HOME override, or git-identity change was performed.
