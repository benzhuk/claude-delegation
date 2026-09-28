DONE a960c366d34ece5ee1044f866f873701c4c5fc08

# Lane 42, stale-session guard: fix round 1

Fix round on top of the prior builder's aeb7f76, applying review-r1.md's findings exactly as
the lead ruled them in lead-ruling-r1.md. Base for this round: 4341806 (docs-only above
aeb7f76). Branch build/stale-session-guard-1.

## MAJOR 1 — the CLI "refuse, not observe" gate was untested

Fix location: hooks/agent-dispatch-guard.mjs:652 `denyWins`, unchanged code — the finding was
a missing test, not a code defect. Added the reviewer's test verbatim at the end of
hooks/agent-dispatch-guard.test.mjs (new section "R0-stale CLI-subprocess proof"), plus one
extra assertion for MINOR 3 (`hard_deny`). Test name: `'R0-stale CLI: a stale cache copy
prints permissionDecision deny WITHOUT the enforce file, and logs R0-stale'`.

**Revert check, as instructed**: temporarily changed hooks/agent-dispatch-guard.mjs:652 from
`const denyWins = result.action === 'deny' && (result.enforced || result.hardDeny);` to the
pre-lane `const denyWins = result.enforced && result.action === 'deny';`, then ran
`node --test hooks/agent-dispatch-guard.test.mjs`:

```
✖ R0-stale CLI: a stale cache copy prints permissionDecision deny WITHOUT the enforce file, and logs R0-stale (41.477955ms)
ℹ tests 120
ℹ pass 119
ℹ fail 1
  SyntaxError: Unexpected end of JSON input
      at JSON.parse (<anonymous>)
      at TestContext.<anonymous> (.../hooks/agent-dispatch-guard.test.mjs:1397:20)
```
(The mutant's guard copy prints nothing on stdout because `denyWins` no longer fires without
the enforce file, so `res.stdout.trim()` is empty and `JSON.parse('')` throws — the test
fails, discriminating exactly as the review predicted, with every other test unaffected:
119 pass, 0 other fail.) Restored the line to
`result.action === 'deny' && (result.enforced || result.hardDeny)` immediately after, and
reran: 120/120 pass, 0 fail.

## MINOR 2 — a symlinked HOME silently disabled R0 and the SessionStart line

Fix (mechanical, exactly as patched) at scripts/plugin-staleness.mjs:83-84:
```js
let cacheDir = path.resolve(pluginsDir, 'cache');
try { cacheDir = fsImpl.realpathSync(cacheDir); } catch { /* keep the unresolved path; fail-open is preserved */ }
const rel = path.relative(cacheDir, pluginRoot);
```
Test added in scripts/plugin-staleness.test.mjs, right after the P1/P3 fail-open block:
`'a symlinked HOME still resolves the cache dir (review-r1.md MINOR 2): the cache dir itself
is realpath'd too'` — a real scratch dir plus `fs.symlinkSync(real, link, ... 'dir')`, running
the check with `home: link` and a scriptPath built under the real dir, asserting `stale: true`.

Discrimination checked the same way as MAJOR 1 (not required by the brief for MINORs, but
done anyway since it was cheap): reverted the two-line patch back to the bare
`const cacheDir = path.resolve(pluginsDir, 'cache');`, reran
`node --test scripts/plugin-staleness.test.mjs` — the new test failed
(`AssertionError: false !== true`, 26 pass / 1 fail), then restored the patch —
27/27 pass.

## MINOR 3 — the log said `enforced: false` for a deny that actually refused

Fix (mechanical, as patched) at hooks/agent-dispatch-guard.mjs, right before `appendLog`:
```js
if (result.roundMention) entry.round_mention = true;
if (result.hardDeny) entry.hard_deny = true;
appendLog(home, fsImpl, entry);
```
Proved by the MAJOR 1 CLI test's added assertion:
`assert.equal(lastLogLine(home).hard_deny, true, ...)`.

## MINOR 4 — a red exit had no printed reason in --json or table modes

Fix (mechanical, as patched) at scripts/wiring-check.mjs's `main()`: `--json` now also writes
`staleSessionText(stale)` to `process.stderr` when stale (stdout's JSON is untouched), and the
table branch (no flag) now also prints the line via `console.log` when stale, alongside the
existing `printTable`.

Four new tests in scripts/wiring-check.test.mjs (new helper `runMainCapturingBoth` that
captures both `console.log` and `process.stderr.write`):
- `'MINOR 4: --json keeps stdout exactly parseable and puts the stale reason on stderr'` —
  asserts `JSON.parse(out)` succeeds and equals `checkWiring()`'s own `{ok:true}`, and the
  stderr text matches the P6 marker.
- `'MINOR 4: --json prints nothing extra to stderr and stays green when not stale'`.
- `'MINOR 4: table mode (no flag) prints the stale line too, and goes red'` — asserts both the
  ordinary `wiring check:` table header and the stale line are present.
- `'MINOR 4: table mode prints nothing extra and stays green when not stale'`.

## NIT 5 — the census section split off the Codex paragraph and was a 6-line bullet

Fix at docs/census.md: moved the `## Counted markers` heading to after the Codex paragraph
(now the true end of the file, per P8's "or at its end if none"), and shortened it to the
one-line form the review suggested, including the `hard_deny` mention:
`` - `stale session:`: the stale-session guard's marker; the guard logs it as rule `R0-stale`
(with `hard_deny: true`); wiring-check `--line` prints the same text. ``

## Deviations accepted (stand as ruled)

Deviations 1 and 2 from the round-1 build report stand unchanged, per the lead ruling. No new
deviations were introduced in this round; every ruling above was applied exactly as the
reviewer wrote or patched it, with no additional judgment calls.

## Gate

Three touched test files, `node --test scripts/plugin-staleness.test.mjs
hooks/agent-dispatch-guard.test.mjs scripts/wiring-check.test.mjs`:
**220 tests, 220 pass, 0 fail, 0 skipped** (26 → 27 in plugin-staleness.test.mjs, 119 → 120 in
agent-dispatch-guard.test.mjs, 69 → 73 in wiring-check.test.mjs; net +6 new tests over the
prior round's 214).

Full suite, `node scripts/run-tests.mjs`, exit 0: **2657 tests, 2652 pass, 0 fail, 5 skipped**
(2651 → 2657, 2646 → 2652, exactly +6 over the prior round's totals, matching the six new
tests above). The nested, deliberately-failing probe file
(`run-tests-probe-*/probe.test.mjs`, test name `probe`) still fails inside its own sealed
sub-run's reported block (confirmed in the log: `✖ probe` under
`run-tests-probe-rZcjmE/probe.test.mjs:3:1`) and does not propagate into these top-level
totals — the one intentional failure named in the brief.

## Stray files

None created inside the git-tracked worktree (`git status --short` shows only the seven
territory files, all modified, nothing untracked). Outside the repo, in scratch space, one
file was left that does not follow the mandated `mktemp -d ... -XXXX` convention:
`/tmp/claude-1000/-home-ben-Code-claude-delegation/f6c8ae21-4813-4cbb-aeb5-9dd45b8ad01e/scratchpad/lane-42/mut-bak-plugin-staleness.mjs`
(an unused `cp` of plugin-staleness.mjs I made before realizing I could do the MAJOR-1-style
revert check with in-place Edit/restore instead, and then never used). Also left, from the
run: `.../scratchpad/lane-42/mut-G0KQ/` (an empty dir from one `mktemp -d` call) and
`.../scratchpad/lane-42/run-tests-r1.log` (the full-suite gate log, kept for the totals quoted
above). None of these are inside the repository; I did not delete any of them per the hard
rule against deletion.

## Commit / push

Single conventional commit `a960c366d34ece5ee1044f866f873701c4c5fc08` on
`build/stale-session-guard-1`, pushed to `origin/build/stale-session-guard-1`
(`4341806..a960c36`). No `-c user.*`, `--author`, `GIT_AUTHOR_*`/`GIT_COMMITTER_*`,
`--no-verify`, and no commit trailers were used.
