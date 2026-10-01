VERDICT: NEEDS_FIXES aeb7f76

# Lane 42, stale-session guard: review r1

Artifact: aeb7f762395b7b2f0c1eee06abee4891b6f3344c (diff against 2cc3c66), branch build/stale-session-guard-1.
Reviewed 2026-09-28, about 17:05 America/New_York. The reviewed worktree was left untouched (`git status --short` was empty after every step). Every probe and mutation ran on `git archive` copies under `scratchpad/lane-42/rev-P0q7/`.

Cause: a session keeps the hooks of the plugin version directory it started on, so a session that started before a newer install never loads guards added after its version (the 9/28 delete-guard miss).
Discriminating check: I copied the built tree into a scratch HOME at `cache/benzhuk/delegation/0.20.9`, pointed `installed_plugins.json` at 0.20.16 and piped in a builder Agent PreToolUse. The copy printed `permissionDecision: deny` and logged `R0-stale`. The same input against the 0.20.16 copy printed nothing and logged `allow`.
Fix location: scripts/plugin-staleness.mjs (new), hooks/agent-dispatch-guard.mjs:540-543 and :651, scripts/wiring-check.mjs:506-530.
Simplification: one shared pure helper (`checkStaleness` plus `staleSessionText`) feeds both call sites. There is no new hook and no hooks.json change.

## Verdict summary

The core logic is correct and I found no false deny. There is one MAJOR: the single line that makes R0-stale refuse instead of observe (`|| result.hardDeny` in runCli) has no test. I reverted it on a scratch copy and all 119 guard tests stayed green. That is the same kind of bug this codebase has shipped before: a guard that logs a deny but never refuses. There are also three MINORs and one NIT. All four of the builder's deviations are accepted (rulings below).

## Gates run

- `node --test scripts/plugin-staleness.test.mjs hooks/agent-dispatch-guard.test.mjs scripts/wiring-check.test.mjs`: 214 tests, 214 pass, 0 fail.
- `node scripts/run-tests.mjs`: exit 0, 2651 tests, 2646 pass, 0 fail, 5 skipped. This matches the builder's report.

## Live proof (attack item 2), pasted stdout

Scratch HOME `rev-P0q7/home`, tree from `git archive aeb7f76`, `installed_plugins.json` = `{"version":2,"plugins":{"delegation@benzhuk":[{"scope":"user","version":"0.20.16",...}]}}`, no `dispatch-guard-enforce`, run as `HOME=$H node $D/0.20.9/hooks/agent-dispatch-guard.mjs < builder.json`:

```
--- stale 0.20.9 builder:
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"stale session: this session loaded delegation hooks 0.20.9, but 0.20.16 is installed, so hooks added since (the delete guard among them) are not running for it or its agents. The one fix: start a fresh session (claude --resume keeps the conversation). Off switch: ~/.agents/no-dispatch-guard"}}
exit=0
--- current 0.20.16 builder:
exit=0
--- log:
{"at":"2026-09-28T20:57:11.223Z","session":"abcdef12","tool":"Agent","from_subagent":false,"subagent_type":"builder","model":"sonnet","rules":["R0-stale"],"action":"deny","enforced":false}
{"at":"2026-09-28T20:57:11.273Z","session":"abcdef12","tool":"Agent","from_subagent":false,"subagent_type":"builder","model":"sonnet","rules":[],"action":"allow","enforced":false}
```

`GUARD_SCRIPT_PATH` resolves to the installed file: the running version, 0.20.9, came from the copy's own location. `runCli` prints the deny with no enforce file, and the log records `R0-stale`.

## Findings

### MAJOR 1: the CLI "refuse, not observe" gate is untested; reverting it leaves the suite green

Evidence: hooks/agent-dispatch-guard.mjs:651 `const denyWins = result.action === 'deny' && (result.enforced || result.hardDeny);`. Every R0-stale test (hooks/agent-dispatch-guard.test.mjs:89-178) calls `decide()` in process. None of them runs `runCli`. The existing CLI subprocess helper, `runCliProcess` (:893), spawns the repo's own `GUARD_PATH`. That path is never a cache install, so R0 can never fire through it.

Mutation check, on a scratch copy: I replaced line 651 with the pre-lane `const denyWins = result.enforced && result.action === 'deny';` and ran `node --test hooks/agent-dispatch-guard.test.mjs`: pass 119, fail 0. Run live, the mutant logs `"rules":["R0-stale"],"action":"deny"` and prints nothing, so the spawn goes ahead.

Fix: add this test verbatim at the end of hooks/agent-dispatch-guard.test.mjs. It uses only helpers the file already has (`scratchHome`, `HERE`, `childEnv`, `lastLogLine`, `staleSessionText`, `spawnSync`).

```js
test('R0-stale CLI: a stale cache copy prints permissionDecision deny WITHOUT the enforce file, and logs R0-stale', () => {
  const home = scratchHome();
  const versionDir = path.join(home, '.claude', 'plugins', 'cache', 'benzhuk', 'delegation', '0.20.9');
  fs.mkdirSync(path.join(versionDir, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(versionDir, 'scripts'), { recursive: true });
  for (const f of ['agent-dispatch-guard.mjs', 'resume-size.mjs']) fs.copyFileSync(path.join(HERE, f), path.join(versionDir, 'hooks', f));
  fs.copyFileSync(path.join(HERE, '..', 'scripts', 'plugin-staleness.mjs'), path.join(versionDir, 'scripts', 'plugin-staleness.mjs'));
  fs.writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'delegation@benzhuk': [{ scope: 'user', version: '0.20.16' }] } }));
  assert.equal(fs.existsSync(path.join(home, '.agents', 'dispatch-guard-enforce')), false);
  const res = spawnSync(process.execPath, [path.join(versionDir, 'hooks', 'agent-dispatch-guard.mjs')], {
    input: JSON.stringify({ tool_name: 'Agent', session_id: 'r0-cli', tool_input: { subagent_type: 'builder', prompt: 'x' } }),
    env: childEnv(home),
    encoding: 'utf8',
  });
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout.trim());
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(out.hookSpecificOutput.permissionDecisionReason,
    staleSessionText({ key: 'delegation@benzhuk', running: '0.20.9', installed: '0.20.16' }));
  assert.deepEqual(lastLogLine(home).rules, ['R0-stale']);
});
```

Predicted outcome, measured on scratch copies: against aeb7f76 it passes (1/1). Against the mutant above it fails (✖, 0 pass 1 fail). Once added, the deny cannot quietly become observe-only again.

### MINOR 2: a symlinked HOME, `~/.claude` or `plugins/cache` silently disables R0 and the SessionStart line (it fails open, but the check stops looking)

Evidence: scripts/plugin-staleness.mjs:79 realpaths the candidate root, but :83 `const cacheDir = path.resolve(pluginsDir, 'cache');` is never resolved. Node already realpaths the main module's `import.meta.url`, so the script-side path is always resolved. If `<home>` is a link, then `path.relative` (:84) starts with `..` and the helper returns "not a cache install".

Measured with scratch `linkhome -> home`:
- `HOME=linkhome node <real>/0.20.9/hooks/agent-dispatch-guard.mjs`: printed nothing (expected a deny).
- `HOME=linkhome node linkhome/.../0.20.9/scripts/wiring-check.mjs --line --hook`: printed only the `wiring:` line, with no `stale session:` line.

It is never a false deny: every symlink case I tried (link HOME, trailing slash, `//`, relative or trailing-slash `CLAUDE_CONFIG_DIR`, `CLAUDE_CONFIG_DIR` pointing elsewhere) either denied correctly or passed. The same blind spot hits macOS test runs, because `os.tmpdir()` sits under `/var -> /private/var`.

Fix (mechanical) in scripts/plugin-staleness.mjs:83. Current:
```js
  const cacheDir = path.resolve(pluginsDir, 'cache');
```
Replacement:
```js
  let cacheDir = path.resolve(pluginsDir, 'cache');
  try { cacheDir = fsImpl.realpathSync(cacheDir); } catch { /* keep the unresolved path; fail-open is preserved */ }
```
I tried this on a scratch copy. With the patch, the `HOME=linkhome` wiring-check prints the stale line (1 match) and the guard, run through the real path, denies. The current version still passes because it is equal to the installed entry, and the helper still never throws. Add a test: a real home dir plus a symlinked home dir (`fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir')`), a script path under the real one and `home: link`, asserting `stale: true`.

This adds a second realpath, which goes past P3's "one stat-free realpath" budget. The lead should accept that explicitly. The cost is one extra syscall chain, well under 1 ms.

### MINOR 3: the log says `enforced: false` for a deny that actually refused

Evidence: hooks/agent-dispatch-guard.mjs:542 returns `enforced: false, hardDeny: true`, and the log entry (:631-642) records `enforced` but not `hardDeny`. The live log line above reads `"action":"deny","enforced":false`, which is how every observe-only R1/R2 deny reads too. Lane 38's counter, or anyone reading the log, cannot tell a real refusal from a logged-only one without hard-coding the rule id. That is the reverse form of the "logged but never refused" bug. The builder was right not to set `enforced: true` (Deviation 1), but the log still needs to carry the difference.

Fix (mechanical) in hooks/agent-dispatch-guard.mjs:642. Current:
```js
  if (result.roundMention) entry.round_mention = true;
```
Replacement:
```js
  if (result.roundMention) entry.round_mention = true;
  if (result.hardDeny) entry.hard_deny = true;
```
Predicted: the R0 log line gains `"hard_deny":true` and every other line is unchanged. Add `assert.equal(lastLogLine(home).hard_deny, true)` to the MAJOR 1 test. Optionally mention `hard_deny` in the census bullet.

### MINOR 4 (Deviation 2 follow-up): a red exit with no printed reason in table and `--json` modes

Evidence: scripts/wiring-check.mjs:530 `return (result.ok && !stale.stale) ? 0 : 1;` makes a stale session exit 1 in every mode. The stale text is printed only in the `--line` branch (:509-515). The `--json` branch (:508) and the table branch (:517) print nothing about it. I measured it by running the 0.20.9 copy with `--json` and with no flag: exit 1, and zero `stale session:` lines in the output. A human running the cache copy's table sees every row ok and a red exit with no explanation.

Fix (mechanical) in scripts/wiring-check.mjs. Current:
```js
  if (argv.includes("--json")) printJson(result);
```
Replacement:
```js
  if (argv.includes("--json")) {
    printJson(result);
    if (stale.stale) process.stderr.write(`${staleSessionText(stale)}\n`);
  }
```
Current:
```js
  else printTable(result.results);
```
Replacement:
```js
  else {
    printTable(result.results);
    if (stale.stale) console.log(staleSessionText(stale));
  }
```
Predicted: the JSON on stdout stays exactly as it was (the extra line goes to stderr), the table gains the one line, and `--line`/`--hook` behaviour does not change. `--hook` together with `--line` still exits 0 with at most one extra line. I measured that: 2 lines when stale, 1 when current, 0 lines under ws-off, exit 0 in every case.

### NIT 5: the census section splits off the Codex paragraph and is a bullet, not one line

Evidence: docs/census.md:490-497 inserts `## Counted markers` before the trailing "Codex: the read counter is unsupported on Codex..." paragraph (:499). That paragraph belongs to "Knowledge read counting" (:475) and now sits under the markers heading. P8 also asked for one line; this is a 6-line bullet. The content does name the marker and `R0-stale`, so P8's substance is met.

Fix: move the whole `## Counted markers` block to after the Codex paragraph, at the true end of the file. Optionally shorten it to one line: ``- `stale session:`: the stale-session guard's marker; the guard logs it as rule `R0-stale` (with `hard_deny: true`); wiring-check `--line` prints the same text.``

## Rulings on the builder's Deviations

1. `hardDeny` field on every `decide()` return: ACCEPTED. It keeps `enforced` truthful about the switch, and the live proof shows the deny prints without the enforce file. The gaps are the missing CLI test (MAJOR 1) and the missing log field (MINOR 3).
2. The stale finding turns the exit red in every mode: ACCEPTED as semantics, because it matches the J2 precedent that the exit reflects findings, not the view. It is conditional on MINOR 4: a red exit must show its reason in the mode that produced it. `--hook` stays 0 (verified, and tested at wiring-check.test.mjs P7), and ws-off still silences `--line` (verified live: no output under ws-off with `--line --hook`).
3. No new check type inside `checkWiring()`: ACCEPTED. The janitor calls `checkWiring` directly (janitor.mjs:116), and the timer runs from a repo checkout, where staleness is always "not a cache install" anyway.
4. Live proof not attempted: ACCEPTED. It was the lead's step, and I ran it above.

## Attack brief answers

1. False deny: none found. Probes and their results:
   - Numeric compare: 0.20.9 vs 0.20.10 installed denies (numeric compare, not string); vs 0.20.8 passes; vs 1.0.0 denies.
   - User entry 0.20.16 plus project entry 0.20.9, running 0.20.9: passes (equal to one entry).
   - Paths: trailing slash on HOME and on `CLAUDE_CONFIG_DIR`, and a `//` in the script path, all behave correctly.
   - Relative `CLAUDE_CONFIG_DIR=.claude`: resolves against cwd consistently on both sides (the manifest and the cache).
   - `CLAUDE_CONFIG_DIR` pointing elsewhere: passes.
   - Windows: simulated with `path.win32` on a scratch copy. `C:\Users\benzh\.claude\plugins\cache\benzhuk\delegation\0.20.16\...` gives running 0.20.16, not stale. At 0.20.9 it is stale. A lower-case drive letter from realpath, and mixed-case or forward-slash HOME, are handled, because `path.win32.relative` compares case-insensitively. A `\\?\` prefix or a home on a different drive gives "not a cache install", which passes.
   - Symlinks can only cause misses (MINOR 2). In one contrived case, where a current version dir is itself a symlink to an older version dir, realpath would read the older version. That follows P1 as written, and nothing in Claude Code's cache layout does it.
2. Silent never-fire:
   - `GUARD_SCRIPT_PATH` is correct and `runCli` denies without the enforce file. Both are proved live, but not by a test (MAJOR 1).
   - Pre-existing and out of this lane's scope, flagged for a follow-up lane: hooks/agent-dispatch-guard.mjs:696 (and hooks/delete-guard.mjs:510) compute `isMain` as `import.meta.url === pathToFileURL(process.argv[1]).href`. Node realpaths `import.meta.url` but not `argv[1]`, so a guard invoked through a symlinked path does nothing at all, R0 and every other rule included. Measured: run through `linkhome/...`, an opus spawn with the enforce file present printed nothing; the same input through the real path printed a deny.
   - scripts/wiring-check.mjs:538 `isMainModule()` already realpaths both sides; the guards should use the same helper. This is not counted in this verdict because it is not in the diff.
3. Fail-open: every one of these passed with exit 0 and no crash:
   - stdin: garbage, empty, `null`, an array `tool_input`, an object `subagent_type`.
   - manifest contents: bad JSON, a BOM prefix, `plugins: null`, the key mapping to an object, prerelease and `v`-prefixed versions.
   - manifest file: a directory in its place, mode 000, a 200k-deep nested array.
   - A 58 MB manifest still decides correctly, in 0.6 s wall time against a 5 s timeout.
   - `no-dispatch-guard` present: nothing prints.
   - `ws-off` and `dispatch-guard-enforce` do not change the R0 deny, which is correct per P5.
4. Scope:
   - Denied: `builder`, `reviewer`, `runner`, `integrator`, `delegation:builder`, `Delegation:Integrator`.
   - Not denied: `general-purpose`, `Explore`, `fork`, `prebuilder`, `builder2`, `"builder "`, empty, or missing.
   - SendMessage: the PreToolUse matcher is `Agent|SendMessage` (hooks.json:90), so the guard does see resumes. `checkR0Stale` returns null for any `tool_name !== 'Agent'` (agent-dispatch-guard.mjs:478), so a resume is never denied. This matches P5 as written: P5 covers spawns and keys on `subagent_type`, which SendMessage does not carry. It is a real hazard, though: a stale session can keep resuming an existing builder that runs without the delete guard. Covering it would need the agent type from the transcript (as `checkResumeNotice` does), which conflicts with P3's cheapness rule. This is a spec question for the lead, not a defect in this build.
5. wiring-check: `--line --hook` always exits 0, with one extra line when stale and none when current or under ws-off. Deviation 2 is ruled on above (MINOR 4).
6. P6 text: I checked it programmatically against the spec's backticked string with `<running>`/`<installed>` placeholders: exact match. The name part is substituted (`foo@bar` gives "loaded foo hooks"). P8: the census names both `stale session:` and `R0-stale` (NIT 5 is about placement only).

## Verified absences

- No false-deny path in `checkStaleness`: the comparison is numeric (plugin-staleness.mjs:50-55), STALE requires the running version to be strictly older than every readable entry (:152), and any unreadable input returns `stale: false`.
- No crash path. The helper has an outer try (:125/:161), `checkR0Stale` has its own try, `wiring-check.staleness()` has its own try, and the guard's `runCli` rejection maps to exit 0.
- The import `../scripts/plugin-staleness.mjs` resolves inside a real cache install: `scripts/` ships in the cache (checked: the `0.20.15/scripts` listing is not empty). Codex's hooks.json does not wire this guard or wiring-check, so the Codex entries pinned to 0.20.14 cannot trigger a false stale deny or notice today.
