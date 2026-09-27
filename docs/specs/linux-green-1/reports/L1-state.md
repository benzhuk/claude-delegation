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
Nothing outstanding for this territory. Reviewer's adversarial pass on `mainCheckout` (esp. UNC) is
next per the brief — not mine to do.

## Open questions
None — brief's two "if X, stop and say so" branches did not trigger (mirror-shared-skills.mjs did not
need touching).

## How to run my gate
```
node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/mirror-shim.test.mjs && \
  node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs
```
Run from `/home/ben/Code/wt-linux-green-1-L1`. All green as of this state file's last edit.
