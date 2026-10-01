# linux-green-1 — pinned contracts (lead's rulings on the spec)

Spec: `docs/specs/linux-green-1/spec.md` (lane ten, origin/docs/lane-specs-0925 0bac9c6). The spec is
precise and stands as written; these rulings only pin what it leaves open. Base: 68d2a15 (origin/main).

## R1. Red before green is on the record
The lead ran both files in isolation at base in this worktree (Log lines in the record): H6 actual
`/home/ben/Code/wt-lg/C:/Users/benzh/Code/Zhuk Projects` vs expected `C:/Users/benzh/Code/Zhuk Projects`;
V4 `SKILL_FILE_EXCLUDE let a .test.mjs file publish`. The builder does not write docs/work.

## R2. mainCheckout
Compose with `path.posix` when `start` is POSIX-absolute or drive-lettered (normalise backslashes first,
as the function already does), keep `path.resolve` only for a relative `start`. A common dir that is
already absolute (POSIX or drive-lettered or UNC `//host/share`) is used as-is, normalised, trailing slash
removed. The function stays pure over strings apart from the existing git runner. The bug-fix fields
Cause, Discriminating check, Fix location and Simplification go in the builder's report.

## R3. V4
Test-only fix, as the spec says. If `scripts/mirror-shared-skills.mjs` already exposes a way to force copy
mode (check how commit 1f65ca3 tested both publish modes), use it so the copy-mode exclusion is asserted
on Linux too; otherwise the platform branch described in the spec. Any change to mirror-shared-skills.mjs
is at most an env or flag read and must be named in the report.

## R4. Gates
- Territory: `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/mirror-shim.test.mjs skills/multi/scripts/transport.test.mjs` (drop the last if it does not exist) `&& node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs`
- Integration: `node scripts/run-tests.mjs` with ZERO failures on Linux (H6 and V4 are this lane's
  targets, so no failing name is excused). A known host-load timing flake in
  hooks/delegation-reminder.test.mjs, if it appears, is rerun alone before any verdict.
- Second host: the lead's runner on Windows from origin before accept.

## Territory map
L1: `skills/multi/scripts/transport.mjs` (mainCheckout only), `skills/multi/scripts/note-send.test.mjs`
(H6 only, plus one new test), `skills/multi/scripts/mirror-shim.test.mjs` (V4 only),
`scripts/mirror-shared-skills.mjs` only per R3. Off-limits: everything else, docs/work/.
Every prompt: never send peer notes, never set a git identity, no trailers, never push, test child
environments only through childEnv().
