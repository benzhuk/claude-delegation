VERDICT: NEEDS_FIXES (2) ffc882f802e2d590a5e52df416070fe6d86a5568

NEEDS_FIXES

# L1 review, round 2 (reviewed at ffc882f802e2d590a5e52df416070fe6d86a5568)

Scope: `4c29a2b..ffc882f` in `/home/ben/Code/wt-linux-green-1-L1`, checked against briefs/L1.md, the
reviewer brief's nine attack points, contracts R2/R3 and the lead's stall note. HEAD is `ffc882f`,
which I read with `git rev-parse HEAD`. The working tree is clean (`git status --short` shows 0 lines),
and no leftover scratch worktree appears in `git worktree list`.

Summary: the V4 half is sound. The `mainCheckout` fix removes the Linux cause. However, its UNC branch
skips normalisation. On Windows that is a regression from base for a UNC `start` inside a
subdirectory, and it breaks contract R2's "normalised" requirement. I found 1 major and 1 minor, and one
3-line patch fixes both.

## Bug-fix fields (mainCheckout half)

Cause: base `transport.mjs:434` composed a relative git common dir with the OS-native `path.resolve(start, c)`. On Linux, `path.resolve` treats a drive-lettered `C:/...` start as relative, so it prefixes the process cwd and returns `<cwd>/C:/Users/benzh/Code/Zhuk Projects`.
Discriminating check: I put base `transport.mjs` into a scratch copy of ffc882f and ran `note-send.test.mjs`. Both `H6: a plain checkout ... (L1)` and the new `H6: a drive-lettered checkout composes a bare .git ...` failed with actual `<scratch>/C:/Users/benzh/Code/Zhuk Projects`. With ffc882f's `transport.mjs` restored, the file passes. The fix is what turns them green.
Fix location: `skills/multi/scripts/transport.mjs:435-451` (inside `mainCheckout` only). The composition line (`transport.mjs:447`) needs the patch in finding 1.
Simplification: one UNC-safe `normalise()` helper, used for both the already-absolute and the composed-onto-start branch, replaces the UNC special-case string concatenation and the redundant `toPosix(path.posix.normalize(...))` wrapper. `path.posix.normalize` never emits a backslash. This also closes contract R2's "used as-is, normalised" requirement for an absolute common dir, and the function ends up shorter.

Cause or compensation: this fixes the **cause**. The cwd-prefixing `path.resolve` no longer runs for any absolute `start` (POSIX, drive-lettered or UNC). No guard hides the symptom. Finding 1 is a gap left inside the new UNC branch, not a compensation.

## Findings

### 1. MAJOR: the UNC-start branch does not normalise, a Windows regression from base and a contract R2 gap

`skills/multi/scripts/transport.mjs:447`:
```js
      c = isUNC(start) ? `${base}/${c}` : toPosix(path.posix.normalize(`${base}/${c}`));
```
The UNC branch avoids the `//` collapse by skipping normalisation completely. Git returns a
`..`-relative common dir when run from a subdirectory. I measured this on git 2.47.3 in a scratch repo:
from `a/b`, `git rev-parse --git-common-dir` prints `../../.git`. Callers pass `process.cwd()`
(`note-send.mjs:372,395,411,420`), and cwd can be such a subdirectory. Measured with the live import
of ffc882f:

| start | runner returns | ffc882f returns | base on Windows (`path.win32.resolve`) |
|---|---|---|---|
| `//host/share/repo/a/b` | `../../.git` | `//host/share/repo/a/b/../..` | `//host/share/repo` |
| `C:/repo/a/b` | `../../.git` | `C:/repo` | `C:/repo` |
| `/home/r/a/b` | `../../.git` | `/home/r` | `/home/r` |

So on Windows the base code returned the canonical `//host/share/repo`, and ffc882f returns a
non-canonical string. It is not normalised (contract R2), and the `senderRepo !== targetRepo` string
comparison at `note-send.mjs:477` now treats the same repo as two different repos. This is attack point 2's
branch. The builder's self-attack only tried `.git` directly under the share, so no case reached the
`..` gap, and no test covers the UNC branch at all.

Patch (exact old to exact new), `transport.mjs:435-451`. It also fixes finding 2:

Old:
```js
  const isDriveLettered = (p) => /^[A-Za-z]:/.test(p);
  const isUNC = (p) => /^\/\/[^/]/.test(p);
  const cIsAbsolute = path.posix.isAbsolute(c) || isDriveLettered(c);

  if (!cIsAbsolute) {
    if (path.posix.isAbsolute(start) || isDriveLettered(start)) {
      // Compose onto `start`'s own string, never the process cwd (H6's bug: on Linux,
      // `path.resolve` does not recognise a POSIX-relative-looking drive-lettered or UNC
      // `start` as absolute, so it silently prefixes cwd). UNC's leading `//` must never
      // pass through `path.posix.normalize`/`join`/`resolve` — they collapse it to a
      // single `/` — so a UNC `start` is joined by hand, string-only, no such call.
      const base = start.replace(/\/+$/, '');
      c = isUNC(start) ? `${base}/${c}` : toPosix(path.posix.normalize(`${base}/${c}`));
    } else {
      c = toPosix(path.resolve(start, c)); // a genuinely relative `start`: cwd-relative is correct
    }
  }
```
New:
```js
  const isDriveLettered = (p) => /^[A-Za-z]:/.test(p);
  const isUNC = (p) => /^\/\/[^/]/.test(p);
  // path.posix.normalize collapses a UNC `//host` to `/host` (the scout's landmine): put the slash back.
  const normalise = (p) => (isUNC(p) ? '/' : '') + path.posix.normalize(p);

  if (path.posix.isAbsolute(c) || isDriveLettered(c)) {
    c = normalise(c); // already absolute (POSIX, drive-lettered or UNC): used as-is, normalised
  } else if (path.posix.isAbsolute(start) || isDriveLettered(start)) {
    // Compose onto `start`'s own string, never the process cwd (H6: on Linux `path.resolve`
    // does not see a drive-lettered or UNC `start` as absolute and silently prefixes cwd).
    c = normalise(`${start.replace(/\/+$/, '')}/${c}`);
  } else {
    c = toPosix(path.resolve(start, c)); // a genuinely relative `start`: cwd-relative is correct
  }
```
Predicted outcome, verified: I applied this patch to a scratch copy (`git archive HEAD`, outside the
reviewed tree) and ran 19 attack cases. `//host/share/repo/a/b` + `../../.git` gives `//host/share/repo`.
Every other case matches ffc882f's output, including UNC `start` with and without backslashes and a
trailing slash, UNC common dir from a drive start, POSIX and drive trailing `.git/`, and relative
`start`. `note-send.test.mjs` passes (115/115), all three H6 tests included. The patch has no
platform branch and needs no new import.

Regression test: the brief caps L1 at exactly one new H6 test, so this needs the lead's permission. The
lead should decide whether to allow a second one. If allowed, verbatim, next to the new H6 test:
```js
test('H6: a UNC checkout run from a subdirectory keeps its leading // and is normalised (L1)', () => {
  assert.equal(mainCheckout('\\\\host\\share\\repo\\a\\b', () => '../../.git\n'), '//host/share/repo');
});
```
This test has no platform branch. It fails at ffc882f on both platforms (it returns `//host/share/repo/a/b/../..`) and passes with the patch. It is the only coverage the UNC branch would have.

### 2. MINOR: an already-absolute common dir is used as-is but not normalised (contract R2)

`transport.mjs:437-439`: when `c` is absolute, the fix skips normalisation (pre-existing behaviour).
Measured: `mainCheckout('C:/wt', () => 'C:/repo/x/../.git')` returns `C:/repo/x/..`. Contract R2 says
"used as-is, normalised, trailing slash removed". Git normally emits canonical absolute paths, so the
risk is low. The finding 1 patch fixes this (`c = normalise(c)`), and I measured `C:/repo` with it.
Nothing extra to apply.

## The nine attack points

1. **Relative `start`**: still `toPosix(path.resolve(start, c))` (`transport.mjs:449`). Measured `some/rel` + `.git` gives `<cwd>/some/rel`, and `some/rel/a` + `../.git` gives `<cwd>/some/rel`. Unchanged.
2. **UNC `start`**: the `//` prefix survives (`//host/share/repo`, and the same from `\\host\share\repo`). The landmine is avoided by skipping normalisation, not by guarding it, which caused finding 1. `node -e "...posix.normalize('//host/share/foo/')"` prints `/host/share/foo/` on this host, as the scout said.
3. **Already-absolute common dir** (POSIX `/home/r/.git`, drive `C:/repo/.git/`, UNC `//host/share/repo/.git/`): each is used as-is and never composed onto `start`, and no `path.resolve` runs. It is not normalised (finding 2).
4. **Trailing slash**: stripped on the drive (`C:/repo/`), UNC (`//host/share/repo/`), absolute `.git/` and relative-resolve branches. Measured all four.
5. **V4 positive control**: present on the new symlink branch (`mirror-shim.test.mjs:309` `topEntries.length > 0`, and `:325-327` recursive walk must find `multi/scripts/transport.mjs`). Two mutations on a scratch copy of `mirror-shared-skills.mjs`:
   - (a) forcing `MODE = 'copy'` on Linux fails with "…/skills/bearings is a real directory, not a symlink".
   - (b) turning `publishSymlink` into a no-op fails with "the skill publish created no entries under ~/.agents/skills".
   The Windows branch (`:292-300`) is byte-identical to the base assertions. Path taken: the R3 platform branch in the test, and `mirror-shared-skills.mjs` is untouched. That is right, because the scout confirmed there is no force-copy flag.
6. **H6 worktree case**: `note-send.test.mjs:363-365` is unedited (the diff only adds lines after :368). It still expects `'C:/Users/benzh/Code/bto_nucleus'` and passes.
7. **New H6 test** (`note-send.test.mjs:371-376`): has no platform branch. It uses a drive-lettered `start` and a bare `.git\n` runner, and fails at base (measured above). It overlaps the :367 test except for backslashes, but the brief pinned exactly that shape, so it is acceptable.
8. **Diff scope**: `git diff --stat 4c29a2b..HEAD` shows only `mirror-shim.test.mjs` (+37/-7), `note-send.test.mjs` (+7), and `transport.mjs` (+18/-1, all inside `mainCheckout`). Nothing is outside the map.
9. **N2**: `node --test --test-name-pattern=N2 skills/multi/scripts/hooks.test.mjs` gives tests 1, pass 1, fail 0. The diff adds no environment spreading.

My own runs at ffc882f: `node --test skills/multi/scripts/note-send.test.mjs skills/multi/scripts/mirror-shim.test.mjs` gives tests 137, pass 137, fail 0.

## Observations (not counted)

- The gate command in the brief redirects only the second command, so `L1-gate.log` holds only the N2 run (9 lines). The 137/137 result is not in the log. I re-ran it myself (above). Fix the brief's gate so both commands' output reaches the log, for example by wrapping the pair in `{ ...; }`.
- The builder report's line 1 is `VERDICT: PASS`. That is outside the APPROVE/NEEDS_FIXES vocabulary the brief uses.
- Outside L1's map: `note-send.mjs:453` `path.posix.join(toPosix(targetRepo), 'docs/ledger')` collapses any UNC `targetRepo` to `/host/share/...` (measured). So UNC ledgers were already written to the wrong place before this build. This is a candidate for a later lane, not for L1.
- The Windows behaviour change for a POSIX-rooted `start` (`/foo`, formerly resolved against the current drive) is exactly what contract R2 prescribes. Not a finding.
