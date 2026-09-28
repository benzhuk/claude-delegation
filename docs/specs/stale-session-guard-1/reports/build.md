DONE aeb7f762395b7b2f0c1eee06abee4891b6f3344c

## Files changed

- `scripts/plugin-staleness.mjs` (new) — the one shared helper, `checkStaleness()` and
  `staleSessionText()`.
- `scripts/plugin-staleness.test.mjs` (new) — 26 tests.
- `hooks/agent-dispatch-guard.mjs` — R0-stale wired into `decide()`.
- `hooks/agent-dispatch-guard.test.mjs` — 10 new R0-stale tests, plus one new import
  (`staleSessionText`).
- `scripts/wiring-check.mjs` — the stale-session line wired into `main()`.
- `scripts/wiring-check.test.mjs` — 10 new P7 tests (9 in-process + 1 real CLI subprocess).
- `docs/census.md` — one new "Counted markers" section naming the marker and rule id (P8).

No other file was touched. `hooks/hooks.json`, any `plugin.json`, the README and `docs/work/`
are all unchanged, as instructed.

## GOAL line served

"Change only what improves ... work lost or stalled" — this closes the class of defect the
lead's research named: a session running stale hooks silently lost the delete-guard's
protection for a builder's whole life. Nearest NOT: "a rule no script checks" — this is a
script-enforced refusal, not a brief sentence (the spec explicitly rules out a brief-sentence
fix).

## How each ruling was met

**P1** (running version from the script's own path, plugin root two dirs up, realpath match
exact): `scripts/plugin-staleness.mjs:74` `resolveRunning()`. Builds `candidateRoot` from the
raw `scriptPath` (`path.dirname(path.dirname(path.resolve(scriptPath)))`), then does the ONE
`fsImpl.realpathSync` call on that directory (never the leaf script file), then
`path.relative` against `<pluginsDir>/cache` and requires exactly 3 non-empty segments
(`marketplace`, `name`, `version`). Any other shape (too few/many segments, a `..`/absolute
relative, a non-existent directory, a non-string `scriptPath`) returns `null` → "not a cache
install" → pass, no line, before the manifest is ever opened. Guard side:
`hooks/agent-dispatch-guard.mjs:55` computes `GUARD_SCRIPT_PATH` via
`fileURLToPath(import.meta.url)` — the running script's OWN path, never `plugin.json`.
Wiring-check side: `scripts/wiring-check.mjs:63`, same pattern, `SELF_PATH`.
Tests: `plugin-staleness.test.mjs` "a non-cache script path (a repo checkout shape)", "too
shallow"/"too many segments", "candidate plugin root that does not exist on disk".

**P2** (`installed_plugins.json` under `<pluginsDir>` = `$CLAUDE_CONFIG_DIR/plugins` or
`<home>/.claude/plugins`; array per key; plain numeric `x.y.z` entries only are readable):
`scripts/plugin-staleness.mjs:60` `pluginsDirFor()` and `:95` `readInstalledVersions()`.
Tests: "CLAUDE_CONFIG_DIR is honoured over <home>/.claude when set", "an empty-string
CLAUDE_CONFIG_DIR falls back", "the key maps to a non-array value: pass", "every entry has a
non-numeric version ... pass", "a non-numeric version entry is skipped, but a numeric sibling
still proves staleness".

**P3** (STALE only if running is strictly older than EVERY readable entry; fail-open on
anything unreadable; synchronous, cheap, no network/child process): the comparison loop is
`scripts/plugin-staleness.mjs:141-156`; the whole function body is wrapped in one
`try {...} catch { return {stale:false, reason:'unexpected error, fail-open'} }` at `:125` and
`:169`. Only `fsImpl.realpathSync` (once) and `fsImpl.readFileSync` (once) are called — both
synchronous, no `statSync`, no directory listing. Tests cover: older-than-only-entry (stale),
equal (pass), newer (pass), older-than-one-but-equal-to-another (pass), manifest missing, bad
JSON, key missing, non-array value, non-numeric version, a throwing `realpathSync`, a throwing
`readFileSync` — all pass, all via `checkStaleness` never throwing (asserted directly in two
tests with `assert.doesNotThrow`).

**P4** (shared pure helper, exact signature/return shape, both call sites import it):
`scripts/plugin-staleness.mjs:124` `export function checkStaleness({ scriptPath, home, env,
fsImpl })` returns `{ stale, running, installed, key, reason }`; `installed` is the LOWEST
readable entry version and is only set when `stale` is true (verified by "older than two
entries: stale, installed is the LOWEST of the readable entries", installed 0.20.13 out of
[0.20.16, 0.20.13, 0.21.0]). Both `hooks/agent-dispatch-guard.mjs:46` and
`scripts/wiring-check.mjs:58` import it. `hooks/hooks.json` untouched; no new hook; no matcher
change.

**P5** (guard: after no-dispatch-guard skip, before R1; `(^|:)(builder|reviewer|runner|integrator)$`
case-insensitive; deny id `R0-stale`; NOT gated by `dispatch-guard-enforce`; `ws-off` does not
disable it; only off switch is `no-dispatch-guard`; existing log line records `R0-stale` like
any other rule): regex at `hooks/agent-dispatch-guard.mjs:89`; `checkR0Stale()` at `:477`;
wired into `decide()` at `:540` (right after the `no-dispatch-guard` skip return at `:537`,
before the R1 check at `:553`); the deny carries `hardDeny: true` (`:542`) while `enforced` is
explicitly `false` for that return (the enforce/observe split simply doesn't apply to this
rule); `runCli()`'s `denyWins` at `:651` is `result.action === 'deny' && (result.enforced ||
result.hardDeny)`, so it prints/exits deny whether or not `dispatch-guard-enforce` exists.
`appendLog()` (unchanged) logs `rules: result.rule` = `['R0-stale']` exactly like any other
rule — no special-case needed there. Tests (`hooks/agent-dispatch-guard.test.mjs`, section
"R0-stale"): builder/reviewer/RUNNER/Integrator/`team:builder` all deny; general-purpose and
no-subagent_type are NOT denied; `no-dispatch-guard` skips it (`skip:true`); `ws-off` present
does NOT stop the deny; `dispatch-guard-enforce` present changes nothing (still denies,
`hardDeny` stays true); not-stale falls through to R1 unchanged; a non-cache scriptPath falls
through to allow; SendMessage is never denied by R0.

**P6** (exact deny text, marker = first two words): `scripts/plugin-staleness.mjs:172`
`staleSessionText()` — built once, imported by both call sites, so the text can never drift.
Verified character-for-character against the spec's pinned string in
`plugin-staleness.test.mjs` ("staleSessionText matches the pinned P6 text exactly") and reused
directly (not re-typed) in the guard's own R0-stale test ("...with the exact P6 text").
`delegation` → key's name part: `key.split('@')[0]`, falling back to `'delegation'` when `key`
is missing/malformed (tested).

**P7** (wiring-check `--line`/`--hook` prints the same fact under the same marker; counts as
non-ok for the red exit; `--hook` stays exit 0; uses wiring-check's own script path; `ws-off`
silences it): `scripts/wiring-check.mjs:478` `staleness()` reads via `checkStaleness()` with
`scriptPath: opts.scriptPath ?? SELF_PATH`; `main()` computes it unconditionally (`:499`),
prints `staleSessionText(stale)` under `--line` only when `!wsOffActive(opts)` (`:508-515`,
same silencing gate the ordinary `printLine` already uses), and folds it into the exit code
at `:530`: `(result.ok && !stale.stale) ? 0 : 1`, with `--hook` still forcing `return 0`
(`:529`) unchanged. Tests (`scripts/wiring-check.test.mjs`, section "P7"): stale + everything
else `ok` still exits 1 under `--line`; `--hook` stays 0 while printing the line; not-stale
(equal, and newer) print nothing extra and stay green; `ws-off` silences the line but not the
exit; a non-cache scriptPath is not stale; no `scriptPath` override defaults to this repo's own
real file (never stale in this suite); a throwing `fsImpl.realpathSync` never crashes `main()`;
and one real CLI-subprocess test that copies `wiring-check.mjs` + `plugin-staleness.mjs` +
`required-wiring.default.json` into a fake `<home>/.claude/plugins/cache/...` directory and
runs the actual copied file with `execFileSync`, proving the CLI wrapper (not just an injected
`opts.scriptPath`) reads its own real on-disk location.

**P8** (one line in census.md naming the marker and rule id): `docs/census.md`, new "Counted
markers" section at the end of the file (there was no pre-existing markers section — P8
allows "or at its end if none" — grepped first for `guard|marker` across the whole file to
confirm none existed), naming `stale session:` and `R0-stale` and both call sites.

## Test names proving older / equal / newer / unreadable (efficacy list)

- older: "older than the only entry: stale, installed is that entry"; "older than two
  entries: stale, installed is the LOWEST of the readable entries"; guard:
  "R0-stale: a stale builder spawn denies with rule R0-stale and the exact P6 text..."
- equal: "equal to the only entry: pass"; guard: "R0-stale: NOT stale (running equal to the
  installed entry) falls through to the existing rules unchanged"
- newer: "newer than the only entry: pass"; wiring-check: "not stale (running newer than every
  entry) prints nothing extra and the exit stays green"
- unreadable: "manifest missing entirely: pass", "manifest is not parseable JSON: pass",
  "manifest has no entry for this key: pass", "the key maps to a non-array value: pass",
  "every entry has a non-numeric version (a prerelease tag): pass", "a running version segment
  that is not plain numeric x.y.z: pass", "a throwing fsImpl.realpathSync ... is fail-open,
  never throws", "a throwing fsImpl.readFileSync ... is fail-open, never throws"

## Gate results

Three touched test files (`node --test`): 214 tests, 214 pass, 0 fail, 0 skipped
(`scripts/plugin-staleness.test.mjs` 26, `hooks/agent-dispatch-guard.test.mjs` 119,
`scripts/wiring-check.test.mjs` 69).

Full suite (`node scripts/run-tests.mjs`), exit code 0: **2651 tests, 2646 pass, 0 fail, 5
skipped.** The suite's own sealed sub-run of `run-tests.mjs`'s tests spawns a nested,
deliberately-failing probe file (`tests 1, pass 0, fail 1` inside that sub-run's own reported
block, `run-tests-probe-*/probe.test.mjs`, test name `probe`) to prove `run-tests.mjs` reports
a real failure faithfully — exactly the one intentional failure named in my brief; it does not
propagate into the top-level totals above, which is why the top-level `fail` reads 0.

## Deviations / assumptions

1. **Return-shape addition to `decide()`**: added a `hardDeny: boolean` field to every branch
   of `decide()`'s return value (previously `{action, rule, text, skip, enforced,
   roundMention}`). This was necessary because P5 explicitly requires R0-stale's deny to print
   even when `dispatch-guard-enforce` is absent, but the existing `runCli()` only ever printed
   a deny when `result.enforced` was true. I judged a new explicit field clearer and safer
   than overloading `enforced: true` for a case where the enforce file genuinely isn't
   present (which would have made the logged `enforced` field lie about the switch state).
2. **P7's exit-code scope**: the spec's sentence about the red exit appears in the paragraph
   describing `--line`, but I made the staleness check (and its effect on the exit code)
   unconditional — computed and folded into the exit code regardless of `--line`/`--json`/
   table/no-flag, matching this file's own existing precedent (the J2 comment: "checkWiring()
   itself never changes shape... only this return value differs"; ordinary findings already
   affect the exit code independent of which flag was used to view them). Only the printed
   LINE TEXT stays scoped to `--line` (and `--hook`), exactly as P7 states. If the lead intended
   the exit-code effect to be scoped to `--line` only, that's a one-line change
   (`result.ok ? 0 : 1` vs `(result.ok && !stale.stale) ? 0 : 1`, moved inside the `--line`
   branch) — flagging it since the spec's wording is ambiguous between the two readings.
3. **`checkWiring()`'s own pure contract is untouched** — I deliberately did NOT add
   staleness as a new check type inside `checkWiring()`'s declarative list machinery (no new
   `plugin_staleness` check type, no entry in `required-wiring.default.json`). P7 frames this
   as a `--line`/`--hook` (CLI-layer) behavior, matching how `wsOffActive()` already sits
   outside `checkWiring()`'s pure list-based contract; changing `checkWiring()`'s own
   documented return shape felt like a much larger, unpinned risk to its many existing callers
   and tests.
4. Did not attempt the "Live proof" paragraph under Efficacy in spec.md — the packet and spec
   both frame that as the lead's job "after review", not the builder's gate.

No stray files were left by this work (the pre-existing `.bak-noparking` file and untracked
`docs/notes/`/`docs/ledger/` entries visible in `git status` at session start predate this
branch's work and are outside my territory).

## Commit

Committed as a single conventional commit on `build/stale-session-guard-1`; sha recorded
below, then pushed to `origin/build/stale-session-guard-1`.
