VERDICT: PASS 875efa007a06f1d16266da7448d63cd8cfbd378f

## rev-parse

```
HEAD        875efa007a06f1d16266da7448d63cd8cfbd378f
origin/main c3f9ad0b0f9682d2de52c8e4ea8adcc6ee7877e7
```

Both confirmed via `git rev-parse HEAD origin/main` on the Windows clone after fetch and
checkout. `HEAD` matches the requested sha exactly; `origin/main` now resolves because the
bundle carried `refs/remotes/origin/main` this time and it was fetched into the clone
before checkout.

## Totals (final aggregate, `run-tests.mjs`)

```
tests      1778
suites     0
pass       1778
fail       0
cancelled  0
skipped    0
todo       0
duration_ms 222857.8338  (~3m 43s)
```

No failing tests. `hooks/delegation-reminder.test.mjs` did not fail, so no rerun of that
known flake was needed.

## Prior run note

The earlier run at `de019ecec82499fe6c09e821f033d272a5998e25` reported one failure —
`skills\decisions\scripts\decisions-handback.test.mjs:789` ("CLI: real process, without
--head, calls real git for the head sha …") with `fatal: bad revision 'origin/main'`.
Per the lead's ruling, that failure was caused solely by the first bundle omitting
`refs/remotes/origin/main` (a bundle-clone-environment gap, not a code regression). This
rerun, with `origin/main` added to the bundle and fetched into the Windows clone before
checkout, passes clean at 875efa0 with the same test now succeeding.

## Host / log

Host: `benzh@ben-desktop.tail219acd.ts.net` (Ben-Desktop, Windows 10.0.26100.9550)

Log (copied back from Windows, overwriting the prior de019ec log): `/home/ben/Code/wt-lg/docs/work/evidence/wr-2026-09-26-linux-green-windows-suite.log`

## Steps executed

1. In `/home/ben/Code/wt-lg`: `git fetch -q origin`, then `git bundle create <scratch>/lg2.bundle build/linux-green-1 refs/remotes/origin/main` — succeeded (3,440,607 bytes).
2. `scp` of the bundle to `C:/Temp/lg2.bundle` — succeeded, byte count matched on the Windows side.
3. On Windows (one line): `git clone -q lg2.bundle lg-875efa0`, `git fetch -q C:\Temp\lg2.bundle refs/remotes/origin/main:refs/remotes/origin/main`, `git checkout -q 875efa007a06f1d16266da7448d63cd8cfbd378f`, `git rev-parse HEAD origin/main` (both matched expected shas), `node scripts/run-tests.mjs` — ran to completion, exit code 0 at the shell level and 0 failing tests reported by the suite, duration ~3m43s.
4. `scp` of `C:\Temp\lg-875efa0.log` back to the evidence path above, overwriting the prior de019ec log — succeeded.
5. Cleanup on Windows (separate ssh command): `rmdir /s /q C:\Temp\lg-875efa0 & del C:\Temp\lg2.bundle C:\Temp\lg-875efa0.log` — succeeded; `dir C:\Temp` afterward shows none of the three artifacts remain (only pre-existing, unrelated files/dirs).
