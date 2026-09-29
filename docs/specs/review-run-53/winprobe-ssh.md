DONE

# Lane 53 (review-run.mjs) live Windows probe — ben-desktop

## Stop condition hit at the precondition gate

Per the brief: "First check that `where claude` resolves to a claude.exe. If it resolves
only to a .cmd shim, or claude is not logged in over ssh, that is the result: report it
and stop." That is exactly what happened. No W-P5 or W-P7 run was attempted through
`review-run.mjs` — none of the 3-run budget was spent, and the spare was not used.

### `where claude`

```
C:\Users\benzh\.local\bin\claude.exe
```
Resolves to a real `claude.exe`, not a `.cmd` shim. This half of the precondition passes.

### claude is not usable (not logged in) over this ssh session

- `claude --version` over ssh returns instantly: `2.1.284 (Claude Code)`. The binary runs fine.
- `claude -p "reply with the single word OK" --model haiku` (plain, then repeated with
  `--setting-sources user --strict-mcp-config --permission-mode bypassPermissions`, then again
  with stdin explicitly redirected from `NUL`) each **hung indefinitely** — zero bytes of
  stdout/stderr after 8-10+ minutes per attempt, across three separate attempts. `netstat`
  showed the child process (verified by exact pid) held multiple ESTABLISHED TCP:443
  connections throughout, so it was not a dead network — it was stuck making requests that
  never resolved to a response, consistent with a blocked local credential (keychain) read.
- Decisive check: `claude -p "reply OK" --model haiku --bare` — `--bare` skips keychain
  reads and requires `ANTHROPIC_API_KEY`/`apiKeyHelper` instead of OAuth/keychain. This
  returned **immediately** (well under the 30s wrapper timeout): `Not logged in · Please run
  /login`, exit 1.
- Conclusion: this ssh session runs under Bitvise's restricted (S4U/network-logon) token,
  the same class of trap the `control-windows-box` skill documents for `gh`/`git` (DPAPI
  credential vault unreachable from that token). `claude`'s default OAuth/keychain auth path
  hits the same wall — the read never completes, so every default-mode `-p` call hangs
  forever rather than failing fast. `--bare` bypasses the keychain and immediately reveals
  there is also no `ANTHROPIC_API_KEY`/`apiKeyHelper` configured for that path. Either way,
  `claude` cannot complete a real model call over this ssh session right now — i.e. "not
  logged in over ssh" per the brief's own phrasing, whatever the underlying mechanism.
- Every hung process this produced was killed by its own exact pid (never a name-based
  kill): PIDs 4824, 13492, 52604, all `taskkill /PID <n> /F` on ben-desktop, each verified
  gone afterward. No process was left running past this report; `tasklist` for `claude.exe`
  now shows only the 6 pre-existing interactive sessions that were already running before
  this probe started (unrelated to this task, untouched).

## Setup that WAS completed on Windows (left in place, nothing deleted)

- Windows clone verified at the pinned sha:
  `git -C C:\Temp\l53r4-20260929024343 log --oneline -1` →
  `643a862 test(review-run): W3 — portable dead-pid and live-victim helpers for win32`
  (matches the brief's `643a8626b7cf3b8d9711e7640ee95a548d9fb69a`).
- New folder created, nothing reused/removed: `C:\Temp\l53probe-20260929025321\` with
  subfolders `decoy\`, `scratch\`, `briefs\`, `reports\`.
- Decoy repo: `C:\Temp\l53probe-20260929025321\decoy\`, `git init`, one file (`readme.txt`)
  committed with the machine's own configured identity only (no `-c user.*`, no `--author`
  passed) — commit `054407b` "decoy initial commit". Git did not refuse for lack of
  identity, so no stop was needed on that account.
- No brief/report files were written under `briefs\`/`reports\` since no `review-run.mjs`
  call was attempted — writing a brief for a run that cannot execute would not have been
  useful evidence.
- The fixture-plugin-guard role for W-P7 was never copied over (scp), since W-P7 could not
  be attempted either.

## Probe table

| Probe | Verdict | Evidence |
|---|---|---|
| W-P5 (real benign review of the decoy) | INCONCLUSIVE | Never run — blocked at the precondition gate: `claude` is not logged in / cannot complete a model call over this ssh session (see above). None of the 3-run budget was spent on it. |
| W-P7 (fixture-plugin-guard: 3 denied git steps + read-only check) | INCONCLUSIVE | Never run — same precondition gate. The `fixture-plugin-guard` role was not copied to Windows since there was nothing to run it against. |

## Budget usage

- Real runs used: 0 of 3.
- Spare used: no (this was an infrastructure/precondition failure caught BEFORE any budgeted
  run, exactly the case the brief carves out as its own stop condition — not a mid-run
  infrastructure failure that would have justified spending the spare).

## Cleanup

- All processes this task spawned on ben-desktop were killed by exact pid (4824, 13492,
  52604) and confirmed gone.
- No files or directories were deleted anywhere, per the hard rule. The decoy repo and the
  `C:\Temp\l53probe-20260929025321\` tree remain on ben-desktop for anyone who wants to
  retry once `claude /login` has been re-established over an interactive (non-Bitvise-
  restricted) session on that box.
- No git identity was ever set by this task; the decoy commit used the box's existing
  configured identity only.
- No sidecars or reports exist to copy back to Netcup (no run produced any), so no
  `/var/tmp/lane53-winprobe-XXXX` evidence-copy directory was created.
