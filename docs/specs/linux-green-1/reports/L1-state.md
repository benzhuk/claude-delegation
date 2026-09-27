# L1 state

## Territory
`skills/multi/scripts/transport.mjs` (`mainCheckout` only), `skills/multi/scripts/note-send.test.mjs`
(H6 only, plus one new test), `skills/multi/scripts/mirror-shim.test.mjs` (V4 only). No touch to
`scripts/mirror-shared-skills.mjs` (not needed — see below).

## Contracts I rely on
- contracts.md R2 (`mainCheckout`: `path.posix` compose when `start` is POSIX-absolute or
  drive-lettered, `path.resolve` only for relative `start`, guard the UNC `//` landmine).
- contracts.md R3 (V4 test-only fix; platform-branch-in-the-test path taken, since
  `mirror-shared-skills.mjs` exposes no force-copy-mode flag — scout confirmed).
- contracts.md R4 (gate command, exactly as given, `transport.test.mjs` dropped — doesn't exist).

## Done
- `mainCheckout` fixed: composes with `path.posix.normalize` for POSIX/drive-lettered `start`,
  string-concats (no `path.posix.*` call) for a UNC `start` to avoid collapsing its leading `//`,
  keeps `path.resolve` only for a genuinely relative `start`. Manually verified UNC, drive-lettered,
  POSIX-absolute and relative `start` all resolve correctly (see report).
- Added one new H6 test (drive-lettered start already forward-slashed, runner returns bare `.git`) —
  isolates the composition fix from backslash normalisation, same expected string as the existing
  drive-lettered/`.git` test. No platform branch in the test.
- V4 fixed test-only: on Linux/macOS (symlink mode) the `.test.mjs`-absence check is replaced with an
  assertion that every top-level skill entry under `~/.agents/skills` (excluding
  `.mirror-manifest.json` and `_docs`, both real by design) is a symlink resolving into the repo root,
  plus a positive control that the recursive walk still finds real repo content (`transport.mjs`)
  through the symlink. Windows branch (copy mode) is untouched.
- All three gate commands green (note-send.test.mjs, mirror-shim.test.mjs, hooks.test.mjs N2 pattern).

## Next
Round 3 (this session) applied review-2's verified finding: the UNC-composed branch at ffc882f skipped
normalisation entirely, so a `..`-relative git-common-dir from a subdirectory (e.g. `../../.git`) left a
non-canonical `//host/share/repo/a/b/../..` instead of collapsing to `//host/share/repo` (major, also a
minor: an already-absolute common dir was used as-is without normalising, contract R2 gap). Applied the
reviewer's exact 3-line-shaped patch verbatim: one `normalise()` helper (puts the UNC `//` back after
`path.posix.normalize`, which would otherwise collapse it to `/`) used for both the already-absolute
branch and the start-composed branch. Verified against the reviewer's own measured table
(`//host/share/repo/a/b` + `../../.git` -> `//host/share/repo`; `C:/wt` + `C:/repo/x/../.git` ->
`C:/repo`). Full gate re-run green: note-send.test.mjs + mirror-shim.test.mjs 137/137, hooks.test.mjs N2
1/1. Diff scope re-checked: only `transport.mjs` changed this round, only inside `mainCheckout`.
Did NOT add the reviewer's suggested second H6 test (UNC-from-subdirectory) — the reviewer flagged that
test as needing the lead's permission since the brief caps this territory at exactly one new H6 test,
and no such permission was given to this round's task. Flagged as an open question below.

## Open questions
Should the reviewer's proposed second H6 test ("H6: a UNC checkout run from a subdirectory keeps its
leading // and is normalised (L1)") be added? It is the only coverage the UNC composition branch would
have (today's tests only exercise a bare `.git` directly under the share/drive, never a `..`-relative
common dir). Not added this round because the brief pins "exactly one new H6 test" and this task's
instructions did not grant the exception the reviewer asked the lead to consider.

## How to run my gate
```
node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/mirror-shim.test.mjs && \
  node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs
```
Run from `/home/ben/Code/wt-linux-green-1-L1`. All green as of this state file's last edit.
