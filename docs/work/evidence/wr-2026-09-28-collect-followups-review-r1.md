VERDICT: NEEDS_FIXES 6cd4ec2

# Lane 33 (collect-followups-1), review round 1

Scope: `git diff 573f04e..6cd4ec2` on build/collect-followups-1. I checked it against docs/specs/collect-followups-1/spec.md and reports/build.md. The worktree was read-only for me. Every experiment ran on `git archive` exports of 573f04e and 6cd4ec2 in scratch `rv33-4PqP`.

Gate: `node --test scripts/install-janitor-timer.test.mjs scripts/collect-from-origin.test.mjs scripts/collect-status.test.mjs skills/multi/scripts/hooks.test.mjs` gave 140 pass, 0 fail. Two extra files that consume the collector, `record-closed-and-skip.contract.test.mjs` and `continue-skill-lane-state.test.mjs`, gave 9 pass, 0 fail.

The production code is correct as far as I can see. The fixes needed are two Major test gaps, both from the named bug class ("a check that passes because it isn't looking"), two Minor contract items and one doc overclaim.

Cause: two bugs. First, a reinstall regenerated the collect unit without `--stale-hours`, which undid lane 30's hand edit. Second, `computeState` folded `Status: closed` into `owned`, so a separate guard in collect-status had to stop closed rows being flagged.
Discriminating check: I ran 14 mutants on scratch copies (table below). 4 of the installer threading mutants survive, and so do 2 of the `closed` grep-test mutants. The verified test patches in F1 and F2 kill all 6.
Fix location: scripts/install-janitor-timer.test.mjs (new main-level test) and scripts/collect-status.test.mjs:201-211 (grep test). Minor items are at scripts/install-janitor-timer.mjs:575-577 and docs/specs/collect-status-1/contracts.md:18.
Simplification: none needed in production code. `scheduledCommandArgv` is already the single place the flag is added. `computeState` is already the single place state is decided, and the lane 30 guard is gone.

## Mutation table (scratch copies of 6cd4ec2, three test files)

| # | Mutation | Result |
|---|---|---|
| M1 | drop `"closed"` from NOTE_STATE_TOKENS (collect-status.mjs:46) | **SURVIVES** (0 fail) |
| M2 | add `if (r.status === "closed") continue; // NOTE_STATE_TOKENS` in computeAttention | **SURVIVES** (0 fail) |
| M3 | revert `computeState` closed line | killed (2 fail: computeState, stall-nudge) |
| M4 | main's `systemdServiceUnit(...)` call drops `staleHours` (install-janitor-timer.mjs:777) | **SURVIVES** |
| M5 | main's `windowsTaskXml(...)` call drops `staleHours` (:790) | **SURVIVES** |
| M6 | main's `launchdPlist(...)` call drops `staleHours` (:798) | **SURVIVES** |
| M7 | main's `installedJsonText(...)` hardcodes `staleHours: 2` (:922) | **SURVIVES** |
| M8 | drop the installer's `/^\d{1,2}(\.\d+)?$/` guard | killed (bounds test, via 0x10) |
| M9 | collect-status lower bound `>= 0.1` changed to `>= 0` | killed (2) |
| M10 | collect-status bad value returns 0, not 2 | killed (1) |
| M11 | legend text reverted | killed (1) |
| M12 | `--stale-hours` pushed before `--host`/`--out` | killed (3) |
| M13 | janitor branch also pushes `--stale-hours` | killed (3, incl. janitor byte test) |
| M14 | installed.json key order `scheduler, staleHours` | killed (1) |

## Findings

### F1: Major. A `--stale-hours` value given to the installer is never checked in the file the installer writes

Evidence: scripts/install-janitor-timer.test.mjs:869-899, the bounds test, asserts `JSON.parse(cap.text()).staleHours` (lines 878 and 899). That field is `result.staleHours` (install-janitor-timer.mjs:759), which is the parsed flag and not the generated unit. The three-generator tests at :840-860 call the generator functions directly. So nothing checks that `main` actually passes the value on.

M4 through M7 survive, each dropping the value on one path: systemd, Windows XML, launchd, or installed.json. In each case a user's `--stale-hours 0.5` becomes 2 in the written unit while the JSON output still reports 0.5. Fix 1 exists to stop exactly this kind of silent revert, and today nothing guards it.

Today's code is correct. I ran `main` with `--stale-hours 0.5` on linux, win32 and darwin, and all three wrote the value into both the command and installed.json.

Fix: append this test to scripts/install-janitor-timer.test.mjs, after the bounds test that ends at :900. I verified it in scratch: it passes on 6cd4ec2, kills M4, M5, M6 and M7, and the file then runs 51 of 51.

```js
test("C2: --stale-hours 0.5 given to main reaches every platform's written command and installed.json (lane 33 F1)", () => {
  const want = { linux: "--stale-hours 0.5", win32: "&quot;--stale-hours&quot; &quot;0.5&quot;", darwin: "'--stale-hours' '0.5'" };
  for (const platform of ["linux", "win32", "darwin"]) {
    const home = mkTmp(`janitor-timer-home-stale-${platform}-`);
    fixtureDefaultRepoGit(home);
    const cap = capture();
    const code = main(["--force-root", "--json", "--dry-run", "--job", "collect-status", "--to", "x", "--stale-hours", "0.5"], { home, env: { XDG_CONFIG_HOME: path.join(home, ".config") }, platform, execPath: "/usr/bin/node", pluginRoot: fixturePluginRoot(), ...cap });
    assert.equal(code, 0, cap.text());
    const files = JSON.parse(cap.text()).files;
    const cmdFile = files.find((f) => /\.(service|task\.xml|plist)$/.test(f.path));
    assert.ok(cmdFile && cmdFile.content.includes(want[platform]), `${platform}: ${cmdFile && cmdFile.content}`);
    const inst = files.find((f) => f.path.endsWith("installed.json"));
    assert.equal(JSON.parse(inst.content).staleHours, 0.5, platform);
  }
});
```

### F2: Major. The `closed` grep test passes without finding anything, and a trailing comment gets past it

Evidence: scripts/collect-status.test.mjs:201-211. The test only asserts that each hit it finds contains `NOTE_STATE_TOKENS` or the legend text. It never asserts that the two expected hits exist, or that there are no others.

- M1: removing `"closed"` from NOTE_STATE_TOKENS (collect-status.mjs:46) makes the RESULT text say `other=N` instead of `closed=N`. That is the thing the spec's K2 change exists to prevent, and no test fails.
- M2: a line that brings the lane 30 guard back with a trailing `// NOTE_STATE_TOKENS` comment passes the grep test.

The `computeAttention` closed test at :196-199 does not discriminate either. It passes on 573f04e too, because a row whose state is already `closed` was never `owned`. The real proof is the stall-nudge fixture, which M3 kills.

Fix: replace this exact block at collect-status.test.mjs:204-210:

```js
  const hits = codeLines.filter((line) => line.includes("closed"));
  for (const line of hits) {
    assert.ok(
      line.includes("NOTE_STATE_TOKENS") || line.includes("its own terminal lane"),
      `unexpected "closed" reference outside NOTE_STATE_TOKENS/the legend: ${line}`,
    );
  }
```

with:

```js
  const hits = codeLines.filter((line) => line.includes("closed"));
  assert.equal(hits.length, 2, `expected exactly the NOTE_STATE_TOKENS and legend lines, got:\n${hits.join("\n")}`);
  assert.ok(hits.some((line) => /^const NOTE_STATE_TOKENS = new Set\(\[.*"closed".*\]\);$/.test(line)), "NOTE_STATE_TOKENS carries \"closed\"");
  assert.ok(hits.some((line) => line.includes("closed is its own terminal lane")), "the legend names closed");
```

I verified it in scratch: it passes on 6cd4ec2 and fails on M1 and on M2.

### F3: Minor, needs the lead's decision. The installer refuses a bad value with exit 1, but the spec pins exit 2

Evidence: spec Acceptance says "`--stale-hours 0` and `99` are refused (exit 2) by the installer and by collect-status parseArgs". The installer returns 1 at install-janitor-timer.mjs:735-738, and the test at :869 pins exit 1. The build report flags this deviation itself: the installer uses 1 for every bound refusal and 2 for usage errors.

Fix: the lead must choose, and the record must say which.
- Recommended: keep exit 1, which matches the `--hour` and `--every` refusals, and write the amendment in the work record and a one-line note under the spec's Acceptance.
- Otherwise: special-case exit 2 for `--stale-hours` refusals only, and change :869's `assert.equal(code, 1, ...)` to 2.

### F4: Minor. `--stale-hours` is accepted and silently ignored for `--job janitor-record`

Evidence: `--dry-run --json --stale-hours 3` with the default job returns 0 with no refusals (measured). `--every` (:575-577), `--to` (:619-621) and `--out` (:642-644) are each refused for the job that does not use them. The usage line (:470) says "collect-status only", and K3 says "Every cross refusal and bound in the spec applies". The builder raised this as an open point.

Fix: insert this after install-janitor-timer.mjs:577, the closing `}` of the `--every` janitor refusal:

```js
  if (job === "janitor-record" && argv.includes("--stale-hours")) {
    refusals.push("--stale-hours is refused for --job janitor-record; it only applies to --job collect-status");
  }
```

Predicted outcome, verified in scratch: the installer test file still runs 51 of 51. The janitor job with `--stale-hours 3` then exits 1 with that single refusal. Janitor bytes are unaffected, because the refusal happens before any generation. Add one assertion for it to the bounds test.

### F5: Minor (doc). K3 claims more than the code does

Evidence: docs/specs/collect-status-1/contracts.md:18 says the value is "carried into every reinstall from then on". It is carried only when each reinstall passes the flag again.

The installer never reads back `staleHours` from `~/.agents/collect/installed.json` or from the existing unit. So a unit installed with `--stale-hours 4` becomes `--stale-hours 2` on a later flagless reinstall. I measured this: an install with 3 over one with 2 gives 3, and the reverse direction follows from the default. `--every` behaves the same way, so the code is consistent. For the one live value, 2, the claim holds.

Fix, mechanical: in contracts.md:18, replace
`— carried into every reinstall from then on, so a hand-edited live unit (lane 30's \`--stale-hours 2\`) is never silently reverted to the collector's own bare default (6h) by a later install.`
with
`— so a reinstall always writes an explicit threshold (the given value, else 2) and never silently falls back to the collector's own bare default (6h), as lane 30's hand-edited \`--stale-hours 2\` would have; a non-default value must be passed again on each reinstall (installed.json's \`staleHours\` records it but is not read back).`

### F6: Nit, no change required. The two parsers accept different spellings

collect-status `parseArgs` (collect-status.mjs:65-75) uses bare `Number()`. It accepts `1e1`, `0x2`, `" 2"`, `2.` and `.5`, all of which the installer refuses.

If the flag is repeated, the last value wins, but an error from an earlier bad value stays set. So `99` then `2` is refused, and `2` then `99` is refused too. That fails closed, which is acceptable.

The range is the same in both parsers. The installer always emits `String(n)` of a regex-checked decimal from 0.1 to 48, which never prints in exponent or hex form. So a scheduled run can never reach these cases.

## Verified absences (first-class findings)

- **Janitor bytes are byte-identical to 573f04e.**
  - Method: I generated from both trees `scheduledCommandArgv`, `systemdServiceUnit`, `systemdTimerUnit`, `windowsTaskXml`, `launchdPlist` and `installedJsonText` for 3 janitor input sets. One set used odd quoting, `C:\r e'p"o`. Another passed a stray `staleHours: 7` into the janitor branch.
  - I also ran `main` in dry-run and real-write modes on linux, win32 and darwin, with no flags and with `--hour 9 --host hh --name custom`.
  - Result: `diff -r` over the 30 outputs was identical, and all 14 written files (units, UTF-16LE task XML, plists, installed.json) were identical after normalising the fixture path.
  - Independent check: when 6cd4ec2's `main` planned over files that 573f04e had written, every janitor artifact came back `unchanged`, installed.json included.
- **`--stale-hours` appears exactly once and last.** It is added in one place (install-janitor-timer.mjs:160), after `--host` and `--out`. M12 and M13 are killed. The Windows XML and plist reach it only through `scheduledCommandArgv`.
- **installed.json key order** is `schema, repo, node, every, staleHours, scheduler, name, to` (:175). M14 is killed.
- **Range matrix.** The installer accepts 0.1, 48, 48.0 and 0.10, and refuses 0.05, 48.01, NaN, 2h, an empty value, a missing value, -1, -0.5, 1e1, 0x2, " 2", 2., .5, Infinity and a repeated flag. collect-status gives exit 2 and writes nothing for anything outside 0.1 to 48 or not a number, including NaN, an empty string (read as 0), a missing value, negatives and Infinity.
- **XML and plist escaping.** The value can only contain `[0-9.]`, so no escaping matters. It renders as `&quot;--stale-hours&quot; &quot;0.5&quot;` and `'--stale-hours' '0.5'`.
- **`--remove --job collect-status`** removes only the collect unit or task or plist and `~/.agents/collect/installed.json`. On all three platforms the janitor files were still present with identical bytes.
- **Reinstall behaviour, all platforms.**
  - Over a 0.20.15 collect unit that lacks the flag: the same COLLECT_MARKER is kept, the service is `updated` and gains `--stale-hours 2`, the timer is `unchanged`, and installed.json is `updated`.
  - Over the hand-edited Netcup shape (the 0.20.15 unit with ` --stale-hours 2` appended to ExecStart): the service is `unchanged` and installed.json is `updated`.
  - With the flag hand-placed mid-line, the unit is overwritten with the canonical order.
- **closed state.**
  - `computeState("closed")` returns `closed` (collect-from-origin.mjs:121). parseRecord trims, so `"  closed  "`, `"closed\t"` and CRLF input all map to `closed`.
  - Case variants like `Closed` map to `owned`, the same as `Accepted`, `Withdrawn` and `Rejected`, because no status is case-tolerant. This matches the siblings and the old guard, so it is not a regression.
  - The lane 30 guard is gone: computeAttention (:133) tests only `r.state === "owned"`.
- **Other consumers.** janitor.mjs, four-read and build-census never read collector rows. `record-closed-and-skip.contract.test.mjs:133`'s legend regex `/non-terminal Status.*owned/i` still matches. Neither the wiring checks nor continue-skill key on state tokens. Census, the collect-from-origin R1 and the collect-status spec addendum no longer describe closed as owned. The only remaining mentions are in historical review reports.
- **Tree hygiene.** The worktree was clean before and after this review, apart from this report.
