# Scout — C2 (scripts/install-janitor-timer.mjs + its test)

## Files and symbols
- `scripts/install-janitor-timer.mjs` (727 lines, base sha 31a23e2): exists exactly as the spec
  assumes. Key exports: `resolveRepo`, `scheduledCommandArgv({node,pluginRoot,repo,host})` (the
  ONE seam every generator calls — spec's territory note says this is where `--job` plugs in),
  `installedJsonText`, `systemdServiceUnit`/`systemdTimerUnit`, `windowsTaskXml`, `launchdPlist`,
  `isInstalledPluginRoot`, `main(argv, opts)`. `DEFAULT_HOUR=6`, `DEFAULT_NAME="janitor-record"`,
  `KNOWN_BOOLEAN_FLAGS`/`KNOWN_VALUE_FLAGS` (line ~351-352) gate unrecognized-argv refusal (L1) —
  `--job` and `--every` must be added to these sets or every `--job`/`--every` invocation is
  refused as unrecognized.
- `main()`'s `--hour` handling (line ~422-435) is a hard-refuse-on-bad-value pattern to mirror for
  `--every` (5-60 int, same refusal-before-any-write discipline).
- `installedJsonPath` today is unconditionally `~/.agents/janitor/installed.json` (line 515) —
  contracts.md K1 pins the collect job's marker file as its OWN `~/.agents/collect/installed.json`,
  never this path; the builder must branch on job, not reuse this constant for both.

## Helpers to reuse
- `writeFileAtomic`, `readMarked`, `planWrite`, `planRemove` — job-agnostic already, take `file`/
  `desired`/`marker`/`dryRun`; reuse as-is for the collect job's artifacts and its own
  `installed.json`.
- `isDurablePath` (from `./mirror-shared-skills.mjs`) and `isInstalledPluginRoot` — checkout-
  durability refusal is job-agnostic, applies to both jobs unchanged.

## Tests that police this area
- `scripts/install-janitor-timer.test.mjs:100` "scheduledCommandArgv is exactly <node> ...
  --record --repo <repo>, plus --host" — calls `scheduledCommandArgv` WITHOUT a job argument and
  asserts the exact janitor-record argv. Adding a `job` param must default this call's behavior
  unchanged (byte-identical), per spec's explicit "keep the byte-stability tests green without
  editing their expectations."
- Line 72 "byte-stability: every generator is a pure function" and line 107 "installed.json is
  byte-stable and matches the pinned seam shape" — same constraint: existing calls, no job arg,
  must still produce identical bytes.
- Lines 411-457: `--hour` bounds/refusal tests — the twin tests the spec wants for `--every`
  (5-60 bounds, valueless refusal) should follow this exact shape.

## Open questions for the spec
- Contracts.md K3 resolves "both jobs in installed.json" as two separate name-owned files (collect
  job's own `~/.agents/collect/installed.json`, distinct from the janitor's) — this reads as
  overriding spec line 51's literal wording ("installed.json records both jobs by name, as the
  name-owned shape already allows"); contracts.md wins per its own header. No further ruling needed.
- Windows/macOS live execution is untested on this host today (comment at windowsTaskXml/
  launchdPlist: "Never executed on this Linux host — text-generation only"); the collect job's
  `--every` schedule types for those two platforms are new text-only surface with the same caveat.
